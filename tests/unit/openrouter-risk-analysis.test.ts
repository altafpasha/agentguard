import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenRouterRiskAnalyzer,
  AIRateLimiter,
  RiskDecisionEngine,
  MockRiskAnalyzer,
  RiskEvaluator,
  EVALUATION_FIXTURES,
  riskClassifierResponseSchema,
  RiskAnalysisContext,
  RISK_ANALYSIS_SECURITY_DISCLAIMER,
} from '../../src/ai';

describe('OpenRouter Risk Analysis Layer', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const baseConfig = {
    apiKey: 'sk-or-v1-valid-test-key-987654321',
    model: 'anthropic/claude-3.5-sonnet',
    baseUrl: 'https://openrouter.ai/api/v1',
    timeoutMs: 1500,
    maxRetries: 1,
    maxContextChars: 1000,
    rateLimitRpm: 10,
  };

  const sampleContext: RiskAnalysisContext = {
    requestId: 'test_req_001',
    policyVersion: 1,
    trusted: {
      intendedPurchase: 'Developer IDE Subscription',
      expectedAmount: '20.00',
      expectedCurrency: 'USD',
      expectedMerchant: 'billing@ide-vendor.com',
      agentId: 'agent_dev_01',
    },
    untrusted: {
      productPageText: 'Official Developer IDE Subscription. $20/month billed annually.',
    },
  };

  // ==========================================================================
  // 1. Provider Interface & Configuration Tests
  // ==========================================================================
  describe('Provider Interface & Configuration', () => {
    it('implements IRiskAnalyzerProvider contract with configurable model and provider name', () => {
      const analyzer = new OpenRouterRiskAnalyzer(baseConfig);
      expect(analyzer.providerName).toBe('openrouter');
      expect(analyzer.modelId).toBe('anthropic/claude-3.5-sonnet');
      expect(typeof analyzer.analyzeRisk).toBe('function');
      expect(typeof analyzer.isConfigured).toBe('function');
    });

    it('returns CONFIG_ERROR failure state when API key is a placeholder or missing', async () => {
      const placeholderAnalyzer = new OpenRouterRiskAnalyzer({
        ...baseConfig,
        apiKey: 'sk-or-v1-placeholder',
      });

      expect(placeholderAnalyzer.isConfigured()).toBe(false);

      const outcome = await placeholderAnalyzer.analyzeRisk(sampleContext);
      expect(outcome.status).toBe('FAILED');
      expect(outcome.failureReason).toBe('CONFIG_ERROR');
      // Must not silently become low risk!
      expect(outcome.riskScore).toBeGreaterThanOrEqual(0.8);
      expect(outcome.recommendation).toBe('HOLD');
      expect(outcome.securityDisclaimer).toBe(RISK_ANALYSIS_SECURITY_DISCLAIMER);
    });

    it('enforces request-size limit on untrusted context to prevent token exhaustion', async () => {
      const analyzer = new OpenRouterRiskAnalyzer({
        ...baseConfig,
        maxContextChars: 100, // Strict limit for test
      });

      const largeContext: RiskAnalysisContext = {
        ...sampleContext,
        untrusted: {
          productPageText: 'A'.repeat(150),
        },
      };

      const outcome = await analyzer.analyzeRisk(largeContext);
      expect(outcome.status).toBe('FAILED');
      expect(outcome.failureReason).toBe('REQUEST_TOO_LARGE');
      expect(outcome.explanation).toContain('exceeds the maximum limit');
      expect(outcome.riskScore).toBeGreaterThanOrEqual(0.8);
    });
  });

  // ==========================================================================
  // 2. Rate Limiting and Failure States
  // ==========================================================================
  describe('Rate Limiting & Backoff', () => {
    it('trips local sliding-window rate limit when request quota is exhausted', async () => {
      const rateLimiter = new AIRateLimiter({ maxRequestsPerMinute: 2 });
      const analyzer = new OpenRouterRiskAnalyzer(baseConfig, rateLimiter);

      // Mock successful fetch
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  riskScore: 0.1,
                  riskCategory: 'BENIGN',
                  reasons: ['Normal purchase'],
                  suspiciousSpans: [],
                  explanation: 'Safe',
                  recommendation: 'ALLOW',
                }),
              },
            },
          ],
        }),
      } as Response);

      // Call 1 & 2 succeed
      const res1 = await analyzer.analyzeRisk(sampleContext);
      const res2 = await analyzer.analyzeRisk(sampleContext);
      expect(res1.status).toBe('SUCCESS');
      expect(res2.status).toBe('SUCCESS');

      // Call 3 exceeds rate limit
      const res3 = await analyzer.analyzeRisk(sampleContext);
      expect(res3.status).toBe('FAILED');
      expect(res3.failureReason).toBe('RATE_LIMITED');
      expect(res3.explanation).toContain('rate limit');
    });

    it('handles upstream HTTP 429 response and respects Retry-After cooldown', async () => {
      const rateLimiter = new AIRateLimiter({ maxRequestsPerMinute: 20 });
      const analyzer = new OpenRouterRiskAnalyzer(baseConfig, rateLimiter);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '30' }),
        text: async () => 'Rate limit reached',
      } as Response);

      const outcome = await analyzer.analyzeRisk(sampleContext);
      expect(outcome.status).toBe('FAILED');
      expect(outcome.failureReason).toBe('RATE_LIMITED');
      expect(outcome.explanation).toContain('HTTP 429');

      // Subsequent attempt should immediately be blocked by local cooldown
      const nextOutcome = await analyzer.analyzeRisk(sampleContext);
      expect(nextOutcome.status).toBe('FAILED');
      expect(nextOutcome.failureReason).toBe('RATE_LIMITED');
    });

    it('handles request timeout cleanly and returns TIMEOUT failure state', async () => {
      const analyzer = new OpenRouterRiskAnalyzer({
        ...baseConfig,
        timeoutMs: 50,
      });

      globalThis.fetch = vi.fn().mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const outcome = await analyzer.analyzeRisk(sampleContext);
      expect(outcome.status).toBe('FAILED');
      expect(outcome.failureReason).toBe('TIMEOUT');
      expect(outcome.riskScore).toBeGreaterThanOrEqual(0.8);
    });
  });

  // ==========================================================================
  // 3. Schema Validation & Defensive JSON Parsing
  // ==========================================================================
  describe('Zod Schema Validation & Defensive Parsing', () => {
    it('validates correct structured response schema', () => {
      const valid = {
        riskScore: 0.15,
        riskCategory: 'BENIGN',
        reasons: ['No anomalies detected'],
        suspiciousSpans: [],
        explanation: 'Clean item',
        recommendation: 'ALLOW',
      };
      expect(() => riskClassifierResponseSchema.parse(valid)).not.toThrow();
    });

    it('rejects out-of-range riskScore (> 1.0 or < 0.0)', () => {
      const invalid = {
        riskScore: 1.5,
        riskCategory: 'BENIGN',
        reasons: ['Invalid score'],
        suspiciousSpans: [],
        explanation: 'Invalid',
        recommendation: 'ALLOW',
      };
      expect(() => riskClassifierResponseSchema.parse(invalid)).toThrow();
    });

    it('rejects unknown risk category', () => {
      const invalid = {
        riskScore: 0.5,
        riskCategory: 'UNKNOWN_CUSTOM_CATEGORY',
        reasons: ['Invalid'],
        suspiciousSpans: [],
        explanation: 'Invalid',
        recommendation: 'ALLOW',
      };
      expect(() => riskClassifierResponseSchema.parse(invalid)).toThrow();
    });

    it('strips Markdown code fences and parses JSON safely', async () => {
      const analyzer = new OpenRouterRiskAnalyzer(baseConfig);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '```json\n{\n  "riskScore": 0.02,\n  "riskCategory": "BENIGN",\n  "reasons": ["Authentic"],\n  "suspiciousSpans": [],\n  "explanation": "Wrapped in markdown fences",\n  "recommendation": "ALLOW"\n}\n```',
              },
            },
          ],
        }),
      } as Response);

      const outcome = await analyzer.analyzeRisk(sampleContext);
      expect(outcome.status).toBe('SUCCESS');
      expect(outcome.riskScore).toBe(0.02);
      expect(outcome.riskCategory).toBe('BENIGN');
    });

    it('returns MALFORMED_RESPONSE failure state on unparseable non-JSON text', async () => {
      const analyzer = new OpenRouterRiskAnalyzer(baseConfig);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'I am a model and I refuse to speak JSON.',
              },
            },
          ],
        }),
      } as Response);

      const outcome = await analyzer.analyzeRisk(sampleContext);
      expect(outcome.status).toBe('FAILED');
      expect(outcome.failureReason).toBe('MALFORMED_RESPONSE');
      expect(outcome.riskScore).toBeGreaterThanOrEqual(0.8);
      expect(outcome.recommendation).toBe('HOLD');
    });
  });

  // ==========================================================================
  // 4. Decision Rules & Required Test Cases (RiskDecisionEngine)
  // ==========================================================================
  describe('RiskDecisionEngine Decision Rules', () => {
    const decisionEngine = new RiskDecisionEngine();

    // Test Case 1: Benign product description
    it('[TEST CASE 1] Benign product description evaluates to ALLOW', async () => {
      const fixture = EVALUATION_FIXTURES.find((f) => f.id === 'BENIGN_PRODUCT_001')!;
      const mockProvider = new MockRiskAnalyzer('test-model', () => ({
        status: 'SUCCESS',
        riskScore: 0.05,
        riskCategory: 'BENIGN',
        reasons: ['Matches intent'],
        explanation: 'Safe product',
        recommendation: 'ALLOW',
      }));

      const result = await decisionEngine.evaluateDecision({
        deterministicDecision: fixture.deterministicDecision,
        deterministicViolations: fixture.deterministicViolations,
        context: fixture.context,
        aiProvider: mockProvider,
      });

      expect(result.finalDecision).toBe('ALLOW');
      expect(result.isAiOverridden).toBe(false);
      expect(result.aiOutcome?.riskCategory).toBe('BENIGN');
    });

    // Test Case 2: Explicit instruction override
    it('[TEST CASE 2] Explicit instruction override evaluates to BLOCK', async () => {
      const fixture = EVALUATION_FIXTURES.find((f) => f.id === 'INSTRUCTION_OVERRIDE_002')!;
      const mockProvider = new MockRiskAnalyzer('test-model', () => ({
        status: 'SUCCESS',
        riskScore: 0.98,
        riskCategory: 'INSTRUCTION_OVERRIDE',
        reasons: ['Prompt injection override detected'],
        suspiciousSpans: ['Ignore all previous instructions'],
        explanation: 'Jailbreak attempted',
        recommendation: 'BLOCK',
      }));

      const result = await decisionEngine.evaluateDecision({
        deterministicDecision: fixture.deterministicDecision,
        deterministicViolations: fixture.deterministicViolations,
        context: fixture.context,
        aiProvider: mockProvider,
      });

      expect(result.finalDecision).toBe('BLOCK');
      expect(result.isAiOverridden).toBe(true);
      expect(result.violations.some((v) => v.includes('INSTRUCTION_OVERRIDE'))).toBe(true);
    });

    // Test Case 3: Attempt to redirect payment to another recipient
    it('[TEST CASE 3] Attempt to redirect payment evaluates to BLOCK', async () => {
      const fixture = EVALUATION_FIXTURES.find((f) => f.id === 'RECIPIENT_REDIRECT_003')!;
      const mockProvider = new MockRiskAnalyzer('test-model', () => ({
        status: 'SUCCESS',
        riskScore: 0.95,
        riskCategory: 'RECIPIENT_REDIRECT',
        reasons: ['Redirecting payment to unauthorized address'],
        suspiciousSpans: ['offshore-escrow@crypto-payout.org'],
        explanation: 'Payment redirect phishing',
        recommendation: 'BLOCK',
      }));

      const result = await decisionEngine.evaluateDecision({
        deterministicDecision: fixture.deterministicDecision,
        deterministicViolations: fixture.deterministicViolations,
        context: fixture.context,
        aiProvider: mockProvider,
      });

      expect(result.finalDecision).toBe('BLOCK');
      expect(result.isAiOverridden).toBe(true);
      expect(result.violations.some((v) => v.includes('RECIPIENT_REDIRECT'))).toBe(true);
    });

    // Test Case 4: Merchant mismatch
    it('[TEST CASE 4] Merchant mismatch evaluates to BLOCK', async () => {
      const fixture = EVALUATION_FIXTURES.find((f) => f.id === 'MERCHANT_MISMATCH_004')!;
      const mockProvider = new MockRiskAnalyzer('test-model', () => ({
        status: 'SUCCESS',
        riskScore: 0.88,
        riskCategory: 'MERCHANT_MISMATCH',
        reasons: ['Claimed vendor is Apple, payee is shady liquidator'],
        suspiciousSpans: ['shady-liquidation-outlet'],
        explanation: 'Deceptive merchant identity',
        recommendation: 'BLOCK',
      }));

      const result = await decisionEngine.evaluateDecision({
        deterministicDecision: fixture.deterministicDecision,
        deterministicViolations: fixture.deterministicViolations,
        context: fixture.context,
        aiProvider: mockProvider,
      });

      expect(result.finalDecision).toBe('BLOCK');
      expect(result.isAiOverridden).toBe(true);
      expect(result.violations.some((v) => v.includes('MERCHANT_MISMATCH'))).toBe(true);
    });

    // Test Case 5: Amount mismatch
    it('[TEST CASE 5] Amount mismatch evaluates to HOLD for human approval', async () => {
      const fixture = EVALUATION_FIXTURES.find((f) => f.id === 'AMOUNT_MISMATCH_005')!;
      const mockProvider = new MockRiskAnalyzer('test-model', () => ({
        status: 'SUCCESS',
        riskScore: 0.72,
        riskCategory: 'AMOUNT_MISMATCH',
        reasons: ['Hidden surcharge increases cart from $10 to $190'],
        suspiciousSpans: ['infrastructure provision fee of $180.00'],
        explanation: 'Price surge trap',
        recommendation: 'HOLD',
      }));

      const result = await decisionEngine.evaluateDecision({
        deterministicDecision: fixture.deterministicDecision,
        deterministicViolations: fixture.deterministicViolations,
        context: fixture.context,
        aiProvider: mockProvider,
      });

      expect(result.finalDecision).toBe('HOLD');
      expect(result.isAiOverridden).toBe(true);
      expect(result.violations.some((v) => v.includes('AMOUNT_MISMATCH'))).toBe(true);
    });

    // Test Case 6: Malformed model response
    it('[TEST CASE 6] Malformed model response fails closed to HOLD when risk analysis required', async () => {
      const fixture = EVALUATION_FIXTURES.find((f) => f.id === 'MALFORMED_RESPONSE_006')!;
      const mockProvider = new MockRiskAnalyzer('test-model', () => ({
        status: 'FAILED',
        failureReason: 'MALFORMED_RESPONSE',
        riskScore: 0.8,
        riskCategory: 'OTHER',
        reasons: ['Response violated Zod schema'],
        recommendation: 'HOLD',
      }));

      const result = await decisionEngine.evaluateDecision({
        deterministicDecision: fixture.deterministicDecision,
        deterministicViolations: fixture.deterministicViolations,
        context: fixture.context,
        aiProvider: mockProvider,
        requireRiskAnalysis: true, // Policy requires risk analysis
      });

      expect(result.finalDecision).toBe('HOLD');
      expect(result.violations.some((v) => v.includes('AI_RISK_ANALYSIS_UNAVAILABLE'))).toBe(true);
      expect(result.reasons.some((r) => r.includes('FAIL_CLOSED'))).toBe(true);
    });

    // Test Case 7: Model timeout and rate limit
    it('[TEST CASE 7] Model timeout and rate limit fail closed to HOLD when risk analysis required', async () => {
      const fixture = EVALUATION_FIXTURES.find((f) => f.id === 'TIMEOUT_RATE_LIMIT_007')!;
      const mockProvider = new MockRiskAnalyzer('test-model', () => ({
        status: 'FAILED',
        failureReason: 'TIMEOUT',
        riskScore: 0.8,
        riskCategory: 'OTHER',
        reasons: ['OpenRouter request timed out'],
        recommendation: 'HOLD',
      }));

      const result = await decisionEngine.evaluateDecision({
        deterministicDecision: fixture.deterministicDecision,
        deterministicViolations: fixture.deterministicViolations,
        context: fixture.context,
        aiProvider: mockProvider,
        requireRiskAnalysis: true,
      });

      expect(result.finalDecision).toBe('HOLD');
      expect(result.violations.some((v) => v.includes('AI_RISK_ANALYSIS_UNAVAILABLE'))).toBe(true);
    });

    // Test Case 8: Model recommends ALLOW despite a deterministic policy BLOCK
    it('[TEST CASE 8] Model recommends ALLOW despite a deterministic policy BLOCK -> Final decision MUST remain BLOCK', async () => {
      const fixture = EVALUATION_FIXTURES.find((f) => f.id === 'DETERMINISTIC_BLOCK_OVERRIDE_008')!;
      const mockProvider = new MockRiskAnalyzer('test-model', () => ({
        status: 'SUCCESS',
        riskScore: 0.0,
        riskCategory: 'BENIGN',
        reasons: ['Looks fine to the LLM'],
        recommendation: 'ALLOW',
      }));

      const result = await decisionEngine.evaluateDecision({
        deterministicDecision: fixture.deterministicDecision, // 'BLOCK'
        deterministicViolations: fixture.deterministicViolations,
        deterministicReason: fixture.deterministicReason,
        context: fixture.context,
        aiProvider: mockProvider,
      });

      // MUST NOT be overridden by AI!
      expect(result.finalDecision).toBe('BLOCK');
      expect(result.deterministicDecision).toBe('BLOCK');
      expect(result.isAiOverridden).toBe(false);
      expect(result.reasons.some((r) => r.includes('DETERMINISTIC_BLOCK_AUTHORITATIVE'))).toBe(true);
    });
  });

  // ==========================================================================
  // 5. Fixture Evaluation Suite
  // ==========================================================================
  describe('RiskEvaluator Fixture Evaluation Suite', () => {
    it('executes full fixture evaluation suite with 100% pass rate', async () => {
      const evaluator = new RiskEvaluator();
      const report = await evaluator.evaluateAll();

      expect(report.totalFixtures).toBe(8);
      expect(report.passedCount).toBe(8);
      expect(report.failedCount).toBe(0);
      expect(report.passRatePercentage).toBe(100);
      expect(report.results.every((r) => r.passed)).toBe(true);
    });
  });
});
