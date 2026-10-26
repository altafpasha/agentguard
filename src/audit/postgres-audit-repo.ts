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
        payload_summary JSONB,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_request_id ON audit_events(request_id);
      CREATE INDEX IF NOT EXISTS idx_audit_events_agent_id ON audit_events(agent_id);
      CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
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
