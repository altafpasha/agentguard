CREATE TABLE IF NOT EXISTS "agent_daily_spend" (
	"agent_id" varchar(128) NOT NULL,
	"spend_date" date NOT NULL,
	"spent_cents" bigint DEFAULT 0 NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_daily_spend_agent_id_spend_date_pk" PRIMARY KEY("agent_id","spend_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"action" varchar(64) DEFAULT 'UNKNOWN' NOT NULL,
	"merchant" varchar(255),
	"amount_cents" bigint,
	"amount_formatted" varchar(32),
	"currency" varchar(3),
	"policy_version" integer,
	"risk_result" jsonb,
	"decision" varchar(32),
	"decision_reasons" jsonb DEFAULT '[]'::jsonb,
	"approval_state" varchar(32) DEFAULT 'NONE',
	"paypal_reference" varchar(128),
	"event_type" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"payload_summary" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "action" varchar(64) DEFAULT 'UNKNOWN' NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "merchant" varchar(255);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "amount_cents" bigint;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "amount_formatted" varchar(32);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "currency" varchar(3);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "policy_version" integer;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "risk_result" jsonb;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "decision" varchar(32);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "decision_reasons" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "approval_state" varchar(32) DEFAULT 'NONE';
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "paypal_reference" varchar(128);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "authorization_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"policy_id" varchar(64) NOT NULL,
	"policy_version" integer NOT NULL,
	"tool" varchar(64) NOT NULL,
	"operation" varchar(64) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"amount_formatted" varchar(32) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"merchant" varchar(255) NOT NULL,
	"decision" varchar(16) NOT NULL,
	"reason" text NOT NULL,
	"violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"authorization_token" varchar(128),
	"is_executed" boolean DEFAULT false NOT NULL,
	"executed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authorization_records_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pending_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"policy_id" varchar(64) NOT NULL,
	"policy_version" integer NOT NULL,
	"tool" varchar(64) NOT NULL,
	"operation" varchar(64) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"amount_formatted" varchar(32) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"merchant" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"risk_score" numeric(4, 3),
	"risk_category" varchar(64),
	"risk_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suspicious_spans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transaction_digest" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" varchar(128),
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"server_authorization_token" varchar(128),
	"token_expires_at" timestamp with time zone,
	"is_consumed" boolean DEFAULT false NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_approvals_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policy_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" varchar(64) NOT NULL,
	"version" integer NOT NULL,
	"max_amount_cents" bigint NOT NULL,
	"max_daily_amount_cents" bigint NOT NULL,
	"approval_threshold_cents" bigint NOT NULL,
	"allowed_currencies" text[] NOT NULL,
	"allowed_merchants" text[],
	"blocked_merchants" text[] DEFAULT '{}' NOT NULL,
	"allowed_tools" text[] NOT NULL,
	"allowed_operations" text[] NOT NULL,
	"velocity_limit" integer DEFAULT 10 NOT NULL,
	"velocity_window_seconds" integer DEFAULT 3600 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"salt" varchar(64) NOT NULL,
	"role" varchar(64) DEFAULT 'REVIEWER' NOT NULL,
	"name" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewers_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviewer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token_hash" varchar(64) NOT NULL,
	"reviewer_id" uuid NOT NULL REFERENCES "reviewers"("id") ON DELETE cascade,
	"reviewer_username" varchar(64) NOT NULL,
	"reviewer_role" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_sessions_session_token_hash_unique" UNIQUE("session_token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_velocity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_events_request_id" ON "audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_events_agent_id" ON "audit_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_events_created_at" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_events_event_type" ON "audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_auth_records_request_id" ON "authorization_records" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_records_token" ON "authorization_records" USING btree ("authorization_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_records_agent" ON "authorization_records" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pending_approvals_request_id" ON "pending_approvals" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_approvals_status" ON "pending_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_approvals_token" ON "pending_approvals" USING btree ("server_authorization_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_approvals_agent" ON "pending_approvals" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_policy_version_unique" ON "policy_definitions" USING btree ("policy_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_policy_active" ON "policy_definitions" USING btree ("policy_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reviewer_sessions_token" ON "reviewer_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviewer_sessions_reviewer_id" ON "reviewer_sessions" USING btree ("reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reviewers_username" ON "reviewers" USING btree ("username");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_velocity_agent_time" ON "transaction_velocity" USING btree ("agent_id","created_at");
