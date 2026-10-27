import {
  AgentGuard,
  EvaluateRequest,
  EvaluationResult,
  PromptScanResult,
  AgentGuardAuthenticationError,
  AgentGuardForbiddenError,
  AgentGuardRateLimitError,
  AgentGuardTimeoutError,
  AgentGuardGatewayError,
} from '@codesec-ai/agentguard';

import { ConsumerConfig } from './config.js';
import {
  MockDownstreamPaymentGateway,
  DownstreamPaymentReceipt,
} from './mock-downstream.js';

export interface ExecuteOrderParams {
  orderId: string;
  agentId: string;
  action: string;
  amount: number;
  currency: string;
  recipient: string;
  description: string;
  promptContext?: string;
  autoWaitApproval?: boolean;
}

export type OrderExecutionResult =
  | {
      success: true;
      decision: 'ALLOW';
      requestId: string;
      authorizationToken: string;
      receipt: DownstreamPaymentReceipt;
    }
  | {
      success: false;
      decision: 'HOLD';
      requestId: string;
      pendingApprovalId: string;
      reason: string;
      message: string;
    }
  | {
      success: false;
      decision: 'BLOCK';
      requestId: string;
      reason: string;
      violations: string[];
      isAuthoritative: boolean;
    }
  | {
      success: false;
      decision: 'ERROR';
      errorType: string;
      message: string;
    };

export class SecureAgentService {
  private client: AgentGuard;
  private downstreamGateway: MockDownstreamPaymentGateway;

  constructor(config: ConsumerConfig, downstreamGateway?: MockDownstreamPaymentGateway) {
    this.client = new AgentGuard({
      baseUrl: config.agentGuardBaseUrl,
      apiKey: config.agentGuardApiKey,
      timeoutMs: config.timeoutMs,
    });
    this.downstreamGateway = downstreamGateway || new MockDownstreamPaymentGateway();
  }

  /**
   * Pre-execution prompt scanning.
   * Analyzes user or agent input for adversarial injection, system prompt overrides, or financial tampering.
   */
  public async scanAgentPrompt(promptText: string): Promise<PromptScanResult> {
    try {
      const result = await this.client.scanPrompt(promptText);
      return result;
    } catch (err: any) {
      if (err instanceof AgentGuardAuthenticationError) {
        console.error('[AgentGuard Scanner Auth Error] Invalid API credentials:', err.message);
        throw err;
      }
      if (err instanceof AgentGuardForbiddenError) {
        console.error('[AgentGuard Scanner Permission Error] Unexpected HTTP 403 (insufficient permissions/firewall):', err.message);
        throw err;
      }
      if (err instanceof AgentGuardTimeoutError) {
        console.error('[AgentGuard Scanner Timeout] Request timed out:', err.message);
        throw err;
      }
      if (err instanceof AgentGuardGatewayError) {
        console.error('[AgentGuard Scanner Gateway Error] Gateway unavailable:', err.message);
        throw err;
      }
      throw err;
    }
  }

