import { Pool, PoolConfig } from 'pg';
import { IAuditRepository, AuditRecord, AuditEventType, AuditEventStatus } from './types';
import { sanitizeAuditPayload } from './sanitizer';

export class PostgresAuditRepository implements IAuditRepository {
  private pool: Pool;

  constructor(connectionStringOrConfig: string | PoolConfig | Pool) {
    if (connectionStringOrConfig instanceof Pool) {
      this.pool = connectionStringOrConfig;
    } else if (typeof connectionStringOrConfig === 'string') {
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

  public getPool(): Pool {
    return this.pool;
  }

  /**
   * Run schema setup if needed
   */
  public async initialize(): Promise<void> {
    const query = `
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      -- 1. Audit Events
      CREATE TABLE IF NOT EXISTS audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id VARCHAR(128) NOT NULL,
        agent_id VARCHAR(128) NOT NULL,
        action VARCHAR(64) DEFAULT 'UNKNOWN' NOT NULL,
        merchant VARCHAR(255),
        amount_cents BIGINT,
        amount_formatted VARCHAR(32),
        currency VARCHAR(3),
        policy_version INT,
        risk_result JSONB,
        decision VARCHAR(32),
        decision_reasons JSONB DEFAULT '[]'::jsonb,
        approval_state VARCHAR(32) DEFAULT 'NONE',
        paypal_reference VARCHAR(128),
        event_type VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        risk_score REAL,
        policy_decision VARCHAR(32),
        payload_summary JSONB,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS risk_score REAL;
      ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS policy_decision VARCHAR(32);
      CREATE INDEX IF NOT EXISTS idx_audit_events_request_id ON audit_events(request_id);
      CREATE INDEX IF NOT EXISTS idx_audit_events_agent_id ON audit_events(agent_id);
      CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);

      -- 2. Versioned Policy Definitions
      CREATE TABLE IF NOT EXISTS policy_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        policy_id VARCHAR(64) NOT NULL,
        version INT NOT NULL,
        max_amount_cents BIGINT NOT NULL,
        max_daily_amount_cents BIGINT NOT NULL,
        approval_threshold_cents BIGINT NOT NULL,
        allowed_currencies TEXT[] NOT NULL,
        allowed_merchants TEXT[],
        blocked_merchants TEXT[] NOT NULL DEFAULT '{}',
        allowed_tools TEXT[] NOT NULL,
        allowed_operations TEXT[] NOT NULL,
        velocity_limit INT NOT NULL DEFAULT 10,
        velocity_window_seconds INT NOT NULL DEFAULT 3600,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_policy_version UNIQUE (policy_id, version)
      );

      -- 3. Reviewers & Authenticated Sessions
      CREATE TABLE IF NOT EXISTS reviewers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(64) NOT NULL UNIQUE,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(64) NOT NULL,
        role VARCHAR(64) NOT NULL DEFAULT 'ANALYST',
        name VARCHAR(128) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE reviewers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE reviewers ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';
      ALTER TABLE reviewers ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviewers_email ON reviewers(email);

      CREATE TABLE IF NOT EXISTS reviewer_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_token_hash VARCHAR(64) NOT NULL UNIQUE,
        reviewer_id UUID NOT NULL REFERENCES reviewers(id) ON DELETE CASCADE,
        reviewer_username VARCHAR(64) NOT NULL,
        reviewer_role VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reviewer_sessions_token ON reviewer_sessions(session_token_hash);
      CREATE INDEX IF NOT EXISTS idx_reviewer_sessions_reviewer_id ON reviewer_sessions(reviewer_id);

      -- 4. User Invitations
      CREATE TABLE IF NOT EXISTS user_invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'ANALYST',
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_by UUID REFERENCES reviewers(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(token_hash);
      CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);

      -- 5. Pending Human Approvals
      CREATE TABLE IF NOT EXISTS pending_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id VARCHAR(128) NOT NULL UNIQUE,
        agent_id VARCHAR(128) NOT NULL,
        policy_id VARCHAR(64) NOT NULL,
        policy_version INT NOT NULL,
        tool VARCHAR(64) NOT NULL,
        operation VARCHAR(64) NOT NULL,
        amount_cents BIGINT NOT NULL,
        amount_formatted VARCHAR(32) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        merchant VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        risk_score NUMERIC(4, 3),
        risk_category VARCHAR(64),
        risk_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
        suspicious_spans JSONB NOT NULL DEFAULT '[]'::jsonb,
        transaction_digest VARCHAR(128) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        reviewed_by VARCHAR(128),
        reviewed_at TIMESTAMPTZ,
        rejection_reason TEXT,
        server_authorization_token VARCHAR(128),
        token_expires_at TIMESTAMPTZ,
        is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
        consumed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pending_approvals_status ON pending_approvals(status);
      CREATE INDEX IF NOT EXISTS idx_pending_approvals_token ON pending_approvals(server_authorization_token);

      -- 6. Atomic Daily Spend & Authorization Records
      CREATE TABLE IF NOT EXISTS agent_daily_spend (
        agent_id VARCHAR(128) NOT NULL,
        spend_date DATE NOT NULL,
        spent_cents BIGINT NOT NULL DEFAULT 0,
        transaction_count INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (agent_id, spend_date)
      );

      CREATE TABLE IF NOT EXISTS authorization_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id VARCHAR(128) NOT NULL UNIQUE,
        agent_id VARCHAR(128) NOT NULL,
        policy_id VARCHAR(64) NOT NULL,
        policy_version INT NOT NULL,
        tool VARCHAR(64) NOT NULL,
        operation VARCHAR(64) NOT NULL,
        amount_cents BIGINT NOT NULL,
        amount_formatted VARCHAR(32) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        merchant VARCHAR(255) NOT NULL,
        decision VARCHAR(16) NOT NULL,
        reason TEXT NOT NULL,
        violations JSONB NOT NULL DEFAULT '[]'::jsonb,
        authorization_token VARCHAR(128),
        is_executed BOOLEAN NOT NULL DEFAULT FALSE,
        executed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_request_id ON authorization_records(request_id);
      CREATE INDEX IF NOT EXISTS idx_auth_token ON authorization_records(authorization_token);

      CREATE TABLE IF NOT EXISTS transaction_velocity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR(128) NOT NULL,
        request_id VARCHAR(128) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_velocity_agent_time ON transaction_velocity(agent_id, created_at DESC);
    `;
    await this.pool.query(query);
  }

  private mapRow(row: Record<string, unknown>): AuditRecord {
    return {
      id: row.id as string,
      requestId: row.request_id as string,
      agentId: row.agent_id as string,
      action: (row.action as string) || undefined,
      merchant: (row.merchant as string) || null,
      amountCents: row.amount_cents ? BigInt(row.amount_cents as string | number) : null,
      amountFormatted: (row.amount_formatted as string) || null,
      currency: (row.currency as string) || null,
      policyVersion: row.policy_version ? Number(row.policy_version) : null,
      riskResult: (row.risk_result as Record<string, unknown>) || null,
      decision: (row.decision as string) || (row.policy_decision as string) || null,
      decisionReasons: (row.decision_reasons as string[]) || null,
      approvalState: (row.approval_state as string) || null,
      paypalReference: (row.paypal_reference as string) || null,
      eventType: row.event_type as AuditEventType,
      status: row.status as AuditEventStatus,
      riskScore: row.risk_score ? parseFloat(row.risk_score as string) : null,
      policyDecision: (row.policy_decision as string) || (row.decision as string) || null,
      payloadSummary: row.payload_summary as Record<string, unknown>,
      errorMessage: (row.error_message as string) || null,
      createdAt: row.created_at ? (row.created_at as Date).toISOString?.() ?? String(row.created_at) : undefined,
    };
  }

  public async recordEvent(event: AuditRecord): Promise<AuditRecord> {
    const sanitizedPayload = sanitizeAuditPayload(event.payloadSummary);
    const sanitizedRiskResult = sanitizeAuditPayload(event.riskResult);

    const query = `
      INSERT INTO audit_events (
        request_id, agent_id, action, merchant, amount_cents, amount_formatted,
        currency, policy_version, risk_result, decision, decision_reasons,
        approval_state, paypal_reference, event_type, status, risk_score,
        policy_decision, payload_summary, error_message
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19
      )
      RETURNING *;
    `;

    const values = [
      event.requestId,
      event.agentId,
      event.action || event.eventType,
      event.merchant || null,
      event.amountCents ? event.amountCents.toString() : null,
      event.amountFormatted || null,
      event.currency || null,
      event.policyVersion ? Number(event.policyVersion) : null,
      sanitizedRiskResult ? JSON.stringify(sanitizedRiskResult) : null,
      event.decision || event.policyDecision || null,
      event.decisionReasons ? JSON.stringify(event.decisionReasons) : '[]',
      event.approvalState || 'NONE',
      event.paypalReference || null,
      event.eventType,
      event.status,
      event.riskScore ?? null,
      event.policyDecision ?? event.decision ?? null,
      sanitizedPayload ? JSON.stringify(sanitizedPayload) : null,
      event.errorMessage ?? null,
    ];

    const result = await this.pool.query(query, values);
    return this.mapRow(result.rows[0]);
  }

  public async getEventsByRequestId(requestId: string): Promise<AuditRecord[]> {
    const query = `
      SELECT *
      FROM audit_events
      WHERE request_id = $1
      ORDER BY created_at ASC;
    `;

    const result = await this.pool.query(query, [requestId]);
    return result.rows.map((row) => this.mapRow(row));
  }

  public async getEventsByAgentId(agentId: string, limit: number = 50): Promise<AuditRecord[]> {
    const query = `
      SELECT *
      FROM audit_events
      WHERE agent_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;

    const result = await this.pool.query(query, [agentId, limit]);
    return result.rows.map((row) => this.mapRow(row));
  }

  public async getAllEvents(limit: number = 100): Promise<AuditRecord[]> {
    const query = `
      SELECT *
      FROM audit_events
      ORDER BY created_at DESC
      LIMIT $1;
    `;
    const result = await this.pool.query(query, [limit]);
    return result.rows.map((row) => this.mapRow(row));
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1;');
      return Boolean(result && result.rows && result.rows.length > 0);
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
