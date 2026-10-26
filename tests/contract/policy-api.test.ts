import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { loadConfig } from '../../src/config/env';

describe('Policy Evaluation API Contract (POST /api/v1/evaluate-policy)', () => {
  let app: FastifyInstance;
  let auditRepo: MemoryAuditRepository;

  beforeEach(async () => {
    auditRepo = new MemoryAuditRepository();
    const config = loadConfig({
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      POLICY_MAX_TRANSACTION_AMOUNT: '50.00',
      POLICY_REQUIRE_HUMAN_APPROVAL_THRESHOLD: '25.00',
      POLICY_ALLOWED_CURRENCIES: 'USD,EUR,GBP',
      POLICY_RECIPIENT_DENYLIST: 'blocked@fraud.com',
    });
    app = buildApp({ config, auditRepo });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 ALLOW for valid payment within limits', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate-policy',
      payload: {
        agentId: 'agent-finance',
        amount: 20.0,
        currency: 'USD',
        recipient: { email: 'vendor@valid.com' },
        description: 'Monthly SaaS subscription',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.decision).toBe('ALLOW');
    expect(body.allowed).toBe(true);
    expect(body.violations).toHaveLength(0);
  });

  it('returns 403 DENY when transaction exceeds max amount limit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate-policy',
      payload: {
        agentId: 'agent-finance',
        amount: 95.0, // Exceeds $50 limit
        currency: 'USD',
        recipient: { email: 'vendor@valid.com' },
        description: 'Equipment purchase',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.decision).toBe('DENY');
    expect(body.allowed).toBe(false);
    expect(body.violations.some((v: { ruleId: string }) => v.ruleId === 'POL-001')).toBe(true);
  });

  it('returns 202 REQUIRE_HUMAN_APPROVAL when amount exceeds threshold without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate-policy',
      payload: {
        agentId: 'agent-finance',
        amount: 35.0, // > 25 threshold, < 50 limit
        currency: 'USD',
        recipient: { email: 'vendor@valid.com' },
        description: 'Team dinner reimbursement',
      },
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.decision).toBe('REQUIRE_HUMAN_APPROVAL');
    expect(body.requiresHumanApproval).toBe(true);
    expect(body.violations.some((v: { ruleId: string }) => v.ruleId === 'POL-004')).toBe(true);
  });

  it('returns 403 DENY when recipient is in denylist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate-policy',
      payload: {
        agentId: 'agent-finance',
        amount: 10.0,
        currency: 'USD',
        recipient: { email: 'blocked@fraud.com' },
        description: 'Payment',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.decision).toBe('DENY');
    expect(body.violations.some((v: { ruleId: string }) => v.ruleId === 'POL-003')).toBe(true);
  });
});
