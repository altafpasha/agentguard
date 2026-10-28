import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryReviewerAuthService } from '../../src/auth/service';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { buildApp } from '../../src/app';
import { EnvConfig } from '../../src/config';

describe('Self-Hosting Authentication & Authorization Security', () => {
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

  it('Phase 4: Detects installation has no owner on fresh start', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/setup-status',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isSetupRequired).toBe(true);
  });

  it('Phase 4: Allows first-run owner creation and returns active session', async () => {
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'sysadmin',
        email: 'admin@company.com',
        password: 'SuperSecureOwnerPassword2026!',
        name: 'Chief Security Officer',
      },
    });

    expect(setupRes.statusCode).toBe(201);
    const setupBody = JSON.parse(setupRes.body);
    expect(setupBody.sessionToken).toBeDefined();
    expect(setupBody.reviewer.role).toBe('OWNER');
    expect(setupBody.reviewer.username).toBe('sysadmin');

    // Status now reports setup is complete
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/setup-status',
    });
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.isSetupRequired).toBe(false);
  });

  it('Phase 4: Permanently closes initial setup route after owner creation', async () => {
    // 1. Create first owner
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'primaryowner',
        email: 'primary@org.internal',
        password: 'ValidOwnerPass123!',
        name: 'Primary Owner',
      },
    });

    // 2. Subsequent setup attempt MUST be rejected with 403 Forbidden
    const secondSetup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'hacker_owner',
        email: 'hacker@adversary.com',
        password: 'AdversaryPassword123!',
        name: 'Malicious Attacker',
      },
    });

    expect(secondSetup.statusCode).toBe(403);
    const errBody = JSON.parse(secondSetup.body);
    expect(errBody.error).toBe('FORBIDDEN');
    expect(errBody.message).toContain('already exists');
  });

  it('Phase 3: Login works with username or email and validates active session', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'owner_user',
        email: 'owner@domain.com',
        password: 'Password999!',
        name: 'Owner User',
      },
    });

    // Login via username
    const loginByUsername = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'owner_user',
        password: 'Password999!',
      },
    });
    expect(loginByUsername.statusCode).toBe(200);
    const token = JSON.parse(loginByUsername.body).sessionToken;

    // Login via email
    const loginByEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'owner@domain.com',
        password: 'Password999!',
      },
    });
    expect(loginByEmail.statusCode).toBe(200);

    // Validate /me endpoint
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(meRes.statusCode).toBe(200);
    expect(JSON.parse(meRes.body).reviewer.username).toBe('owner_user');
  });

  it('Phase 5: Owner can invite Analyst and Admin, but Admin cannot invite Admin', async () => {
    // 1. Setup owner
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'bigboss',
        email: 'boss@security.com',
        password: 'BossPassword123!',
        name: 'Big Boss',
      },
    });
    const ownerToken = JSON.parse(setup.body).sessionToken;

    // 2. Owner invites an Admin
    const inviteAdminRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: 'admin.deputy@security.com',
        role: 'ADMIN',
      },
    });
    expect(inviteAdminRes.statusCode).toBe(201);
    const adminInvite = JSON.parse(inviteAdminRes.body);

    // 3. Admin accepts invite
    const acceptAdminRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken: adminInvite.inviteToken,
        username: 'admin_deputy',
        password: 'DeputyPassword123!',
        name: 'Deputy Admin',
      },
    });
    expect(acceptAdminRes.statusCode).toBe(200);
    const adminToken = JSON.parse(acceptAdminRes.body).sessionToken;

    // 4. Admin tries to invite another Admin -> MUST BE FORBIDDEN (403)
    const adminEscalation = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: 'another.admin@security.com',
        role: 'ADMIN',
      },
    });
    expect(adminEscalation.statusCode).toBe(403);

    // 5. Admin can invite Analyst
    const analystInvite = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: 'analyst1@security.com',
        role: 'ANALYST',
      },
    });
    expect(analystInvite.statusCode).toBe(201);
  });

  it('Phase 5: Single-use invitation token cannot be reused', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'owner_invite_test',
        email: 'owner@invitetest.com',
        password: 'OwnerPassword123!',
        name: 'Owner',
      },
    });
    const ownerToken = JSON.parse(setup.body).sessionToken;

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: 'analyst.singleuse@company.com',
        role: 'ANALYST',
      },
    });
    const { inviteToken } = JSON.parse(inviteRes.body);

    // First acceptance succeeds
    const firstAccept = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'analyst_legit',
        password: 'ValidPass123!',
        name: 'Legit Analyst',
      },
    });
    expect(firstAccept.statusCode).toBe(200);

    // Replay attempt fails (400 validation error)
    const replayAccept = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'analyst_attacker',
        password: 'ValidPass123!',
        name: 'Attacker Replay',
      },
    });
    expect(replayAccept.statusCode).toBe(400);
  });

  it('Phase 5: Cannot deactivate the last remaining owner account', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'sole_owner',
        email: 'sole@domain.com',
        password: 'SoleOwnerPass123!',
        name: 'Sole Owner',
      },
    });
    const ownerData = JSON.parse(setup.body);

    const deactRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${ownerData.reviewer.id}/status`,
      headers: { authorization: `Bearer ${ownerData.sessionToken}` },
      payload: {
        status: 'INACTIVE',
      },
    });

    expect(deactRes.statusCode).toBe(403);
    expect(JSON.parse(deactRes.body).message).toContain('last remaining owner');
  });

  it('Phase 3 & 8: Analyst cannot modify security policies or manage users', async () => {
    // 1. Setup owner
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'owner_policies',
        email: 'owner@pol.com',
        password: 'ValidPass123!',
        name: 'Owner Pol',
      },
    });
    const ownerToken = JSON.parse(setup.body).sessionToken;

    // 2. Invite & create analyst
    const invite = await app.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'analyst.read@pol.com', role: 'ANALYST' },
    });
    const { inviteToken } = JSON.parse(invite.body);

    const analystLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/users/accept-invite',
      payload: {
        inviteToken,
        username: 'analyst_read',
        password: 'AnalystPass123!',
        name: 'Analyst Read',
      },
    });
    const analystToken = JSON.parse(analystLogin.body).sessionToken;

    // 3. Analyst tries to view users -> 403 Forbidden
    const usersRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${analystToken}` },
    });
    expect(usersRes.statusCode).toBe(403);

    // 4. Analyst tries to update policy -> 403 Forbidden
    const policyUpdateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/policies/update',
      headers: { authorization: `Bearer ${analystToken}` },
      payload: { maxAmount: 9999 },
    });
    expect(policyUpdateRes.statusCode).toBe(403);
  });

  it('Phase 2 & 6: Overview returns genuine empty state when 0 events exist and protects from unauthenticated access', async () => {
    // 1. Unauthenticated request must return 401
    const unauth = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/overview',
    });
    expect(unauth.statusCode).toBe(401);

    // 2. Setup owner to get authenticated session
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'dashboard_owner',
        email: 'dashboard@security.com',
        password: 'ValidPassword123!',
        name: 'Dashboard Owner',
      },
    });
    const token = JSON.parse(setup.body).sessionToken;

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/overview',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const stats = JSON.parse(res.body);

    // Pure zero empty state: No fake 975,124!
    expect(stats.totalMonitored).toBe(0);
    expect(stats.allowedCount).toBe(0);
    expect(stats.blockedThreats).toBe(0);
    expect(stats.pendingApprovals).toBe(0);
    expect(stats.totalSandboxSpendFormatted).toBe('$0.00');
    expect(stats.totalAttemptedSpendFormatted).toBe('$0.00');
    expect(stats.averageRiskScore).toBe(0);
    expect(stats.threatDistribution).toEqual([]);
    expect(stats.monthlyActivity).toEqual([]);
    expect(stats.recentEvents).toEqual([]);
  });

  it('Phase 7: Integrations status requires auth and returns connectivity reports with masked secrets', async () => {
    // 1. Unauthenticated request must be rejected with 401
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/status',
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Setup owner to get authenticated session
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-owner',
      payload: {
        username: 'integ_owner',
        email: 'integ@domain.com',
        password: 'ValidPassword123!',
        name: 'Integ Owner',
      },
    });
    const sessionToken = JSON.parse(setup.body).sessionToken;

    // 3. Authenticated request returns 200 with masked secrets
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/status',
      headers: { authorization: `Bearer ${sessionToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.integrations).toHaveLength(4);

    const gateway = body.integrations.find((i: any) => i.id === 'gateway');
    expect(gateway.status).toBe('connected');

    const postgres = body.integrations.find((i: any) => i.id === 'postgres');
    expect(postgres).toBeDefined();

    // Verify secrets are masked
    const paypal = body.integrations.find((i: any) => i.id === 'paypal');
    expect(paypal.details.clientId).not.toBe('test-client'); // Masked!
  });
});
