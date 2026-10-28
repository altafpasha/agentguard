import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PolicyEngine } from '../policy';
import { IAuditRepository } from '../audit';
import { HumanApprovalService } from '../approval/service';
import { policyEvaluationRequestSchema, riskAnalysisRequestSchema } from './schemas';
import { ValidationError } from '../common/errors';
import { IRiskAnalyzerProvider, RiskDecisionEngine } from '../ai';

import { IReviewerAuthService } from '../auth/service';
import { createReviewerAuthHook, createRoleAuthHook } from '../auth/middleware';

export interface PolicyRouteOptions {
  policyEngine: PolicyEngine;
  auditRepo: IAuditRepository;
  aiRiskAnalyzer?: IRiskAnalyzerProvider;
  riskDecisionEngine?: RiskDecisionEngine;
  approvalService?: HumanApprovalService;
  authService?: IReviewerAuthService;
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
    authService,
  } = options;

  const requireAuth = authService ? createReviewerAuthHook(authService) : null;
  const requireAdminOrOwner = authService ? createRoleAuthHook(['OWNER', 'ADMIN']) : null;

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
  fastify.get('/api/v1/policies/history/:policyId', { preHandler: requireAuth ? [requireAuth] : [] }, async (req, reply) => {
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

  fastify.get('/api/v1/policies/history', { preHandler: requireAuth ? [requireAuth] : [] }, async (req, reply) => {
    const policyId = (req.query as { policyId?: string })?.policyId || 'default';
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
   * Get Active Policy
   */
  fastify.get('/api/v1/policies/active', { preHandler: requireAuth ? [requireAuth] : [] }, async (req, reply) => {
    const policyId = (req.query as { policyId?: string })?.policyId || 'default';
    const store = policyEngine.getPolicyStore();
    let active = await store.getActivePolicy(policyId);
    if (!active) {
      active = policyEngine.getDefaultPolicy() ?? null;
    }

    if (!active) {
      return reply.status(200).send({
        policy: {
          policyId: 'default',
          version: 1,
          maxAmountCents: '5000',
          maxDailyAmountCents: '20000',
          approvalThresholdCents: '2500',
          allowedCurrencies: ['USD', 'EUR', 'GBP'],
          blockedMerchants: ['hacker@blackhat.com'],
          allowedTools: ['paypal_payment', 'payment_gateway', 'paypal_sandbox'],
          allowedOperations: ['create_order', 'capture_payment', 'initiate_payment'],
          velocityLimit: 10,
          velocityWindowSeconds: 3600,
          isActive: true,
        },
      });
    }

    return reply.status(200).send({
      policy: {
        ...active,
        maxAmountCents: active.maxAmountCents.toString(),
        maxDailyAmountCents: active.maxDailyAmountCents.toString(),
        approvalThresholdCents: active.approvalThresholdCents.toString(),
      },
    });
  });

  /**
   * Update Policy / Create New Policy Version (Requires Authenticated Reviewer/Admin Session)
   */
  fastify.post(
    '/api/v1/policies/update',
    { preHandler: requireAuth && requireAdminOrOwner ? [requireAuth, requireAdminOrOwner] : requireAuth ? [requireAuth] : [] },
    async (req, reply) => {
    const body = req.body as {
      policyId?: string;
      maxAmount?: number;
      maxDailyAmount?: number;
      approvalThreshold?: number;
      allowedCurrencies?: string[];
      blockedMerchants?: string[];
      allowedTools?: string[];
      allowedOperations?: string[];
      velocityLimit?: number;
      velocityWindowSeconds?: number;
    };

    const policyId = body.policyId || 'default';
    const store = policyEngine.getPolicyStore();
    const history = await store.getPolicyHistory(policyId);
    const nextVersion = history.length > 0 ? Math.max(...history.map((h) => h.version)) + 1 : 2;

    const current = history[0] || policyEngine.getDefaultPolicy();

    const maxAmountCents = body.maxAmount !== undefined
      ? BigInt(Math.round(body.maxAmount * 100))
      : (current?.maxAmountCents ?? 5000n);

    const maxDailyAmountCents = body.maxDailyAmount !== undefined
      ? BigInt(Math.round(body.maxDailyAmount * 100))
      : (current?.maxDailyAmountCents ?? 20000n);

    const approvalThresholdCents = body.approvalThreshold !== undefined
      ? BigInt(Math.round(body.approvalThreshold * 100))
      : (current?.approvalThresholdCents ?? 2500n);

    const newPolicy = await store.createPolicyVersion({
      policyId,
      version: nextVersion,
      maxAmountCents,
      maxDailyAmountCents,
      approvalThresholdCents,
      allowedCurrencies: body.allowedCurrencies ?? current?.allowedCurrencies ?? ['USD', 'EUR', 'GBP'],
      blockedMerchants: body.blockedMerchants ?? current?.blockedMerchants ?? [],
      allowedTools: body.allowedTools ?? current?.allowedTools ?? ['paypal_payment', 'payment_gateway'],
      allowedOperations: body.allowedOperations ?? current?.allowedOperations ?? ['create_order', 'capture_payment'],
      velocityLimit: body.velocityLimit ?? current?.velocityLimit ?? 10,
      velocityWindowSeconds: body.velocityWindowSeconds ?? current?.velocityWindowSeconds ?? 3600,
      isActive: true,
    });

    await auditRepo.recordEvent({
      requestId: req.id as string,
      agentId: 'system-admin',
      eventType: 'POLICY_EVALUATED',
      status: 'SUCCESS',
      policyDecision: 'ALLOW',
      payloadSummary: {
        action: 'UPDATE_POLICY_VERSION',
        policyId,
        version: newPolicy.version,
        maxAmountCents: maxAmountCents.toString(),
        approvalThresholdCents: approvalThresholdCents.toString(),
      },
    });

    return reply.status(200).send({
      message: `Policy ${policyId} updated to version ${newPolicy.version} successfully.`,
      policy: {
        ...newPolicy,
        maxAmountCents: newPolicy.maxAmountCents.toString(),
        maxDailyAmountCents: newPolicy.maxDailyAmountCents.toString(),
        approvalThresholdCents: newPolicy.approvalThresholdCents.toString(),
      },
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
