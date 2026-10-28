import { FastifyRequest, FastifyReply } from 'fastify';
import { IReviewerAuthService, ReviewerProfile, UserRole, normalizeRole, hasRolePermission } from './service';
import { IApiKeyService, ApiKeyRecord } from './api-key-service';
import { UnauthorizedError, ForbiddenError } from '../common/errors';

declare module 'fastify' {
  interface FastifyRequest {
    reviewer?: ReviewerProfile;
    apiKey?: ApiKeyRecord;
  }
}

/**
 * Fastify preHandler hook to enforce authenticated reviewer sessions
 */
export function createReviewerAuthHook(authService: IReviewerAuthService) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    let token: string | undefined;

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (typeof request.headers['x-reviewer-token'] === 'string') {
      token = request.headers['x-reviewer-token'].trim();
    } else if (typeof request.headers.cookie === 'string') {
      const match = request.headers.cookie.match(/(?:^|;\s*)agentguard_session=([^;]+)/);
      if (match && match[1]) {
        token = decodeURIComponent(match[1].trim());
      }
    }

    if (!token) {
      throw new UnauthorizedError(
        'Authentication required. Please provide a valid reviewer session token in Authorization: Bearer <token>, X-Reviewer-Token header, or session cookie.'
      );
    }

    const reviewer = await authService.validateSession(token);
    request.reviewer = reviewer;
  };
}

/**
 * Fastify preHandler hook to enforce API key authentication for SDK clients
 */
export function createApiKeyAuthHook(apiKeyService: IApiKeyService, requiredPermission?: string) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    let key: string | undefined;

    const apiKeyHeader = request.headers['x-api-key'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
      key = apiKeyHeader.trim();
    } else {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const potentialKey = authHeader.substring(7).trim();
        if (potentialKey.startsWith('ag_live_') || potentialKey.startsWith('ag_test_')) {
          key = potentialKey;
        }
      }
    }

    if (!key) {
      throw new UnauthorizedError(
        'API key required. Please provide a valid AgentGuard API key in the X-API-Key header or Authorization: Bearer ag_... header.'
      );
    }

    const keyRecord = await apiKeyService.validateKey(key, requiredPermission);
    request.apiKey = keyRecord;
  };
}

/**
 * Fastify preHandler hook that allows either an API key or an authenticated reviewer session
 */
export function createDualAuthHook(
  authService?: IReviewerAuthService,
  apiKeyService?: IApiKeyService,
  requiredPermission?: string
) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    // 1. Check for API key in X-API-Key or Bearer ag_...
    const apiKeyHeader = request.headers['x-api-key'];
    const authHeader = request.headers.authorization;
    const isApiKeyBearer = authHeader && (authHeader.startsWith('Bearer ag_live_') || authHeader.startsWith('Bearer ag_test_'));

    if (apiKeyService && (typeof apiKeyHeader === 'string' || isApiKeyBearer)) {
      const rawKey = typeof apiKeyHeader === 'string' && apiKeyHeader.trim()
        ? apiKeyHeader.trim()
        : authHeader!.substring(7).trim();

      const keyRecord = await apiKeyService.validateKey(rawKey, requiredPermission);
      request.apiKey = keyRecord;
      return;
    }

    // 2. Fall back to reviewer session
    if (authService) {
      let token: string | undefined;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else if (typeof request.headers['x-reviewer-token'] === 'string') {
        token = request.headers['x-reviewer-token'].trim();
      } else if (typeof request.headers.cookie === 'string') {
        const match = request.headers.cookie.match(/(?:^|;\s*)agentguard_session=([^;]+)/);
        if (match && match[1]) {
          token = decodeURIComponent(match[1].trim());
        }
      }

      if (token) {
        const reviewer = await authService.validateSession(token);
        request.reviewer = reviewer;
        return;
      }
    }

    throw new UnauthorizedError(
      'Authentication required. Please provide an AgentGuard API key (X-API-Key header) or a reviewer session token.'
    );
  };
}

/**
 * Fastify preHandler hook to enforce required roles
 */
export function createRoleAuthHook(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.reviewer) {
      throw new UnauthorizedError('Authentication required before evaluating role permissions.');
    }

    const userRole = normalizeRole(request.reviewer.role);
    const isAllowed = allowedRoles.some((allowed) => hasRolePermission(userRole, allowed));

    if (!isAllowed) {
      throw new ForbiddenError(
        `Insufficient permissions. Action requires one of: ${allowedRoles.join(', ')} (current role: ${userRole}).`
      );
    }
  };
}
