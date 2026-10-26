export type Decision = 'ALLOW' | 'HOLD' | 'BLOCK' | 'DENY' | 'REQUIRE_HUMAN_APPROVAL';

export type EventType =
  | 'REQUEST_RECEIVED'
  | 'INJECTION_SCAN_PASSED'
  | 'INJECTION_BLOCKED'
  | 'POLICY_EVALUATED'
  | 'POLICY_APPROVED'
  | 'POLICY_BLOCKED'
  | 'APPROVAL_REQUIRED'
  | 'AI_RISK_ANALYZED'
  | 'ORDER_CREATED'
  | 'PAYMENT_ATTEMPTED'
  | 'PAYMENT_EXECUTION_GUARDED'
  | 'PAYMENT_COMPLETED'
  | 'PAYMENT_FAILED';

export interface AuditRecord {
  id?: string;
  requestId: string;
  agentId: string;
  action?: string;
  merchant?: string | null;
  amountCents?: string | null;
  amountFormatted?: string | null;
  currency?: string | null;
  policyVersion?: number | string | null;
  riskResult?: Record<string, unknown> | null;
  decision?: string | null;
  decisionReasons?: string[] | null;
  approvalState?: string | null;
  paypalReference?: string | null;
  eventType: EventType;
  status: 'SUCCESS' | 'BLOCKED' | 'FAILED' | 'PENDING_APPROVAL' | 'GUARDED';
  riskScore?: number | null;
  policyDecision?: string | null;
  payloadSummary?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt?: string;
}

export interface PendingApprovalRecord {
  id: string;
  requestId: string;
  agentId: string;
  policyId: string;
  policyVersion: number;
  tool: string;
  operation: string;
  amountCents: string;
  amountFormatted: string;
  currency: string;
  merchant: string;
  description: string;
  riskScore?: number;
  riskCategory?: string;
  riskReasons: string[];
  suspiciousSpans: string[];
  transactionDigest: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  serverAuthorizationToken?: string;
  tokenExpiresAt?: string;
  isConsumed: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface PolicyDefinition {
  id?: string;
  policyId: string;
  version: number;
  maxAmountCents: string;
  maxDailyAmountCents: string;
  approvalThresholdCents: string;
  allowedCurrencies: string[];
  allowedMerchants?: string[] | null;
  blockedMerchants: string[];
  allowedTools: string[];
  allowedOperations: string[];
  velocityLimit: number;
  velocityWindowSeconds: number;
  isActive: boolean;
  createdAt?: string;
}

export interface DashboardOverviewStats {
  totalMonitored: number;
  allowedCount: number;
  blockedThreats: number;
  pendingApprovals: number;
  totalSandboxSpendFormatted: string;
  totalAttemptedSpendFormatted: string;
  averageRiskScore: number;
  threatDistribution: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  monthlyActivity: Array<{
    month: string;
    allowed: number;
    held: number;
    blocked: number;
    active?: boolean;
    value?: string;
    change?: string;
  }>;
  recentEvents: AuditRecord[];
}

export interface SystemHealthStatus {
  gateway: {
    status: 'healthy' | 'degraded' | 'unavailable';
    uptimeSeconds: number;
    version: string;
  };
  database: {
    status: 'connected' | 'disconnected';
  };
  paypal: {
    environment: 'sandbox' | 'live';
    liveExecutionAllowed: boolean;
    status: 'connected' | 'ready';
  };
  openRouter: {
    status: 'active' | 'standby';
    model: string;
  };
}

export interface ReviewerProfile {
  id: string;
  username: string;
  role: string;
  name: string;
}
