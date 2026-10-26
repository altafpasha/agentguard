import { describe, it, expect, vi } from 'vitest';
import { PostgresAuditRepository } from '../../src/audit/postgres-audit-repo';
import { AuditRecord } from '../../src/audit/types';

describe('PostgresAuditRepository Module', () => {
  it('records audit events using parameterized queries', async () => {
    const repo = new PostgresAuditRepository('postgresql://user:pass@localhost:5432/db');

    const fakeRow = {
      id: 'uuid-123',
      request_id: 'req-abc',
      agent_id: 'agent-xyz',
      event_type: 'REQUEST_RECEIVED',
      status: 'SUCCESS',
      risk_score: '0.125',
      policy_decision: 'ALLOW',
      payload_summary: { amount: 10 },
      error_message: null,
      created_at: new Date('2026-10-26T08:00:00Z'),
    };

    // Mock pool.query
    const pool = (repo as unknown as { pool: { query: (...args: unknown[]) => Promise<unknown> } }).pool;
    const querySpy = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [fakeRow] } as never);

    const eventToRecord: AuditRecord = {
      requestId: 'req-abc',
      agentId: 'agent-xyz',
      eventType: 'REQUEST_RECEIVED',
      status: 'SUCCESS',
      riskScore: 0.125,
      policyDecision: 'ALLOW',
      payloadSummary: { amount: 10 },
    };

    const recorded = await repo.recordEvent(eventToRecord);

    expect(querySpy).toHaveBeenCalled();
    expect(recorded.id).toBe('uuid-123');
    expect(recorded.requestId).toBe('req-abc');
    expect(recorded.riskScore).toBe(0.125);
  });

  it('queries events by requestId and agentId', async () => {
    const repo = new PostgresAuditRepository('postgresql://user:pass@localhost:5432/db');

    const fakeRows = [
      {
        id: 'uuid-1',
        request_id: 'req-abc',
        agent_id: 'agent-xyz',
        event_type: 'REQUEST_RECEIVED',
        status: 'SUCCESS',
        risk_score: null,
        policy_decision: null,
        payload_summary: null,
        error_message: null,
        created_at: new Date('2026-10-26T08:00:00Z'),
      },
    ];

    const pool = (repo as unknown as { pool: { query: (...args: unknown[]) => Promise<unknown> } }).pool;
    const querySpy = vi.spyOn(pool, 'query')
      .mockResolvedValue({ rows: fakeRows } as never);

    const reqEvents = await repo.getEventsByRequestId('req-abc');
    expect(reqEvents).toHaveLength(1);
    expect(reqEvents[0]?.requestId).toBe('req-abc');

    const agentEvents = await repo.getEventsByAgentId('agent-xyz', 10);
    expect(agentEvents).toHaveLength(1);
    expect(agentEvents[0]?.agentId).toBe('agent-xyz');

    expect(querySpy).toHaveBeenCalledTimes(2);
  });

  it('checks database health accurately', async () => {
    const repo = new PostgresAuditRepository('postgresql://user:pass@localhost:5432/db');

    const pool = (repo as unknown as { pool: { query: (...args: unknown[]) => Promise<unknown> } }).pool;
    const querySpy = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [{ ping: 1 }] } as never)
      .mockRejectedValueOnce(new Error('Connection lost') as never);

    const isHealthy1 = await repo.healthCheck();
    expect(isHealthy1).toBe(true);

    const isHealthy2 = await repo.healthCheck();
    expect(isHealthy2).toBe(false);

    expect(querySpy).toHaveBeenCalledTimes(2);
  });
});
