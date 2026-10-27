export type EvaluationDecision = 'ALLOW' | 'HOLD' | 'BLOCK';

export interface AgentGuardConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  workspaceId?: string;
}

export interface EvaluateRequest {
  action: string;
  amount?: number | string;
  currency?: string;
  recipient?:
    | string
    | {
        email?: string;
        name?: string;
        merchantId?: string;
      };
  description?: string;
  agentId?: string;
  tool?: string;
  operation?: string;
  promptContext?: string;
  humanApprovalToken?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface EvaluationResult {
  status: EvaluationDecision;
  decision: EvaluationDecision;
  isAllowed: boolean;
  isHeld: boolean;
  isBlocked: boolean;
  reason: string;
  violations: string[];
  requestId: string;
  policyId?: string;
  policyVersion?: number;
  pendingApprovalId?: string;
  authorizationToken?: string;
  amountFormatted?: string;
  amountCents?: string;
  currency?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRecord {
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
  merchant: string | { email?: string; name?: string };
  description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  riskReasons: string[];
  serverAuthorizationToken?: string | null;
  tokenExpiresAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
}

export interface WaitForApprovalOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface PromptScanFinding {
  ruleId: string;
  name: string;
  category: string;
  severity: string;
  description: string;
  matchedSnippet?: string;
}

export interface PromptScanResult {
  isThreatDetected: boolean;
  riskScore: number;
  threatLevel: string;
  findings: PromptScanFinding[];
  sanitizedInput: string;
  requestId?: string;
  agentId?: string;
  scanDurationMs?: number;
}

