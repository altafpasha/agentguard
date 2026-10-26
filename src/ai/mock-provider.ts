import {
  IRiskAnalyzerProvider,
  RiskAnalysisContext,
  RiskAnalysisOutcome,
  RISK_ANALYSIS_SECURITY_DISCLAIMER,
} from './types';

export class MockRiskAnalyzer implements IRiskAnalyzerProvider {
  public readonly providerName = 'mock-analyzer';
  public readonly modelId: string;
  private configured: boolean = true;
  private customHandler?: (context: RiskAnalysisContext) => Promise<Partial<RiskAnalysisOutcome>> | Partial<RiskAnalysisOutcome>;

  constructor(
    modelId: string = 'mock-model-v1',
    customHandler?: (context: RiskAnalysisContext) => Promise<Partial<RiskAnalysisOutcome>> | Partial<RiskAnalysisOutcome>
  ) {
    this.modelId = modelId;
    this.customHandler = customHandler;
  }

  public setConfigured(isConfigured: boolean): void {
    this.configured = isConfigured;
  }

  public isConfigured(): boolean {
    return this.configured;
  }

  public setHandler(
    handler: (context: RiskAnalysisContext) => Promise<Partial<RiskAnalysisOutcome>> | Partial<RiskAnalysisOutcome>
  ): void {
    this.customHandler = handler;
  }

  public async analyzeRisk(context: RiskAnalysisContext): Promise<RiskAnalysisOutcome> {
    const startTime = performance.now();

    if (!this.configured) {
      return {
        requestId: context.requestId,
        modelId: this.modelId,
        policyVersion: context.policyVersion,
        latencyMs: 1,
        status: 'FAILED',
        failureReason: 'CONFIG_ERROR',
        riskScore: 0.8,
        riskCategory: 'OTHER',
        reasons: ['MOCK_AI_UNCONFIGURED'],
        suspiciousSpans: [],
        explanation: 'Mock AI provider is unconfigured.',
        recommendation: 'HOLD',
        securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
      };
    }

    if (this.customHandler) {
      const result = await this.customHandler(context);
      return {
        requestId: context.requestId,
        modelId: this.modelId,
        policyVersion: context.policyVersion,
        latencyMs: Math.round(performance.now() - startTime),
        status: result.status ?? 'SUCCESS',
        failureReason: result.failureReason,
        riskScore: result.riskScore ?? 0.0,
        riskCategory: result.riskCategory ?? 'BENIGN',
        reasons: result.reasons ?? [],
        suspiciousSpans: result.suspiciousSpans ?? [],
        explanation: result.explanation ?? 'Default mock evaluation',
        recommendation: result.recommendation ?? 'ALLOW',
        securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
      };
    }

    // Default heuristic mock: check for overt keywords in untrusted text
    const untrusted = [
      context.untrusted.productPageText,
      context.untrusted.toolResultText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (
      untrusted.includes('ignore previous instructions') ||
      untrusted.includes('system prompt') ||
      untrusted.includes('admin override')
    ) {
      return {
        requestId: context.requestId,
        modelId: this.modelId,
        policyVersion: context.policyVersion,
        latencyMs: 5,
        status: 'SUCCESS',
        riskScore: 0.95,
        riskCategory: 'INSTRUCTION_OVERRIDE',
        reasons: ['Untrusted content contains instruction override keywords.'],
        suspiciousSpans: ['ignore previous instructions'],
        explanation: 'Adversarial jailbreak attempt detected in product description.',
        recommendation: 'BLOCK',
        securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
      };
    }

    if (
      untrusted.includes('pay instead to') ||
      untrusted.includes('send funds to alternate') ||
      untrusted.includes('crypto wallet')
    ) {
      return {
        requestId: context.requestId,
        modelId: this.modelId,
        policyVersion: context.policyVersion,
        latencyMs: 5,
        status: 'SUCCESS',
        riskScore: 0.9,
        riskCategory: 'RECIPIENT_REDIRECT',
        reasons: ['Untrusted content attempts to redirect payment recipient.'],
        suspiciousSpans: ['pay instead to'],
        explanation: 'Payment redirect attempt detected in page content.',
        recommendation: 'BLOCK',
        securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
      };
    }

    return {
      requestId: context.requestId,
      modelId: this.modelId,
      policyVersion: context.policyVersion,
      latencyMs: 3,
      status: 'SUCCESS',
      riskScore: 0.05,
      riskCategory: 'BENIGN',
      reasons: ['Product content matches expected purchase intent.'],
      suspiciousSpans: [],
      explanation: 'Benign product description verified.',
      recommendation: 'ALLOW',
      securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
    };
  }
}
