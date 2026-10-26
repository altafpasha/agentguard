import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IReviewerAuthService } from '../auth/service';
import { createReviewerAuthHook } from '../auth/middleware';
import { loginRequestSchema } from './schemas';
import { ValidationError } from '../common/errors';

export interface AuthRouteOptions {
  authService: IReviewerAuthService;
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (
  fastify: FastifyInstance,
  options: AuthRouteOptions
) => {
  const { authService } = options;
  const requireAuth = createReviewerAuthHook(authService);

  /**
   * Reviewer Login
   */
  fastify.post('/api/v1/auth/login', async (req, reply) => {
    const parseResult = loginRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid login payload', parseResult.error.flatten());
    }

    const { username, password } = parseResult.data;
    const loginResult = await authService.login(username, password);

    return reply.status(200).send({
      message: 'Authentication successful.',
      ...loginResult,
    });
  });

  /**
   * Reviewer Logout / Session Revocation
   */
  fastify.post(
    '/api/v1/auth/logout',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      let token: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else if (typeof req.headers['x-reviewer-token'] === 'string') {
        token = req.headers['x-reviewer-token'].trim();
      }

      if (token) {
        await authService.logout(token);
      }

      return reply.status(200).send({
        message: 'Reviewer session revoked successfully.',
      });
    }
  );

  /**
   * Current Reviewer Profile Check
   */
  fastify.get(
    '/api/v1/auth/me',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      return reply.status(200).send({
        reviewer: req.reviewer,
      });
    }
  );
};
