import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { sanitizeAuditPayload } from '../../src/audit/sanitizer';
import { MemoryApprovalStore } from '../../src/approval/approval-store';
import { HumanApprovalService } from '../../src/approval/service';
import { MemoryReviewerAuthService } from '../../src/auth/service';
import { PolicyEngine } from '../../src/policy/engine';
import { MemoryPolicyStore } from '../../src/policy/policy-store';
import { IPayPalSandboxAdapter } from '../../src/payment/types';

describe('AgentGuard Security Regression & Hardening Suite', () => {
  let app: FastifyInstance;
  let auditRepo: MemoryAuditRepository;
  let approvalStore: MemoryApprovalStore;
  let approvalService: HumanApprovalService;
  let authService: MemoryReviewerAuthService;
  let policyStore: MemoryPolicyStore;
  let policyEngine: PolicyEngine;
  let mockPaymentAdapter: IPayPalSandboxAdapter;
  let executePaymentCalls: number;

  beforeEach(async () => {
    executePaymentCalls = 0;
    auditRepo = new MemoryAuditRepository();
    approvalStore = new MemoryApprovalStore();
    policyStore = new MemoryPolicyStore();
    authService = new MemoryReviewerAuthService();
    await authService.seedReviewer('security_admin', 'ChangeMeNow123!', 'Security Admin', 'ADMIN');

    policyEngine = new PolicyEngine({
      policyStore,
      defaultPolicy: {
        policyId: 'default',
        version: 1,
        maxAmountCents: 5000n, // $50 max
        maxDailyAmountCents: 10000n, // $100 daily
        approvalThresholdCents: 2500n, // $25 threshold
        allowedCurrencies: ['USD', 'EUR', 'GBP'],
        blockedMerchants: ['hacker@blackhat.com'],
        allowedTools: ['paypal_payment', 'payment_gateway', 'paypal_sandbox'],
        allowedOperations: ['create_order', 'capture_payment', 'initiate_payment'],
        velocityLimit: 10,
        velocityWindowSeconds: 3600,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    });

    approvalService = new HumanApprovalService({
      store: approvalStore,
      policyEngine,
      auditRepo,
    });

    policyEngine.setApprovalStore(approvalStore);

    mockPaymentAdapter = {
      isConfigured: () => true,
      verifyCredentials: async () => true,
      createOrder: async () => ({
        id: 'ORDER_TEST_MOCK_123',
        status: 'CREATED',
        intent: 'CAPTURE',
        purchase_units: [],
        links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/checkout?token=123', method: 'GET' }],
      }),
      getOrderDetails: async () => ({
        id: 'ORDER_TEST_MOCK_123',
        status: 'APPROVED',
        intent: 'CAPTURE',
        purchase_units: [],
        links: [],
      }),
      reconcileOrder: async () => ({
        isReconciled: true,
        orderId: 'ORDER_TEST_MOCK_123',
        status: 'APPROVED',
        captureStatus: 'NONE',
        amount: 35.0,
        currency: 'USD',
        discrepancies: [],
        reconciledAt: new Date().toISOString(),
      }),
      executePayment: async () => {
        executePaymentCalls++;
        return {
          executed: true,
          status: 'COMPLETED',
          message: 'PayPal Sandbox order executed successfully.',
          requestId: 'test_req',
          agentId: 'test_agent',
          amount: 35.0,
          currency: 'USD',
          recipientEmail: 'vendor@digital.com',
          paypalOrderId: 'ORDER_TEST_MOCK_123',
          paypalCaptureId: 'CAPTURE_MOCK_999',
          executionTimestamp: new Date().toISOString(),
        };
      },
    };

    app = buildApp({
      auditRepo,
      approvalService,
      authService,
      policyEngine,
      paymentAdapter: mockPaymentAdapter,
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // =========================================================================
  // VULNERABILITY 1: Arbitrary Client Token Human Approval Bypass
  // =========================================================================
  describe('Vulnerability 1: Human Approval Token Forgery & Bypass Resistance', () => {
    it('rejects unapproved / forged humanApprovalToken and halts in HOLD', async () => {
      // Amount is $35.00 >= $25.00 approvalThreshold.
      // Attacker attempts to provide a forged/arbitrary string as humanApprovalToken
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        payload: {
          agentId: 'rogue-agent',
          amount: 35.0,
          currency: 'USD',
          recipient: { email: 'vendor@digital.com' },
          description: 'High-value purchase attempt with forged approval token',
          humanApprovalToken: 'forged_arbitrary_token_12345',
        },
      });

      // Must be rejected with 403 (Invalid or unrecognized approval token)
      expect(res.statusCode).toBe(403);
      expect(executePaymentCalls).toBe(0); // Zero payment executed!

      const body = res.json();
      expect(body.message).toMatch(/Invalid or unrecognized human approval token/i);
    });

    it('rejects capture attempt with forged humanApprovalToken', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/orders/ORDER_TEST_MOCK_123/capture',
        payload: {
          agentId: 'rogue-agent',
          amount: 35.0,
          currency: 'USD',
          recipient: { email: 'vendor@digital.com' },
          humanApprovalToken: 'forged_arbitrary_token_12345',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(executePaymentCalls).toBe(0); // Zero payment executed!
    });
  });

  // =========================================================================
  // VULNERABILITY 2: Unauthenticated Policy Update
  // =========================================================================
  describe('Vulnerability 2: Authentication on Policy Update Routes', () => {
    it('rejects unauthenticated policy update attempts with HTTP 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/policies/update',
        payload: {
          policyId: 'default',
          maxAmount: 999999, // Attempt to raise cap to 1 million
          maxDailyAmount: 9999999,
          approvalThreshold: 999999,
          blockedMerchants: [],
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error).toBe('UNAUTHORIZED');

      // Verify active policy cap was NOT altered
      const activePolicy = await policyStore.getActivePolicy('default');
      expect(activePolicy?.maxAmountCents).toBe(5000n); // Remains $50.00
    });

    it('allows policy update when valid reviewer Bearer token is provided', async () => {
      // 1. Login as reviewer
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: 'security_admin',
          password: 'ChangeMeNow123!',
        },
      });

      expect(loginRes.statusCode).toBe(200);
      const { sessionToken } = loginRes.json();

      // 2. Perform authenticated policy update
      const updateRes = await app.inject({
        method: 'POST',
        url: '/api/v1/policies/update',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          policyId: 'default',
          maxAmount: 60.0,
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const activePolicy = await policyStore.getActivePolicy('default');
      expect(activePolicy?.maxAmountCents).toBe(6000n);
    });
  });

  // =========================================================================
  // VULNERABILITY 3: Secret Leakage & Incomplete Audit Sanitization
  // =========================================================================
  describe('Vulnerability 3: Secret Sanitization and Redaction', () => {
    it('redacts serverAuthorizationToken, passwords, and sensitive keys from audit payloads', () => {
      const payload = {
        agentId: 'ai-agent-1',
        serverAuthorizationToken: 'auth_99887766554433221100aabbccddeeff',
        humanApprovalToken: 'auth_11223344556677889900aabbccddeeff',
        clientSecret: 'secret_live_paypal_123',
        password: 'Password123!',
        nested: {
          apiKey: 'sk-or-v1-supersecret',
          authToken: 'Bearer eyJhbGciOi...',
        },
      };

      const sanitized = sanitizeAuditPayload(payload);
      expect(sanitized).not.toBeNull();
      expect(sanitized?.serverAuthorizationToken).toBe('[REDACTED]');
      expect(sanitized?.humanApprovalToken).toBe('[REDACTED]');
      expect(sanitized?.clientSecret).toBe('[REDACTED]');
      expect(sanitized?.password).toBe('[REDACTED]');
      expect((sanitized?.nested as Record<string, unknown>)?.apiKey).toBe('[REDACTED]');
      expect((sanitized?.nested as Record<string, unknown>)?.authToken).toBe('[REDACTED]');
    });
  });

  // =========================================================================
  // VULNERABILITY 4: Replayed Approvals & Parameter Tampering
  // =========================================================================
  describe('Vulnerability 4: Approval Replay and Parameter Tampering Resistance', () => {
    it('prevents reusing a consumed single-use authorization token (HTTP 409)', async () => {
      // 1. Create pending approval
      const pending = await approvalService.createPendingApproval({
        requestId: 'req-replay-test-01',
        agentId: 'agent-ops',
        policyId: 'default',
        policyVersion: 1,
        tool: 'paypal_payment',
        operation: 'create_order',
        amountCents: 3500n,
        amountFormatted: '35.00',
        currency: 'USD',
        merchant: 'vendor@digital.com',
        description: 'Single-use test',
      });

      // 2. Approve action as reviewer
      const approved = await approvalService.approveAction(pending.id, 'security_admin');
      const validToken = approved.serverAuthorizationToken!;

      // 3. First execution -> Succeeds
      const firstExec = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        payload: {
          agentId: 'agent-ops',
          amount: 35.0,
          currency: 'USD',
          recipient: { email: 'vendor@digital.com' },
          description: 'Single-use test',
          humanApprovalToken: validToken,
        },
      });
      expect(firstExec.statusCode).toBe(200);
      expect(executePaymentCalls).toBe(1);

      // 4. Second execution with SAME token (replay attempt) -> MUST BE REJECTED WITH 409
      const replayExec = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        payload: {
          agentId: 'agent-ops',
          amount: 35.0,
          currency: 'USD',
          recipient: { email: 'vendor@digital.com' },
          description: 'Single-use test replay',
          humanApprovalToken: validToken,
        },
      });

      expect(replayExec.statusCode).toBe(409);
      expect(executePaymentCalls).toBe(1); // Executed exactly once; replay blocked!
    });

    it('rejects approval token if amount or recipient is tampered (HTTP 403)', async () => {
      // 1. Create pending approval for $35.00
      const pending = await approvalService.createPendingApproval({
        requestId: 'req-tamper-test-01',
        agentId: 'agent-ops',
        policyId: 'default',
        policyVersion: 1,
        tool: 'paypal_payment',
        operation: 'create_order',
        amountCents: 3500n,
        amountFormatted: '35.00',
        currency: 'USD',
        merchant: 'vendor@digital.com',
        description: 'Tamper test',
      });

      const approved = await approvalService.approveAction(pending.id, 'security_admin');
      const validToken = approved.serverAuthorizationToken!;

      // 2. Attacker modifies amount to $49.00 while using the $35.00 approval token
      const tamperedAmountRes = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        payload: {
          agentId: 'agent-ops',
          amount: 49.0, // Tampered!
          currency: 'USD',
          recipient: { email: 'vendor@digital.com' },
          description: 'Tamper test',
          humanApprovalToken: validToken,
        },
      });

      expect(tamperedAmountRes.statusCode).toBe(403);
      expect(executePaymentCalls).toBe(0);

      // 3. Attacker modifies recipient to attacker@hacker.com
      const tamperedMerchantRes = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        payload: {
          agentId: 'agent-ops',
          amount: 35.0,
          currency: 'USD',
          recipient: { email: 'attacker@hacker.com' }, // Tampered!
          description: 'Tamper test',
          humanApprovalToken: validToken,
        },
      });

      expect(tamperedMerchantRes.statusCode).toBe(403);
      expect(executePaymentCalls).toBe(0);
    });
  });

  // =========================================================================
  // VULNERABILITY 5: Oversized Payload & API Abuse DoS
  // =========================================================================
  describe('Vulnerability 5: Payload Limits & Security Response Headers', () => {
    it('rejects oversized JSON payloads exceeding 512KB with HTTP 413', async () => {
      // Create payload > 512 KB
      const largeDescription = 'A'.repeat(600 * 1024); // 600 KB string
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/initiate',
        payload: {
          agentId: 'test-agent',
          amount: 10.0,
          currency: 'USD',
          recipient: { email: 'vendor@digital.com' },
          description: largeDescription,
        },
      });

      expect(res.statusCode).toBe(413);
    });

    it('emits standard security response headers on all API responses', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-xss-protection']).toBe('1; mode=block');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('emits no-store cache control headers on sensitive API endpoints', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events',
      });

      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.headers['pragma']).toBe('no-cache');
    });
  });

  // =========================================================================
  // VULNERABILITY 6: Concurrent Spending-Limit Bypass
  // =========================================================================
  describe('Vulnerability 6: Concurrent Spending-Limit Race Condition Protection', () => {
    it('serializes concurrent requests so total spend cannot exceed daily limit', async () => {
      // Set daily limit to $50.00 for agent so 4 x $15.00 ($60.00 total) exceeds it.
      // Each transaction is $15.00 (under the $25.00 approval threshold so it attempts immediate execution).
      // Exactly 3 must succeed ($45.00 <= $50.00), and the 4th must be blocked ($60.00 > $50.00).
      await policyStore.createPolicyVersion({
        policyId: 'concurrent-spend-agent',
        version: 1,
        maxAmountCents: 5000n,
        maxDailyAmountCents: 5000n, // $50 daily cap
        approvalThresholdCents: 2500n,
        allowedCurrencies: ['USD'],
        blockedMerchants: [],
        allowedTools: ['paypal_payment'],
        allowedOperations: ['create_order'],
        velocityLimit: 10,
        velocityWindowSeconds: 3600,
        isActive: true,
      });

      const promises = [1, 2, 3, 4].map((i) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/payments/initiate',
          payload: {
            agentId: 'concurrent-spend-agent',
            amount: 15.0,
            currency: 'USD',
            recipient: { email: 'vendor@digital.com' },
            description: `Concurrent transaction ${i}`,
          },
        })
      );

      const results = await Promise.all(promises);
      const statusCodes = results.map((r) => r.statusCode);

      const allowedCount = statusCodes.filter((s) => s === 200).length;
      const blockedCount = statusCodes.filter((s) => s === 403).length;

      expect(allowedCount).toBe(3);
      expect(blockedCount).toBe(1);
    });
  });
});
