-- AgentGuard Audit Events Schema (PostgreSQL 16)
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

-- Indexes for high-performance audit query filtering
CREATE INDEX IF NOT EXISTS idx_audit_events_request_id ON audit_events(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_agent_id ON audit_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);
