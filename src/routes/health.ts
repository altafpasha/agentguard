import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IAuditRepository } from '../audit';

export interface HealthRouteOptions {
  auditRepo: IAuditRepository;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (
  fastify: FastifyInstance,
  options: HealthRouteOptions
) => {
  const { auditRepo } = options;

  // Liveness endpoint
  fastify.get('/health', async (_req, reply) => {
    return reply.status(200).send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      service: 'agentguard-gateway',
      version: '1.0.0',
    });
  });

  // Readiness endpoint (verifies database / audit repository connection)
  fastify.get('/health/ready', async (req, reply) => {
    const isDbConnected = await auditRepo.healthCheck();

    if (!isDbConnected) {
      req.log.warn('Readiness check failed: audit repository is disconnected');
      return reply.status(503).send({
        status: 'unready',
        timestamp: new Date().toISOString(),
        checks: {
          auditDatabase: 'disconnected',
        },
      });
    }

    return reply.status(200).send({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        auditDatabase: 'connected',
      },
    });
  });
};
