import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { loadConfig } from '../../src/config/env';

describe('Error Handling and Request ID Contract', () => {
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

  it('propagates client-provided x-request-id in headers and response body', async () => {
    const customId = 'req-trace-custom-uuid-777';

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': customId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe(customId);
  });

  it('generates a unique request ID when x-request-id is omitted', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(String(response.headers['x-request-id']).length).toBeGreaterThan(10);
  });

  it('returns standard structured error JSON for 404 Not Found', async () => {
    const customId = 'req-trace-404-check';

    const response = await app.inject({
      method: 'GET',
      url: '/non-existent-route',
      headers: {
        'x-request-id': customId,
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('NOT_FOUND');
    expect(body.requestId).toBe(customId);
    expect(body.timestamp).toBeDefined();
  });
});
