import { describe, it, expect } from 'vitest';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { sanitizeAuditPayload } from '../../src/audit/sanitizer';

describe('Audit Repository Module', () => {
  it('records and retrieves events by requestId', async () => {
    const repo = new MemoryAuditRepository();

    await repo.recordEvent({
      requestId: 'req-123',
      agentId: 'agent-01',
      eventType: 'REQUEST_RECEIVED',
      status: 'SUCCESS',
      payloadSummary: { amount: 25.0, currency: 'USD' },
    });

    await repo.recordEvent({
      requestId: 'req-123',
      agentId: 'agent-01',
      eventType: 'POLICY_APPROVED',
      status: 'SUCCESS',
      policyDecision: 'ALLOW',
    });

    const events = await repo.getEventsByRequestId('req-123');
    expect(events).toHaveLength(2);
    expect(events[0]?.eventType).toBe('REQUEST_RECEIVED');
    expect(events[1]?.eventType).toBe('POLICY_APPROVED');
    expect(events[0]?.id).toBeDefined();
    expect(events[0]?.createdAt).toBeDefined();
  });

  it('sanitizes sensitive secrets and credentials before storage', () => {
    const rawPayload = {
      amount: 45.0,
      apiKey: 'sk-1234567890',
      clientSecret: 'secret-paypal-password',
      password: 'super-secret-password',
      humanApprovalToken: 'auth-token-xyz',
      nested: {
        token: 'nested-bearer-token',
        cvv: '123',
        normalField: 'safe data',
      },
    };

    const sanitized = sanitizeAuditPayload(rawPayload);

    expect(sanitized?.apiKey).toBe('[REDACTED]');
    expect(sanitized?.clientSecret).toBe('[REDACTED]');
    expect(sanitized?.password).toBe('[REDACTED]');
    expect(sanitized?.humanApprovalToken).toBe('[REDACTED]');
    expect((sanitized?.nested as Record<string, unknown>)?.token).toBe('[REDACTED]');
    expect((sanitized?.nested as Record<string, unknown>)?.cvv).toBe('[REDACTED]');
    expect((sanitized?.nested as Record<string, unknown>)?.normalField).toBe('safe data');
    expect(sanitized?.amount).toBe(45.0);
  });

  it('reports health status accurately', async () => {
    const repo = new MemoryAuditRepository();
    expect(await repo.healthCheck()).toBe(true);

    repo.setHealthy(false);
    expect(await repo.healthCheck()).toBe(false);
  });
});
