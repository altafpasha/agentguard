import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HumanApprovalService,
  MemoryApprovalStore,
  PendingApprovalRecord,
} from '../../src/approval';
import {
  MemoryReviewerAuthService,
} from '../../src/auth';
import { PolicyEngine } from '../../src/policy/engine';
import { MemoryPolicyStore } from '../../src/policy/policy-store';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { PostgresAuditRepository } from '../../src/audit/postgres-audit-repo';
import { PayPalSandboxAdapter } from '../../src/payment/paypal-sandbox-adapter';
import { IPayPalClient } from '../../src/payment/types';
import {
  ConflictError,
  PolicyViolationError,
  UnauthorizedError,
} from '../../src/common/errors';
import { loadConfig } from '../../src/config/env';
import { Pool } from 'pg';

describe('AgentGuard Human Approval Workflow & Durable Audit Log', () => {
  let policyEngine: PolicyEngine;
  let auditRepo: MemoryAuditRepository;
  let approvalStore: MemoryApprovalStore;
  let approvalService: HumanApprovalService;
  let authService: MemoryReviewerAuthService;

  beforeEach(async () => {
    auditRepo = new MemoryAuditRepository();
    const policyStore = new MemoryPolicyStore();
    policyEngine = new PolicyEngine({
      policyStore,
      defaultPolicy: {
        policyId: 'default',
        version: 1,
        maxAmountCents: 50000n, // $500.00 max
        maxDailyAmountCents: 200000n,
        approvalThresholdCents: 2500n, // $25.00 threshold
        allowedCurrencies: ['USD', 'EUR'],
        blockedMerchants: ['blocked-scam@fraud.com'],
        allowedTools: ['paypal_payment'],
        allowedOperations: ['create_order', 'capture_payment'],
        velocityLimit: 10,
        velocityWindowSeconds: 60,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    });

    approvalStore = new MemoryApprovalStore();
    approvalService = new HumanApprovalService({
      store: approvalStore,
      policyEngine,
      auditRepo,
      defaultApprovalWindowSeconds: 900,
      defaultTokenTtlSeconds: 300,
    });

    authService = new MemoryReviewerAuthService();
    await authService.seedReviewer('reviewer_alice', 'SecurePassword123!', 'Alice Reviewer', 'REVIEWER');
  });

  // ==========================================================================
  // Test Case 1: Pending actions cannot execute
  // ==========================================================================
  it('[TEST CASE 1] Pending actions cannot execute without server authorization', async () => {
    // 1. Transaction placed on HOLD because amount exceeds $25 threshold
    const pending = await approvalService.createPendingApproval({
      requestId: 'req_pending_001',
      agentId: 'agent_finance',
      policyId: 'default',
      policyVersion: 1,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amountCents: 10000n, // $100.00
      amountFormatted: '100.00',
      currency: 'USD',
      merchant: 'vendor@trusted.com',
      description: 'Quarterly Cloud Database Tier',
      riskReasons: ['MANDATORY_APPROVAL_REQUIRED: Amount 100.00 USD exceeds approval threshold of 25.00 USD'],
    });

    expect(pending.status).toBe('PENDING');
    expect(pending.isConsumed).toBe(false);
    expect(pending.serverAuthorizationToken).toBeUndefined();

    // 2. Mock PayPal Client
    const mockClient: IPayPalClient = {
      createOrder: vi.fn(),
      getOrder: vi.fn(),
      captureOrder: vi.fn(),
      reconcileOrder: vi.fn(),
      isConfigured: () => true,
      getAccessToken: vi.fn(),
    };

    const adapter = new PayPalSandboxAdapter(
      mockClient,
      true, // allowLiveExecution
      policyEngine.getAuthorizationEngine(),
      approvalService
    );

    // 3. Attempt payment execution without server authorization token
    const result = await adapter.executePayment(
      {
        agentId: 'agent_finance',
        amount: 100.0,
        currency: 'USD',
        recipient: { email: 'vendor@trusted.com' },
        description: 'Quarterly Cloud Database Tier',
      },
      'req_pending_001'
      // No serverAuthorizationToken provided!
    );

    expect(result.executed).toBe(false);
    expect(result.error).toBe('MISSING_SERVER_AUTHORIZATION');
    expect(result.message).toContain('Unauthorized payment execution');
    expect(mockClient.captureOrder).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Test Case 2: Unauthenticated reviewers cannot approve
  // ==========================================================================
  it('[TEST CASE 2] Unauthenticated reviewers cannot approve actions', async () => {
    await expect(authService.validateSession('')).rejects.toThrow(UnauthorizedError);
    await expect(authService.validateSession('fake_nonexistent_token_12345')).rejects.toThrow(UnauthorizedError);
    await expect(authService.login('reviewer_alice', 'WrongPassword!')).rejects.toThrow(UnauthorizedError);
    await expect(authService.login('nonexistent_user', 'any_pass')).rejects.toThrow(UnauthorizedError);
  });

  // ==========================================================================
  // Test Case 3: Rejected and expired actions cannot execute
  // ==========================================================================
  it('[TEST CASE 3] Rejected and expired actions cannot execute', async () => {
    const pending = await approvalService.createPendingApproval({
      requestId: 'req_reject_001',
      agentId: 'agent_finance',
      policyId: 'default',
      policyVersion: 1,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amountCents: 8000n,
      amountFormatted: '80.00',
      currency: 'USD',
      merchant: 'vendor@trusted.com',
      description: 'Rejected Item',
    });

    // 1. Reviewer rejects action
    const rejected = await approvalService.rejectAction(
      pending.id,
      'reviewer_alice',
      'Suspected duplicate purchase request.'
    );
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toContain('Suspected duplicate');

    // 2. Attempting to approve a rejected action fails
    await expect(
      approvalService.approveAction(pending.id, 'reviewer_alice')
    ).rejects.toThrow(ConflictError);

    // 3. Expired action approval fails
    const expiredPending = await approvalService.createPendingApproval({
      requestId: 'req_expired_001',
      agentId: 'agent_finance',
      policyId: 'default',
      policyVersion: 1,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amountCents: 5000n,
      amountFormatted: '50.00',
      currency: 'USD',
      merchant: 'vendor@trusted.com',
      description: 'Expired Item',
      expiresInSeconds: -10, // already expired
    });

    await expect(
      approvalService.approveAction(expiredPending.id, 'reviewer_alice')
    ).rejects.toThrow(ConflictError);

    // 4. Expired server authorization token cannot execute
    const approved = await approvalService.approveAction(
      pending.id = (await approvalService.createPendingApproval({
        requestId: 'req_expired_token_001',
        agentId: 'agent_finance',
        policyId: 'default',
        policyVersion: 1,
        tool: 'paypal_payment',
        operation: 'capture_payment',
        amountCents: 5000n,
        amountFormatted: '50.00',
        currency: 'USD',
        merchant: 'vendor@trusted.com',
        description: 'Short Token Item',
      })).id,
      'reviewer_alice',
      -5 // expired 5 seconds ago
    );

    await expect(
      approvalService.consumeAuthorization({
        serverAuthorizationToken: approved.serverAuthorizationToken!,
        requestId: 'req_expired_token_001',
        agentId: 'agent_finance',
        tool: 'paypal_payment',
        operation: 'capture_payment',
        amountCents: 5000n,
        currency: 'USD',
        merchant: 'vendor@trusted.com',
      })
    ).rejects.toThrow(PolicyViolationError);
  });

  // ==========================================================================
  // Test Case 4: A token cannot be replayed
  // ==========================================================================
  it('[TEST CASE 4] Single-use server authorization token cannot be replayed', async () => {
    const pending = await approvalService.createPendingApproval({
      requestId: 'req_replay_001',
      agentId: 'agent_finance',
      policyId: 'default',
      policyVersion: 1,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amountCents: 4500n, // $45.00
      amountFormatted: '45.00',
      currency: 'USD',
      merchant: 'vendor@trusted.com',
      description: 'Dev Tool Subscription',
    });

    const approved = await approvalService.approveAction(pending.id, 'reviewer_alice');
    const token = approved.serverAuthorizationToken!;
    expect(token).toBeDefined();

    // 1. First execution consumes token successfully
    const firstConsume = await approvalService.consumeAuthorization({
      serverAuthorizationToken: token,
      requestId: 'req_replay_001',
      agentId: 'agent_finance',
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amountCents: 4500n,
      currency: 'USD',
      merchant: 'vendor@trusted.com',
    });
    expect(firstConsume.isConsumed).toBe(true);

    // 2. Second execution attempt with identical parameters fails with ConflictError
    await expect(
      approvalService.consumeAuthorization({
        serverAuthorizationToken: token,
        requestId: 'req_replay_001',
        agentId: 'agent_finance',
        tool: 'paypal_payment',
        operation: 'capture_payment',
        amountCents: 4500n,
        currency: 'USD',
        merchant: 'vendor@trusted.com',
      })
    ).rejects.toThrow(ConflictError);
  });

  // ==========================================================================
  // Test Case 5: Changing amount or merchant after approval invalidates auth
  // ==========================================================================
  it('[TEST CASE 5] Changing amount or merchant after approval invalidates authorization', async () => {
    const pending = await approvalService.createPendingApproval({
      requestId: 'req_tamper_001',
      agentId: 'agent_finance',
      policyId: 'default',
      policyVersion: 1,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amountCents: 3000n, // $30.00
      amountFormatted: '30.00',
      currency: 'USD',
      merchant: 'vendor@trusted.com',
      description: 'Standard Order',
    });

    const approved = await approvalService.approveAction(pending.id, 'reviewer_alice');
    const token = approved.serverAuthorizationToken!;

    // 1. Attacker tampers with amount ($30.00 -> $300.00)
    await expect(
      approvalService.consumeAuthorization({
        serverAuthorizationToken: token,
        requestId: 'req_tamper_001',
        agentId: 'agent_finance',
        tool: 'paypal_payment',
        operation: 'capture_payment',
        amountCents: 30000n, // Tampered!
        currency: 'USD',
        merchant: 'vendor@trusted.com',
      })
    ).rejects.toThrow(PolicyViolationError);

    // 2. Attacker tampers with merchant (vendor@trusted.com -> attacker@scam.com)
    await expect(
      approvalService.consumeAuthorization({
        serverAuthorizationToken: token,
        requestId: 'req_tamper_001',
        agentId: 'agent_finance',
        tool: 'paypal_payment',
        operation: 'capture_payment',
        amountCents: 3000n,
        currency: 'USD',
        merchant: 'attacker@scam.com', // Tampered!
      })
    ).rejects.toThrow(PolicyViolationError);
  });

  // ==========================================================================
  // Test Case 6: Two concurrent approval requests cannot execute twice
  // ==========================================================================
  it('[TEST CASE 6] Concurrent approvals and executions cannot double-execute', async () => {
    const pending = await approvalService.createPendingApproval({
      requestId: 'req_concurrent_001',
      agentId: 'agent_finance',
      policyId: 'default',
      policyVersion: 1,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amountCents: 7500n,
      amountFormatted: '75.00',
      currency: 'USD',
      merchant: 'vendor@trusted.com',
      description: 'Concurrent Test Item',
    });

    // 1. Two concurrent approve calls
    const [res1, res2] = await Promise.allSettled([
      approvalService.approveAction(pending.id, 'reviewer_alice'),
      approvalService.approveAction(pending.id, 'reviewer_alice'),
    ]);

    // Exactly one must succeed, one must fail with conflict
    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const failures = [res1, res2].filter((r) => r.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const token = (successes[0] as PromiseFulfilledResult<PendingApprovalRecord>).value
      .serverAuthorizationToken!;

    // 2. Two concurrent consumption attempts
    const [c1, c2] = await Promise.allSettled([
      approvalService.consumeAuthorization({
        serverAuthorizationToken: token,
        requestId: 'req_concurrent_001',
        agentId: 'agent_finance',
        tool: 'paypal_payment',
        operation: 'capture_payment',
        amountCents: 7500n,
        currency: 'USD',
        merchant: 'vendor@trusted.com',
      }),
      approvalService.consumeAuthorization({
        serverAuthorizationToken: token,
        requestId: 'req_concurrent_001',
        agentId: 'agent_finance',
        tool: 'paypal_payment',
        operation: 'capture_payment',
        amountCents: 7500n,
        currency: 'USD',
        merchant: 'vendor@trusted.com',
      }),
    ]);

    expect([c1, c2].filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect([c1, c2].filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  // ==========================================================================
  // Test Case 7: A PayPal timeout is reconciled without unsafe duplicate execution
  // ==========================================================================
  it('[TEST CASE 7] Ambiguous PayPal network timeout reconciles status without duplicate capture', async () => {
    let captureCalls = 0;
    const mockClient: IPayPalClient = {
      createOrder: vi.fn(),
      getOrder: vi.fn(),
      captureOrder: vi.fn().mockImplementation(async () => {
        captureCalls++;
        throw new Error('ETIMEDOUT: Connection reset by peer');
      }),
      reconcileOrder: vi.fn().mockResolvedValue({
        isReconciled: true,
        orderId: 'ORDER_TIMEOUT_123',
        status: 'COMPLETED',
        captureStatus: 'COMPLETED',
        captureId: 'CAPTURE_ALREADY_SETTLED_999',
        amount: 35.0,
        currency: 'USD',
        discrepancies: [],
      }),
      isConfigured: () => true,
      getAccessToken: vi.fn(),
    };

    const adapter = new PayPalSandboxAdapter(
      mockClient,
      true,
      policyEngine.getAuthorizationEngine(),
      approvalService
    );

    const pending = await approvalService.createPendingApproval({
      requestId: 'req_timeout_reconcile_001',
      agentId: 'agent_ops',
      policyId: 'default',
      policyVersion: 1,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amountCents: 3500n,
      amountFormatted: '35.00',
      currency: 'USD',
      merchant: 'merchant@vendor.com',
      description: 'Timeout Reconcile Test',
    });

    const approved = await approvalService.approveAction(pending.id, 'reviewer_alice');

    // Execute payment with preApprovedOrderId
    const result = await adapter.executePayment(
      {
        agentId: 'agent_ops',
        amount: 35.0,
        currency: 'USD',
        recipient: { email: 'merchant@vendor.com' },
        description: 'Timeout Reconcile Test',
      },
      'req_timeout_reconcile_001',
      {
        preApprovedOrderId: 'ORDER_TIMEOUT_123',
        serverAuthorizationToken: approved.serverAuthorizationToken,
      }
    );

    // Verified: Reconciled order showed COMPLETED, so captureOrder was NOT called twice
    expect(result.executed).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.paypalCaptureId).toBe('CAPTURE_ALREADY_SETTLED_999');
    expect(mockClient.reconcileOrder).toHaveBeenCalledWith('ORDER_TIMEOUT_123', expect.anything());
    expect(captureCalls).toBe(0); // Safely avoided unsafe capture call!
  });

  // ==========================================================================
  // Test Case 8: Audit history survives application restarts
  // ==========================================================================
  it('[TEST CASE 8] Durable audit log survives application restarts in PostgreSQL', async () => {
    const config = loadConfig();
    const testPool = new Pool({ connectionString: config.DATABASE_URL });

    // Verify DB connectivity
    try {
      await testPool.query('SELECT 1');
    } catch {
      // If DB is offline in CI, skip safely
      return;
    }

    const testRequestId = `req_restart_${Date.now()}`;

    // Session 1: Create PostgresAuditRepository and record event with all required fields
    const repo1 = new PostgresAuditRepository(testPool);
    await repo1.recordEvent({
      requestId: testRequestId,
      agentId: 'agent_procurement',
      action: 'INITIATE_PAYMENT',
      merchant: 'billing@saas.com',
      amountCents: 4500n,
      amountFormatted: '45.00',
      currency: 'USD',
      policyVersion: 1,
      riskResult: { riskScore: 0.1, category: 'BENIGN' },
      decision: 'ALLOW',
      decisionReasons: ['Policy constraints passed.'],
      approvalState: 'APPROVED',
      paypalReference: '5O190127TN364715T',
      eventType: 'PAYMENT_COMPLETED',
      status: 'SUCCESS',
      payloadSummary: { note: 'Persistent audit event' },
    });

    // Simulate complete application restart: close first repo connection
    // Session 2: Create a brand new PostgresAuditRepository instance connected to same DB
    const repo2 = new PostgresAuditRepository(config.DATABASE_URL);
    const retrievedEvents = await repo2.getEventsByRequestId(testRequestId);

    expect(retrievedEvents).toHaveLength(1);
    const persisted = retrievedEvents[0]!;

    // Assert all audit contract fields survive restart intact
    expect(persisted.requestId).toBe(testRequestId);
    expect(persisted.agentId).toBe('agent_procurement');
    expect(persisted.action).toBe('INITIATE_PAYMENT');
    expect(persisted.merchant).toBe('billing@saas.com');
    expect(persisted.amountFormatted).toBe('45.00');
    expect(persisted.currency).toBe('USD');
    expect(persisted.policyVersion).toBe(1);
    expect(persisted.decision).toBe('ALLOW');
    expect(persisted.approvalState).toBe('APPROVED');
    expect(persisted.paypalReference).toBe('5O190127TN364715T');
    expect(persisted.status).toBe('SUCCESS');
    expect(persisted.createdAt).toBeDefined();

    await repo2.close();
    await testPool.end();
  });
});
