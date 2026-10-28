import { describe, it, expect } from 'vitest';
import { buildApp } from '../../src/app';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { MemoryReviewerAuthService } from '../../src/auth';
import { MemoryStoreRepository } from '../../src/store';
import { loadConfig } from '../../src/config/env';

describe('Integrations Routes & Empty JSON Body Handling', () => {
  const config = loadConfig({
    PORT: '3000',
    HOST: '0.0.0.0',
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
  });

  const authService = new MemoryReviewerAuthService();
  const app = buildApp({
    config,
    auditRepo: new MemoryAuditRepository(),
    authService,
    storeRepo: new MemoryStoreRepository(),
  });

  let token: string;

  it('sets up initial owner and retrieves auth token', async () => {
    const res = await authService.setupOwner({
      username: 'admin',
      email: 'admin@agentguard.dev',
      password: 'StrongAdminPassword123!',
      name: 'Admin User',
    });
    token = res.sessionToken;
    expect(token).toBeDefined();
  });

  it('handles POST requests with Content-Type application/json and EMPTY BODY without FST_ERR_CTP_EMPTY_JSON_BODY', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/test/gateway',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      payload: '',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.integration.id).toBe('gateway');
    expect(body.integration.status).toBe('connected');
  });

  it('GET /api/v1/integrations/status returns list of all integrations with status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/status',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.integrations)).toBe(true);
    expect(body.integrations.map((i: any) => i.id)).toEqual(
      expect.arrayContaining(['gateway', 'postgres', 'paypal', 'openrouter'])
    );
  });

  it('POST /api/v1/integrations/test/gateway tests connection and accepts custom log level', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/test/gateway',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      payload: JSON.stringify({ logLevel: 'debug' }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.integration.id).toBe('gateway');
    expect(body.integration.status).toBe('connected');
    expect(body.integration.details.logLevel).toBe('debug');
  });

  it('POST /api/v1/integrations/test/postgres reports connection test failure gracefully on invalid host', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/test/postgres',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      payload: JSON.stringify({
        connectionUrl: 'postgresql://invalid_user:invalid_pass@127.0.0.1:54329/nonexistent',
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.integration.id).toBe('postgres');
    expect(['disconnected', 'not_configured']).toContain(body.integration.status);
    expect(body.integration.errorMessage).toBeDefined();
  });

  it('POST /api/v1/integrations/configure/gateway allows updating runtime configuration', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/configure/gateway',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      payload: JSON.stringify({
        logLevel: 'warn',
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.integration.details.logLevel).toBe('warn');
  });
});
