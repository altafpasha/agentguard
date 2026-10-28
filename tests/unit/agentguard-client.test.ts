import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentGuardClient } from '../../src/integrations/agentguard-client';

describe('AgentGuardClient SDK & Fail-Closed Invariant Unit Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses successful ALLOW decision from AgentGuard policy evaluation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        decision: 'ALLOW',
        decisionId: 'dec_123',
        authorizationToken: 'auth_tok_abc',
        policyId: 'default',
        policyVersion: 1,
        evaluatedAt: new Date().toISOString(),
      }),
    } as any);

    const client = new AgentGuardClient({ baseUrl: 'http://localhost:3001', timeoutMs: 2000 });
    const result = await client.evaluatePayment({
      agentId: 'travel-agent-1',
      amount: 25.0,
      currency: 'INR',
    });

    expect(result.decision).toBe('ALLOW');
    expect(result.decisionId).toBe('dec_123');
    expect(result.authorizationToken).toBe('auth_tok_abc');
    expect(result.failClosedTriggered).toBe(false);
  });

  it('enforces FAIL-CLOSED: returns BLOCK when gateway returns HTTP 500 error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as any);

    const client = new AgentGuardClient({ baseUrl: 'http://localhost:3001' });
    const result = await client.evaluatePayment({
      agentId: 'travel-agent-1',
      amount: 25.0,
      currency: 'INR',
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.failClosedTriggered).toBe(true);
    expect(result.reason).toContain('HTTP 500');
    expect(result.reason).toContain('fail-closed');
  });

  it('enforces FAIL-CLOSED: returns BLOCK when gateway connection times out', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      const error: any = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    const client = new AgentGuardClient({ baseUrl: 'http://localhost:3001', timeoutMs: 100 });
    const result = await client.evaluatePayment({
      agentId: 'travel-agent-1',
      amount: 25.0,
      currency: 'INR',
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.failClosedTriggered).toBe(true);
    expect(result.reason).toContain('timed out');
    expect(result.reason).toContain('fail-closed');
  });

  it('enforces FAIL-CLOSED: returns BLOCK on network connection refused', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = new AgentGuardClient({ baseUrl: 'http://localhost:3001' });
    const result = await client.evaluatePayment({
      agentId: 'travel-agent-1',
      amount: 25.0,
      currency: 'INR',
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.failClosedTriggered).toBe(true);
    expect(result.reason).toContain('ECONNREFUSED');
  });
});
