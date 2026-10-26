/**
 * Supported payment currencies (ISO 4217 standard)
 */
export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';

/**
 * Standard security threat severity levels
 */
export type ThreatLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Deterministic policy decision outcomes
 */
export type PolicyDecisionType = 'ALLOW' | 'DENY' | 'REQUIRE_HUMAN_APPROVAL';

/**
 * Standard API error response format (RFC 7807 aligned)
 */
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  requestId: string;
  timestamp: string;
  details?: unknown;
}

/**
 * Payment intent types
 */
export type PaymentIntent = 'CAPTURE' | 'AUTHORIZE';

/**
 * Recipient details for payment
 */
export interface PaymentRecipient {
  email: string;
  name?: string;
  merchantId?: string;
}

/**
 * Payment request payload structure
 */
export interface PaymentOrderRequest {
  agentId: string;
  requestId?: string;
  amount: number;
  currency: string;
  recipient: PaymentRecipient;
  intent?: PaymentIntent;
  description: string;
  promptContext?: string;
  humanApprovalToken?: string;
  metadata?: Record<string, unknown>;
}
