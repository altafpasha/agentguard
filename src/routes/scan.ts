import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { InjectionScanner } from '../scanner';
import { IAuditRepository } from '../audit';
import { scanRequestSchema } from './schemas';
import { ValidationError } from '../common/errors';

export interface ScanRouteOptions {
  scanner: InjectionScanner;
  auditRepo: IAuditRepository;
}

export const scanRoutes: FastifyPluginAsync<ScanRouteOptions> = async (
  fastify: FastifyInstance,
  options: ScanRouteOptions
) => {
  const { scanner, auditRepo } = options;

  fastify.post('/api/v1/scan', async (req, reply) => {
    const parseResult = scanRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid scan request payload', parseResult.error.flatten());
    }

    const { input, agentId = 'anonymous-agent' } = parseResult.data;
    const requestId = req.id as string;

    const scanResult = scanner.scan(input);

    // Audit the scan operation
    await auditRepo.recordEvent({
      requestId,
      agentId,
      eventType: scanResult.isThreatDetected ? 'INJECTION_BLOCKED' : 'INJECTION_SCAN_PASSED',
      status: scanResult.isThreatDetected ? 'BLOCKED' : 'SUCCESS',
      riskScore: scanResult.riskScore,
      payloadSummary: {
        threatLevel: scanResult.threatLevel,
        findingsCount: scanResult.findings.length,
        hasThreat: scanResult.isThreatDetected,
      },
    });

    const statusCode = scanResult.isThreatDetected ? 403 : 200;

    return reply.status(statusCode).send({
      requestId,
      agentId,
      ...scanResult,
    });
  });
};
