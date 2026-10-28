-- Migration: 0002_auth_settings.sql
-- Add revocation columns to user_invitations
ALTER TABLE "user_invitations" ADD COLUMN IF NOT EXISTS "revoked" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
--> statement-breakpoint

-- Create auth_settings table
CREATE TABLE IF NOT EXISTS "auth_settings" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"allow_public_signup" boolean DEFAULT false NOT NULL,
	"default_user_role" varchar(32) DEFAULT 'VIEWER' NOT NULL,
	"require_email_verification" boolean DEFAULT false NOT NULL,
	"invite_only" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(128)
);
--> statement-breakpoint
INSERT INTO "auth_settings" ("id", "allow_public_signup", "default_user_role", "require_email_verification", "invite_only")
VALUES ('default', false, 'VIEWER', false, true)
ON CONFLICT ("id") DO NOTHING;
