import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { loadConfig } from '../../src/config/env';

describe('Health API Contract', () => {
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

  it('GET /health returns 200 with service information and liveness', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('agentguard-gateway');
    expect(body.version).toBe('1.0.0');
    expect(body.timestamp).toBeDefined();
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /health/ready returns 200 when database connection is healthy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ready');
    expect(body.checks.auditDatabase).toBe('connected');
  });

  it('GET /health/ready returns 503 when database is disconnected', async () => {
    auditRepo.setHealthy(false);

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('unready');
    expect(body.checks.auditDatabase).toBe('disconnected');
  });
});
