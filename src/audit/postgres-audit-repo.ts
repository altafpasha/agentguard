import { Pool, PoolConfig } from 'pg';
import { IAuditRepository, AuditRecord } from './types';
import { sanitizeAuditPayload } from './sanitizer';

export class PostgresAuditRepository implements IAuditRepository {
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
        event_type VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        risk_score NUMERIC(4, 3),
        policy_decision VARCHAR(32),
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

  public async recordEvent(event: AuditRecord): Promise<AuditRecord> {
    const sanitizedPayload = sanitizeAuditPayload(event.payloadSummary);

    const query = `
      INSERT INTO audit_events (
        request_id, agent_id, event_type, status, risk_score, policy_decision, payload_summary, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, request_id, agent_id, event_type, status, risk_score, policy_decision, payload_summary, error_message, created_at;
    `;

    const values = [
      event.requestId,
      event.agentId,
      event.eventType,
      event.status,
      event.riskScore ?? null,
      event.policyDecision ?? null,
      sanitizedPayload ? JSON.stringify(sanitizedPayload) : null,
      event.errorMessage ?? null,
    ];

    const result = await this.pool.query(query, values);
    const row = result.rows[0];

    return {
      id: row.id,
      requestId: row.request_id,
      agentId: row.agent_id,
      eventType: row.event_type,
      status: row.status,
      riskScore: row.risk_score ? parseFloat(row.risk_score) : null,
      policyDecision: row.policy_decision,
      payloadSummary: row.payload_summary,
      errorMessage: row.error_message,
      createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
    };
  }

  public async getEventsByRequestId(requestId: string): Promise<AuditRecord[]> {
    const query = `
      SELECT id, request_id, agent_id, event_type, status, risk_score, policy_decision, payload_summary, error_message, created_at
      FROM audit_events
      WHERE request_id = $1
      ORDER BY created_at ASC;
    `;

    const result = await this.pool.query(query, [requestId]);
    return result.rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      agentId: row.agent_id,
      eventType: row.event_type,
      status: row.status,
      riskScore: row.risk_score ? parseFloat(row.risk_score) : null,
      policyDecision: row.policy_decision,
      payloadSummary: row.payload_summary,
      errorMessage: row.error_message,
      createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
    }));
  }

  public async getEventsByAgentId(agentId: string, limit = 50): Promise<AuditRecord[]> {
    const query = `
      SELECT id, request_id, agent_id, event_type, status, risk_score, policy_decision, payload_summary, error_message, created_at
      FROM audit_events
      WHERE agent_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;

    const result = await this.pool.query(query, [agentId, limit]);
    return result.rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      agentId: row.agent_id,
      eventType: row.event_type,
      status: row.status,
      riskScore: row.risk_score ? parseFloat(row.risk_score) : null,
      policyDecision: row.policy_decision,
      payloadSummary: row.payload_summary,
      errorMessage: row.error_message,
      createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
    }));
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT 1 as ping');
      return res.rows[0]?.ping === 1;
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
