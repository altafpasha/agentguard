import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { HumanApprovalService } from '../approval/service';
import { IReviewerAuthService } from '../auth/service';
import { IApiKeyService } from '../auth/api-key-service';
import { createReviewerAuthHook, createRoleAuthHook, createDualAuthHook } from '../auth/middleware';
import { rejectApprovalRequestSchema } from './schemas';
import { ValidationError, NotFoundError } from '../common/errors';

export interface ApprovalRouteOptions {
  approvalService: HumanApprovalService;
  authService: IReviewerAuthService;
  apiKeyService?: IApiKeyService;
}

export const approvalRoutes: FastifyPluginAsync<ApprovalRouteOptions> = async (
  fastify: FastifyInstance,
  options: ApprovalRouteOptions
) => {
  const { approvalService, authService, apiKeyService } = options;
  const requireAuth = createReviewerAuthHook(authService);
  const requireEditorOrAbove = createRoleAuthHook(['EDITOR']);
  const readApprovalAuth = createDualAuthHook(authService, apiKeyService);

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
   * Get single pending approval record by ID (Accessible by reviewers and SDK API keys)
   */
  fastify.get(
    '/api/v1/approvals/:id',
    { preHandler: [readApprovalAuth] },
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
   * Requires EDITOR, ADMIN, or OWNER role. (Viewers cannot perform write operations).
   */
  fastify.post(
    '/api/v1/approvals/:id/approve',
    { preHandler: [requireAuth, requireEditorOrAbove] },
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
   * Requires EDITOR, ADMIN, or OWNER role. (Viewers cannot perform write operations).
   */
  fastify.post(
    '/api/v1/approvals/:id/reject',
    { preHandler: [requireAuth, requireEditorOrAbove] },
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
