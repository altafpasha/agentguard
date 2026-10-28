import {
  AuditRecord,
  DashboardOverviewStats,
  PendingApprovalRecord,
  PolicyDefinition,
  ReviewerProfile,
  SystemHealthStatus,
  IntegrationStatusItem,
  UserInviteResult,
  AuthSettings,
  InvitationRecord,
  ApiKeyRecord,
  CreateApiKeyPayload,
  CreateApiKeyResult,
} from '../types';

const BASE_URL = ''; // Proxied via next.config.ts rewrites to backend gateway

/**
 * Reviewer session token storage helper
 */
const TOKEN_KEY = 'agentguard_reviewer_token';

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token || token.trim().length === 0) return null;
  return token;
}

export function setSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `agentguard_session=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
}

export function removeSessionToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = 'agentguard_session=; path=/; max-age=0; SameSite=Lax';
}

export async function ensureReviewerSession(): Promise<string | null> {
  return getSessionToken();
}

function getAuthHeaders(): HeadersInit {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': `web-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Reviewer-Token'] = token;
  }
  return headers;
}

/**
 * Setup Status & Owner Creation
 */
export async function fetchSetupStatus(): Promise<{ isSetupRequired: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/setup-status`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to check setup status: ${res.status}`);
  }
  return res.json();
}

export async function setupOwner(payload: {
  username: string;
  email: string;
  password: string;
  name: string;
}): Promise<{
  sessionToken: string;
  reviewer: ReviewerProfile;
  expiresAt: string;
}> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/setup-owner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Owner setup failed (${res.status})`);
  }
  const result = await res.json();
  if (result.sessionToken) {
    setSessionToken(result.sessionToken);
  }
  return result;
}

/**
 * Login & Session Management
 */
export async function loginReviewer(username: string, password: string): Promise<{
  sessionToken: string;
  reviewer: ReviewerProfile;
  expiresAt: string;
}> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Invalid username or password');
  }
  const result = await res.json();
  if (result.sessionToken) {
    setSessionToken(result.sessionToken);
  }
  return result;
}

export async function logoutReviewer(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } finally {
    removeSessionToken();
  }
}

export async function fetchCurrentReviewer(): Promise<ReviewerProfile | null> {
  const token = getSessionToken();
  if (!token) return null;

  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return data.reviewer;
    }
    if (res.status === 401 || res.status === 403) {
      removeSessionToken();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * User Management (Admin & Owner)
 */
export async function fetchUsers(): Promise<{ count: number; users: ReviewerProfile[] }> {
  const res = await fetch(`${BASE_URL}/api/v1/users`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to fetch users: ${res.status}`);
  }
  return res.json();
}

export async function inviteUser(payload: {
  email: string;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER' | 'ANALYST';
  ttlHours?: number;
}): Promise<UserInviteResult> {
  const res = await fetch(`${BASE_URL}/api/v1/users/invite`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to generate invitation: ${res.status}`);
  }
  return res.json();
}

export async function acceptUserInvite(payload: {
  inviteToken: string;
  username: string;
  password: string;
  name: string;
}): Promise<{
  sessionToken: string;
  reviewer: ReviewerProfile;
  expiresAt: string;
}> {
  const res = await fetch(`${BASE_URL}/api/v1/users/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to accept invitation (${res.status})`);
  }
  const result = await res.json();
  if (result.sessionToken) {
    setSessionToken(result.sessionToken);
  }
  return result;
}

export async function updateUserStatus(
  userId: string,
  status: 'ACTIVE' | 'INACTIVE'
): Promise<{ message: string; user: ReviewerProfile }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/${encodeURIComponent(userId)}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to update status: ${res.status}`);
  }
  return res.json();
}

export async function updateUserRole(
  userId: string,
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'ANALYST' | string
): Promise<{ message: string; user: ReviewerProfile }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to update role: ${res.status}`);
  }
  return res.json();
}

export async function revokeUserSessions(userId: string): Promise<{ message: string; revokedCount: number }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/${encodeURIComponent(userId)}/revoke-sessions`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to revoke sessions: ${res.status}`);
  }
  return res.json();
}

/**
 * Integrations & Health
 */
export async function fetchIntegrations(): Promise<{ timestamp: string; integrations: IntegrationStatusItem[] }> {
  const res = await fetch(`${BASE_URL}/api/v1/integrations/status`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch integrations: ${res.status}`);
  }
  return res.json();
}

export async function testIntegration(
  id: string,
  customConfig?: Record<string, unknown>
): Promise<{ message: string; integration: IntegrationStatusItem }> {
  const res = await fetch(`${BASE_URL}/api/v1/integrations/test/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(customConfig || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to test integration ${id}`);
  }
  return res.json();
}

