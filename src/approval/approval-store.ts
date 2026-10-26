import { Pool } from 'pg';
import {
  ApprovalStatus,
  ConsumeAuthorizationOptions,
  IApprovalStore,
  PendingApprovalRecord,
} from './types';
import { createTransactionDigest } from '../auth/crypto';
import {
  ConflictError,
  PolicyViolationError,
  NotFoundError,
} from '../common/errors';

export class MemoryApprovalStore implements IApprovalStore {
  private records = new Map<string, PendingApprovalRecord>();
  private requestIndex = new Map<string, string>(); // requestId -> id
  private tokenIndex = new Map<string, string>(); // token -> id
  private locks = new Map<string, Promise<void>>();

  private async acquireLock(id: string): Promise<() => void> {
    while (this.locks.has(id)) {
      await this.locks.get(id);
    }
    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.locks.set(id, lockPromise);
    return () => {
      this.locks.delete(id);
      releaseLock();
    };
  }

  public async savePendingApproval(approval: PendingApprovalRecord): Promise<void> {
    this.records.set(approval.id, { ...approval });
    this.requestIndex.set(approval.requestId, approval.id);
    if (approval.serverAuthorizationToken) {
      this.tokenIndex.set(approval.serverAuthorizationToken, approval.id);
    }
  }

  public async getPendingApprovalById(id: string): Promise<PendingApprovalRecord | null> {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }

  public async getPendingApprovalByRequestId(requestId: string): Promise<PendingApprovalRecord | null> {
    const id = this.requestIndex.get(requestId);
    if (!id) return null;
    return this.getPendingApprovalById(id);
  }

  public async getPendingApprovalByToken(token: string): Promise<PendingApprovalRecord | null> {
    const id = this.tokenIndex.get(token);
    if (!id) return null;
    return this.getPendingApprovalById(id);
  }

  public async listPendingApprovals(): Promise<PendingApprovalRecord[]> {
    const now = Date.now();
    const result: PendingApprovalRecord[] = [];

    for (const r of this.records.values()) {
      if (r.status === 'PENDING') {
        const expiresAtMs = new Date(r.expiresAt).getTime();
        if (now > expiresAtMs) {
          r.status = 'EXPIRED';
        } else {
          result.push({ ...r });
        }
      }
    }
    return result;
  }

  public async approveActionAtomic(
    id: string,
    reviewerUsername: string,
    serverAuthorizationToken: string,
    tokenExpiresAt: string,
    revalidateConstraints: (record: PendingApprovalRecord) => Promise<{ allowed: boolean; violation?: string }>
  ): Promise<PendingApprovalRecord> {
    const release = await this.acquireLock(id);
    try {
      const record = this.records.get(id);
      if (!record) {
        throw new NotFoundError(`Pending approval with id '${id}' not found.`);
      }

      if (record.status !== 'PENDING') {
        throw new ConflictError(
          `Cannot approve action in status '${record.status}'. Only PENDING actions can be approved.`
        );
      }

      if (Date.now() > new Date(record.expiresAt).getTime()) {
        record.status = 'EXPIRED';
        throw new ConflictError('Action approval window has expired. Payment cannot be approved.');
      }

      // Revalidate immutable transaction digest
      const expectedDigest = createTransactionDigest({
        requestId: record.requestId,
        agentId: record.agentId,
        tool: record.tool,
        operation: record.operation,
        amountCents: record.amountCents,
        currency: record.currency,
        merchant: record.merchant,
        policyVersion: record.policyVersion,
      });

      if (expectedDigest !== record.transactionDigest) {
        throw new PolicyViolationError('Immutable transaction digest mismatch. Action data was tampered.');
      }

      // Revalidate against current hard security constraints
      const revalidation = await revalidateConstraints(record);
      if (!revalidation.allowed) {
        throw new PolicyViolationError(
          `Revalidation against hard constraints failed: ${revalidation.violation}`
        );
      }

      record.status = 'APPROVED';
      record.reviewedBy = reviewerUsername;
      record.reviewedAt = new Date().toISOString();
      record.serverAuthorizationToken = serverAuthorizationToken;
      record.tokenExpiresAt = tokenExpiresAt;

      this.tokenIndex.set(serverAuthorizationToken, record.id);
      return { ...record };
    } finally {
      release();
    }
  }

