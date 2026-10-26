import { randomUUID } from 'crypto';
import {
  ConsumeAuthorizationOptions,
  CreatePendingApprovalOptions,
  IApprovalStore,
  PendingApprovalRecord,
} from './types';
import { createTransactionDigest } from '../auth/crypto';
import { PolicyEngine } from '../policy/engine';
import { IAuditRepository } from '../audit/types';

export interface HumanApprovalServiceOptions {
  store: IApprovalStore;
  policyEngine: PolicyEngine;
  auditRepo: IAuditRepository;
  defaultApprovalWindowSeconds?: number;
  defaultTokenTtlSeconds?: number;
}

export class HumanApprovalService {
  private store: IApprovalStore;
  private policyEngine: PolicyEngine;
  private auditRepo: IAuditRepository;
  private defaultApprovalWindowSeconds: number;
  private defaultTokenTtlSeconds: number;

  constructor(options: HumanApprovalServiceOptions) {
    this.store = options.store;
    this.policyEngine = options.policyEngine;
    this.auditRepo = options.auditRepo;
    this.defaultApprovalWindowSeconds = options.defaultApprovalWindowSeconds ?? 900; // 15 mins
    this.defaultTokenTtlSeconds = options.defaultTokenTtlSeconds ?? 300; // 5 mins
  }

  public getStore(): IApprovalStore {
    return this.store;
  }

  /**
   * Persist a HOLD decision as a pending approval record.
   * Computes an immutable transaction digest and records audit event.
   */
  public async createPendingApproval(
    options: CreatePendingApprovalOptions
  ): Promise<PendingApprovalRecord> {
    const id = randomUUID();
    const expiresIn = options.expiresInSeconds ?? this.defaultApprovalWindowSeconds;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresIn * 1000).toISOString();

    const transactionDigest = createTransactionDigest({
      requestId: options.requestId,
      agentId: options.agentId,
      tool: options.tool,
      operation: options.operation,
      amountCents: options.amountCents,
      currency: options.currency,
      merchant: options.merchant,
      policyVersion: options.policyVersion,
    });

    const record: PendingApprovalRecord = {
      id,
      requestId: options.requestId,
      agentId: options.agentId,
      policyId: options.policyId,
      policyVersion: options.policyVersion,
      tool: options.tool,
      operation: options.operation,
      amountCents: options.amountCents,
      amountFormatted: options.amountFormatted,
      currency: options.currency,
      merchant: options.merchant,
      description: options.description,
      riskScore: options.riskScore,
      riskCategory: options.riskCategory,
      riskReasons: options.riskReasons ?? [],
      suspiciousSpans: options.suspiciousSpans ?? [],
      transactionDigest,
      status: 'PENDING',
      isConsumed: false,
      expiresAt,
      createdAt: now.toISOString(),
    };

    await this.store.savePendingApproval(record);

    // Audit record for pending approval
    await this.auditRepo.recordEvent({
      requestId: record.requestId,
      agentId: record.agentId,
      action: record.operation,
      merchant: record.merchant,
      amountCents: record.amountCents,
      amountFormatted: record.amountFormatted,
      currency: record.currency,
      policyVersion: record.policyVersion,
      riskResult: {
        riskScore: record.riskScore,
        riskCategory: record.riskCategory,
        suspiciousSpans: record.suspiciousSpans,
      },
      decision: 'HOLD',
      decisionReasons: record.riskReasons,
      approvalState: 'PENDING',
      eventType: 'APPROVAL_REQUIRED',
      status: 'PENDING_APPROVAL',
      payloadSummary: {
        approvalId: record.id,
        tool: record.tool,
        transactionDigest: record.transactionDigest,
        expiresAt: record.expiresAt,
      },
    });

