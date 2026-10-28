/**
 * AgentGuard Client SDK for Merchant Backend
 *
 * Implements authoritative pre-flight policy evaluation with strict fail-closed security:
 * If the AgentGuard gateway is offline, times out, or returns a 5xx error,
 * the transaction is strictly BLOCKED to ensure financial safety.
 */

export interface AgentGuardClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface PaymentEvaluationRequest {
  agentId: string;
  amount: number | string;
  currency: string;
  merchant?: string;
  tool?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecisionResponse {
  decision: 'ALLOW' | 'HOLD' | 'BLOCK';
  decisionId: string;
  reason?: string;
  violations?: string[];
  authorizationToken?: string;
  pendingApprovalId?: string;
  failClosedTriggered?: boolean;
}

export class AgentGuardClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(config: AgentGuardClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs || 3000;
  }

  /**
   * Pre-flight evaluate a payment before executing Razorpay order creation.
   * Fail-Closed Guarantee: Returns decision: 'BLOCK' on any network or timeout failure.
   */
  public async evaluatePayment(params: PaymentEvaluationRequest): Promise<PolicyDecisionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/integrations/razorpay/evaluate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentId: params.agentId,
          amount: params.amount,
          currency: params.currency,
          merchant: params.merchant || 'merchant@agentguard.internal',
          tool: params.tool || 'razorpay_payment',
          operation: params.operation || 'create_razorpay_order',
          metadata: params.metadata,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        return {
          decision: 'BLOCK',
          decisionId: `failclose_http_${Date.now()}`,
          reason: `AgentGuard gateway returned HTTP ${response.status}: ${errText}. Payment blocked for security (fail-closed).`,
          failClosedTriggered: true,
        };
      }

      const data = (await response.json()) as any;
      return {
        decision: data.decision || 'BLOCK',
        decisionId: data.decisionId || data.requestId || `dec_${Date.now()}`,
        reason: data.reason,
        violations: data.violations,
        authorizationToken: data.authorizationToken,
        pendingApprovalId: data.pendingApprovalId,
        failClosedTriggered: false,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';

      return {
        decision: 'BLOCK',
        decisionId: `failclose_err_${Date.now()}`,
        reason: isTimeout
          ? `AgentGuard policy evaluation timed out after ${this.timeoutMs}ms. Payment blocked for safety (fail-closed).`
          : `AgentGuard communication error: ${err.message}. Payment blocked for safety (fail-closed).`,
        failClosedTriggered: true,
      };
    }
  }
}
