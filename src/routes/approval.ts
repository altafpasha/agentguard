import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { HumanApprovalService } from '../approval/service';
import { IReviewerAuthService } from '../auth/service';
import { createReviewerAuthHook } from '../auth/middleware';
import { rejectApprovalRequestSchema } from './schemas';
import { ValidationError, NotFoundError } from '../common/errors';

export interface ApprovalRouteOptions {
  approvalService: HumanApprovalService;
  authService: IReviewerAuthService;
}

export const approvalRoutes: FastifyPluginAsync<ApprovalRouteOptions> = async (
  fastify: FastifyInstance,
  options: ApprovalRouteOptions
) => {
  const { approvalService, authService } = options;
  const requireAuth = createReviewerAuthHook(authService);

  /**
   * List all pending actions awaiting human review
   */
  fastify.get(
    '/api/v1/approvals/pending',
    { preHandler: [requireAuth] },
    async (_req, reply) => {
      const records = await approvalService.listPendingApprovals();
      return reply.status(200).send({
        count: records.length,
        pendingApprovals: records.map((r) => ({
          ...r,
          amountCents: r.amountCents.toString(),
        })),
      });
    }
  );

  /**
   * Get single pending approval record by ID
   */
  fastify.get(
    '/api/v1/approvals/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const record = await approvalService.getPendingApprovalById(id);
      if (!record) {
        throw new NotFoundError(`Pending approval '${id}' not found.`);
      }

      return reply.status(200).send({
        ...record,
        amountCents: record.amountCents.toString(),
      });
    }
  );

  /**
   * Authenticated reviewer approves a pending action.
   * Enforces atomic update, revalidates constraints, and issues short-lived single-use authorization token.
   */
  fastify.post(
    '/api/v1/approvals/:id/approve',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const reviewer = req.reviewer!;

      const bodyObj = (req.body as { tokenTtlSeconds?: number }) ?? {};
      const approvedRecord = await approvalService.approveAction(
        id,
        reviewer.username,
        bodyObj.tokenTtlSeconds
      );

      return reply.status(200).send({
        message: 'Action approved successfully. Server authorization token issued.',
        approval: {
          ...approvedRecord,
          amountCents: approvedRecord.amountCents.toString(),
        },
      });
    }
  );

  /**
   * Authenticated reviewer rejects a pending action.
   */
  fastify.post(
    '/api/v1/approvals/:id/reject',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const reviewer = req.reviewer!;

      const parseResult = rejectApprovalRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid reject payload', parseResult.error.flatten());
      }

      const { reason } = parseResult.data;
      const rejectedRecord = await approvalService.rejectAction(id, reviewer.username, reason);

      return reply.status(200).send({
        message: 'Action rejected by reviewer.',
        approval: {
          ...rejectedRecord,
          amountCents: rejectedRecord.amountCents.toString(),
        },
      });
    }
  );
};