  public async rejectActionAtomic(
    id: string,
    reviewerUsername: string,
    reason: string
  ): Promise<PendingApprovalRecord> {
    const release = await this.acquireLock(id);
    try {
      const record = this.records.get(id);
      if (!record) {
        throw new NotFoundError(`Pending approval with id '${id}' not found.`);
      }

      if (record.status !== 'PENDING') {
        throw new ConflictError(
          `Cannot reject action in status '${record.status}'. Only PENDING actions can be rejected.`
        );
      }

      record.status = 'REJECTED';
      record.reviewedBy = reviewerUsername;
      record.reviewedAt = new Date().toISOString();
      record.rejectionReason = reason;

      return { ...record };
    } finally {
      release();
    }
  }

  public async consumeAuthorizationAtomic(
    options: ConsumeAuthorizationOptions
  ): Promise<PendingApprovalRecord> {
    const id = this.tokenIndex.get(options.serverAuthorizationToken);
    if (!id) {
      throw new PolicyViolationError(
        'Server authorization token is invalid, unrecognized, or was never issued.'
      );
    }

    const release = await this.acquireLock(id);
    try {
      const record = this.records.get(id);
      if (!record) {
        throw new PolicyViolationError('Authorization record not found.');
      }

      if (record.status !== 'APPROVED') {
        throw new PolicyViolationError(`Authorization is not approved (status: ${record.status}).`);
      }

      if (record.isConsumed) {
        throw new ConflictError(
          'Single-use server authorization token has already been consumed. Replay rejected.'
        );
      }

      if (record.tokenExpiresAt && Date.now() > new Date(record.tokenExpiresAt).getTime()) {
        throw new PolicyViolationError('Server authorization token has expired.');
      }

      // Check immutable digest and exact fields against execution attempt
      const executingDigest = createTransactionDigest({
        requestId: options.requestId,
        agentId: options.agentId,
        tool: options.tool,
        operation: options.operation,
        amountCents: options.amountCents,
        currency: options.currency,
        merchant: options.merchant,
        policyVersion: record.policyVersion,
      });

      if (executingDigest !== record.transactionDigest) {
        throw new PolicyViolationError(
          'Transaction parameter mismatch: amount, merchant, or currency changed after approval.'
        );
      }

      // Atomically mark consumed
      record.isConsumed = true;
      record.consumedAt = new Date().toISOString();
      return { ...record };
    } finally {
      release();
    }
  }
}

export class PostgresApprovalStore implements IApprovalStore {
  private pool: Pool;

  constructor(poolOrUrl: Pool | string) {
    if (typeof poolOrUrl === 'string') {
      this.pool = new Pool({ connectionString: poolOrUrl });
    } else {
      this.pool = poolOrUrl;
    }
  }

