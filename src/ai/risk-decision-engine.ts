import {
  IRiskAnalyzerProvider,
  RiskAnalysisContext,
  RiskAnalysisOutcome,
  RISK_ANALYSIS_SECURITY_DISCLAIMER,
} from './types';
import { PolicyDecision } from '../policy/types';

export interface IntegratedDecisionOptions {
  deterministicDecision: PolicyDecision;
  deterministicViolations: string[];
  deterministicReason?: string;
  context: RiskAnalysisContext;
  aiProvider?: IRiskAnalyzerProvider;
  requireRiskAnalysis?: boolean;
}

export interface IntegratedDecisionResult {
  finalDecision: PolicyDecision;
  deterministicDecision: PolicyDecision;
  reasons: string[];
  violations: string[];
  aiOutcome?: RiskAnalysisOutcome;
  isAiOverridden: boolean;
  securityDisclaimer: string;
}

/**
 * High-Assurance Risk Decision Engine.
 * Evaluates server-side decision rules integrating deterministic policies
 * and the OpenRouter AI risk analysis layer.
 */
export class RiskDecisionEngine {
  /**
   * Evaluate combined deterministic policy and AI risk outcome.
   *
   * DECISION RULES:
   * 1. A deterministic policy block cannot be overridden by AI.
   * 2. Suspicious content can trigger BLOCK or HOLD according to explicit server-side rules.
   * 3. An unavailable or invalid classifier must not silently become a low-risk result.
   * 4. If risk analysis is required by policy and unavailable, fail closed by holding the action.
   * 5. Do not claim the classifier detects all prompt injections.
   */
  public async evaluateDecision(
    options: IntegratedDecisionOptions
  ): Promise<IntegratedDecisionResult> {
    const {
      deterministicDecision,
      deterministicViolations,
      deterministicReason,
      context,
      aiProvider,
      requireRiskAnalysis = false,
    } = options;

    let aiOutcome: RiskAnalysisOutcome | undefined;

    // Run AI risk classifier if provider exists
    if (aiProvider) {
      aiOutcome = await aiProvider.analyzeRisk(context);
    }

    // Combine violations and reasons
    const violations = [...deterministicViolations];
    const reasons: string[] = [];
    if (deterministicReason) {
      reasons.push(deterministicReason);
    }

    // ------------------------------------------------------------------------
    // RULE 1: Deterministic Policy BLOCK Can NEVER Be Overridden by AI
    // ------------------------------------------------------------------------
    if (deterministicDecision === 'BLOCK') {
      reasons.push(
        'DETERMINISTIC_BLOCK_AUTHORITATIVE: Transaction is denied by deterministic policy. AI recommendation cannot override this decision.'
      );
      return {
        finalDecision: 'BLOCK',
        deterministicDecision: 'BLOCK',
        reasons,
        violations,
        aiOutcome,
        isAiOverridden: false,
        securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
      };
    }

    // ------------------------------------------------------------------------
    // RULE 2 & 3: Handle AI Classifier Unavailable or Failed State
    // ------------------------------------------------------------------------
    if (!aiProvider || !aiProvider.isConfigured() || !aiOutcome || aiOutcome.status === 'FAILED') {
      const failureReason = aiOutcome?.failureReason ?? 'AI_PROVIDER_UNCONFIGURED';
      const failureMsg = `AI_RISK_ANALYSIS_UNAVAILABLE: ${failureReason}`;

      // Rule: An unavailable classifier must not silently become a low-risk result.
      // Rule: If risk analysis is required by policy, fail closed by holding the action.
      if (requireRiskAnalysis) {
        violations.push(failureMsg);
        reasons.push(
          `FAIL_CLOSED: Policy requires AI risk analysis, but classifier is unavailable (${failureReason}). Payment execution is held pending human review.`
        );
        return {
          finalDecision: 'HOLD',
          deterministicDecision,
          reasons,
          violations,
          aiOutcome,
          isAiOverridden: deterministicDecision === 'ALLOW',
          securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
        };
      }

      // If risk analysis is advisory only and unavailable, preserve deterministic decision
      reasons.push(
        `AI_ADVISORY_OFFLINE: ${failureReason}. Deterministic decision ${deterministicDecision} preserved.`
      );
      return {
        finalDecision: deterministicDecision,
        deterministicDecision,
        reasons,
        violations,
        aiOutcome,
        isAiOverridden: false,
        securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
      };
    }

    // ------------------------------------------------------------------------
    // RULE 4: Server-Side Rules for Suspicious Content
    // ------------------------------------------------------------------------
    const { riskScore, riskCategory, explanation } = aiOutcome;

    // Critical threats -> Server-side BLOCK
    const isCriticalRisk =
      riskScore >= 0.85 ||
      riskCategory === 'INSTRUCTION_OVERRIDE' ||
      riskCategory === 'RECIPIENT_REDIRECT' ||
      riskCategory === 'MERCHANT_MISMATCH';

    if (isCriticalRisk) {
      const violationMsg = `AI_RISK_BLOCK: ${riskCategory} (score: ${riskScore.toFixed(2)}) - ${explanation}`;
      violations.push(violationMsg);
      reasons.push(
        `CRITICAL_AI_RISK_DETECTED: Action blocked by server-side rule for ${riskCategory}.`
      );
      return {
        finalDecision: 'BLOCK',
        deterministicDecision,
        reasons,
        violations,
        aiOutcome,
        isAiOverridden: true,
        securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
      };
    }

    // Suspicious threats -> Server-side HOLD (requires human approval)
    const isSuspiciousRisk =
      riskScore >= 0.5 ||
      riskCategory === 'AMOUNT_MISMATCH' ||
      riskCategory === 'SUSPICIOUS_URGENCY' ||
      riskCategory === 'FRAUD_INDICATOR';

    if (isSuspiciousRisk) {
      const violationMsg = `AI_RISK_HOLD: ${riskCategory} (score: ${riskScore.toFixed(2)}) - ${explanation}`;
      violations.push(violationMsg);
      reasons.push(
        `SUSPICIOUS_AI_RISK_DETECTED: Action held for human approval by server-side rule for ${riskCategory}.`
      );
      return {
        finalDecision: 'HOLD',
        deterministicDecision,
        reasons,
        violations,
        aiOutcome,
        isAiOverridden: deterministicDecision === 'ALLOW',
        securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
      };
    }

    // Benign content -> Retain deterministic decision (ALLOW or HOLD)
    reasons.push('AI_RISK_ANALYSIS_PASSED: Content verified benign with low risk.');
    return {
      finalDecision: deterministicDecision,
      deterministicDecision,
      reasons,
      violations,
      aiOutcome,
      isAiOverridden: false,
      securityDisclaimer: RISK_ANALYSIS_SECURITY_DISCLAIMER,
    };
  }
}
