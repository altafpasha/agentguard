import { z } from 'zod';

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries?: number;
  maxContextChars?: number;
  rateLimitRpm?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?:
    | { type: 'json_object' }
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          strict?: boolean;
          schema: Record<string, unknown>;
        };
      };
  provider?: {
    require_parameters?: boolean;
  };
}

export interface OpenRouterChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface SemanticAnalysisResult {
  isAdvisoryAnomalyDetected: boolean;
  confidenceScore: number; // 0.0 to 1.0
  intentCategory: string;
  summary: string;
  riskSignals: string[];
  /**
   * Explanatory disclaimer: AI evaluation is strictly advisory and NEVER authoritative
   * for payment authorization.
   */
  authorizationAuthorityDisclaimer: string;
}

// ============================================================================
// OpenRouter Risk Analysis Layer Types & Schemas
// ============================================================================

export type RiskCategory =
  | 'BENIGN'
  | 'INSTRUCTION_OVERRIDE'
  | 'RECIPIENT_REDIRECT'
  | 'MERCHANT_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'SUSPICIOUS_URGENCY'
  | 'FRAUD_INDICATOR'
  | 'OTHER';

export type RiskRecommendation = 'ALLOW' | 'HOLD' | 'BLOCK';

export type RiskAnalysisFailureReason =
  | 'CONFIG_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'MALFORMED_RESPONSE'
  | 'NETWORK_ERROR'
  | 'REQUEST_TOO_LARGE'
  | 'UNKNOWN';

export const riskCategorySchema = z.enum([
  'BENIGN',
  'INSTRUCTION_OVERRIDE',
  'RECIPIENT_REDIRECT',
  'MERCHANT_MISMATCH',
  'AMOUNT_MISMATCH',
  'SUSPICIOUS_URGENCY',
  'FRAUD_INDICATOR',
  'OTHER',
]);

export const riskRecommendationSchema = z.enum(['ALLOW', 'HOLD', 'BLOCK']);

/**
 * Zod validation schema for the structured response from LLM classifiers.
 * Enforces strict typing, value ranges, and rejects missing or out-of-range fields.
 */
export const riskClassifierResponseSchema = z.object({
  riskScore: z.number().min(0.0).max(1.0),
  riskCategory: riskCategorySchema,
  reasons: z.array(z.string().min(1)),
  suspiciousSpans: z.array(z.string()),
  explanation: z.string().min(1),
  recommendation: riskRecommendationSchema,
});

export type RiskClassifierResponse = z.infer<typeof riskClassifierResponseSchema>;

/**
 * Context input for the AI risk classifier.
 * Accepts ONLY the minimum necessary context:
 * - trusted: intended purchase & verified fields
 * - untrusted: product page or tool output text
 */
export interface TrustedPurchaseContext {
  intendedPurchase: string;
  expectedAmount: string | number;
  expectedCurrency: string;
  expectedMerchant: string;
  agentId: string;
}

export interface UntrustedPageContext {
  productPageText?: string;
  toolResultText?: string;
}

export interface RiskAnalysisContext {
  requestId: string;
  policyVersion: number | string;
  trusted: TrustedPurchaseContext;
  untrusted: UntrustedPageContext;
}

/**
 * Standardized outcome from an AI Risk Analyzer Provider.
 * Includes latency, telemetry, sanitized fields, and security disclaimer.
 */
export interface RiskAnalysisOutcome {
  requestId: string;
  modelId: string;
  policyVersion: number | string;
  latencyMs: number;
  status: 'SUCCESS' | 'FAILED';
  failureReason?: RiskAnalysisFailureReason;
  riskScore: number;
  riskCategory: RiskCategory;
  reasons: string[];
  suspiciousSpans: string[];
  explanation: string;
  recommendation: RiskRecommendation;
  rawTokensUsed?: number;
  securityDisclaimer: string;
}

/**
 * Extensible Provider Interface so OpenRouter can be replaced
 * without changing payment authorization code.
 */
export interface IRiskAnalyzerProvider {
  readonly providerName: string;
  readonly modelId: string;
  analyzeRisk(context: RiskAnalysisContext): Promise<RiskAnalysisOutcome>;
  isConfigured(): boolean;
}

/**
 * Mandatory security disclaimer:
 * "Do not claim the classifier detects all prompt injections."
 */
export const RISK_ANALYSIS_SECURITY_DISCLAIMER =
  'AI risk analysis is probabilistic and strictly advisory. It does not guarantee detection of all prompt injections, jailbreaks, or evasion techniques. Deterministic payment authorization rules always take precedence.';
