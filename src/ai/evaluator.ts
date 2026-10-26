import { EVALUATION_FIXTURES, EvaluationFixture } from './fixtures/evaluation-fixtures';
import { MockRiskAnalyzer } from './mock-provider';
import { RiskDecisionEngine, IntegratedDecisionResult } from './risk-decision-engine';
import { IRiskAnalyzerProvider } from './types';

export interface FixtureEvaluationResult {
  fixtureId: string;
  fixtureName: string;
  expectedFinalDecision: string;
  actualFinalDecision: string;
  passed: boolean;
  deterministicDecision: string;
  aiCategory?: string;
  aiRiskScore?: number;
  aiRecommendation?: string;
  aiLatencyMs?: number;
  reasons: string[];
}

export interface EvaluationReport {
  timestamp: string;
  modelIdentifier: string;
  totalFixtures: number;
  passedCount: number;
  failedCount: number;
  passRatePercentage: number;
  averageLatencyMs: number;
  decisionDistribution: {
    ALLOW: number;
    HOLD: number;
    BLOCK: number;
  };
  results: FixtureEvaluationResult[];
}

export class RiskEvaluator {
  private decisionEngine: RiskDecisionEngine;

  constructor(decisionEngine?: RiskDecisionEngine) {
    this.decisionEngine = decisionEngine ?? new RiskDecisionEngine();
  }

  /**
   * Run the evaluation suite against the provided or mock AI provider
   */
  public async evaluateAll(
    provider?: IRiskAnalyzerProvider,
    fixtures: EvaluationFixture[] = EVALUATION_FIXTURES
  ): Promise<EvaluationReport> {
    const results: FixtureEvaluationResult[] = [];
    let totalLatency = 0;
    const distribution = { ALLOW: 0, HOLD: 0, BLOCK: 0 };

    for (const fixture of fixtures) {
      const activeProvider = provider ?? this.createFixtureMockProvider(fixture);

      const decision: IntegratedDecisionResult = await this.decisionEngine.evaluateDecision({
        deterministicDecision: fixture.deterministicDecision,
        deterministicViolations: fixture.deterministicViolations,
        deterministicReason: fixture.deterministicReason,
        context: fixture.context,
        aiProvider: activeProvider,
        requireRiskAnalysis: fixture.requireRiskAnalysis ?? false,
      });

      const actualFinalDecision = decision.finalDecision;
      const passed = actualFinalDecision === fixture.expectedFinalDecision;

      distribution[actualFinalDecision]++;
      const latency = decision.aiOutcome?.latencyMs ?? 0;
      totalLatency += latency;

      results.push({
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        expectedFinalDecision: fixture.expectedFinalDecision,
        actualFinalDecision,
        passed,
        deterministicDecision: fixture.deterministicDecision,
        aiCategory: decision.aiOutcome?.riskCategory,
        aiRiskScore: decision.aiOutcome?.riskScore,
        aiRecommendation: decision.aiOutcome?.recommendation,
        aiLatencyMs: latency,
        reasons: decision.reasons,
      });
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.length - passedCount;

    return {
      timestamp: new Date().toISOString(),
      modelIdentifier: provider?.modelId ?? 'fixture-calibrated-mock',
      totalFixtures: fixtures.length,
      passedCount,
      failedCount,
      passRatePercentage: Math.round((passedCount / fixtures.length) * 100),
      averageLatencyMs: results.length > 0 ? Math.round(totalLatency / results.length) : 0,
      decisionDistribution: distribution,
      results,
    };
  }

  /**
   * Helper to create a fixture-tailored mock provider that accurately reproduces
   * timeout, rate-limit, malformed, or expected fixture responses.
   */
  private createFixtureMockProvider(fixture: EvaluationFixture): IRiskAnalyzerProvider {
    return new MockRiskAnalyzer('evaluation-fixture-model', async () => {
      if (fixture.simulateCondition === 'timeout') {
        return {
          status: 'FAILED',
          failureReason: 'TIMEOUT',
          riskScore: 0.8,
          riskCategory: 'OTHER',
          reasons: ['Simulated upstream model timeout'],
          recommendation: 'HOLD',
          explanation: 'OpenRouter classification request timed out.',
        };
      }

      if (fixture.simulateCondition === 'rate_limit') {
        return {
          status: 'FAILED',
          failureReason: 'RATE_LIMITED',
          riskScore: 0.8,
          riskCategory: 'OTHER',
          reasons: ['Simulated HTTP 429 rate limit exceeded'],
          recommendation: 'HOLD',
          explanation: 'Upstream rate limit active.',
        };
      }

      if (fixture.simulateCondition === 'malformed') {
        return {
          status: 'FAILED',
          failureReason: 'MALFORMED_RESPONSE',
          riskScore: 0.8,
          riskCategory: 'OTHER',
          reasons: ['Response violated Zod schema'],
          recommendation: 'HOLD',
          explanation: 'Model output could not be parsed as structured JSON.',
        };
      }

      if (typeof fixture.mockModelOutput === 'object') {
        return {
          status: 'SUCCESS',
          riskScore: fixture.mockModelOutput.riskScore ?? 0.0,
          riskCategory: fixture.mockModelOutput.riskCategory ?? 'BENIGN',
          reasons: fixture.mockModelOutput.reasons ?? [],
          suspiciousSpans: fixture.mockModelOutput.suspiciousSpans ?? [],
          explanation: fixture.mockModelOutput.explanation ?? 'Mock explanation',
          recommendation: fixture.mockModelOutput.recommendation ?? 'ALLOW',
        };
      }

      return {
        status: 'SUCCESS',
        riskScore: 0.05,
        riskCategory: 'BENIGN',
        reasons: ['Default verified'],
        recommendation: 'ALLOW',
      };
    });
  }
}