export async function configureIntegration(
  id: string,
  settings: Record<string, unknown>
): Promise<{ message: string; integration: IntegrationStatusItem }> {
  const res = await fetch(`${BASE_URL}/api/v1/integrations/configure/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to configure integration ${id}`);
  }
  return res.json();
}

export async function fetchOverviewStats(): Promise<DashboardOverviewStats> {
  const res = await fetch(`${BASE_URL}/api/v1/dashboard/overview`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch overview metrics: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchAuditEvents(options: {
  limit?: number;
  status?: string;
  agentId?: string;
  eventType?: string;
  search?: string;
} = {}): Promise<{ count: number; events: AuditRecord[] }> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.status) params.set('status', options.status);
  if (options.agentId) params.set('agentId', options.agentId);
  if (options.eventType) params.set('eventType', options.eventType);
  if (options.search) params.set('search', options.search);

  const res = await fetch(`${BASE_URL}/api/v1/audit/events?${params.toString()}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch audit events: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchAuditByRequestId(requestId: string): Promise<{ count: number; events: AuditRecord[] }> {
  const res = await fetch(`${BASE_URL}/api/v1/audit/${encodeURIComponent(requestId)}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch audit records for request ${requestId}`);
  }
  return res.json();
}

export async function fetchPendingApprovals(): Promise<{ count: number; pendingApprovals: PendingApprovalRecord[] }> {
  const res = await fetch(`${BASE_URL}/api/v1/approvals/pending`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch pending approvals: ${res.status}`);
  }
  return res.json();
}

export async function fetchApprovalById(id: string): Promise<PendingApprovalRecord> {
  const res = await fetch(`${BASE_URL}/api/v1/approvals/${encodeURIComponent(id)}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch approval ${id}`);
  }
  return res.json();
}

export async function approvePendingAction(
  id: string,
  tokenTtlSeconds: number = 300
): Promise<{ message: string; approval: PendingApprovalRecord }> {
  const res = await fetch(`${BASE_URL}/api/v1/approvals/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ tokenTtlSeconds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Approval failed with status ${res.status}`);
  }
  return res.json();
}

export async function rejectPendingAction(
  id: string,
  reason: string
): Promise<{ message: string; approval: PendingApprovalRecord }> {
  const res = await fetch(`${BASE_URL}/api/v1/approvals/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Rejection failed with status ${res.status}`);
  }
  return res.json();
}

export async function fetchActivePolicy(policyId: string = 'default'): Promise<{ policy: PolicyDefinition }> {
  const res = await fetch(`${BASE_URL}/api/v1/policies/active?policyId=${encodeURIComponent(policyId)}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch active policy: ${res.status}`);
  }
  return res.json();
}

export async function fetchPolicyHistory(policyId: string = 'default'): Promise<{
  policyId: string;
  versionsCount: number;
  history: PolicyDefinition[];
}> {
  const res = await fetch(`${BASE_URL}/api/v1/policies/history/${encodeURIComponent(policyId)}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch policy history: ${res.status}`);
  }
  return res.json();
}

