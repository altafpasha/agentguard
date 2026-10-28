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
    email: varchar('email', { length: 255 }).unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    salt: varchar('salt', { length: 64 }).notNull(),
    role: varchar('role', { length: 64 }).notNull().default('ANALYST'),
    name: varchar('name', { length: 128 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('ACTIVE'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_reviewers_username').on(table.username),
    uniqueIndex('idx_reviewers_email').on(table.email),
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

export const userInvitations = pgTable(
  'user_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    role: varchar('role', { length: 32 }).notNull().default('ANALYST'),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revoked: boolean('revoked').notNull().default(false),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => reviewers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_user_invitations_token').on(table.tokenHash),
    index('idx_user_invitations_email').on(table.email),
  ]
);

export const authSettings = pgTable(
  'auth_settings',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    allowPublicSignup: boolean('allow_public_signup').notNull().default(false),
    defaultUserRole: varchar('default_user_role', { length: 32 }).notNull().default('VIEWER'),
    requireEmailVerification: boolean('require_email_verification').notNull().default(false),
    inviteOnly: boolean('invite_only').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: varchar('updated_by', { length: 128 }),
  }
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 32 }).notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
    workspaceId: varchar('workspace_id', { length: 64 }).notNull().default('default'),
    role: varchar('role', { length: 32 }).notNull().default('CLIENT'),
    permissions: jsonb('permissions').$type<string[]>().notNull().default(['evaluate']),
    rateLimitRpm: integer('rate_limit_rpm').notNull().default(600),
    revoked: boolean('revoked').notNull().default(false),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: varchar('created_by', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_api_keys_hash').on(table.keyHash),
    index('idx_api_keys_workspace').on(table.workspaceId),
    index('idx_api_keys_prefix').on(table.keyPrefix),
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

// ============================================================================
// 6. Store Products, Orders, and Pricing Plans
// ============================================================================

export const storeProducts = pgTable(
  'store_products',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    priceCents: bigint('price_cents', { mode: 'bigint' }).notNull(),
    priceFormatted: varchar('price_formatted', { length: 32 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    description: text('description').notNull(),
    details: text('details'),
    imageUrl: text('image_url'),
    stock: integer('stock').notNull().default(100),
    isAvailable: boolean('is_available').notNull().default(true),
    merchantEmail: varchar('merchant_email', { length: 255 }).notNull(),
    merchantName: varchar('merchant_name', { length: 255 }).notNull(),
    isMalicious: boolean('is_malicious').notNull().default(false),
    expectedScenario: varchar('expected_scenario', { length: 32 }).default('A'),
    injectionSnippet: text('injection_snippet'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_store_products_category').on(table.category),
    index('idx_store_products_available').on(table.isAvailable),
  ]
);

export const storeOrders = pgTable(
  'store_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderNumber: varchar('order_number', { length: 64 }).notNull().unique(),
    items: jsonb('items').$type<Array<Record<string, unknown>>>().notNull(),
    totalCents: bigint('total_cents', { mode: 'bigint' }).notNull(),
    totalFormatted: varchar('total_formatted', { length: 32 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    merchantEmail: varchar('merchant_email', { length: 255 }).notNull(),
    merchantName: varchar('merchant_name', { length: 255 }).notNull(),
    status: varchar('status', { length: 64 }).notNull().default('PENDING'),
    customerEmail: varchar('customer_email', { length: 255 }),
    agentId: varchar('agent_id', { length: 128 }),
    paypalOrderId: varchar('paypal_order_id', { length: 128 }),
    paypalApprovalUrl: text('paypal_approval_url'),
    paypalCaptureId: varchar('paypal_capture_id', { length: 128 }),
    securityDecision: varchar('security_decision', { length: 16 }).notNull().default('ALLOW'),
    securityReason: text('security_reason'),
    securityViolations: jsonb('security_violations').$type<string[]>().default([]),
    humanApprovalId: uuid('human_approval_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_store_orders_number').on(table.orderNumber),
    index('idx_store_orders_paypal').on(table.paypalOrderId),
    index('idx_store_orders_status').on(table.status),
    index('idx_store_orders_created').on(table.createdAt),
  ]
);

export const storePricingPlans = pgTable(
  'store_pricing_plans',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    tier: varchar('tier', { length: 64 }).notNull(),
    priceMonthlyCents: bigint('price_monthly_cents', { mode: 'bigint' }).notNull(),
    priceMonthlyFormatted: varchar('price_monthly_formatted', { length: 32 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    billingInterval: varchar('billing_interval', { length: 32 }).notNull().default('monthly'),
    description: text('description').notNull(),
    features: jsonb('features').$type<string[]>().notNull().default([]),
    roadmapFeatures: jsonb('roadmap_features').$type<string[]>().notNull().default([]),
    badge: varchar('badge', { length: 64 }),
    isPopular: boolean('is_popular').notNull().default(false),
    status: varchar('status', { length: 32 }).notNull().default('AVAILABLE'),
    ctaText: varchar('cta_text', { length: 64 }).notNull(),
    ctaAction: varchar('cta_action', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  }
);

// Type definitions
export type Reviewer = typeof reviewers.$inferSelect;
export type NewReviewer = typeof reviewers.$inferInsert;

export type ReviewerSession = typeof reviewerSessions.$inferSelect;
export type NewReviewerSession = typeof reviewerSessions.$inferInsert;

export type UserInvitation = typeof userInvitations.$inferSelect;
export type NewUserInvitation = typeof userInvitations.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type PendingApproval = typeof pendingApprovals.$inferSelect;
export type NewPendingApproval = typeof pendingApprovals.$inferInsert;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;

export type StoreProductRow = typeof storeProducts.$inferSelect;
export type NewStoreProductRow = typeof storeProducts.$inferInsert;

export type StoreOrderRow = typeof storeOrders.$inferSelect;
export type NewStoreOrderRow = typeof storeOrders.$inferInsert;

export type StorePricingPlanRow = typeof storePricingPlans.$inferSelect;
export type NewStorePricingPlanRow = typeof storePricingPlans.$inferInsert;

