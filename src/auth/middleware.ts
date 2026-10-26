import { FastifyRequest, FastifyReply } from 'fastify';
import { IReviewerAuthService, ReviewerProfile } from './service';
import { UnauthorizedError } from '../common/errors';

declare module 'fastify' {
  interface FastifyRequest {
    reviewer?: ReviewerProfile;
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
    }

    if (!token) {
      throw new UnauthorizedError(
        'Authentication required. Please provide a valid reviewer session token in Authorization: Bearer <token> or X-Reviewer-Token header.'
      );
    }

    const reviewer = await authService.validateSession(token);
    request.reviewer = reviewer;
  };
}
