-- Migration: 0001_auth_self_host.sql
-- Add email, status, and last_login_at to reviewers table
ALTER TABLE "reviewers" ADD COLUMN IF NOT EXISTS "email" varchar(255);
--> statement-breakpoint
ALTER TABLE "reviewers" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "reviewers" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reviewers_email" ON "reviewers" ("email");
--> statement-breakpoint

-- Create user_invitations table
CREATE TABLE IF NOT EXISTS "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(32) DEFAULT 'ANALYST' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid REFERENCES "reviewers"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_invitations_token" ON "user_invitations" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_invitations_email" ON "user_invitations" ("email");