    return record;
  }

  /**
   * List unexpired pending approvals for reviewer dashboard
   */
  public async listPendingApprovals(): Promise<PendingApprovalRecord[]> {
    return this.store.listPendingApprovals();
  }

  /**
   * Retrieve single pending approval details
   */
  public async getPendingApprovalById(id: string): Promise<PendingApprovalRecord | null> {
    return this.store.getPendingApprovalById(id);
  }

  /**
   * Retrieve pending approval by client requestId
   */
  public async getPendingApprovalByRequestId(requestId: string): Promise<PendingApprovalRecord | null> {
    return this.store.getPendingApprovalByRequestId(requestId);
  }

  /**
   * Authenticated reviewer approves a pending action.
   * Atomically revalidates hard constraints, binds to transaction digest,
   * and issues a short-lived single-use server authorization token.
   */
  public async approveAction(
    id: string,
    reviewerUsername: string,
    tokenTtlSeconds?: number
  ): Promise<PendingApprovalRecord> {
    const ttl = tokenTtlSeconds ?? this.defaultTokenTtlSeconds;
    const token = `auth_${randomUUID().replace(/-/g, '')}`;
    const tokenExpiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    const approvedRecord = await this.store.approveActionAtomic(
      id,
      reviewerUsername,
      token,
      tokenExpiresAt,
      async (record) => {
        // Revalidate against current hard constraints
        const store = this.policyEngine.getPolicyStore();
        const activePolicy =
          (await store.getActivePolicy(record.policyId)) ??
          (await store.getActivePolicy('default')) ??
          this.policyEngine.getDefaultPolicy();

        if (!activePolicy || !activePolicy.isActive) {
          return { allowed: false, violation: `Policy '${record.policyId}' is inactive or not found.` };
        }

        // Check merchant denylist
        const lowerMerchant = record.merchant.toLowerCase();
        const isBlocked = activePolicy.blockedMerchants.some(
          (m) => lowerMerchant.includes(m.toLowerCase()) || lowerMerchant === m.toLowerCase()
        );
        if (isBlocked) {
          return { allowed: false, violation: `Merchant '${record.merchant}' is currently on denylist.` };
        }

        // Check currency
        if (!activePolicy.allowedCurrencies.includes(record.currency.toUpperCase())) {
          return { allowed: false, violation: `Currency '${record.currency}' is not permitted.` };
        }

        // Check single transaction limit
        if (record.amountCents > activePolicy.maxAmountCents) {
          return {
            allowed: false,
            violation: `Amount ${record.amountFormatted} exceeds max allowable limit of ${activePolicy.maxAmountCents} cents.`,
          };
        }

        return { allowed: true };
      }
    );

    // Audit approved event
    await this.auditRepo.recordEvent({
      requestId: approvedRecord.requestId,
      agentId: approvedRecord.agentId,
      action: approvedRecord.operation,
      merchant: approvedRecord.merchant,
      amountCents: approvedRecord.amountCents,
      amountFormatted: approvedRecord.amountFormatted,
      currency: approvedRecord.currency,
      policyVersion: approvedRecord.policyVersion,
      decision: 'APPROVED',
      decisionReasons: ['Explicit human approval granted by authenticated reviewer.'],
      approvalState: 'APPROVED',
      eventType: 'POLICY_APPROVED',
      status: 'SUCCESS',
      payloadSummary: {
        approvalId: approvedRecord.id,
        reviewedBy: reviewerUsername,
        serverAuthorizationToken: approvedRecord.serverAuthorizationToken
          ? `${approvedRecord.serverAuthorizationToken.slice(0, 8)}...[REDACTED]`
          : undefined,
        tokenExpiresAt: approvedRecord.tokenExpiresAt,
        transactionDigest: approvedRecord.transactionDigest,
      },
    });

    return approvedRecord;
  }

  /**
   * Authenticated reviewer rejects a pending action.
   */
  public async rejectAction(
    id: string,
    reviewerUsername: string,
    reason: string
  ): Promise<PendingApprovalRecord> {
    const rejectedRecord = await this.store.rejectActionAtomic(id, reviewerUsername, reason);

    // Audit rejected event
    await this.auditRepo.recordEvent({
      requestId: rejectedRecord.requestId,
      agentId: rejectedRecord.agentId,
      action: rejectedRecord.operation,
      merchant: rejectedRecord.merchant,
      amountCents: rejectedRecord.amountCents,
      amountFormatted: rejectedRecord.amountFormatted,
      currency: rejectedRecord.currency,
      policyVersion: rejectedRecord.policyVersion,
      decision: 'REJECTED',
      decisionReasons: [reason],
      approvalState: 'REJECTED',
      eventType: 'POLICY_BLOCKED',
      status: 'BLOCKED',
      payloadSummary: {
        approvalId: rejectedRecord.id,
        reviewedBy: reviewerUsername,
        rejectionReason: reason,
      },
      errorMessage: `Human approval rejected: ${reason}`,
    });

    return rejectedRecord;
  }

  /**
   * Atomically consume a server-issued authorization token on payment execution.
   * Ensures single-use semantics and verifies exact immutable digest.
   */
  public async consumeAuthorization(
    options: ConsumeAuthorizationOptions
  ): Promise<PendingApprovalRecord> {
    const consumed = await this.store.consumeAuthorizationAtomic(options);

    await this.auditRepo.recordEvent({
      requestId: consumed.requestId,
      agentId: consumed.agentId,
      action: options.operation,
      merchant: options.merchant,
      amountCents: options.amountCents,
      currency: options.currency,
      policyVersion: consumed.policyVersion,
      decision: 'ALLOW',
      decisionReasons: ['Single-use server authorization token atomically consumed.'],
      approvalState: 'APPROVED',
      eventType: 'PAYMENT_ATTEMPTED',
      status: 'SUCCESS',
      payloadSummary: {
        approvalId: consumed.id,
        isConsumed: true,
        consumedAt: consumed.consumedAt,
        transactionDigest: consumed.transactionDigest,
      },
    });

    return consumed;
  }
}
