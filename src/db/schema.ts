import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  numeric,
  jsonb,
  date,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// 1. Reviewer Accounts & Authenticated Sessions
// ============================================================================

export const reviewers = pgTable(
  'reviewers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username', { length: 64 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    salt: varchar('salt', { length: 64 }).notNull(),
    role: varchar('role', { length: 64 }).notNull().default('REVIEWER'),
    name: varchar('name', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_reviewers_username').on(table.username),
  ]
);

export const reviewerSessions = pgTable(
  'reviewer_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionTokenHash: varchar('session_token_hash', { length: 64 }).notNull().unique(),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => reviewers.id, { onDelete: 'cascade' }),
    reviewerUsername: varchar('reviewer_username', { length: 64 }).notNull(),
    reviewerRole: varchar('reviewer_role', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked: boolean('revoked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_reviewer_sessions_token').on(table.sessionTokenHash),
    index('idx_reviewer_sessions_reviewer_id').on(table.reviewerId),
  ]
);

// ============================================================================
// 2. Pending Human Approvals & Single-Use Authorization Tokens
// ============================================================================

export const pendingApprovals = pgTable(
  'pending_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: varchar('request_id', { length: 128 }).notNull().unique(),
    agentId: varchar('agent_id', { length: 128 }).notNull(),
    policyId: varchar('policy_id', { length: 64 }).notNull(),
    policyVersion: integer('policy_version').notNull(),
    tool: varchar('tool', { length: 64 }).notNull(),
    operation: varchar('operation', { length: 64 }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    amountFormatted: varchar('amount_formatted', { length: 32 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    merchant: varchar('merchant', { length: 255 }).notNull(),
    description: text('description').notNull(),
    riskScore: numeric('risk_score', { precision: 4, scale: 3 }),
    riskCategory: varchar('risk_category', { length: 64 }),
    riskReasons: jsonb('risk_reasons').$type<string[]>().default([]).notNull(),
    suspiciousSpans: jsonb('suspicious_spans').$type<string[]>().default([]).notNull(),
    transactionDigest: varchar('transaction_digest', { length: 128 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('PENDING'), // PENDING, APPROVED, REJECTED, EXPIRED
    reviewedBy: varchar('reviewed_by', { length: 128 }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    serverAuthorizationToken: varchar('server_authorization_token', { length: 128 }),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    isConsumed: boolean('is_consumed').notNull().default(false),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_pending_approvals_request_id').on(table.requestId),
    index('idx_pending_approvals_status').on(table.status),
    index('idx_pending_approvals_token').on(table.serverAuthorizationToken),
    index('idx_pending_approvals_agent').on(table.agentId, table.createdAt),
  ]
);

// ============================================================================
// 3. Durable Audit Events
// ============================================================================

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: varchar('request_id', { length: 128 }).notNull(),
    agentId: varchar('agent_id', { length: 128 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    merchant: varchar('merchant', { length: 255 }),
    amountCents: bigint('amount_cents', { mode: 'bigint' }),
    amountFormatted: varchar('amount_formatted', { length: 32 }),
    currency: varchar('currency', { length: 3 }),
    policyVersion: integer('policy_version'),
    riskResult: jsonb('risk_result').$type<Record<string, unknown>>(),
    decision: varchar('decision', { length: 32 }),
    decisionReasons: jsonb('decision_reasons').$type<string[]>().default([]),
    approvalState: varchar('approval_state', { length: 32 }).default('NONE'),
    paypalReference: varchar('paypal_reference', { length: 128 }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    payloadSummary: jsonb('payload_summary').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_events_request_id').on(table.requestId),
    index('idx_audit_events_agent_id').on(table.agentId),
    index('idx_audit_events_created_at').on(table.createdAt),
    index('idx_audit_events_event_type').on(table.eventType),
  ]
);

// ============================================================================
// 4. Versioned Policy Definitions
// ============================================================================

export const policyDefinitions = pgTable(
  'policy_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    policyId: varchar('policy_id', { length: 64 }).notNull(),
    version: integer('version').notNull(),
    maxAmountCents: bigint('max_amount_cents', { mode: 'bigint' }).notNull(),
    maxDailyAmountCents: bigint('max_daily_amount_cents', { mode: 'bigint' }).notNull(),
    approvalThresholdCents: bigint('approval_threshold_cents', { mode: 'bigint' }).notNull(),
    allowedCurrencies: text('allowed_currencies').array().notNull(),
    allowedMerchants: text('allowed_merchants').array(),
    blockedMerchants: text('blocked_merchants').array().notNull().default([]),
    allowedTools: text('allowed_tools').array().notNull(),
    allowedOperations: text('allowed_operations').array().notNull(),
    velocityLimit: integer('velocity_limit').notNull().default(10),
    velocityWindowSeconds: integer('velocity_window_seconds').notNull().default(3600),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_policy_version_unique').on(table.policyId, table.version),
    index('idx_policy_active').on(table.policyId, table.isActive),
  ]
);

// ============================================================================
// 5. Daily Spend & Velocity Tracking
// ============================================================================

export const agentDailySpend = pgTable(
  'agent_daily_spend',
  {
    agentId: varchar('agent_id', { length: 128 }).notNull(),
    spendDate: date('spend_date').notNull(),
    spentCents: bigint('spent_cents', { mode: 'bigint' }).notNull().default(sql`0`),
    transactionCount: integer('transaction_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.spendDate] }),
  ]
);

export const authorizationRecords = pgTable(
  'authorization_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: varchar('request_id', { length: 128 }).notNull().unique(),
    agentId: varchar('agent_id', { length: 128 }).notNull(),
    policyId: varchar('policy_id', { length: 64 }).notNull(),
    policyVersion: integer('policy_version').notNull(),
    tool: varchar('tool', { length: 64 }).notNull(),
    operation: varchar('operation', { length: 64 }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    amountFormatted: varchar('amount_formatted', { length: 32 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    merchant: varchar('merchant', { length: 255 }).notNull(),
    decision: varchar('decision', { length: 16 }).notNull(),
    reason: text('reason').notNull(),
    violations: jsonb('violations').$type<string[]>().notNull().default([]),
    authorizationToken: varchar('authorization_token', { length: 128 }),
    isExecuted: boolean('is_executed').notNull().default(false),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_auth_records_request_id').on(table.requestId),
    index('idx_auth_records_token').on(table.authorizationToken),
    index('idx_auth_records_agent').on(table.agentId, table.createdAt),
  ]
);

export const transactionVelocity = pgTable(
  'transaction_velocity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: varchar('agent_id', { length: 128 }).notNull(),
    requestId: varchar('request_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_velocity_agent_time').on(table.agentId, table.createdAt),
  ]
);

// Type definitions
export type Reviewer = typeof reviewers.$inferSelect;
export type NewReviewer = typeof reviewers.$inferInsert;

export type ReviewerSession = typeof reviewerSessions.$inferSelect;
export type NewReviewerSession = typeof reviewerSessions.$inferInsert;

export type PendingApproval = typeof pendingApprovals.$inferSelect;
export type NewPendingApproval = typeof pendingApprovals.$inferInsert;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
