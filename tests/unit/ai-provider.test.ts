import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterClient } from '../../src/ai/client';
import { SemanticPromptAnalyzer } from '../../src/ai/prompt-analyzer';
import { AIProviderError } from '../../src/common/errors';
import { PaymentOrderRequest } from '../../src/common/types';

describe('OpenRouter AI Provider Module', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws AIProviderError when calling live completion with placeholder API key', async () => {
    const client = new OpenRouterClient({
      apiKey: 'sk-or-v1-placeholder',
      model: 'anthropic/claude-3.5-sonnet',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 5000,
    });

    await expect(
      client.createChatCompletion([{ role: 'user', content: 'hello' }])
    ).rejects.toThrow(AIProviderError);
  });

  it('provides safe advisory analysis in fallback mode without breaking gateway', async () => {
    const client = new OpenRouterClient({
      apiKey: 'sk-or-v1-dev-placeholder',
      model: 'anthropic/claude-3.5-sonnet',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 5000,
    });

    const analyzer = new SemanticPromptAnalyzer(client);

    const testRequest: PaymentOrderRequest = {
      agentId: 'agent-ops',
      amount: 10.0,
      currency: 'USD',
      recipient: { email: 'vendor@domain.com' },
      description: 'Domain registration renewal',
      promptContext: 'Please renew the domain for one year.',
    };

    const analysis = await analyzer.analyzePaymentIntent(testRequest);

    expect(analysis).toBeDefined();
    expect(analysis.authorizationAuthorityDisclaimer).toContain('NON-AUTHORITATIVE');
    expect(analysis.intentCategory).toBe('STANDARD_PURCHASE');
  });

  it('explicitly documents and preserves authority separation constraint', async () => {
    // Constraint: "Do not use an LLM as the authority for payment authorization."
    const client = new OpenRouterClient({
      apiKey: 'sk-or-v1-dev-placeholder',
      model: 'anthropic/claude-3.5-sonnet',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 5000,
    });

    const analyzer = new SemanticPromptAnalyzer(client);
    const analysis = await analyzer.analyzePaymentIntent({
      agentId: 'agent-finance',
      amount: 1000.0,
      currency: 'USD',
      recipient: { email: 'vendor@domain.com' },
      description: 'Massive transfer',
    });

    expect(analysis.authorizationAuthorityDisclaimer).toContain(
      'cannot override deterministic policy engine rules'
    );
  });

  describe('OpenRouterClient live requests (mocked)', () => {
    const client = new OpenRouterClient({
      apiKey: 'sk-or-v1-valid-real-secret-key-1234567890',
      model: 'anthropic/claude-3.5-sonnet',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 1000,
    });

    it('successfully calls OpenRouter and returns chat completion', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'gen-123',
          choices: [
            {
              message: {
                role: 'assistant',
                content: '{"isAnomaly": false, "confidence": 0.99, "category": "LEGITIMATE"}',
              },
            },
          ],
        }),
      } as Response);

      const res = await client.createChatCompletion([{ role: 'user', content: 'test' }]);
      expect(res.id).toBe('gen-123');
      expect(res.choices[0]?.message.content).toContain('LEGITIMATE');
    });

    it('throws AIProviderError on non-ok HTTP response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      } as Response);

      await expect(
        client.createChatCompletion([{ role: 'user', content: 'test' }], { maxRetries: 0 })
      ).rejects.toThrow(AIProviderError);
    });

    it('handles timeout (AbortError) properly', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      await expect(
        client.createChatCompletion([{ role: 'user', content: 'test' }], { maxRetries: 0 })
      ).rejects.toThrow('timed out');
    });
  });

  describe('SemanticPromptAnalyzer with configured client', () => {
    const client = new OpenRouterClient({
      apiKey: 'sk-or-v1-valid-real-secret-key-1234567890',
      model: 'anthropic/claude-3.5-sonnet',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 2000,
    });
    const analyzer = new SemanticPromptAnalyzer(client);

    it('parses valid JSON response from LLM', async () => {
      vi.spyOn(client, 'createChatCompletion').mockResolvedValueOnce({
        id: 'gen-456',
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                '```json\n{"isAnomaly": true, "confidence": 0.88, "category": "SUSPICIOUS_URGENCY", "summary": "Urgent transfer", "riskSignals": ["PRESSURE"]}\n```',
            },
          },
        ],
      });

      const res = await analyzer.analyzePaymentIntent({
        agentId: 'agent-1',
        amount: 50,
        currency: 'USD',
        recipient: { email: 'vendor@test.com' },
        description: 'Urgent payment',
      });

      expect(res.isAdvisoryAnomalyDetected).toBe(true);
      expect(res.confidenceScore).toBe(0.88);
      expect(res.intentCategory).toBe('SUSPICIOUS_URGENCY');
      expect(res.riskSignals).toContain('PRESSURE');
    });

    it('handles AI failure gracefully without crashing', async () => {
      vi.spyOn(client, 'createChatCompletion').mockRejectedValueOnce(
        new Error('Network connection failed')
      );

      const res = await analyzer.analyzePaymentIntent({
        agentId: 'agent-1',
        amount: 50,
        currency: 'USD',
        recipient: { email: 'vendor@test.com' },
        description: 'Payment',
      });

      expect(res.isAdvisoryAnomalyDetected).toBe(false);
      expect(res.intentCategory).toBe('UNVERIFIED_AI_OFFLINE');
      expect(res.riskSignals).toContain('AI_PROVIDER_UNREACHABLE');
    });
  });
});
