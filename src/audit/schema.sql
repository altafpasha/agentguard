-- AgentGuard Schema (PostgreSQL 16)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Audit Trail
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
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);

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

CREATE INDEX IF NOT EXISTS idx_policy_active ON policy_definitions(policy_id, is_active);

-- 3. Atomic Cumulative Daily Spend Tracking
CREATE TABLE IF NOT EXISTS agent_daily_spend (
    agent_id VARCHAR(128) NOT NULL,
    spend_date DATE NOT NULL,
    spent_cents BIGINT NOT NULL DEFAULT 0,
    transaction_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_id, spend_date)
);

-- 4. Durable Authorization Decision Records & Tokens
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
CREATE INDEX IF NOT EXISTS idx_auth_agent ON authorization_records(agent_id, created_at DESC);

-- 5. Velocity Tracking Window
CREATE TABLE IF NOT EXISTS transaction_velocity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(128) NOT NULL,
    request_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_velocity_agent_time ON transaction_velocity(agent_id, created_at DESC);
