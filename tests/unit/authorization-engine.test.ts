import { describe, it, expect, beforeEach } from 'vitest';
import { AuthorizationEngine } from '../../src/policy/authorization-engine';
import { MemoryPolicyStore } from '../../src/policy/policy-store';
import { PolicyDefinition, AuthorizationRequest } from '../../src/policy/types';
import { parseMoneyToCents } from '../../src/policy/money';
import { PayPalSandboxAdapter } from '../../src/payment/paypal-sandbox-adapter';
import { IPayPalClient } from '../../src/payment/types';

describe('Deterministic Transaction Authorization Engine', () => {
  let store: MemoryPolicyStore;
  let engine: AuthorizationEngine;

  const basePolicy: PolicyDefinition = {
    policyId: 'default',
    version: 1,
    maxAmountCents: parseMoneyToCents(50.0), // $50 max transaction
    maxDailyAmountCents: parseMoneyToCents(200.0), // $200 max daily spend
    approvalThresholdCents: parseMoneyToCents(25.0), // $25 HITL threshold
    allowedCurrencies: ['USD', 'EUR', 'GBP'],
    allowedMerchants: ['vendor@trusted.com', 'merchant@sandbox.paypal.com'],
    blockedMerchants: ['hacker@blackhat.com', 'malicious.com'],
    allowedTools: ['paypal_payment', 'payment_gateway'],
    allowedOperations: ['create_order', 'capture_payment'],
    velocityLimit: 5, // max 5 transactions per window
    velocityWindowSeconds: 3600, // 1 hour
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const createRequest = (overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest => ({
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    agentId: 'agent-finance-01',
    tool: 'paypal_payment',
    operation: 'capture_payment',
    amount: 15.0,
    currency: 'USD',
    merchant: { email: 'vendor@trusted.com' },
    description: 'Cloud subscription renewal',
    ...overrides,
  });

  beforeEach(async () => {
    store = new MemoryPolicyStore();
    await store.createPolicyVersion(basePolicy);
    engine = new AuthorizationEngine({
      store,
      defaultPolicy: basePolicy,
    });
  });

  it('Under-limit purchase is allowed', async () => {
    const request = createRequest({ amount: 15.0 }); // $15 < $25 threshold < $50 limit
    const decision = await engine.authorize(request);

    expect(decision.decision).toBe('ALLOW');
    expect(decision.authorizationToken).toBeDefined();
    expect(decision.authorizationToken?.startsWith('auth_')).toBe(true);
    expect(decision.amountCents).toBe(1500n);
    expect(decision.amountFormatted).toBe('15.00');
    expect(decision.violations).toHaveLength(0);
    expect(decision.isExecuted).toBe(false);
  });

  it('Over-limit purchase is blocked', async () => {
    const request = createRequest({ amount: 65.0 }); // $65 > $50 limit
    const decision = await engine.authorize(request);

    expect(decision.decision).toBe('BLOCK');
    expect(decision.authorizationToken).toBeUndefined();
    expect(decision.violations.some((v) => v.includes('MAX_AMOUNT_EXCEEDED'))).toBe(true);
    expect(decision.reason).toContain('exceeds maximum single transaction limit');
  });

  it('Daily budget exhaustion is blocked', async () => {
    // Perform 4 purchases of $45 ($180 total, within $200 daily limit)
    for (let i = 0; i < 4; i++) {
      const req = createRequest({
        amount: 20.0, // under HITL threshold $25
      });
      const res = await engine.authorize(req);
      expect(res.decision).toBe('ALLOW');
    }

    // Now daily spend is $80. Let's record spend until close to $200.
    const today = new Date().toISOString().split('T')[0]!;
    // Spend already $80. Let's add $110 to make it $190.
    await store.recordSpendWithAtomicCheck('agent-finance-01', today, parseMoneyToCents(110.0), basePolicy.maxDailyAmountCents);

    // Now $190 is spent of $200 daily budget.
    // An attempt of $20.00 should be BLOCKED because $190 + $20 = $210 > $200.
    const overBudgetReq = createRequest({ amount: 20.0 });
    const blockedDecision = await engine.authorize(overBudgetReq);

    expect(blockedDecision.decision).toBe('BLOCK');
    expect(blockedDecision.violations).toContain('DAILY_LIMIT_EXCEEDED');
    expect(blockedDecision.reason).toContain('exceeds daily limit');
  });

  it('Unknown merchant is blocked', async () => {
    // Policy has allowedMerchants: ['vendor@trusted.com', 'merchant@sandbox.paypal.com']
    const request = createRequest({
      merchant: { email: 'unknown-vendor@untrusted.com' },
    });
    const decision = await engine.authorize(request);

    expect(decision.decision).toBe('BLOCK');
    expect(decision.violations.some((v) => v.includes('UNKNOWN_MERCHANT'))).toBe(true);
  });

  it('Blocked merchant on denylist is blocked', async () => {
    const request = createRequest({
      merchant: { email: 'hacker@blackhat.com' },
    });
    const decision = await engine.authorize(request);

    expect(decision.decision).toBe('BLOCK');
    expect(decision.violations.some((v) => v.includes('BLOCKED_MERCHANT'))).toBe(true);
  });

  it('Disallowed tool is blocked', async () => {
    const request = createRequest({
      tool: 'unauthorized_crypto_transfer',
    });
    const decision = await engine.authorize(request);

    expect(decision.decision).toBe('BLOCK');
    expect(decision.violations.some((v) => v.includes('DISALLOWED_TOOL'))).toBe(true);
  });

  it('Disallowed operation is blocked', async () => {
    const request = createRequest({
      operation: 'delete_merchant_account',
    });
    const decision = await engine.authorize(request);

    expect(decision.decision).toBe('BLOCK');
    expect(decision.violations.some((v) => v.includes('DISALLOWED_OPERATION'))).toBe(true);
  });

  it('High-value purchase is held (payment execution prohibited without approval token)', async () => {
    // $35 >= $25 threshold, <= $50 single limit
    const request = createRequest({
      amount: 35.0,
      humanApprovalToken: undefined, // no approval token
    });
    const decision = await engine.authorize(request);

    expect(decision.decision).toBe('HOLD');
    expect(decision.authorizationToken).toBeUndefined(); // NO authorization token issued
    expect(decision.violations).toContain('HOLD_PENDING_APPROVAL');
    expect(decision.reason).toContain('Payment execution is prohibited pending human approval');

    // When valid approval token is provided, it is ALLOWED
    const approvedRequest = createRequest({
      amount: 35.0,
      humanApprovalToken: 'human-approval-token-verified-12345',
    });
    const approvedDecision = await engine.authorize(approvedRequest);
    expect(approvedDecision.decision).toBe('ALLOW');
    expect(approvedDecision.authorizationToken).toBeDefined();
  });

  it('Concurrent purchases cannot overspend the daily limit', async () => {
    // Set daily limit to $100
    const strictPolicy: PolicyDefinition = {
      ...basePolicy,
      policyId: 'strict-concurrent-agent',
      maxDailyAmountCents: parseMoneyToCents(100.0),
    };
    await store.createPolicyVersion(strictPolicy);

    // 10 concurrent requests of $15 each (total $150 attempted, daily limit is $100)
    // Exactly 6 requests ($90) should succeed; the remaining 4 requests must be BLOCKED!
    const requests = Array.from({ length: 10 }, (_, i) =>
      createRequest({
        agentId: 'strict-concurrent-agent',
        requestId: `concurrent-req-${i}`,
        amount: 15.0,
      })
    );

    const decisions = await Promise.all(requests.map((r) => engine.authorize(r)));

    const allowed = decisions.filter((d) => d.decision === 'ALLOW');
    const blocked = decisions.filter((d) => d.decision === 'BLOCK');

    expect(allowed.length).toBe(6); // 6 * $15 = $90
    expect(blocked.length).toBe(4); // $90 + $15 = $105 > $100

    // Verify total recorded daily spend in store is exactly $90
    const today = new Date().toISOString().split('T')[0]!;
    const totalDailySpend = await store.getDailySpend('strict-concurrent-agent', today);
    expect(totalDailySpend).toBe(9000n); // $90.00
  });

  it('Duplicate requests cannot double-execute', async () => {
    const request = createRequest({ amount: 18.0 });
    const decision = await engine.authorize(request);
    expect(decision.decision).toBe('ALLOW');
    const token = decision.authorizationToken!;

    // 1. Verify and mark executed first time -> SUCCESS
    const firstExecution = await engine.verifyAndMarkExecuted(request.requestId, token, {
      agentId: request.agentId,
      amount: request.amount,
      currency: request.currency,
      merchantEmail: request.merchant.email,
    });
    expect(firstExecution.valid).toBe(true);

    // 2. Duplicate execution attempt -> BLOCKED (Duplicate execution prohibited)
    const duplicateExecution = await engine.verifyAndMarkExecuted(request.requestId, token, {
      agentId: request.agentId,
      amount: request.amount,
      currency: request.currency,
      merchantEmail: request.merchant.email,
    });
    expect(duplicateExecution.valid).toBe(false);
    expect(duplicateExecution.reason).toContain('Duplicate execution prohibited');
  });

  it('Invalid money values and currencies are rejected without floating point errors', async () => {
    // Negative value
    const negRes = await engine.authorize(createRequest({ amount: -10.0 }));
    expect(negRes.decision).toBe('BLOCK');
    expect(negRes.reason).toContain('Invalid money value');

    // Zero
    const zeroRes = await engine.authorize(createRequest({ amount: 0 }));
    expect(zeroRes.decision).toBe('BLOCK');
    expect(zeroRes.reason).toContain('Invalid money value');

    // Fractions of a cent (e.g. 10.505)
    const fracRes = await engine.authorize(createRequest({ amount: 10.505 }));
    expect(fracRes.decision).toBe('BLOCK');
    expect(fracRes.reason).toContain('Invalid money value');

    // Non-numeric string
    const stringRes = await engine.authorize(createRequest({ amount: 'one-hundred' }));
    expect(stringRes.decision).toBe('BLOCK');
    expect(stringRes.reason).toContain('Invalid money value');

    // Disallowed currency
    const currRes = await engine.authorize(createRequest({ currency: 'JPY' }));
    expect(currRes.decision).toBe('BLOCK');
    expect(currRes.violations.some((v) => v.includes('CURRENCY_NOT_ALLOWED'))).toBe(true);
  });

  it('Previously blocked action cannot become executable through a retry', async () => {
    const fixedReqId = 'permanent-blocked-req-123';
    // Send over-limit purchase ($500)
    const block1 = await engine.authorize(
      createRequest({
        requestId: fixedReqId,
        amount: 500.0,
      })
    );
    expect(block1.decision).toBe('BLOCK');

    // An agent attempts to retry with the same requestId but a modified lower amount ($10)
    // The engine enforces idempotency and previously recorded BLOCK status!
    const retry = await engine.authorize(
      createRequest({
        requestId: fixedReqId,
        amount: 10.0,
      })
    );

    expect(retry.decision).toBe('BLOCK');
    expect(retry.reason).toContain('MAX_AMOUNT_EXCEEDED');
  });

  it('Per-agent velocity limit blocks rapid excess requests', async () => {
    // Policy velocity limit is 5 per hour
    for (let i = 0; i < 5; i++) {
      const res = await engine.authorize(createRequest({ amount: 5.0 }));
      expect(res.decision).toBe('ALLOW');
    }

    // 6th request within window exceeds velocity limit
    const velocityExceeded = await engine.authorize(createRequest({ amount: 5.0 }));
    expect(velocityExceeded.decision).toBe('BLOCK');
    expect(velocityExceeded.violations.some((v) => v.includes('VELOCITY_LIMIT_EXCEEDED'))).toBe(true);
  });

  it('Missing policy for an agent defaults to deny-by-default when no default policy exists', async () => {
    const emptyStore = new MemoryPolicyStore();
    const strictEngine = new AuthorizationEngine({
      store: emptyStore,
      defaultPolicy: undefined,
    });

    const res = await strictEngine.authorize(createRequest({ agentId: 'unconfigured-agent' }));
    expect(res.decision).toBe('BLOCK');
    expect(res.violations).toContain('MISSING_POLICY_DENY_BY_DEFAULT');
  });

  describe('Integration with PayPal Adapter', () => {
    it('PayPal adapter rejects execution without a server-issued authorization token', async () => {
      const mockClient: IPayPalClient = {
        isConfigured: () => true,
        getAccessToken: async () => 'test-token',
        createOrder: async () => ({ id: 'ORDER-1', status: 'CREATED', intent: 'CAPTURE', purchase_units: [], links: [] }),
        getOrder: async () => ({ id: 'ORDER-1', status: 'APPROVED', intent: 'CAPTURE', purchase_units: [], links: [] }),
        captureOrder: async () => ({ id: 'ORDER-1', status: 'COMPLETED', purchase_units: [] }),
        reconcileOrder: async () => ({ isReconciled: true, orderId: 'ORDER-1', status: 'APPROVED', amount: 15, currency: 'USD', discrepancies: [], reconciledAt: '' }),
      };

      const adapter = new PayPalSandboxAdapter(mockClient, true, engine);

      const request = {
        agentId: 'agent-finance-01',
        amount: 15.0,
        currency: 'USD',
        recipient: { email: 'vendor@trusted.com' },
        description: 'Test purchase',
        approved: true, // Client attempts to supply approved: true
      };

      // 1. Calling executePayment WITHOUT server authorization token -> REJECTED
      const unauthResult = await adapter.executePayment(request, 'req-unauthorized-attempt');
      expect(unauthResult.executed).toBe(false);
      expect(unauthResult.error).toBe('MISSING_SERVER_AUTHORIZATION');

      // 2. Calling with server-issued authorization token -> SUCCEEDS
      const authDecision = await engine.authorize({
        requestId: 'req-authorized-attempt',
        agentId: request.agentId,
        tool: 'paypal_payment',
        operation: 'create_order',
        amount: request.amount,
        currency: request.currency,
        merchant: request.recipient,
        description: request.description,
      });

      expect(authDecision.decision).toBe('ALLOW');

      const authResult = await adapter.executePayment(request, 'req-authorized-attempt', {
        serverAuthorizationToken: authDecision.authorizationToken!,
      });

      expect(authResult.executed).toBe(true);
      expect(authResult.paypalOrderId).toBe('ORDER-1');
    });

    it('PayPal adapter rejects tampered parameters even if valid token is provided', async () => {
      const mockClient: IPayPalClient = {
        isConfigured: () => true,
        getAccessToken: async () => 'test-token',
        createOrder: async () => ({ id: 'ORDER-1', status: 'CREATED', intent: 'CAPTURE', purchase_units: [], links: [] }),
        getOrder: async () => ({ id: 'ORDER-1', status: 'APPROVED', intent: 'CAPTURE', purchase_units: [], links: [] }),
        captureOrder: async () => ({ id: 'ORDER-1', status: 'COMPLETED', purchase_units: [] }),
        reconcileOrder: async () => ({ isReconciled: true, orderId: 'ORDER-1', status: 'APPROVED', amount: 15, currency: 'USD', discrepancies: [], reconciledAt: '' }),
      };

      const adapter = new PayPalSandboxAdapter(mockClient, true, engine);

      // Authorized for $15
      const authDecision = await engine.authorize({
        requestId: 'req-tamper-test',
        agentId: 'agent-finance-01',
        tool: 'paypal_payment',
        operation: 'create_order',
        amount: 15.0,
        currency: 'USD',
        merchant: { email: 'vendor@trusted.com' },
        description: 'Test purchase',
      });

      // Agent tries to execute with tampered amount $50
      const tamperedResult = await adapter.executePayment(
        {
          agentId: 'agent-finance-01',
          amount: 50.0, // Tampered!
          currency: 'USD',
          recipient: { email: 'vendor@trusted.com' },
          description: 'Tampered attempt',
        },
        'req-tamper-test',
        {
          serverAuthorizationToken: authDecision.authorizationToken!,
        }
      );

      expect(tamperedResult.executed).toBe(false);
      expect(tamperedResult.error).toBe('INVALID_SERVER_AUTHORIZATION');
      expect(tamperedResult.message).toContain('Amount tampering detected');
    });
  });
});
