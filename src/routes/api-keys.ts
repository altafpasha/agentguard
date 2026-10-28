import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IApiKeyService } from '../auth/api-key-service';
import { IReviewerAuthService } from '../auth/service';
import { createReviewerAuthHook, createRoleAuthHook } from '../auth/middleware';
import { IAuditRepository } from '../audit';
import { ValidationError } from '../common/errors';
import { z } from 'zod';

export interface ApiKeyRouteOptions {
  apiKeyService: IApiKeyService;
  authService?: IReviewerAuthService;
  auditRepo?: IAuditRepository;
}

const createApiKeySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(128),
  workspaceId: z.string().max(64).optional().default('default'),
  permissions: z.array(z.string()).optional().default(['evaluate']),
  role: z.string().max(32).optional().default('CLIENT'),
  rateLimitRpm: z.number().int().positive().optional().default(600),
  expiresInDays: z.number().int().positive().optional(),
  isTestKey: z.boolean().optional().default(false),
});

export const apiKeyRoutes: FastifyPluginAsync<ApiKeyRouteOptions> = async (
  fastify: FastifyInstance,
  options: ApiKeyRouteOptions
) => {
  const { apiKeyService, authService, auditRepo } = options;

  // Enforce reviewer authentication (Owner/Admin for mutation, analyst for viewing)
  const requireAuth = authService ? createReviewerAuthHook(authService) : null;
  const requireAdminOrOwner = authService ? createRoleAuthHook(['ADMIN', 'OWNER']) : null;

  const authHook = requireAuth ? [requireAuth] : [];
  const adminHook = requireAuth && requireAdminOrOwner ? [requireAuth, requireAdminOrOwner] : authHook;

  /**
   * 1. List API Keys (Never returns secret key or hash)
   */
  fastify.get('/api/v1/api-keys', { preHandler: authHook }, async (req, reply) => {
    const { workspaceId } = (req.query as { workspaceId?: string }) || {};
    const keys = await apiKeyService.listKeys(workspaceId);

    return reply.status(200).send({
      count: keys.length,
      apiKeys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        workspaceId: k.workspaceId,
        role: k.role,
        permissions: k.permissions,
        rateLimitRpm: k.rateLimitRpm,
        revoked: k.revoked,
        revokedAt: k.revokedAt,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        createdBy: k.createdBy,
        createdAt: k.createdAt,
      })),
    });
  });

  /**
   * 2. Create New API Key (Returns secretKey ONCE)
   */
  fastify.post('/api/v1/api-keys', { preHandler: adminHook }, async (req, reply) => {
    const parseResult = createApiKeySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid API key creation payload', parseResult.error.flatten());
    }

    const { name, workspaceId, permissions, role, rateLimitRpm, expiresInDays, isTestKey } = parseResult.data;
    const callerUsername = req.reviewer?.username || 'system';

    const { apiKey, secretKey } = await apiKeyService.generateKey({
      name,
      workspaceId,
      permissions,
      role,
      rateLimitRpm,
      expiresInDays,
      createdBy: callerUsername,
      isTestKey,
    });

    if (auditRepo) {
      await auditRepo.recordEvent({
        requestId: (req.id as string) || `key_gen_${Date.now()}`,
        agentId: callerUsername,
        action: 'API_KEY_CREATED',
        eventType: 'POLICY_APPROVED',
        status: 'SUCCESS',
        payloadSummary: {
          keyId: apiKey.id,
          keyName: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          permissions: apiKey.permissions,
        },
      });
    }

    return reply.status(201).send({
      message: 'API key created successfully. Save the secretKey now; it cannot be viewed again.',
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        workspaceId: apiKey.workspaceId,
        role: apiKey.role,
        permissions: apiKey.permissions,
        rateLimitRpm: apiKey.rateLimitRpm,
        revoked: apiKey.revoked,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
      secretKey, // Shown only once
    });
  });

  /**
   * 3. Revoke API Key (Immediate invalidation)
   */
  fastify.post('/api/v1/api-keys/:id/revoke', { preHandler: adminHook }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const callerUsername = req.reviewer?.username || 'system';

    const revoked = await apiKeyService.revokeKey(id, callerUsername);

    if (auditRepo) {
      await auditRepo.recordEvent({
        requestId: (req.id as string) || `key_rev_${Date.now()}`,
        agentId: callerUsername,
        action: 'API_KEY_REVOKED',
        eventType: 'POLICY_APPROVED',
        status: 'SUCCESS',
        payloadSummary: {
          keyId: revoked.id,
          keyName: revoked.name,
          keyPrefix: revoked.keyPrefix,
        },
      });
    }

    return reply.status(200).send({
      message: `API key '${revoked.name}' (${revoked.keyPrefix}) has been revoked immediately.`,
      apiKey: {
        id: revoked.id,
        name: revoked.name,
        keyPrefix: revoked.keyPrefix,
        revoked: revoked.revoked,
        revokedAt: revoked.revokedAt,
      },
    });
  });

  /**
   * 4. Rotate API Key (Revokes existing, returns new secretKey once)
   */
  fastify.post('/api/v1/api-keys/:id/rotate', { preHandler: adminHook }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const callerUsername = req.reviewer?.username || 'system';

    const { apiKey, secretKey } = await apiKeyService.rotateKey(id, callerUsername);

    if (auditRepo) {
      await auditRepo.recordEvent({
        requestId: (req.id as string) || `key_rot_${Date.now()}`,
        agentId: callerUsername,
        action: 'API_KEY_ROTATED',
        eventType: 'POLICY_APPROVED',
        status: 'SUCCESS',
        payloadSummary: {
          oldKeyId: id,
          newKeyId: apiKey.id,
          keyName: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
        },
      });
    }

    return reply.status(200).send({
      message: 'API key rotated successfully. The previous key was revoked immediately. Save the new secretKey.',
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        workspaceId: apiKey.workspaceId,
        permissions: apiKey.permissions,
        createdAt: apiKey.createdAt,
      },
      secretKey, // Shown only once
    });
  });
};
