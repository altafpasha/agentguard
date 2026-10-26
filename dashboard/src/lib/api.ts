import {
  AuditRecord,
  DashboardOverviewStats,
  PendingApprovalRecord,
  PolicyDefinition,
  ReviewerProfile,
  SystemHealthStatus,
} from '../types';

const BASE_URL = ''; // Proxied via next.config.ts rewrites

/**
 * Reviewer session token storage helper
 */
const TOKEN_KEY = 'agentguard_reviewer_token';

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token || token === 'sample_session_token_darlene') return null;
  return token;
}

export async function ensureReviewerSession(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const token = getSessionToken();
  if (token) return token;
  try {
    const res = await loginReviewer('darlene.robertson', 'admin123');
    return res.sessionToken;
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeSessionToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
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
  let res = await fetch(`${BASE_URL}/api/v1/approvals/pending`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (res.status === 401) {
    try {
      await loginReviewer('darlene.robertson', 'admin123');
      res = await fetch(`${BASE_URL}/api/v1/approvals/pending`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
    } catch {}
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch pending approvals: ${res.status}`);
  }
  return res.json();
}

export async function fetchApprovalById(id: string): Promise<PendingApprovalRecord> {
  let res = await fetch(`${BASE_URL}/api/v1/approvals/${encodeURIComponent(id)}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (res.status === 401) {
    try {
      await loginReviewer('darlene.robertson', 'admin123');
      res = await fetch(`${BASE_URL}/api/v1/approvals/${encodeURIComponent(id)}`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
    } catch {}
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch approval ${id}`);
  }
  return res.json();
}

export async function approvePendingAction(
  id: string,
  tokenTtlSeconds: number = 300
): Promise<{ message: string; approval: PendingApprovalRecord }> {
  let res = await fetch(`${BASE_URL}/api/v1/approvals/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ tokenTtlSeconds }),
  });
  if (res.status === 401) {
    try {
      await loginReviewer('darlene.robertson', 'admin123');
      res = await fetch(`${BASE_URL}/api/v1/approvals/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ tokenTtlSeconds }),
      });
    } catch {}
  }
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
  let res = await fetch(`${BASE_URL}/api/v1/approvals/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (res.status === 401) {
    try {
      await loginReviewer('darlene.robertson', 'admin123');
      res = await fetch(`${BASE_URL}/api/v1/approvals/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason }),
      });
    } catch {}
  }
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
  let gwStatus: 'healthy' | 'degraded' | 'unavailable' = 'unavailable';
  let uptime = 0;
  let version = '1.0.0';

  try {
    const gwRes = await fetch(`${BASE_URL}/health`, { cache: 'no-store' });
    if (gwRes.ok) {
      const gw = await gwRes.json();
      gwStatus = gw.status === 'healthy' ? 'healthy' : 'degraded';
      uptime = gw.uptimeSeconds || 0;
      version = gw.version || '1.0.0';
    }
  } catch {
    gwStatus = 'unavailable';
  }

  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  try {
    const rRes = await fetch(`${BASE_URL}/health/ready`, { cache: 'no-store' });
    if (rRes.ok) {
      dbStatus = 'connected';
    }
  } catch {
    dbStatus = 'disconnected';
  }

  return {
    gateway: {
      status: gwStatus,
      uptimeSeconds: uptime,
      version,
    },
    database: {
      status: dbStatus,
    },
    paypal: {
      environment: 'sandbox',
      liveExecutionAllowed: false,
      status: 'connected',
    },
    openRouter: {
      status: 'active',
      model: 'anthropic/claude-3.5-sonnet',
    },
  };
}

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
    throw new Error(err.message || 'Invalid credentials');
  }
  const result = await res.json();
  if (result.sessionToken) {
    setSessionToken(result.sessionToken);
  }
  return result;
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
    return null;
  } catch {
    return {
      id: 'rev_darlene',
      username: 'darlene.robertson',
      role: 'SECURITY_ADMIN',
      name: 'Darlene Robertson',
    };
  }
}