  private mapRow(row: Record<string, unknown>): PendingApprovalRecord {
    return {
      id: row.id as string,
      requestId: row.request_id as string,
      agentId: row.agent_id as string,
      policyId: row.policy_id as string,
      policyVersion: row.policy_version as number,
      tool: row.tool as string,
      operation: row.operation as string,
      amountCents: BigInt(row.amount_cents as string | number),
      amountFormatted: row.amount_formatted as string,
      currency: row.currency as string,
      merchant: row.merchant as string,
      description: row.description as string,
      riskScore: row.risk_score ? parseFloat(row.risk_score as string) : undefined,
      riskCategory: (row.risk_category as string) || undefined,
      riskReasons: (row.risk_reasons as string[]) || [],
      suspiciousSpans: (row.suspicious_spans as string[]) || [],
      transactionDigest: row.transaction_digest as string,
      status: row.status as ApprovalStatus,
      reviewedBy: (row.reviewed_by as string) || undefined,
      reviewedAt: row.reviewed_at ? (row.reviewed_at as Date).toISOString() : undefined,
      rejectionReason: (row.rejection_reason as string) || undefined,
      serverAuthorizationToken: (row.server_authorization_token as string) || undefined,
      tokenExpiresAt: row.token_expires_at ? (row.token_expires_at as Date).toISOString() : undefined,
      isConsumed: Boolean(row.is_consumed),
      consumedAt: row.consumed_at ? (row.consumed_at as Date).toISOString() : undefined,
      expiresAt: (row.expires_at as Date).toISOString(),
      createdAt: (row.created_at as Date).toISOString(),
    };
  }

