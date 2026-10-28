import { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { IReviewerAuthService } from '../auth/service';
import { createReviewerAuthHook } from '../auth/middleware';
import {
  loginRequestSchema,
  setupOwnerRequestSchema,
  publicRegisterRequestSchema,
  changePasswordRequestSchema,
} from './schemas';
import { ValidationError } from '../common/errors';

export interface AuthRouteOptions {
  authService: IReviewerAuthService;
}

// Simple sliding window in-memory rate limiter for login protection
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 15) {
    return false;
  }
  entry.count++;
  return true;
}

function clearRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

function setSessionCookie(reply: FastifyReply, token: string, maxAgeSeconds: number = 8 * 3600) {
  reply.header(
    'Set-Cookie',
    `agentguard_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  );
}

function clearSessionCookie(reply: FastifyReply) {
  reply.header(
    'Set-Cookie',
    'agentguard_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  );
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (
  fastify: FastifyInstance,
  options: AuthRouteOptions
) => {
  const { authService } = options;
  const requireAuth = createReviewerAuthHook(authService);

  /**
   * Check if first-run setup is required
   */
  fastify.get('/api/v1/auth/setup-status', async (_req, reply) => {
    const isRequired = await authService.isSetupRequired();
    return reply.status(200).send({
      isSetupRequired: isRequired,
      message: isRequired
        ? 'Initial setup is required. Please create the owner account.'
        : 'System is initialized.',
    });
  });

  /**
   * First-run setup: Create Primary Owner Account
   */
  fastify.post('/api/v1/auth/setup-owner', async (req, reply) => {
    const parseResult = setupOwnerRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid setup payload', parseResult.error.flatten());
    }

    const { username, email, password, name } = parseResult.data;
    const result = await authService.setupOwner({ username, email, password, name });
    setSessionCookie(reply, result.sessionToken);

    return reply.status(201).send({
      message: 'Owner account created successfully. System initialized.',
      ...result,
    });
  });

  /**
   * User Login (supports username or email)
   */
  fastify.post('/api/v1/auth/login', async (req, reply) => {
    const clientIp = req.ip || '127.0.0.1';
    if (!checkRateLimit(clientIp)) {
      return reply.status(429).send({
        statusCode: 429,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many failed login attempts. Please wait 5 minutes before retrying.',
      });
    }

    const parseResult = loginRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid login payload', parseResult.error.flatten());
    }

    const { username, password } = parseResult.data;
    try {
      const loginResult = await authService.login(username, password);
      clearRateLimit(clientIp);
      setSessionCookie(reply, loginResult.sessionToken);

      return reply.status(200).send({
        message: 'Authentication successful.',
        ...loginResult,
      });
    } catch (err) {
      throw err;
    }
  });

  /**
   * Public Self-Registration (Gated by auth_settings.allowPublicSignup)
   */
  fastify.post('/api/v1/auth/register', async (req, reply) => {
    const parseResult = publicRegisterRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid registration payload', parseResult.error.flatten());
    }

    const { username, email, password, name } = parseResult.data;
    const result = await authService.registerPublicUser({ username, email, password, name });
    setSessionCookie(reply, result.sessionToken);

    return reply.status(201).send({
      message: 'Account registered successfully.',
      ...result,
    });
  });

  /**
   * User Logout / Session Revocation
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
      } else if (typeof req.headers.cookie === 'string') {
        const match = req.headers.cookie.match(/(?:^|;\s*)agentguard_session=([^;]+)/);
        if (match && match[1]) {
          token = decodeURIComponent(match[1].trim());
        }
      }

      if (token) {
        await authService.logout(token);
      }

      clearSessionCookie(reply);

      return reply.status(200).send({
        message: 'Session revoked successfully.',
      });
    }
  );

  /**
   * Current Authenticated User Profile Check
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

  /**
   * Change Password (Authenticated user with session rotation)
   */
  fastify.post(
    '/api/v1/auth/change-password',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const parseResult = changePasswordRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid password payload', parseResult.error.flatten());
      }

      const { oldPassword, newPassword } = parseResult.data;
      const result = await authService.changePassword(req.reviewer!.id, oldPassword, newPassword);
      setSessionCookie(reply, result.sessionToken);

      return reply.status(200).send({
        message: 'Password changed successfully. Existing sessions rotated.',
        ...result,
      });
    }
  );
};
