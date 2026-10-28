import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env if present (does not fail if absent)
dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Database
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:54329/agentguard_dev'),

  // OpenRouter AI Provider
  OPENROUTER_API_KEY: z.string().default('sk-or-v1-dev-placeholder'),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-3.5-sonnet'),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  OPENROUTER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  OPENROUTER_MAX_CONTEXT_CHARS: z.coerce.number().int().min(500).max(100000).default(16000),
  OPENROUTER_RATE_LIMIT_RPM: z.coerce.number().int().min(1).max(1000).default(20),
  POLICY_REQUIRE_AI_RISK_ANALYSIS: z
    .preprocess((val) => val === 'true' || val === true, z.boolean())
    .default(false),

  // PayPal Sandbox Adapter
  PAYPAL_CLIENT_ID: z.string().default('sandbox_client_id_placeholder'),
  PAYPAL_CLIENT_SECRET: z.string().default('sandbox_client_secret_placeholder'),
  PAYPAL_ENVIRONMENT: z.literal('sandbox').default('sandbox'),
  PAYPAL_API_BASE_URL: z.string().url().default('https://api-m.sandbox.paypal.com'),
  PAYPAL_ALLOW_LIVE_EXECUTION: z
    .preprocess((val) => val === 'true' || val === true, z.boolean())
    .default(false),
  PAYPAL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),

  // Razorpay Payment Adapter
  RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_secret_placeholder'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_webhook_secret_placeholder'),
  RAZORPAY_ALLOW_LIVE_EXECUTION: z
    .preprocess((val) => val === 'true' || val === true, z.boolean())
    .default(false),

  // Policy Engine Defaults
  POLICY_MAX_TRANSACTION_AMOUNT: z.coerce.number().positive().default(50.0),
  POLICY_MAX_DAILY_AMOUNT: z.coerce.number().positive().default(200.0),
  POLICY_ALLOWED_CURRENCIES: z
    .string()
    .default('USD,EUR,GBP,INR')
    .transform((val) => val.split(',').map((s) => s.trim().toUpperCase())),
  POLICY_REQUIRE_HUMAN_APPROVAL_THRESHOLD: z.coerce.number().positive().default(25.0),
  POLICY_RECIPIENT_DENYLIST: z
    .string()
    .default('')
    .transform((val) => (val ? val.split(',').map((s) => s.trim().toLowerCase()) : [])),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validate and load configuration from environment or provided overrides
 */
export function loadConfig(overrides: Record<string, unknown> = {}): EnvConfig {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(merged);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((i) => `Field "${i.path.join('.')}" : ${i.message}`)
      .join('\n');
    throw new Error(`AgentGuard Configuration Error:\n${errorDetails}`);
  }

  return parsed.data;
}

/**
 * Helper to mask sensitive strings for safe diagnostic logging
 */
export function maskSecret(secret: string | undefined): string {
  if (!secret) return '[EMPTY]';
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Export safe diagnostic representation of configuration
 */
export function getSanitizedConfig(config: EnvConfig): Record<string, unknown> {
  return {
    PORT: config.PORT,
    HOST: config.HOST,
    NODE_ENV: config.NODE_ENV,
    LOG_LEVEL: config.LOG_LEVEL,
    DATABASE_URL: config.DATABASE_URL.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:[REDACTED]@'),
    OPENROUTER_API_KEY: maskSecret(config.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: config.OPENROUTER_MODEL,
    OPENROUTER_BASE_URL: config.OPENROUTER_BASE_URL,
    OPENROUTER_TIMEOUT_MS: config.OPENROUTER_TIMEOUT_MS,
    OPENROUTER_MAX_RETRIES: config.OPENROUTER_MAX_RETRIES,
    OPENROUTER_MAX_CONTEXT_CHARS: config.OPENROUTER_MAX_CONTEXT_CHARS,
    OPENROUTER_RATE_LIMIT_RPM: config.OPENROUTER_RATE_LIMIT_RPM,
    POLICY_REQUIRE_AI_RISK_ANALYSIS: config.POLICY_REQUIRE_AI_RISK_ANALYSIS,
    PAYPAL_CLIENT_ID: maskSecret(config.PAYPAL_CLIENT_ID),
    PAYPAL_CLIENT_SECRET: maskSecret(config.PAYPAL_CLIENT_SECRET),
    PAYPAL_ENVIRONMENT: config.PAYPAL_ENVIRONMENT,
    PAYPAL_API_BASE_URL: config.PAYPAL_API_BASE_URL,
    PAYPAL_ALLOW_LIVE_EXECUTION: config.PAYPAL_ALLOW_LIVE_EXECUTION,
    PAYPAL_TIMEOUT_MS: config.PAYPAL_TIMEOUT_MS,
    RAZORPAY_KEY_ID: maskSecret(config.RAZORPAY_KEY_ID),
    RAZORPAY_KEY_SECRET: maskSecret(config.RAZORPAY_KEY_SECRET),
    RAZORPAY_ALLOW_LIVE_EXECUTION: config.RAZORPAY_ALLOW_LIVE_EXECUTION,
    POLICY_MAX_TRANSACTION_AMOUNT: config.POLICY_MAX_TRANSACTION_AMOUNT,
    POLICY_MAX_DAILY_AMOUNT: config.POLICY_MAX_DAILY_AMOUNT,
    POLICY_ALLOWED_CURRENCIES: config.POLICY_ALLOWED_CURRENCIES,
    POLICY_REQUIRE_HUMAN_APPROVAL_THRESHOLD: config.POLICY_REQUIRE_HUMAN_APPROVAL_THRESHOLD,
    POLICY_RECIPIENT_DENYLIST: config.POLICY_RECIPIENT_DENYLIST,
  };
}

let cachedConfig: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}
