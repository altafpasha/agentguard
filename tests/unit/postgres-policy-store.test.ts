import { describe, it, expect, vi } from 'vitest';
import { PostgresPolicyStore } from '../../src/policy/policy-store';
import { PolicyDefinition, AuthorizationDecisionRecord } from '../../src/policy/types';

describe('PostgresPolicyStore Module (PostgreSQL 16 Durable State)', () => {
  it('retrieves active policy from database', async () => {
    const store = new PostgresPolicyStore('postgresql://user:pass@localhost:5432/db');
    const pool = (store as unknown as { pool: { query: (...args: unknown[]) => Promise<unknown> } }).pool;

    const fakeRow = {
      id: 'uuid-pol-1',
      policy_id: 'default',
      version: 2,
      max_amount_cents: '5000',
      max_daily_amount_cents: '20000',
      approval_threshold_cents: '2500',
      allowed_currencies: ['USD', 'EUR'],
      allowed_merchants: null,
      blocked_merchants: ['hacker@evil.com'],
      allowed_tools: ['paypal_payment'],
      allowed_operations: ['capture_payment'],
      velocity_limit: 5,
      velocity_window_seconds: 3600,
      is_active: true,
      created_at: new Date('2026-10-26T08:00:00Z'),
    };

    vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [fakeRow] } as never);

    const policy = await store.getActivePolicy('default');

    expect(policy).toBeDefined();
    expect(policy?.policyId).toBe('default');
    expect(policy?.version).toBe(2);
    expect(policy?.maxAmountCents).toBe(5000n);
    expect(policy?.maxDailyAmountCents).toBe(20000n);
    expect(policy?.isActive).toBe(true);
  });

  it('creates versioned policy inside a database transaction', async () => {
    const store = new PostgresPolicyStore('postgresql://user:pass@localhost:5432/db');
    const pool = (store as unknown as { pool: { connect: () => Promise<unknown> } }).pool;

    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE is_active = FALSE
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-new-pol', created_at: new Date('2026-10-26T08:30:00Z') }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: vi.fn(),
    };

    vi.spyOn(pool, 'connect').mockResolvedValueOnce(mockClient as never);

    const newPolicy: Omit<PolicyDefinition, 'id' | 'createdAt'> = {
      policyId: 'agent-ops',
      version: 1,
      maxAmountCents: 3000n,
      maxDailyAmountCents: 15000n,
      approvalThresholdCents: 2000n,
      allowedCurrencies: ['USD'],
      blockedMerchants: [],
      allowedTools: ['paypal_payment'],
      allowedOperations: ['create_order'],
      velocityLimit: 3,
      velocityWindowSeconds: 1800,
      isActive: true,
    };

    const created = await store.createPolicyVersion(newPolicy);

    expect(created.id).toBe('uuid-new-pol');
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('performs atomic spend limit checks using row-level locking (SELECT ... FOR UPDATE)', async () => {
    const store = new PostgresPolicyStore('postgresql://user:pass@localhost:5432/db');
    const pool = (store as unknown as { pool: { connect: () => Promise<unknown> } }).pool;

    // Test Case 1: Within limit -> locks row, updates spend, commits
    const mockClientSuccess = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT ON CONFLICT DO NOTHING
        .mockResolvedValueOnce({ rows: [{ spent_cents: '3000' }] }) // SELECT ... FOR UPDATE (current $30)
        .mockResolvedValueOnce({ rows: [{ spent_cents: '5000' }] }) // UPDATE ... RETURNING (new $50)
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: vi.fn(),
    };

    vi.spyOn(pool, 'connect').mockResolvedValueOnce(mockClientSuccess as never);

    const successRes = await store.recordSpendWithAtomicCheck(
      'agent-1',
      '2026-10-26',
      2000n, // $20
      10000n // $100 limit
    );

    expect(successRes.success).toBe(true);
    expect(successRes.currentDailySpendCents).toBe(5000n);
    expect(mockClientSuccess.query).toHaveBeenCalledWith('COMMIT');

    // Test Case 2: Exceeds limit -> commits without updating
    const mockClientOverLimit = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT ON CONFLICT DO NOTHING
        .mockResolvedValueOnce({ rows: [{ spent_cents: '9500' }] }) // SELECT ... FOR UPDATE ($95 spent)
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: vi.fn(),
    };

    vi.spyOn(pool, 'connect').mockResolvedValueOnce(mockClientOverLimit as never);

    const failRes = await store.recordSpendWithAtomicCheck(
      'agent-1',
      '2026-10-26',
      1000n, // $10, would make total $105 > $100 limit
      10000n // $100 limit
    );

    expect(failRes.success).toBe(false);
    expect(failRes.currentDailySpendCents).toBe(9500n);
  });

  it('persists and retrieves decision records by requestId', async () => {
    const store = new PostgresPolicyStore('postgresql://user:pass@localhost:5432/db');
    const pool = (store as unknown as { pool: { query: (...args: unknown[]) => Promise<unknown> } }).pool;

    const fakeRow = {
      id: 'dec-123',
      request_id: 'req-save-test',
      agent_id: 'agent-1',
      policy_id: 'default',
      policy_version: 1,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amount_cents: '1500',
      amount_formatted: '15.00',
      currency: 'USD',
      merchant: 'vendor@store.com',
      decision: 'ALLOW',
      reason: 'Authorized',
      violations: '[]',
      authorization_token: 'auth_xyz',
      is_executed: false,
      executed_at: null,
      expires_at: new Date('2026-10-26T09:00:00Z'),
      created_at: new Date('2026-10-26T08:45:00Z'),
    };

    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [{ id: 'dec-123', created_at: fakeRow.created_at }] } as never) // save
      .mockResolvedValueOnce({ rows: [fakeRow] } as never); // get

    const decisionRecord: AuthorizationDecisionRecord = {
      requestId: 'req-save-test',
      agentId: 'agent-1',
      policyId: 'default',
      policyVersion: 1,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amountCents: 1500n,
      amountFormatted: '15.00',
      currency: 'USD',
      merchant: 'vendor@store.com',
      decision: 'ALLOW',
      reason: 'Authorized',
      violations: [],
      authorizationToken: 'auth_xyz',
      isExecuted: false,
      expiresAt: '2026-10-26T09:00:00Z',
      createdAt: '2026-10-26T08:45:00Z',
    };

    const saved = await store.saveDecision(decisionRecord);
    expect(saved.id).toBe('dec-123');

    const retrieved = await store.getDecisionByRequestId('req-save-test');
    expect(retrieved?.decision).toBe('ALLOW');
    expect(retrieved?.authorizationToken).toBe('auth_xyz');
    expect(retrieved?.amountCents).toBe(1500n);
  });
});
