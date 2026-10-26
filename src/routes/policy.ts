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
};
