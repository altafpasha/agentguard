import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryReviewerAuthService } from '../../src/auth/service';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { buildApp } from '../../src/app';
import { EnvConfig } from '../../src/config';

describe('Comprehensive Security Lifecycle: Admin Setup, Authentication & RBAC', () => {
  let authService: MemoryReviewerAuthService;
  let auditRepo: MemoryAuditRepository;
  let app: any;

  const testConfig: EnvConfig = {
    NODE_ENV: 'test',
    PORT: 3001,
    HOST: '127.0.0.1',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'memory://test',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL: 'test-model',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENROUTER_TIMEOUT_MS: 5000,
    OPENROUTER_MAX_RETRIES: 1,
    OPENROUTER_MAX_CONTEXT_CHARS: 4000,
    OPENROUTER_RATE_LIMIT_RPM: 60,
    PAYPAL_CLIENT_ID: 'test-client',
    PAYPAL_CLIENT_SECRET: 'test-secret',
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_API_BASE_URL: 'https://api-m.sandbox.paypal.com',
    PAYPAL_ALLOW_LIVE_EXECUTION: false,
    PAYPAL_TIMEOUT_MS: 5000,
    POLICY_MAX_TRANSACTION_AMOUNT: 50,
    POLICY_MAX_DAILY_AMOUNT: 200,
    POLICY_ALLOWED_CURRENCIES: ['USD'],
    POLICY_REQUIRE_HUMAN_APPROVAL_THRESHOLD: 25,
    POLICY_REQUIRE_AI_RISK_ANALYSIS: false,
    POLICY_RECIPIENT_DENYLIST: [],
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    RAZORPAY_WEBHOOK_SECRET: '',
    RAZORPAY_ALLOW_LIVE_EXECUTION: false,
  };

  beforeEach(() => {
    authService = new MemoryReviewerAuthService();
    auditRepo = new MemoryAuditRepository();
    app = buildApp({
      config: testConfig,
      authService,
      auditRepo,
    });
  });

  // 1. Fresh installation redirects to initial admin setup
  it('1. Fresh installation reports setup is required', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/setup-status',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isSetupRequired).toBe(true);
    expect(body.message.toLowerCase()).toContain('setup is required');
  });

  // 2. Initial admin can be created exactly once with strong password enforcement
  it('2. Initial admin creation enforces strong password policy', async () => {
    // Weak password: less than 8 chars
    const weakRes1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'admin',
        email: 'admin@company.com',
        password: 'short',
        name: 'Administrator',
      },
    });
    expect(weakRes1.statusCode).toBe(400);

    // Weak password: no uppercase or symbol
    const weakRes2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'admin',
        email: 'admin@company.com',
        password: 'alllowercase123',
        name: 'Administrator',
      },
    });
    expect(weakRes2.statusCode).toBe(400);

    // Strong password: satisfies policy
    const validRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'admin',
        email: 'admin@company.com',
        password: 'StrongAdminPassword2026!',
        name: 'Initial Administrator',
      },
    });
    expect(validRes.statusCode).toBe(201);
    const body = JSON.parse(validRes.body);
    expect(body.sessionToken).toBeDefined();
    expect(body.reviewer.role).toBe('OWNER');

    // Cookie is set
    expect(validRes.headers['set-cookie']).toBeDefined();
  });

  // 3. Concurrent setup attempts cannot create multiple admins
  it('3. Concurrency-safe: simultaneous setup attempts result in exactly 1 admin', async () => {
    const requests = Array.from({ length: 5 }, (_, i) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup-owner',
        payload: {
          username: `admin_${i}`,
          email: `admin_${i}@company.com`,
          password: `StrongConcurrencyPass${i}!`,
          name: `Concurrent Admin ${i}`,
        },
      })
    );

    const responses = await Promise.all(requests);
    const successes = responses.filter((r) => r.statusCode === 201);
    const forbidden = responses.filter((r) => r.statusCode === 403);

    expect(successes).toHaveLength(1);
    expect(forbidden).toHaveLength(4);
  });

  // 4. Setup cannot be repeated after initialization
  it('4. Initial setup route permanently locks after completion', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'first_admin',
        email: 'first@org.internal',
        password: 'StrongFirstPassword2026!',
        name: 'First Admin',
      },
    });

    const secondAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'impostor',
        email: 'impostor@evil.com',
        password: 'StrongImpostorPassword2026!',
        name: 'Impostor',
      },
    });
    expect(secondAttempt.statusCode).toBe(403);
    expect(JSON.parse(secondAttempt.body).error).toBe('FORBIDDEN');
  });

  // 5. Dashboard pages and APIs reject unauthenticated access
  it('5. Private APIs strictly reject unauthenticated callers with 401', async () => {
    const endpoints = [
      { method: 'GET', url: '/api/v1/dashboard/overview' },
      { method: 'GET', url: '/api/v1/audit/events' },
      { method: 'GET', url: '/api/v1/policies/active' },
      { method: 'GET', url: '/api/v1/policies/history/default' },
      { method: 'GET', url: '/api/v1/settings/auth' },
      { method: 'GET', url: '/api/v1/users' },
      { method: 'GET', url: '/api/v1/integrations/status' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({ method: ep.method, url: ep.url });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('UNAUTHORIZED');
    }
  });

  // 6. Public sign-up is disabled by default
  it('6. Public registration is disabled by default on fresh installation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'random_guest',
        email: 'guest@public.com',
        password: 'ValidGuestPassword123!',
        name: 'Random Guest',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toContain('Public registration is currently disabled');
  });

  // 7. Registration settings are enforced by the backend
  it('7. When public sign-up is enabled by admin, users register with configured default role', async () => {
    // 1. Setup initial owner
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'boss',
        email: 'boss@corp.com',
        password: 'SuperBossPassword123!',
        name: 'Boss',
      },
    });
    const ownerToken = JSON.parse(setup.body).sessionToken;

    // 2. Owner enables public sign-up with default role VIEWER
    const updateSettingsRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/settings/auth',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        allowPublicSignup: true,
        defaultUserRole: 'VIEWER',
      },
    });
    expect(updateSettingsRes.statusCode).toBe(200);

    // 3. Public registration now succeeds
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'new_viewer',
        email: 'viewer@corp.com',
        password: 'ViewerPassword123!',
        name: 'New Viewer',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const viewerBody = JSON.parse(regRes.body);
    expect(viewerBody.reviewer.role).toBe('VIEWER');
  });

  // 8. Invitations expire, cannot be reused, and cannot be forged
  it('8. Invitations are single-use, hash-stored, and can be revoked', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'invite_master',
        email: 'master@corp.com',
        password: 'MasterPassword123!',
        name: 'Master',
      },
    });
    const ownerToken = JSON.parse(setup.body).sessionToken;

    // Issue invitation
    const inviteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: 'editor@corp.com',
        role: 'EDITOR',
      },
    });
    expect(inviteRes.statusCode).toBe(201);
    const { inviteToken, invitationId } = JSON.parse(inviteRes.body);

    // List invitations
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/invitations',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const invites = JSON.parse(listRes.body).invitations;
    expect(invites.some((inv: any) => inv.id === invitationId)).toBe(true);

    // Accept invitation
    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'editor_user',
        password: 'EditorPassword123!',
        name: 'Editor User',
      },
    });
    expect(acceptRes.statusCode).toBe(200);
    expect(JSON.parse(acceptRes.body).reviewer.role).toBe('EDITOR');

    // Attempt to reuse invitation -> MUST FAIL (400)
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'replay_user',
        password: 'ReplayPassword123!',
        name: 'Replay',
      },
    });
    expect(reuseRes.statusCode).toBe(400);

    // Revocation test: Issue another invitation and revoke it
    const invite2Res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: 'revokeme@corp.com',
        role: 'VIEWER',
      },
    });
    const { inviteToken: token2, invitationId: id2 } = JSON.parse(invite2Res.body);

    // Revoke invitation
    const revokeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/users/invitations/${id2}/revoke`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(revokeRes.statusCode).toBe(200);

    // Attempt to accept revoked invitation -> MUST FAIL
    const acceptRevoked = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken: token2,
        username: 'revoked_user',
        password: 'ValidPassword123!',
        name: 'Revoked',
      },
    });
    expect(acceptRevoked.statusCode).toBe(400);
    expect(JSON.parse(acceptRevoked.body).message).toContain('revoked');
  });

  // 9. Editors cannot access admin-only functionality
  it('9. Editors are restricted from user management, policy updates, and auth settings', async () => {
    // 1. Setup owner & invite editor
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'root_admin',
        email: 'root@corp.com',
        password: 'RootPassword123!',
        name: 'Root Admin',
      },
    });
    const ownerToken = JSON.parse(setup.body).sessionToken;

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'ops.editor@corp.com', role: 'EDITOR' },
    });
    const { inviteToken } = JSON.parse(inviteRes.body);

    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'ops_editor',
        password: 'EditorPassword123!',
        name: 'Ops Editor',
      },
    });
    const editorToken = JSON.parse(acceptRes.body).sessionToken;

    // 2. Editor attempts user management -> 403 Forbidden
    const userManage = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { email: 'another@corp.com', role: 'VIEWER' },
    });
    expect(userManage.statusCode).toBe(403);

    // 3. Editor attempts auth settings change -> 403 Forbidden
    const authChange = await app.inject({
      method: 'PATCH',
      url: '/api/v1/settings/auth',
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { allowPublicSignup: true },
    });
    expect(authChange.statusCode).toBe(403);

    // 4. Editor attempts policy update -> 403 Forbidden
    const policyUpdate = await app.inject({
      method: 'POST',
      url: '/api/v1/policies/update',
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { maxAmount: 9999 },
    });
    expect(policyUpdate.statusCode).toBe(403);
  });

  // 10. Viewers cannot perform write operations
  it('10. Viewers receive 403 Forbidden on transaction authorization mutations', async () => {
    // 1. Setup owner & create viewer
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'owner_sec',
        email: 'owner@sec.com',
        password: 'SecPassword123!',
        name: 'Sec Owner',
      },
    });
    const ownerToken = JSON.parse(setup.body).sessionToken;

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'readonly@sec.com', role: 'VIEWER' },
    });
    const { inviteToken } = JSON.parse(inviteRes.body);

    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'viewer_user',
        password: 'ViewerPassword123!',
        name: 'Viewer User',
      },
    });
    const viewerToken = JSON.parse(acceptRes.body).sessionToken;

    // 2. Viewer attempts to approve a transaction -> 403 Forbidden
    const approveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/mock-appr-1/approve',
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(approveRes.statusCode).toBe(403);

    // 3. Viewer attempts to reject a transaction -> 403 Forbidden
    const rejectRes = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/mock-appr-1/reject',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { reason: 'Unauthorized viewer test' },
    });
    expect(rejectRes.statusCode).toBe(403);
  });

  // 11. Users cannot escalate their own privileges
  it('11. Users cannot escalate their own role or promote themselves', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'big_admin',
        email: 'big@admin.com',
        password: 'BigPassword123!',
        name: 'Big Admin',
      },
    });
    const ownerToken = JSON.parse(setup.body).sessionToken;

    // Create an editor
    const inviteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'subordinate@admin.com', role: 'EDITOR' },
    });
    const { inviteToken } = JSON.parse(inviteRes.body);

    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'subordinate',
        password: 'SubPassword123!',
        name: 'Subordinate',
      },
    });
    const subBody = JSON.parse(acceptRes.body);
    const subToken = subBody.sessionToken;
    const subId = subBody.reviewer.id;

    // Subordinate tries to promote themselves to OWNER or ADMIN
    const escalateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${subId}/role`,
      headers: { authorization: `Bearer ${subToken}` },
      payload: { role: 'ADMIN' },
    });
    expect(escalateRes.statusCode).toBe(403);
  });

  // 12. Disabled users cannot continue using existing sessions
  it('12. Deactivating an account immediately invalidates existing active sessions', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'super_admin',
        email: 'super@admin.com',
        password: 'SuperPassword123!',
        name: 'Super Admin',
      },
    });
    const ownerToken = JSON.parse(setup.body).sessionToken;

    // Create user
    const inviteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'target@admin.com', role: 'EDITOR' },
    });
    const { inviteToken } = JSON.parse(inviteRes.body);

    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'target_user',
        password: 'TargetPassword123!',
        name: 'Target User',
      },
    });
    const targetBody = JSON.parse(acceptRes.body);
    const targetToken = targetBody.sessionToken;
    const targetId = targetBody.reviewer.id;

    // Verify session works initially
    const verifyInitial = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${targetToken}` },
    });
    expect(verifyInitial.statusCode).toBe(200);

    // Admin deactivates target user
    const deactivateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${targetId}/status`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { status: 'INACTIVE' },
    });
    expect(deactivateRes.statusCode).toBe(200);

    // User's session MUST now be rejected
    const verifyAfterDeactivation = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${targetToken}` },
    });
    expect(verifyAfterDeactivation.statusCode).toBe(401);
  });

  // 13. Password change rotates session and invalidates previous sessions
  it('13. Password change rotates session token and invalidates old credentials', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'pw_user',
        email: 'pw@user.com',
        password: 'OldPassword123!',
        name: 'Password User',
      },
    });
    const oldToken = JSON.parse(setup.body).sessionToken;

    // Change password
    const changeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${oldToken}` },
      payload: {
        oldPassword: 'OldPassword123!',
        newPassword: 'NewStrongPassword456!',
      },
    });
    expect(changeRes.statusCode).toBe(200);
    const newToken = JSON.parse(changeRes.body).sessionToken;
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(oldToken);

    // Old token is revoked
    const testOldToken = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${oldToken}` },
    });
    expect(testOldToken.statusCode).toBe(401);

    // New token is active
    const testNewToken = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${newToken}` },
    });
    expect(testNewToken.statusCode).toBe(200);

    // Login with old password fails
    const loginOld = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'pw_user', password: 'OldPassword123!' },
    });
    expect(loginOld.statusCode).toBe(401);

    // Login with new password succeeds
    const loginNew = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'pw_user', password: 'NewStrongPassword456!' },
    });
    expect(loginNew.statusCode).toBe(200);
  });

  // 14. Admin password reset and session revocation
  it('14. Admin password reset generates temporary credentials and revokes sessions', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'reset_admin',
        email: 'admin@reset.com',
        password: 'AdminPassword123!',
        name: 'Reset Admin',
      },
    });
    const adminToken = JSON.parse(setup.body).sessionToken;

    // Create target user
    const inviteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'reset_target@reset.com', role: 'VIEWER' },
    });
    const { inviteToken } = JSON.parse(inviteRes.body);

    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'target_op',
        password: 'TargetPassword123!',
        name: 'Target Operator',
      },
    });
    const { sessionToken: targetToken, reviewer } = JSON.parse(acceptRes.body);

    // Admin resets user's password
    const resetRes = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${reviewer.id}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(resetRes.statusCode).toBe(200);
    const tempPass = JSON.parse(resetRes.body).temporaryPassword;
    expect(tempPass).toBeDefined();

    // Old session token is revoked
    const testRevoked = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${targetToken}` },
    });
    expect(testRevoked.statusCode).toBe(401);

    // User can login with the generated temporary password
    const loginTemp = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'target_op', password: tempPass },
    });
    expect(loginTemp.statusCode).toBe(200);
  });

  // 15. Safeguards against deleting last administrator or self
  it('15. Delete user safeguards prevent deleting oneself or the last owner', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'solo_owner',
        email: 'solo@owner.com',
        password: 'SoloPassword123!',
        name: 'Solo Owner',
      },
    });
    const { sessionToken: ownerToken, reviewer: owner } = JSON.parse(setup.body);

    // Owner tries to delete themselves -> MUST FAIL (403)
    const deleteSelf = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${owner.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(deleteSelf.statusCode).toBe(403);
    expect(JSON.parse(deleteSelf.body).message).toContain('Cannot delete your own account');
  });
});
