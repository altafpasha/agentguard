/**
 * AgentGuard Client SDK
 * Official SDK client for evaluating transactions and scanning agent actions
 * before executing downstream operations (e.g., Razorpay, Stripe, PayPal).
 *
 * Designed with a strict FAIL-CLOSED policy:
 * If AgentGuard is unreachable, times out, or returns an unverified response,
 * the client authoritatively returns a BLOCK decision to prevent unauthorized execution.
 */

export interface AgentGuardClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface PaymentEvaluationParams {
  agentId: string;
  actionId?: string;
  amount: number | string; // Numeric value (e.g. 25.00) or cents
  currency: string;
  merchant?: string;
  tool?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentGuardEvaluationResult {
  decision: 'ALLOW' | 'HOLD' | 'BLOCK';
  decisionId: string;
  reason?: string;
  policyId?: string;
  policyVersion?: number;
  authorizationToken?: string;
  pendingApprovalId?: string;
  executed: boolean;
  timestamp: string;
  latencyMs: number;
  failClosedTriggered?: boolean;
}

export interface AgentGuardScanParams {
  prompt: string;
  agentId?: string;
  context?: Record<string, unknown>;
}

export interface AgentGuardScanResult {
  decision: 'ALLOW' | 'BLOCK';
  riskScore: number;
  findings: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  scannedAt: string;
}

export class AgentGuardClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: AgentGuardClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  /**
   * Evaluates an agent payment or transaction request against configured AgentGuard policies.
   * Strict fail-closed: If the gateway is down, unreachable, or returns a 5xx/4xx error,
   * returns a BLOCK decision to guarantee financial safety.
   */
  public async evaluatePayment(params: PaymentEvaluationParams): Promise<AgentGuardEvaluationResult> {
    const startTime = Date.now();
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
      const payload = {
        agentId: params.agentId,
        actionId: params.actionId ?? `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tool: params.tool ?? 'razorpay_payment',
        operation: params.operation ?? 'create_razorpay_order',
        amount: params.amount,
        currency: (params.currency || 'INR').toUpperCase(),
        merchant: params.merchant,
        metadata: params.metadata,
      };

      const response = await fetch(`${this.baseUrl}/api/v1/policies/authorize`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return {
          decision: 'BLOCK',
          decisionId: `err_${Date.now()}`,
          reason: `AgentGuard gateway returned HTTP ${response.status}: ${errorText || 'Unknown error'}. Transaction blocked for safety (fail-closed).`,
          executed: false,
          timestamp: new Date().toISOString(),
          latencyMs,
          failClosedTriggered: true,
        };
      }

      interface EvalApiResponse {
        decision?: 'ALLOW' | 'HOLD' | 'BLOCK';
        decisionId?: string;
        id?: string;
        reason?: string;
        violations?: string[];
        policyId?: string;
        policyVersion?: number;
        authorizationToken?: string;
        pendingApprovalId?: string;
        executed?: boolean;
        evaluatedAt?: string;
        record?: EvalApiResponse;
      }
      const data = (await response.json()) as EvalApiResponse;
      const decisionRecord = data.record || data;

      return {
        decision: decisionRecord.decision || 'BLOCK',
        decisionId: decisionRecord.decisionId || decisionRecord.id || `dec_${Date.now()}`,
        reason: decisionRecord.reason || (decisionRecord.violations && decisionRecord.violations.join(', ')),
        policyId: decisionRecord.policyId,
        policyVersion: decisionRecord.policyVersion,
        authorizationToken: decisionRecord.authorizationToken,
        pendingApprovalId: decisionRecord.pendingApprovalId,
        executed: !!decisionRecord.executed,
        timestamp: decisionRecord.evaluatedAt || new Date().toISOString(),
        latencyMs,
        failClosedTriggered: false,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      const errorObj = err as Error;
      const isTimeout = errorObj.name === 'AbortError';

      return {
        decision: 'BLOCK',
        decisionId: `failclose_${Date.now()}`,
        reason: isTimeout
          ? `AgentGuard policy evaluation timed out after ${this.timeoutMs}ms. Transaction blocked for safety (fail-closed).`
          : `AgentGuard gateway communication error: ${errorObj.message || 'Network failure'}. Transaction blocked for safety (fail-closed).`,
        executed: false,
        timestamp: new Date().toISOString(),
        latencyMs,
        failClosedTriggered: true,
      };
    }
  }

  /**
   * Scans a prompt or command for injection attacks, jailbreaks, or tool tampering.
   */
  public async scanPrompt(params: AgentGuardScanParams): Promise<AgentGuardScanResult> {
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
      const response = await fetch(`${this.baseUrl}/api/v1/scan`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: params.prompt,
          agentId: params.agentId || 'default-agent',
          context: params.context,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          decision: 'BLOCK',
          riskScore: 1.0,
          findings: [
            {
              type: 'SCAN_FAILED',
              description: `Gateway scan failed with status ${response.status}`,
              severity: 'high',
            },
          ],
          scannedAt: new Date().toISOString(),
        };
      }

      interface ScanApiResponse {
        isSafe?: boolean;
        decision?: 'ALLOW' | 'BLOCK';
        riskScore?: number;
        findings?: AgentGuardScanResult['findings'];
        violations?: AgentGuardScanResult['findings'];
        timestamp?: string;
      }
      const data = (await response.json()) as ScanApiResponse;
      return {
        decision: data.isSafe === false || data.decision === 'BLOCK' ? 'BLOCK' : 'ALLOW',
        riskScore: data.riskScore ?? (data.isSafe ? 0 : 0.9),
        findings: data.findings || data.violations || [],
        scannedAt: data.timestamp || new Date().toISOString(),
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const errorObj = err as Error;
      return {
        decision: 'BLOCK',
        riskScore: 1.0,
        findings: [
          {
            type: 'COMMUNICATION_ERROR',
            description: `AgentGuard scan error: ${errorObj.message || 'Timeout/Network failure'} (fail-closed)`,
            severity: 'high',
          },
        ],
        scannedAt: new Date().toISOString(),
      };
    }
  }
}
