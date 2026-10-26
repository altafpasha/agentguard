import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PolicyEngine } from '../policy';
import { IAuditRepository } from '../audit';
import { policyEvaluationRequestSchema } from './schemas';
import { ValidationError } from '../common/errors';

export interface PolicyRouteOptions {
  policyEngine: PolicyEngine;
  auditRepo: IAuditRepository;
}

export const policyRoutes: FastifyPluginAsync<PolicyRouteOptions> = async (
  fastify: FastifyInstance,
  options: PolicyRouteOptions
) => {
  const { policyEngine, auditRepo } = options;

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

    if (decisionRecord.decision === 'BLOCK') {
      auditEventType = 'POLICY_BLOCKED';
      auditStatus = 'BLOCKED';
    } else if (decisionRecord.decision === 'HOLD') {
      auditEventType = 'APPROVAL_REQUIRED';
      auditStatus = 'PENDING_APPROVAL';
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
      },
      errorMessage: decisionRecord.decision === 'BLOCK' ? decisionRecord.reason : undefined,
    });

    const statusCode = decisionRecord.decision === 'ALLOW' ? 200 : decisionRecord.decision === 'HOLD' ? 202 : 403;

    return reply.status(statusCode).send({
      ...decisionRecord,
      amountCents: decisionRecord.amountCents.toString(),
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
};
