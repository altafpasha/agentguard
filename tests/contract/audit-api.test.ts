import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { loadConfig } from '../../src/config/env';

describe('Audit API Contract (GET /api/v1/audit)', () => {
  let app: FastifyInstance;
  let auditRepo: MemoryAuditRepository;

  beforeEach(async () => {
    auditRepo = new MemoryAuditRepository();
    const config = loadConfig({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });
    app = buildApp({ config, auditRepo });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('retrieves full audit event log for a given requestId', async () => {
    const targetRequestId = 'req-trace-audit-test-123';

    await auditRepo.recordEvent({
      requestId: targetRequestId,
      agentId: 'agent-audited',
      eventType: 'REQUEST_RECEIVED',
      status: 'SUCCESS',
      payloadSummary: { amount: 15.0 },
    });

    await auditRepo.recordEvent({
      requestId: targetRequestId,
      agentId: 'agent-audited',
      eventType: 'POLICY_APPROVED',
      status: 'SUCCESS',
      policyDecision: 'ALLOW',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/audit/${targetRequestId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.requestId).toBe(targetRequestId);
    expect(body.count).toBe(2);
    expect(body.events).toHaveLength(2);
    expect(body.events[0].eventType).toBe('REQUEST_RECEIVED');
    expect(body.events[1].eventType).toBe('POLICY_APPROVED');
  });

  it('returns 404 when no audit records exist for requestId', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/unknown-nonexistent-request-id',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('retrieves audit event log by agentId', async () => {
    await auditRepo.recordEvent({
      requestId: 'req-agent-1',
      agentId: 'agent-special-42',
      eventType: 'REQUEST_RECEIVED',
      status: 'SUCCESS',
      payloadSummary: { amount: 10.0 },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/agent/agent-special-42',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.agentId).toBe('agent-special-42');
    expect(body.count).toBe(1);
    expect(body.events[0].requestId).toBe('req-agent-1');
  });
});
