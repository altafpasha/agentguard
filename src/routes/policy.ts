import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PolicyEngine } from '../policy';
import { IAuditRepository } from '../audit';
import { HumanApprovalService } from '../approval/service';
import { policyEvaluationRequestSchema, riskAnalysisRequestSchema } from './schemas';
import { ValidationError } from '../common/errors';
import { IRiskAnalyzerProvider, RiskDecisionEngine } from '../ai';

export interface PolicyRouteOptions {
  policyEngine: PolicyEngine;
  auditRepo: IAuditRepository;
  aiRiskAnalyzer?: IRiskAnalyzerProvider;
  riskDecisionEngine?: RiskDecisionEngine;
  approvalService?: HumanApprovalService;
}

export const policyRoutes: FastifyPluginAsync<PolicyRouteOptions> = async (
  fastify: FastifyInstance,
  options: PolicyRouteOptions
) => {
  const {
    policyEngine,
    auditRepo,
    aiRiskAnalyzer,
    riskDecisionEngine = new RiskDecisionEngine(),
    approvalService,
  } = options;

  fastify.post('/api/v1/evaluate-policy', async (req, reply) => {
    const parseResult = policyEvaluationRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid policy evaluation payload', parseResult.error.flatten());
    }

    const payload = parseResult.data;
    const requestId = req.id as string;

    const evaluation = await policyEngine.evaluate({
      request: {
        agentId: payload.agentId,
        requestId,
        amount: payload.amount,
        currency: payload.currency,
        recipient: payload.recipient,
        description: payload.description,
        humanApprovalToken: payload.humanApprovalToken,
      },
    });

    let auditEventType: 'POLICY_APPROVED' | 'POLICY_BLOCKED' | 'APPROVAL_REQUIRED' = 'POLICY_APPROVED';
    let auditStatus: 'SUCCESS' | 'BLOCKED' | 'PENDING_APPROVAL' = 'SUCCESS';

    if (evaluation.decision === 'DENY') {
      auditEventType = 'POLICY_BLOCKED';
      auditStatus = 'BLOCKED';
    } else if (evaluation.decision === 'REQUIRE_HUMAN_APPROVAL') {
      auditEventType = 'APPROVAL_REQUIRED';
      auditStatus = 'PENDING_APPROVAL';
    }

    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: auditEventType,
      status: auditStatus,
      policyDecision: evaluation.decision,
      payloadSummary: {
        amount: payload.amount,
        currency: payload.currency,
        recipientEmail: payload.recipient.email,
        violationsCount: evaluation.violations.length,
      },
    });

    const statusCode = evaluation.decision === 'ALLOW' ? 200 : evaluation.decision === 'REQUIRE_HUMAN_APPROVAL' ? 202 : 403;

    return reply.status(statusCode).send({
      requestId,
      ...evaluation,
    });
  });

  /**
   * Deterministic Policy Authorization Engine Entrypoint
   * Decision Contract:
   * - ALLOW: policy permits the specific action.
   * - HOLD: action is persisted as pending approval; payment execution is prohibited.
   * - BLOCK: action is denied; payment execution is prohibited.
   */
  fastify.post('/api/v1/policies/authorize', async (req, reply) => {
    const parseResult = policyEvaluationRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid policy authorization payload', parseResult.error.flatten());
    }

    const payload = parseResult.data;
    const requestId = req.id as string;
    const bodyObj = req.body as { tool?: string; operation?: string };

    const decisionRecord = await policyEngine.authorize({
      requestId,
      agentId: payload.agentId,
      tool: bodyObj.tool || 'paypal_payment',
      operation: bodyObj.operation || 'capture_payment',
      amount: payload.amount,
      currency: payload.currency,
      merchant: payload.recipient,
      description: payload.description,
      humanApprovalToken: payload.humanApprovalToken,
    });

    let auditEventType: 'POLICY_APPROVED' | 'POLICY_BLOCKED' | 'APPROVAL_REQUIRED' = 'POLICY_APPROVED';
    let auditStatus: 'SUCCESS' | 'BLOCKED' | 'PENDING_APPROVAL' = 'SUCCESS';

    let pendingApprovalId: string | undefined;

    if (decisionRecord.decision === 'BLOCK') {
      auditEventType = 'POLICY_BLOCKED';
      auditStatus = 'BLOCKED';
    } else if (decisionRecord.decision === 'HOLD') {
      auditEventType = 'APPROVAL_REQUIRED';
      auditStatus = 'PENDING_APPROVAL';

      if (approvalService) {
        const pending = await approvalService.createPendingApproval({
          requestId,
          agentId: payload.agentId,
          policyId: decisionRecord.policyId,
          policyVersion: decisionRecord.policyVersion,
          tool: decisionRecord.tool,
          operation: decisionRecord.operation,
          amountCents: decisionRecord.amountCents,
          amountFormatted: decisionRecord.amountFormatted,
          currency: decisionRecord.currency,
          merchant: decisionRecord.merchant,
          description: payload.description,
          riskReasons: decisionRecord.violations,
        });
        pendingApprovalId = pending.id;
      }
    }

    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: auditEventType,
      status: auditStatus,
      policyDecision: decisionRecord.decision,
      payloadSummary: {
        policyId: decisionRecord.policyId,
        policyVersion: decisionRecord.policyVersion,
        amountFormatted: decisionRecord.amountFormatted,
        currency: decisionRecord.currency,
        merchant: decisionRecord.merchant,
        violations: decisionRecord.violations,
        pendingApprovalId,
      },
      errorMessage: decisionRecord.decision === 'BLOCK' ? decisionRecord.reason : undefined,
    });

    const statusCode = decisionRecord.decision === 'ALLOW' ? 200 : decisionRecord.decision === 'HOLD' ? 202 : 403;

    return reply.status(statusCode).send({
      ...decisionRecord,
      amountCents: decisionRecord.amountCents.toString(),
      pendingApprovalId,
    });
  });

  /**
   * Version History for Policies
   */
  fastify.get('/api/v1/policies/history/:policyId', async (req, reply) => {
    const { policyId } = req.params as { policyId: string };
    const history = await policyEngine.getPolicyStore().getPolicyHistory(policyId);

    return reply.status(200).send({
      policyId,
      versionsCount: history.length,
      history: history.map((p) => ({
        ...p,
        maxAmountCents: p.maxAmountCents.toString(),
        maxDailyAmountCents: p.maxDailyAmountCents.toString(),
        approvalThresholdCents: p.approvalThresholdCents.toString(),
      })),
    });
  });

  /**
   * Risk Analysis Layer Entrypoint
   * Integrates deterministic policy with OpenRouter AI risk classification
   */
  fastify.post('/api/v1/risk/analyze', async (req, reply) => {
    const parseResult = riskAnalysisRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid risk analysis payload', parseResult.error.flatten());
    }

    const payload = parseResult.data;
    const requestId = req.id as string;

    // 1. Evaluate deterministic policy constraints first
    const deterministicAuth = await policyEngine.authorize({
      requestId,
      agentId: payload.agentId,
      tool: 'paypal_payment',
      operation: 'initiate_payment',
      amount: payload.expectedAmount,
      currency: payload.expectedCurrency,
      merchant: { email: payload.expectedMerchant },
      description: payload.intendedPurchase,
    });

    // 2. Evaluate with Risk Decision Engine
    const decisionResult = await riskDecisionEngine.evaluateDecision({
      deterministicDecision: deterministicAuth.decision,
      deterministicViolations: deterministicAuth.violations,
      deterministicReason: deterministicAuth.reason,
      context: {
        requestId,
        policyVersion: payload.policyVersion,
        trusted: {
          intendedPurchase: payload.intendedPurchase,
          expectedAmount: payload.expectedAmount,
          expectedCurrency: payload.expectedCurrency,
          expectedMerchant: payload.expectedMerchant,
          agentId: payload.agentId,
        },
        untrusted: {
          productPageText: payload.productPageText,
          toolResultText: payload.toolResultText,
        },
      },
      aiProvider: aiRiskAnalyzer,
      requireRiskAnalysis: payload.requireRiskAnalysis,
    });

    // 3. Record Audit Event with Latency and Outcome Telemetry (No Credentials Logged)
    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: 'AI_RISK_ANALYZED',
      status: decisionResult.finalDecision === 'ALLOW' ? 'SUCCESS' : decisionResult.finalDecision === 'HOLD' ? 'PENDING_APPROVAL' : 'BLOCKED',
      policyDecision: decisionResult.finalDecision,
      payloadSummary: {
        deterministicDecision: decisionResult.deterministicDecision,
        finalDecision: decisionResult.finalDecision,
        isAiOverridden: decisionResult.isAiOverridden,
        riskScore: decisionResult.aiOutcome?.riskScore,
        riskCategory: decisionResult.aiOutcome?.riskCategory,
        modelId: decisionResult.aiOutcome?.modelId,
        latencyMs: decisionResult.aiOutcome?.latencyMs,
        aiStatus: decisionResult.aiOutcome?.status,
        failureReason: decisionResult.aiOutcome?.failureReason,
      },
      errorMessage: decisionResult.finalDecision === 'BLOCK' ? decisionResult.reasons.join('; ') : undefined,
    });

    const statusCode = decisionResult.finalDecision === 'ALLOW' ? 200 : decisionResult.finalDecision === 'HOLD' ? 202 : 403;

    return reply.status(statusCode).send({
      requestId,
      ...decisionResult,
    });
  });
};
