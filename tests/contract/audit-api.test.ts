import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { MemoryReviewerAuthService } from '../../src/auth/service';
import { loadConfig } from '../../src/config/env';

describe('Audit API Contract (GET /api/v1/audit)', () => {
  let app: FastifyInstance;
  let auditRepo: MemoryAuditRepository;
  let authService: MemoryReviewerAuthService;
  let authToken: string;

  beforeEach(async () => {
    auditRepo = new MemoryAuditRepository();
    authService = new MemoryReviewerAuthService();
    const config = loadConfig({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });
    app = buildApp({ config, auditRepo, authService });
    await app.ready();

    // Create an authenticated reviewer session
    const setupRes = await authService.setupOwner({
      name: 'Audit Reviewer',
      username: 'auditor',
      email: 'auditor@defense.node',
      password: 'AuditorPassword123!',
    });
    authToken = setupRes.sessionToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects unauthenticated access with 401 Unauthorized', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/any-request-id',
    });
    expect(response.statusCode).toBe(401);
  });

  it('retrieves full audit event log for a given requestId when authenticated', async () => {
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
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.requestId).toBe(targetRequestId);
    expect(body.count).toBe(2);
    expect(body.events).toHaveLength(2);
    expect(body.events[0].eventType).toBe('REQUEST_RECEIVED');
    expect(body.events[1].eventType).toBe('POLICY_APPROVED');
  });

  it('returns 404 when no audit records exist for requestId when authenticated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/unknown-nonexistent-request-id',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('retrieves audit event log by agentId when authenticated', async () => {
    const agentId = 'agent-special-42';

    await auditRepo.recordEvent({
      requestId: 'req-spec-1',
      agentId,
      eventType: 'INJECTION_BLOCKED',
      status: 'BLOCKED',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/audit/agent/${agentId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.agentId).toBe('agent-special-42');
    expect(body.events).toHaveLength(1);
    expect(body.events[0].eventType).toBe('INJECTION_BLOCKED');
  });
});
