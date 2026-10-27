/**
 * Synthetic Downstream Payment Gateway / Settlement Service.
 *
 * NOTE: This is a synthetic mock service for demonstration purposes only.
 * It simulates a downstream payment processor (e.g. Razorpay, PayPal, Stripe)
 * enforcing server-side authorization token verification before processing any transaction.
 *
 * DO NOT use real payment credentials or move real funds in this example.
 */

export interface DownstreamPaymentRequest {
  requestId: string;
  authorizationToken: string;
  amount: number;
  currency: string;
  recipient: string;
  description: string;
}

export interface DownstreamPaymentReceipt {
  status: 'SETTLED' | 'REJECTED';
  transactionId: string;
  requestId: string;
  amount: number;
  currency: string;
  recipient: string;
  settledAt: string;
  note: string;
}

export class MockDownstreamPaymentGateway {
  private executedTokens = new Set<string>();

  /**
   * Execute protected payment action.
   * STRICT REQUIREMENT: Only executes if a valid, unconsumed authorization token is provided.
   */
  public async executeAuthorizedPayment(request: DownstreamPaymentRequest): Promise<DownstreamPaymentReceipt> {
    // 1. Enforce token presence
    if (!request.authorizationToken || typeof request.authorizationToken !== 'string') {
      throw new Error(
        `[DownstreamSecurityViolation] Payment rejected: Missing required AgentGuard server authorization token.`
      );
    }

    // 2. Enforce token format
    if (!request.authorizationToken.startsWith('auth_')) {
      throw new Error(
        `[DownstreamSecurityViolation] Payment rejected: Invalid authorization token format '${request.authorizationToken}'.`
      );
    }

    // 3. Enforce single-use / anti-replay on downstream processor
    if (this.executedTokens.has(request.authorizationToken)) {
      throw new Error(
        `[DownstreamSecurityViolation] Replay attack detected: Authorization token '${request.authorizationToken}' has already been executed.`
      );
    }

    this.executedTokens.add(request.authorizationToken);

    // Mock successful execution
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return {
      status: 'SETTLED',
      transactionId,
      requestId: request.requestId,
      amount: request.amount,
      currency: request.currency,
      recipient: request.recipient,
      settledAt: new Date().toISOString(),
      note: 'Downstream payment executed successfully with verified AgentGuard authorization token.',
    };
  }
}
