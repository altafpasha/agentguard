import { Pool, PoolConfig } from 'pg';
import {
  AuthorizationDecisionRecord,
  IPolicyStore,
  PolicyDefinition,
} from './types';

/**
 * In-Memory Policy Store with deterministic atomic concurrency synchronization.
 * Ideal for unit/contract tests and development environments without a live PostgreSQL server.
 */
export class MemoryPolicyStore implements IPolicyStore {
  private policies = new Map<string, PolicyDefinition[]>();
  private decisions = new Map<string, AuthorizationDecisionRecord>();
  private dailySpend = new Map<string, { spentCents: bigint; count: number }>();
  private velocityRecords: Array<{ agentId: string; requestId: string; timestamp: number }> = [];
  private spendLock = new Map<string, Promise<void>>();

  private async acquireLock(key: string): Promise<() => void> {
    while (this.spendLock.has(key)) {
      await this.spendLock.get(key);
    }
    let resolveLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.spendLock.set(key, lockPromise);

    return () => {
      this.spendLock.delete(key);
      resolveLock();
    };
  }

  public async getActivePolicy(policyId: string): Promise<PolicyDefinition | null> {
    const list = this.policies.get(policyId) ?? [];
    return list.find((p) => p.isActive) ?? null;
  }

  public async createPolicyVersion(
    policy: Omit<PolicyDefinition, 'id' | 'createdAt'>
  ): Promise<PolicyDefinition> {
    const list = this.policies.get(policy.policyId) ?? [];
    // Mark previous active policies as inactive
    for (const p of list) {
      p.isActive = false;
    }

    const created: PolicyDefinition = {
      ...policy,
      id: `pol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };

    list.push(created);
    this.policies.set(policy.policyId, list);
    return created;
  }

  public async getPolicyHistory(policyId: string): Promise<PolicyDefinition[]> {
    return (this.policies.get(policyId) ?? []).slice().sort((a, b) => b.version - a.version);
  }

  public async getDecisionByRequestId(
    requestId: string
  ): Promise<AuthorizationDecisionRecord | null> {
    return this.decisions.get(requestId) ?? null;
  }

  public async saveDecision(
    record: AuthorizationDecisionRecord
  ): Promise<AuthorizationDecisionRecord> {
    this.decisions.set(record.requestId, { ...record });
    return record;
  }

  public async markExecuted(requestId: string, authorizationToken: string): Promise<boolean> {
    const existing = this.decisions.get(requestId);
    if (!existing) return false;
    if (existing.authorizationToken !== authorizationToken) return false;
    if (existing.isExecuted) return false; // already executed!

    existing.isExecuted = true;
    existing.executedAt = new Date().toISOString();
    this.decisions.set(requestId, existing);
    return true;
  }

  public async getDailySpend(agentId: string, utcDate: string): Promise<bigint> {
    const key = `${agentId}:${utcDate}`;
    return this.dailySpend.get(key)?.spentCents ?? 0n;
  }

  public async recordSpendWithAtomicCheck(
    agentId: string,
    utcDate: string,
    amountCents: bigint,
    dailyLimitCents: bigint
  ): Promise<{ success: boolean; currentDailySpendCents: bigint }> {
    const key = `${agentId}:${utcDate}`;
    const release = await this.acquireLock(key);

    try {
      const current = this.dailySpend.get(key) ?? { spentCents: 0n, count: 0 };
      if (current.spentCents + amountCents > dailyLimitCents) {
        return { success: false, currentDailySpendCents: current.spentCents };
      }

      current.spentCents += amountCents;
      current.count += 1;
      this.dailySpend.set(key, current);

      return { success: true, currentDailySpendCents: current.spentCents };
    } finally {
      release();
    }
  }

  public async getVelocityCount(agentId: string, sinceUtc: string): Promise<number> {
    const sinceTime = new Date(sinceUtc).getTime();
    return this.velocityRecords.filter(
      (r) => r.agentId === agentId && r.timestamp >= sinceTime
    ).length;
  }

  public async recordVelocity(
    agentId: string,
    requestId: string,
    timestampUtc: string
  ): Promise<void> {
    this.velocityRecords.push({
      agentId,
      requestId,
      timestamp: new Date(timestampUtc).getTime(),
    });
  }

  public clear(): void {
    this.policies.clear();
    this.decisions.clear();
    this.dailySpend.clear();
    this.velocityRecords = [];
    this.spendLock.clear();
  }
}

/**
 * PostgreSQL Policy Store implementing durable versioned policies, decision records,
 * and row-level locking (SELECT ... FOR UPDATE) for concurrent spend limit enforcement.
 */
export class PostgresPolicyStore implements IPolicyStore {
  private pool: Pool;

  constructor(connectionStringOrConfig: string | PoolConfig) {
    if (typeof connectionStringOrConfig === 'string') {
      this.pool = new Pool({
        connectionString: connectionStringOrConfig,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } else {
      this.pool = new Pool(connectionStringOrConfig);
    }
  }

  public async getActivePolicy(policyId: string): Promise<PolicyDefinition | null> {
    const query = `
      SELECT id, policy_id, version, max_amount_cents, max_daily_amount_cents, approval_threshold_cents,
             allowed_currencies, allowed_merchants, blocked_merchants, allowed_tools, allowed_operations,
             velocity_limit, velocity_window_seconds, is_active, created_at
      FROM policy_definitions
      WHERE policy_id = $1 AND is_active = TRUE
      ORDER BY version DESC
      LIMIT 1;
    `;
    const res = await this.pool.query(query, [policyId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    return {
      id: row.id,
      policyId: row.policy_id,
      version: row.version,
      maxAmountCents: BigInt(row.max_amount_cents),
      maxDailyAmountCents: BigInt(row.max_daily_amount_cents),
      approvalThresholdCents: BigInt(row.approval_threshold_cents),
      allowedCurrencies: row.allowed_currencies,
      allowedMerchants: row.allowed_merchants,
      blockedMerchants: row.blocked_merchants,
      allowedTools: row.allowed_tools,
      allowedOperations: row.allowed_operations,
      velocityLimit: row.velocity_limit,
      velocityWindowSeconds: row.velocity_window_seconds,
      isActive: row.is_active,
      createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
    };
  }

  public async createPolicyVersion(
    policy: Omit<PolicyDefinition, 'id' | 'createdAt'>
  ): Promise<PolicyDefinition> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Set existing versions for this policyId to inactive
      await client.query(
        'UPDATE policy_definitions SET is_active = FALSE WHERE policy_id = $1',
        [policy.policyId]
      );

      const query = `
        INSERT INTO policy_definitions (
          policy_id, version, max_amount_cents, max_daily_amount_cents, approval_threshold_cents,
          allowed_currencies, allowed_merchants, blocked_merchants, allowed_tools, allowed_operations,
          velocity_limit, velocity_window_seconds, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, created_at;
      `;

      const values = [
        policy.policyId,
        policy.version,
        policy.maxAmountCents.toString(),
        policy.maxDailyAmountCents.toString(),
        policy.approvalThresholdCents.toString(),
        policy.allowedCurrencies,
        policy.allowedMerchants ?? null,
        policy.blockedMerchants,
        policy.allowedTools,
        policy.allowedOperations,
        policy.velocityLimit,
        policy.velocityWindowSeconds,
        policy.isActive,
      ];

      const res = await client.query(query, values);
      await client.query('COMMIT');

      return {
        ...policy,
        id: res.rows[0].id,
        createdAt: res.rows[0].created_at?.toISOString?.() ?? String(res.rows[0].created_at),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getPolicyHistory(policyId: string): Promise<PolicyDefinition[]> {
    const query = `
      SELECT id, policy_id, version, max_amount_cents, max_daily_amount_cents, approval_threshold_cents,
             allowed_currencies, allowed_merchants, blocked_merchants, allowed_tools, allowed_operations,
             velocity_limit, velocity_window_seconds, is_active, created_at
      FROM policy_definitions
      WHERE policy_id = $1
      ORDER BY version DESC;
    `;
    const res = await this.pool.query(query, [policyId]);

    return res.rows.map((row) => ({
      id: row.id,
      policyId: row.policy_id,
      version: row.version,
      maxAmountCents: BigInt(row.max_amount_cents),
      maxDailyAmountCents: BigInt(row.max_daily_amount_cents),
      approvalThresholdCents: BigInt(row.approval_threshold_cents),
      allowedCurrencies: row.allowed_currencies,
      allowedMerchants: row.allowed_merchants,
      blockedMerchants: row.blocked_merchants,
      allowedTools: row.allowed_tools,
      allowedOperations: row.allowed_operations,
      velocityLimit: row.velocity_limit,
      velocityWindowSeconds: row.velocity_window_seconds,
      isActive: row.is_active,
      createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
    }));
  }

  public async getDecisionByRequestId(
    requestId: string
  ): Promise<AuthorizationDecisionRecord | null> {
    const query = `
      SELECT id, request_id, agent_id, policy_id, policy_version, tool, operation, amount_cents,
             amount_formatted, currency, merchant, decision, reason, violations, authorization_token,
             is_executed, executed_at, expires_at, created_at
      FROM authorization_records
      WHERE request_id = $1;
    `;
    const res = await this.pool.query(query, [requestId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    return {
      id: row.id,
      requestId: row.request_id,
      agentId: row.agent_id,
      policyId: row.policy_id,
      policyVersion: row.policy_version,
      tool: row.tool,
      operation: row.operation,
      amountCents: BigInt(row.amount_cents),
      amountFormatted: row.amount_formatted,
      currency: row.currency,
      merchant: row.merchant,
      decision: row.decision,
      reason: row.reason,
      violations: typeof row.violations === 'string' ? JSON.parse(row.violations) : row.violations,
      authorizationToken: row.authorization_token,
      isExecuted: row.is_executed,
      executedAt: row.executed_at?.toISOString?.() ?? row.executed_at,
      expiresAt: row.expires_at?.toISOString?.() ?? String(row.expires_at),
      createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
    };
  }

  public async saveDecision(
    record: AuthorizationDecisionRecord
  ): Promise<AuthorizationDecisionRecord> {
    const query = `
      INSERT INTO authorization_records (
        request_id, agent_id, policy_id, policy_version, tool, operation, amount_cents,
        amount_formatted, currency, merchant, decision, reason, violations, authorization_token,
        is_executed, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (request_id) DO UPDATE SET
        decision = EXCLUDED.decision,
        reason = EXCLUDED.reason
      RETURNING id, created_at;
    `;

    const values = [
      record.requestId,
      record.agentId,
      record.policyId,
      record.policyVersion,
      record.tool,
      record.operation,
      record.amountCents.toString(),
      record.amountFormatted,
      record.currency,
      record.merchant,
      record.decision,
      record.reason,
      JSON.stringify(record.violations),
      record.authorizationToken ?? null,
      record.isExecuted,
      record.expiresAt,
    ];

    const res = await this.pool.query(query, values);
    return {
      ...record,
      id: res.rows[0].id,
      createdAt: res.rows[0].created_at?.toISOString?.() ?? String(res.rows[0].created_at),
    };
  }

  public async markExecuted(requestId: string, authorizationToken: string): Promise<boolean> {
    const query = `
      UPDATE authorization_records
      SET is_executed = TRUE, executed_at = NOW()
      WHERE request_id = $1 AND authorization_token = $2 AND is_executed = FALSE
      RETURNING id;
    `;
    const res = await this.pool.query(query, [requestId, authorizationToken]);
    return res.rows.length > 0;
  }

  public async getDailySpend(agentId: string, utcDate: string): Promise<bigint> {
    const query = `
      SELECT spent_cents FROM agent_daily_spend WHERE agent_id = $1 AND spend_date = $2;
    `;
    const res = await this.pool.query(query, [agentId, utcDate]);
    if (res.rows.length === 0) return 0n;
    return BigInt(res.rows[0].spent_cents);
  }

  /**
   * Enforce spend limit atomically using PostgreSQL row-level locking (SELECT ... FOR UPDATE)
   */
  public async recordSpendWithAtomicCheck(
    agentId: string,
    utcDate: string,
    amountCents: bigint,
    dailyLimitCents: bigint
  ): Promise<{ success: boolean; currentDailySpendCents: bigint }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure record exists
      await client.query(
        `INSERT INTO agent_daily_spend (agent_id, spend_date, spent_cents, transaction_count, updated_at)
         VALUES ($1, $2, 0, 0, NOW())
         ON CONFLICT (agent_id, spend_date) DO NOTHING;`,
        [agentId, utcDate]
      );

      // Acquire exclusive row lock
      const lockRes = await client.query(
        `SELECT spent_cents FROM agent_daily_spend
         WHERE agent_id = $1 AND spend_date = $2
         FOR UPDATE;`,
        [agentId, utcDate]
      );

      const currentSpent = BigInt(lockRes.rows[0]?.spent_cents ?? 0);

      if (currentSpent + amountCents > dailyLimitCents) {
        await client.query('COMMIT');
        return { success: false, currentDailySpendCents: currentSpent };
      }

      const updateRes = await client.query(
        `UPDATE agent_daily_spend
         SET spent_cents = spent_cents + $3,
             transaction_count = transaction_count + 1,
             updated_at = NOW()
         WHERE agent_id = $1 AND spend_date = $2
         RETURNING spent_cents;`,
        [agentId, utcDate, amountCents.toString()]
      );

      await client.query('COMMIT');
      return { success: true, currentDailySpendCents: BigInt(updateRes.rows[0].spent_cents) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getVelocityCount(agentId: string, sinceUtc: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count FROM transaction_velocity
      WHERE agent_id = $1 AND created_at >= $2;
    `;
    const res = await this.pool.query(query, [agentId, sinceUtc]);
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }

  public async recordVelocity(
    agentId: string,
    requestId: string,
    timestampUtc: string
  ): Promise<void> {
    const query = `
      INSERT INTO transaction_velocity (agent_id, request_id, created_at)
      VALUES ($1, $2, $3);
    `;
    await this.pool.query(query, [agentId, requestId, timestampUtc]);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
