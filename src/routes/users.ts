import crypto from 'node:crypto';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IReviewerAuthService, normalizeRole } from '../auth/service';
import { createReviewerAuthHook, createRoleAuthHook } from '../auth/middleware';
import { IAuditRepository } from '../audit';
import {
  inviteUserRequestSchema,
  acceptInviteRequestSchema,
  updateUserStatusRequestSchema,
  updateUserRoleRequestSchema,
  resetPasswordRequestSchema,
  updateAuthSettingsRequestSchema,
} from './schemas';
import { ValidationError, ForbiddenError } from '../common/errors';

export interface UserRouteOptions {
  authService: IReviewerAuthService;
  auditRepo: IAuditRepository;
}

export const userRoutes: FastifyPluginAsync<UserRouteOptions> = async (
  fastify: FastifyInstance,
  options: UserRouteOptions
) => {
  const { authService, auditRepo } = options;
  const requireAuth = createReviewerAuthHook(authService);
  const requireAdminOrOwner = createRoleAuthHook(['ADMIN']);
  const requireOwnerOnly = createRoleAuthHook(['OWNER']);

  /**
   * List all system users (Owner & Admin only)
   */
  fastify.get(
    '/api/v1/users',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    async (_req, reply) => {
      const users = await authService.listUsers();
      return reply.status(200).send({
        count: users.length,
        users,
      });
    }
  );

  /**
   * Invite a new user with single-use, time-limited token (Owner & Admin only)
   */
  fastify.post(
    '/api/v1/users/invite',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    async (req, reply) => {
      const parseResult = inviteUserRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid invite payload', parseResult.error.flatten());
      }

      const caller = req.reviewer!;
      const callerRole = normalizeRole(caller.role);
      const { email, role, ttlHours } = parseResult.data;

      // Admins cannot invite other Admins or Owners; only Owners can invite Admins
      if (callerRole !== 'OWNER' && (role === 'ADMIN' || (role as string) === 'OWNER')) {
        throw new ForbiddenError('Administrators cannot invite other Administrators. Only Owners can invite Administrators.');
      }

      const inviteResult = await authService.inviteUser({
        email,
        role,
        createdBy: caller.id,
        ttlHours,
      });

      // Construct self-hosted invite URL
      const host = req.headers.host || 'localhost:3000';
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const inviteUrl = `${protocol}://${host}/accept-invite?token=${inviteResult.inviteToken}`;

      await auditRepo.recordEvent({
        requestId: req.id as string,
        agentId: caller.username,
        action: 'INVITE_USER',
        eventType: 'POLICY_EVALUATED',
        status: 'SUCCESS',
        policyDecision: 'ALLOW',
        payloadSummary: {
          action: 'USER_INVITATION_CREATED',
          invitedEmail: email,
          assignedRole: role,
          invitedBy: caller.username,
          expiresAt: inviteResult.expiresAt,
        },
      });

      return reply.status(201).send({
        message: 'Invitation generated successfully.',
        inviteId: inviteResult.inviteId,
        invitationId: inviteResult.inviteId,
        inviteToken: inviteResult.inviteToken,
        inviteUrl,
        email: inviteResult.email,
        role: inviteResult.role,
        expiresAt: inviteResult.expiresAt,
      });
    }
  );

  /**
   * List all user invitations (Owner & Admin only)
   */
  fastify.get(
    '/api/v1/users/invitations',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    async (_req, reply) => {
      const invitations = await authService.listInvitations();
      return reply.status(200).send({
        count: invitations.length,
        invitations,
      });
    }
  );

  /**
   * Revoke a pending invitation (Owner & Admin only)
   */
  const revokeHandler = async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    const caller = req.reviewer!;

    await authService.revokeInvitation(id, caller);

    await auditRepo.recordEvent({
      requestId: req.id as string,
      agentId: caller.username,
      action: 'REVOKE_INVITATION',
      eventType: 'POLICY_EVALUATED',
      status: 'SUCCESS',
      policyDecision: 'ALLOW',
      payloadSummary: {
        action: 'USER_INVITATION_REVOKED',
        inviteId: id,
        revokedBy: caller.username,
      },
    });

    return reply.status(200).send({
      message: 'Invitation revoked successfully.',
    });
  };

  fastify.post(
    '/api/v1/users/invitations/:id/revoke',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    revokeHandler
  );

  fastify.delete(
    '/api/v1/users/invitations/:id',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    revokeHandler
  );

  /**
   * Accept an invitation and activate user account (Public with valid token)
   */
  fastify.post('/api/v1/users/accept-invite', async (req, reply) => {
    const parseResult = acceptInviteRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid invitation acceptance payload', parseResult.error.flatten());
    }

    const { inviteToken, username, password, name } = parseResult.data;
    const loginResult = await authService.acceptInvite({
      inviteToken,
      username,
      password,
      name,
    });

    // Set HttpOnly session cookie
    reply.header(
      'Set-Cookie',
      `agentguard_session=${encodeURIComponent(loginResult.sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`
    );

    await auditRepo.recordEvent({
      requestId: req.id as string,
      agentId: username,
      action: 'ACCEPT_INVITATION',
      eventType: 'POLICY_APPROVED',
      status: 'SUCCESS',
      policyDecision: 'ALLOW',
      payloadSummary: {
        action: 'USER_INVITATION_ACCEPTED',
        username,
        role: loginResult.reviewer.role,
      },
    });

    return reply.status(200).send({
      message: 'Account activated successfully.',
      ...loginResult,
    });
  });

  /**
   * Deactivate or reactivate user (Owner & Admin only; cannot deactivate last owner)
   */
  fastify.patch(
    '/api/v1/users/:id/status',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parseResult = updateUserStatusRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid status payload', parseResult.error.flatten());
      }

      const caller = req.reviewer!;
      const { status } = parseResult.data;

      const updatedUser = await authService.updateUserStatus(id, status, caller);

      await auditRepo.recordEvent({
        requestId: req.id as string,
        agentId: caller.username,
        action: 'UPDATE_USER_STATUS',
        eventType: 'POLICY_EVALUATED',
        status: 'SUCCESS',
        policyDecision: 'ALLOW',
        payloadSummary: {
          targetUserId: id,
          newStatus: status,
          updatedBy: caller.username,
        },
      });

      return reply.status(200).send({
        message: `User status updated to ${status}.`,
        user: updatedUser,
      });
    }
  );

  /**
   * Modify user role (Owner only; cannot demote last owner)
   */
  fastify.patch(
    '/api/v1/users/:id/role',
    { preHandler: [requireAuth, requireOwnerOnly] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parseResult = updateUserRoleRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid role payload', parseResult.error.flatten());
      }

      const caller = req.reviewer!;
      const { role } = parseResult.data;

      const updatedUser = await authService.updateUserRole(id, role, caller);

      await auditRepo.recordEvent({
        requestId: req.id as string,
        agentId: caller.username,
        action: 'UPDATE_USER_ROLE',
        eventType: 'POLICY_EVALUATED',
        status: 'SUCCESS',
        policyDecision: 'ALLOW',
        payloadSummary: {
          targetUserId: id,
          newRole: role,
          updatedBy: caller.username,
        },
      });

      return reply.status(200).send({
        message: `User role updated to ${role}.`,
        user: updatedUser,
      });
    }
  );

  /**
   * Delete user account with safeguards (Owner & Admin only; cannot delete last owner or self)
   */
  fastify.delete(
    '/api/v1/users/:id',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const caller = req.reviewer!;

      await authService.deleteUser(id, caller);

      await auditRepo.recordEvent({
        requestId: req.id as string,
        agentId: caller.username,
        action: 'DELETE_USER',
        eventType: 'POLICY_EVALUATED',
        status: 'SUCCESS',
        policyDecision: 'ALLOW',
        payloadSummary: {
          targetUserId: id,
          deletedBy: caller.username,
        },
      });

      return reply.status(200).send({
        message: 'User account removed successfully.',
      });
    }
  );

  /**
   * Admin Reset User Password (Owner & Admin only)
   */
  fastify.post(
    '/api/v1/users/:id/reset-password',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const caller = req.reviewer!;

      const parseResult = resetPasswordRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid reset password payload', parseResult.error.flatten());
      }

      const finalTempPassword = parseResult.data?.tempPassword || (crypto.randomBytes(8).toString('hex') + 'Aa1!');
      await authService.resetUserPassword(id, finalTempPassword, caller);

      await auditRepo.recordEvent({
        requestId: req.id as string,
        agentId: caller.username,
        action: 'RESET_USER_PASSWORD',
        eventType: 'POLICY_EVALUATED',
        status: 'SUCCESS',
        policyDecision: 'ALLOW',
        payloadSummary: {
          targetUserId: id,
          resetBy: caller.username,
        },
      });

      return reply.status(200).send({
        message: 'User password reset successfully. Active sessions revoked.',
        temporaryPassword: finalTempPassword,
      });
    }
  );

  /**
   * Revoke all active sessions for a user (Owner & Admin only)
   */
  fastify.post(
    '/api/v1/users/:id/revoke-sessions',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const caller = req.reviewer!;

      const revokedCount = await authService.revokeUserSessions(id);

      await auditRepo.recordEvent({
        requestId: req.id as string,
        agentId: caller.username,
        action: 'REVOKE_USER_SESSIONS',
        eventType: 'POLICY_EVALUATED',
        status: 'SUCCESS',
        policyDecision: 'ALLOW',
        payloadSummary: {
          targetUserId: id,
          revokedSessionsCount: revokedCount,
          revokedBy: caller.username,
        },
      });

      return reply.status(200).send({
        message: `Revoked ${revokedCount} active session(s) for user.`,
        revokedCount,
      });
    }
  );

  /**
   * Get Authentication & Registration Settings (Owner & Admin only)
   */
  fastify.get(
    '/api/v1/settings/auth',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    async (_req, reply) => {
      const settings = await authService.getAuthSettings();
      return reply.status(200).send({
        settings,
      });
    }
  );

  /**
   * Update Authentication & Registration Settings (Owner & Admin only)
   */
  fastify.patch(
    '/api/v1/settings/auth',
    { preHandler: [requireAuth, requireAdminOrOwner] },
    async (req, reply) => {
      const parseResult = updateAuthSettingsRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid auth settings payload', parseResult.error.flatten());
      }

      const caller = req.reviewer!;
      const updated = await authService.updateAuthSettings(parseResult.data, caller);

      await auditRepo.recordEvent({
        requestId: req.id as string,
        agentId: caller.username,
        action: 'UPDATE_AUTH_SETTINGS',
        eventType: 'POLICY_EVALUATED',
        status: 'SUCCESS',
        policyDecision: 'ALLOW',
        payloadSummary: {
          updatedSettings: parseResult.data,
          updatedBy: caller.username,
        },
      });

      return reply.status(200).send({
        message: 'Authentication and access settings updated successfully.',
        settings: updated,
      });
    }
  );
};