export async function updatePolicy(payload: {
  policyId?: string;
  maxAmount?: number;
  maxDailyAmount?: number;
  approvalThreshold?: number;
  allowedCurrencies?: string[];
  blockedMerchants?: string[];
  allowedTools?: string[];
  allowedOperations?: string[];
  velocityLimit?: number;
  velocityWindowSeconds?: number;
}): Promise<{ message: string; policy: PolicyDefinition }> {
  const res = await fetch(`${BASE_URL}/api/v1/policies/update`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to update policy: ${res.status}`);
  }
  return res.json();
}

export async function scanPromptInput(input: string, agentId: string = 'attack-lab-agent'): Promise<{
  isThreatDetected: boolean;
  threatLevel: string;
  riskScore: number;
  findings: Array<{ rule: string; description: string; severity: string; snippet?: string }>;
}> {
  const res = await fetch(`${BASE_URL}/api/v1/scan`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ input, agentId }),
  });
  return res.json();
}

export async function testAuthorizePayment(payload: {
  agentId: string;
  amount: number;
  currency: string;
  recipient: { email: string; name?: string };
  description: string;
  promptContext?: string;
  dryRun?: boolean;
}): Promise<{
  statusCode: number;
  data: Record<string, unknown>;
}> {
  const res = await fetch(`${BASE_URL}/api/v1/payments/initiate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return {
    statusCode: res.status,
    data,
  };
}

export async function fetchSystemHealth(): Promise<SystemHealthStatus> {
  try {
    const statusData = await fetchIntegrations();
    const gw = statusData.integrations.find((i) => i.id === 'gateway');
    const pg = statusData.integrations.find((i) => i.id === 'postgres');
    const pp = statusData.integrations.find((i) => i.id === 'paypal');
    const or = statusData.integrations.find((i) => i.id === 'openrouter');

    return {
      gateway: {
        status: (gw?.status === 'connected' ? 'healthy' : 'degraded') as any,
        uptimeSeconds: (gw?.details?.uptimeSeconds as number) || 0,
        version: (gw?.details?.version as string) || '1.0.0',
      },
      database: {
        status: pg?.status === 'connected' ? 'connected' : 'disconnected',
      },
      paypal: {
        environment: 'sandbox',
        liveExecutionAllowed: false,
        status: pp?.status === 'connected' ? 'connected' : 'ready',
      },
      openRouter: {
        status: or?.status === 'connected' ? 'active' : 'standby',
        model: (or?.details?.model as string) || 'anthropic/claude-3.5-sonnet',
      },
    };
  } catch {
    return {
      gateway: {
        status: 'unavailable',
        uptimeSeconds: 0,
        version: '1.0.0',
      },
      database: {
        status: 'disconnected',
      },
      paypal: {
        environment: 'sandbox',
        liveExecutionAllowed: false,
        status: 'ready',
      },
      openRouter: {
        status: 'standby',
        model: 'anthropic/claude-3.5-sonnet',
      },
    };
  }
}

/**
 * Invitations Management
 */
export async function fetchInvitations(): Promise<{ count: number; invitations: InvitationRecord[] }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/invitations`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to load invitations');
  }
  return res.json();
}

export async function revokeInvitation(inviteId: string): Promise<{ success?: boolean; message?: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/invitations/${inviteId}/revoke`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to revoke invitation');
  }
  return res.json().catch(() => ({ message: 'Invitation revoked.' }));
}

/**
 * User Deletion
 */
export async function deleteUser(userId: string): Promise<{ success?: boolean; message?: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete user');
  }
  return res.json().catch(() => ({ message: 'User deleted.' }));
}

/**
 * Authentication & Access Settings
 */
export async function fetchAuthSettings(): Promise<{ settings: AuthSettings }> {
  const res = await fetch(`${BASE_URL}/api/v1/settings/auth`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to load authentication settings');
  }
  return res.json();
}

export async function updateAuthSettings(settings: Partial<AuthSettings>): Promise<{ settings: AuthSettings }> {
  const res = await fetch(`${BASE_URL}/api/v1/settings/auth`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update authentication settings');
  }
  return res.json();
}

/**
 * Password Management
 */
export async function changePassword(
  oldOrPayload: string | { currentPassword: string; newPassword: string },
  maybeNewPassword?: string
): Promise<{
  sessionToken: string;
  reviewer: ReviewerProfile;
  expiresAt: string;
  message?: string;
}> {
  const oldPassword = typeof oldOrPayload === 'string' ? oldOrPayload : oldOrPayload.currentPassword;
  const newPassword = typeof oldOrPayload === 'string' ? maybeNewPassword! : oldOrPayload.newPassword;
  const res = await fetch(`${BASE_URL}/api/v1/auth/change-password`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to change password');
  }
  const result = await res.json();
  if (result.sessionToken) {
    setSessionToken(result.sessionToken);
  }
  return result;
}

export async function resetUserPassword(
  userId: string,
  tempPassword?: string
): Promise<{ message: string; temporaryPassword: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/${userId}/reset-password`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(tempPassword ? { tempPassword } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to reset user password');
  }
  return res.json();
}

export async function registerPublicUser(payload: {
  username: string;
  email: string;
  password: string;
  name: string;
}): Promise<{
  sessionToken: string;
  reviewer: ReviewerProfile;
  expiresAt: string;
}> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Registration failed');
  }
  const result = await res.json();
  if (result.sessionToken) {
    setSessionToken(result.sessionToken);
  }
  return result;
}

/**
 * API Key Management for SDK & External Integrations
 */
export async function fetchApiKeys(): Promise<{ apiKeys: ApiKeyRecord[] }> {
  const res = await fetch(`${BASE_URL}/api/v1/api-keys`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch API keys');
  }
  return res.json();
}

export async function createApiKey(payload: CreateApiKeyPayload): Promise<CreateApiKeyResult> {
  const res = await fetch(`${BASE_URL}/api/v1/api-keys`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to generate API key');
  }
  return res.json();
}

export async function revokeApiKey(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/api-keys/${id}/revoke`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to revoke API key');
  }
  return res.json();
}

export async function rotateApiKey(
  id: string
): Promise<{ success: boolean; oldKeyId: string; apiKey: ApiKeyRecord; secretKey: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/api-keys/${id}/rotate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to rotate API key');
  }
  return res.json();
}


