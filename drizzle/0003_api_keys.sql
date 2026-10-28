-- Migration: 0003_api_keys.sql
-- Create api_keys table for external SDK authentication and application scoping
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"key_prefix" varchar(32) NOT NULL,
	"key_hash" varchar(64) NOT NULL UNIQUE,
	"workspace_id" varchar(64) DEFAULT 'default' NOT NULL,
	"role" varchar(32) DEFAULT 'CLIENT' NOT NULL,
	"permissions" jsonb DEFAULT '["evaluate"]'::jsonb NOT NULL,
	"rate_limit_rpm" integer DEFAULT 600 NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_api_keys_hash" ON "api_keys" ("key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_workspace" ON "api_keys" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_prefix" ON "api_keys" ("key_prefix");