  /**
   * Safely evaluate and execute a protected transaction with fail-closed security.
   *
   * Flow:
   * 1. (Optional) Run heuristic prompt scan if promptContext is supplied.
   * 2. Authoritatively evaluate transaction against spending limits, recipient allowlists, and velocity policies.
   * 3. Handle policy decisions:
   *    - ALLOW: Proceed only with authoritative decision and valid server authorization token.
   *    - HOLD: Halt execution immediately; expose pendingApprovalId for human operator review.
   *    - BLOCK: Reject execution immediately.
   * 4. Any failure (network, auth, timeout) strictly fails closed: NO downstream transaction is initiated.
   */
  public async evaluateAndExecuteOrder(params: ExecuteOrderParams): Promise<OrderExecutionResult> {
    const requestId = `req_${params.orderId}_${Date.now()}`;

    // 1. Pre-execution Prompt Inspection
    if (params.promptContext && params.promptContext.trim().length > 0) {
      const scan = await this.scanAgentPrompt(params.promptContext);
      if (scan.isThreatDetected) {
        console.warn(`[SecurityAlert] Adversarial prompt injection detected for order ${params.orderId}:`);
        scan.findings.forEach((f) => {
          console.warn(`  - [${f.category}] (${f.severity}): ${f.description}`);
        });

        return {
          success: false,
          decision: 'BLOCK',
          requestId,
          reason: 'Pre-execution scan detected adversarial prompt injection.',
          violations: scan.findings.map((f) => `Prompt threat: [${f.category}] ${f.description}`),
          isAuthoritative: true,
        };
      }
    }

    // 2. Authoritative Policy Evaluation
    const evalRequest: EvaluateRequest = {
      action: params.action,
      amount: params.amount,
      currency: params.currency,
      recipient: {
        name: params.recipient,
        email: params.recipient.includes('@') ? params.recipient : `${params.recipient}@example.com`,
      },
      description: params.description,
      agentId: params.agentId,
      promptContext: params.promptContext,
      idempotencyKey: requestId,
    };

    let evaluation: EvaluationResult;
    try {
      evaluation = await this.client.evaluate(evalRequest);
    } catch (err: any) {
      // Fail closed on any client or gateway error
      if (err instanceof AgentGuardAuthenticationError) {
        console.error('[SecurityFailure] Gateway authentication failed (HTTP 401). Execution blocked.');
        return {
          success: false,
          decision: 'ERROR',
          errorType: 'AUTHENTICATION_ERROR',
          message: 'AgentGuard API key is invalid or revoked.',
        };
      }

      if (err instanceof AgentGuardForbiddenError) {
        console.error('[SecurityFailure] Gateway permission denied (HTTP 403). Execution blocked.');
        return {
          success: false,
          decision: 'ERROR',
          errorType: 'FORBIDDEN_ERROR',
          message: 'Insufficient permissions on AgentGuard gateway for evaluate action.',
        };
      }

      if (err instanceof AgentGuardRateLimitError) {
        console.error('[SecurityFailure] Rate limit exceeded (HTTP 429). Execution throttled.');
        return {
          success: false,
          decision: 'ERROR',
          errorType: 'RATE_LIMIT_ERROR',
          message: 'AgentGuard rate limit reached. Retry after backoff.',
        };
      }

      if (err instanceof AgentGuardTimeoutError) {
        console.error('[SecurityFailure] Gateway evaluation timed out. Fail-closed: downstream execution aborted.');
        return {
          success: false,
          decision: 'ERROR',
          errorType: 'TIMEOUT_ERROR',
          message: 'Evaluation timed out; failed closed to prevent unauthorized spend.',
        };
      }

      if (err instanceof AgentGuardGatewayError) {
        console.error(`[SecurityFailure] Gateway communication error (${err.statusCode || 503}). Fail-closed.`);
        return {
          success: false,
          decision: 'ERROR',
          errorType: 'GATEWAY_ERROR',
          message: err.message,
        };
      }

      console.error('[SecurityFailure] Unexpected error during policy evaluation. Fail-closed:', err);
      return {
        success: false,
        decision: 'ERROR',
        errorType: 'UNKNOWN_ERROR',
        message: err.message || 'Unknown evaluation failure',
      };
    }

    // 3. Process Authoritative Decision
    if (evaluation.decision === 'BLOCK' || evaluation.isBlocked) {
      console.warn(`[PolicyDecision] Transaction ${params.orderId} BLOCKED by AgentGuard policy.`);
      evaluation.violations.forEach((v) => console.warn(`  - Violation: ${v}`));

      return {
        success: false,
        decision: 'BLOCK',
        requestId: evaluation.requestId,
        reason: evaluation.reason,
        violations: evaluation.violations,
        isAuthoritative: true,
      };
    }

    if (evaluation.decision === 'HOLD' || evaluation.isHeld) {
      const pendingApprovalId = evaluation.pendingApprovalId || 'unknown_approval_id';
      console.warn(`[PolicyDecision] Transaction ${params.orderId} placed on HOLD. Pending approval ID: ${pendingApprovalId}`);

      // If autoWaitApproval is enabled, poll the approval record
      if (params.autoWaitApproval && pendingApprovalId !== 'unknown_approval_id') {
        console.log(`[ApprovalWorkflow] Polling approval status for ${pendingApprovalId}...`);
        try {
          const approval = await this.client.waitForApproval(pendingApprovalId, {
            pollIntervalMs: 1500,
            timeoutMs: 10000,
          });

          if (approval.status === 'APPROVED' && approval.serverAuthorizationToken) {
            console.log(`[ApprovalWorkflow] Human reviewer APPROVED request ${pendingApprovalId}!`);
            const receipt = await this.downstreamGateway.executeAuthorizedPayment({
              requestId: approval.requestId,
              authorizationToken: approval.serverAuthorizationToken,
              amount: params.amount,
              currency: params.currency,
              recipient: params.recipient,
              description: params.description,
            });

            return {
              success: true,
              decision: 'ALLOW',
              requestId: approval.requestId,
              authorizationToken: approval.serverAuthorizationToken,
              receipt,
            };
          }

          console.warn(`[ApprovalWorkflow] Request ${pendingApprovalId} ended with status: ${approval.status}`);
          return {
            success: false,
            decision: 'HOLD',
            requestId: evaluation.requestId,
            pendingApprovalId,
            reason: `Transaction review concluded with status: ${approval.status}`,
            message: 'Transaction not approved by human reviewer.',
          };
        } catch (pollErr: any) {
          console.warn(`[ApprovalWorkflow] Polling timed out or failed: ${pollErr.message}`);
        }
      }

      return {
        success: false,
        decision: 'HOLD',
        requestId: evaluation.requestId,
        pendingApprovalId,
        reason: evaluation.reason,
        message: 'Transaction exceeds automated threshold and requires operator approval.',
      };
    }

    if (evaluation.decision === 'ALLOW' && evaluation.isAllowed) {
      // Verification: Authoritative ALLOW must provide server authorization token
      if (!evaluation.authorizationToken) {
        console.error('[SecurityAnomaly] Gateway returned ALLOW without authorization token. Failing closed.');
        return {
          success: false,
          decision: 'ERROR',
          errorType: 'MISSING_AUTHORIZATION_TOKEN',
          message: 'Authoritative ALLOW missing server authorization token. Refusing to execute.',
        };
      }

      console.log(`[PolicyDecision] Transaction ${params.orderId} ALLOWED. Server token received: ${evaluation.authorizationToken.substring(0, 10)}...`);

      // 4. Downstream Execution
      const receipt = await this.downstreamGateway.executeAuthorizedPayment({
        requestId: evaluation.requestId,
        authorizationToken: evaluation.authorizationToken,
        amount: params.amount,
        currency: params.currency,
        recipient: params.recipient,
        description: params.description,
      });

      return {
        success: true,
        decision: 'ALLOW',
        requestId: evaluation.requestId,
        authorizationToken: evaluation.authorizationToken,
        receipt,
      };
    }

    // Fail safe on unknown decision
    return {
      success: false,
      decision: 'ERROR',
      errorType: 'UNRECOGNIZED_DECISION',
      message: `Received unrecognized decision '${evaluation.decision}' from gateway.`,
    };
  }
}