  public async savePendingApproval(approval: PendingApprovalRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO pending_approvals (
        id, request_id, agent_id, policy_id, policy_version, tool, operation,
        amount_cents, amount_formatted, currency, merchant, description,
        risk_score, risk_category, risk_reasons, suspicious_spans,
        transaction_digest, status, server_authorization_token, token_expires_at,
        is_consumed, expires_at, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23
      )
      ON CONFLICT (request_id) DO UPDATE SET
        status = EXCLUDED.status,
        expires_at = EXCLUDED.expires_at`,
      [
        approval.id,
        approval.requestId,
        approval.agentId,
        approval.policyId,
        approval.policyVersion,
        approval.tool,
        approval.operation,
        approval.amountCents.toString(),
        approval.amountFormatted,
        approval.currency,
        approval.merchant,
        approval.description,
        approval.riskScore ?? null,
        approval.riskCategory ?? null,
        JSON.stringify(approval.riskReasons),
        JSON.stringify(approval.suspiciousSpans),
        approval.transactionDigest,
        approval.status,
        approval.serverAuthorizationToken ?? null,
        approval.tokenExpiresAt ?? null,
        approval.isConsumed,
        approval.expiresAt,
        approval.createdAt,
      ]
    );
  }

  public async getPendingApprovalById(id: string): Promise<PendingApprovalRecord | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM pending_approvals WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  public async getPendingApprovalByRequestId(requestId: string): Promise<PendingApprovalRecord | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM pending_approvals WHERE request_id = $1',
      [requestId]
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  public async getPendingApprovalByToken(token: string): Promise<PendingApprovalRecord | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM pending_approvals WHERE server_authorization_token = $1',
      [token]
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  public async listPendingApprovals(): Promise<PendingApprovalRecord[]> {
    // Automatically filter expired
    const { rows } = await this.pool.query(
      `SELECT * FROM pending_approvals
       WHERE status = 'PENDING' AND expires_at > NOW()
       ORDER BY created_at DESC`
    );
    return rows.map((r) => this.mapRow(r));
  }

  public async approveActionAtomic(
    id: string,
    reviewerUsername: string,
    serverAuthorizationToken: string,
    tokenExpiresAt: string,
    revalidateConstraints: (record: PendingApprovalRecord) => Promise<{ allowed: boolean; violation?: string }>
  ): Promise<PendingApprovalRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Row-level lock to prevent concurrent double-approvals
      const { rows } = await client.query(
        'SELECT * FROM pending_approvals WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (rows.length === 0) {
        throw new NotFoundError(`Pending approval with id '${id}' not found.`);
      }

      const record = this.mapRow(rows[0]);

      if (record.status !== 'PENDING') {
        throw new ConflictError(
          `Cannot approve action in status '${record.status}'. Only PENDING actions can be approved.`
        );
      }

      if (Date.now() > new Date(record.expiresAt).getTime()) {
        await client.query("UPDATE pending_approvals SET status = 'EXPIRED' WHERE id = $1", [id]);
        throw new ConflictError('Action approval window has expired. Payment cannot be approved.');
      }

      // Revalidate immutable transaction digest
      const expectedDigest = createTransactionDigest({
        requestId: record.requestId,
        agentId: record.agentId,
        tool: record.tool,
        operation: record.operation,
        amountCents: record.amountCents,
        currency: record.currency,
        merchant: record.merchant,
        policyVersion: record.policyVersion,
      });

      if (expectedDigest !== record.transactionDigest) {
        throw new PolicyViolationError('Immutable transaction digest mismatch. Action data was tampered.');
      }

      // Revalidate against current hard security constraints
      const revalidation = await revalidateConstraints(record);
      if (!revalidation.allowed) {
        throw new PolicyViolationError(
          `Revalidation against hard constraints failed: ${revalidation.violation}`
        );
      }

      const now = new Date();
      const updateRes = await client.query(
        `UPDATE pending_approvals
         SET status = 'APPROVED',
             reviewed_by = $1,
             reviewed_at = $2,
             server_authorization_token = $3,
             token_expires_at = $4
         WHERE id = $5
         RETURNING *`,
        [reviewerUsername, now.toISOString(), serverAuthorizationToken, tokenExpiresAt, id]
      );

      await client.query('COMMIT');
      return this.mapRow(updateRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async rejectActionAtomic(
    id: string,
    reviewerUsername: string,
    reason: string
  ): Promise<PendingApprovalRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT * FROM pending_approvals WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (rows.length === 0) {
        throw new NotFoundError(`Pending approval with id '${id}' not found.`);
      }

      const record = this.mapRow(rows[0]);
      if (record.status !== 'PENDING') {
        throw new ConflictError(
          `Cannot reject action in status '${record.status}'. Only PENDING actions can be rejected.`
        );
      }

      const now = new Date();
      const updateRes = await client.query(
        `UPDATE pending_approvals
         SET status = 'REJECTED',
             reviewed_by = $1,
             reviewed_at = $2,
             rejection_reason = $3
         WHERE id = $4
         RETURNING *`,
        [reviewerUsername, now.toISOString(), reason, id]
      );

      await client.query('COMMIT');
      return this.mapRow(updateRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async consumeAuthorizationAtomic(
    options: ConsumeAuthorizationOptions
  ): Promise<PendingApprovalRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Atomic row-level lock on the authorization token
      const { rows } = await client.query(
        'SELECT * FROM pending_approvals WHERE server_authorization_token = $1 FOR UPDATE',
        [options.serverAuthorizationToken]
      );

      if (rows.length === 0) {
        throw new PolicyViolationError(
          'Server authorization token is invalid, unrecognized, or was never issued.'
        );
      }

      const record = this.mapRow(rows[0]);

      if (record.status !== 'APPROVED') {
        throw new PolicyViolationError(`Authorization is not approved (status: ${record.status}).`);
      }

      if (record.isConsumed) {
        throw new ConflictError(
          'Single-use server authorization token has already been consumed. Replay rejected.'
        );
      }

      if (record.tokenExpiresAt && Date.now() > new Date(record.tokenExpiresAt).getTime()) {
        throw new PolicyViolationError('Server authorization token has expired.');
      }

      // Check immutable transaction digest
      const executingDigest = createTransactionDigest({
        requestId: options.requestId,
        agentId: options.agentId,
        tool: options.tool,
        operation: options.operation,
        amountCents: options.amountCents,
        currency: options.currency,
        merchant: options.merchant,
        policyVersion: record.policyVersion,
      });

      if (executingDigest !== record.transactionDigest) {
        throw new PolicyViolationError(
          'Transaction parameter mismatch: amount, merchant, or currency changed after approval.'
        );
      }

      const now = new Date();
      const updateRes = await client.query(
        `UPDATE pending_approvals
         SET is_consumed = TRUE,
             consumed_at = $1
         WHERE id = $2
         RETURNING *`,
        [now.toISOString(), record.id]
      );

      await client.query('COMMIT');
      return this.mapRow(updateRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
