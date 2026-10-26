export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface PendingApprovalRecord {
  id: string;
  requestId: string;
  agentId: string;
  policyId: string;
  policyVersion: number;
  tool: string;
  operation: string;
  amountCents: bigint;
  amountFormatted: string;
  currency: string;
  merchant: string;
  description: string;
  riskScore?: number;
  riskCategory?: string;
  riskReasons: string[];
  suspiciousSpans: string[];
  transactionDigest: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  serverAuthorizationToken?: string;
  tokenExpiresAt?: string;
  isConsumed: boolean;
  consumedAt?: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreatePendingApprovalOptions {
  requestId: string;
  agentId: string;
  policyId: string;
  policyVersion: number;
  tool: string;
  operation: string;
  amountCents: bigint;
  amountFormatted: string;
  currency: string;
  merchant: string;
  description: string;
  riskScore?: number;
  riskCategory?: string;
  riskReasons?: string[];
  suspiciousSpans?: string[];
  expiresInSeconds?: number;
}

export interface ApproveActionOptions {
  id: string;
  reviewerUsername: string;
  tokenTtlSeconds?: number; // default 300s (5 min)
}

export interface RejectActionOptions {
  id: string;
  reviewerUsername: string;
  reason: string;
}

export interface ConsumeAuthorizationOptions {
  serverAuthorizationToken: string;
  requestId: string;
  agentId: string;
  tool: string;
  operation: string;
  amountCents: bigint;
  currency: string;
  merchant: string;
}

export interface IApprovalStore {
  savePendingApproval(approval: PendingApprovalRecord): Promise<void>;
  getPendingApprovalById(id: string): Promise<PendingApprovalRecord | null>;
  getPendingApprovalByRequestId(requestId: string): Promise<PendingApprovalRecord | null>;
  getPendingApprovalByToken(token: string): Promise<PendingApprovalRecord | null>;
  listPendingApprovals(): Promise<PendingApprovalRecord[]>;
  approveActionAtomic(
    id: string,
    reviewerUsername: string,
    serverAuthorizationToken: string,
    tokenExpiresAt: string,
    revalidateConstraints: (record: PendingApprovalRecord) => Promise<{ allowed: boolean; violation?: string }>
  ): Promise<PendingApprovalRecord>;
  rejectActionAtomic(id: string, reviewerUsername: string, reason: string): Promise<PendingApprovalRecord>;
  consumeAuthorizationAtomic(options: ConsumeAuthorizationOptions): Promise<PendingApprovalRecord>;
}
