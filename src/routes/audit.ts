import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IAuditRepository } from '../audit';
import { NotFoundError } from '../common/errors';

export interface AuditRouteOptions {
  auditRepo: IAuditRepository;
}

export const auditRoutes: FastifyPluginAsync<AuditRouteOptions> = async (
  fastify: FastifyInstance,
  options: AuditRouteOptions
) => {
  const { auditRepo } = options;

  fastify.get('/api/v1/audit/:requestId', async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    const events = await auditRepo.getEventsByRequestId(requestId);

    if (!events || events.length === 0) {
      throw new NotFoundError(`No audit events found for requestId: ${requestId}`);
    }

    return reply.status(200).send({
      requestId,
      count: events.length,
      events,
    });
  });

  fastify.get('/api/v1/audit/agent/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const limit = Number((req.query as { limit?: string }).limit ?? 50);
    const events = await auditRepo.getEventsByAgentId(agentId, limit);

    return reply.status(200).send({
      agentId,
      count: events.length,
      events,
    });
  });
};
