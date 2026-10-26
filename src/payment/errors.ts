import { AppError } from '../common/errors';

/**
 * Thrown when PayPal OAuth token acquisition fails
 */
export class PayPalAuthError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, 'PAYPAL_AUTH_ERROR', details);
  }
}

/**
 * Thrown when PayPal Orders API returns an error response
 */
export class PayPalApiError extends AppError {
  public readonly paypalIssue?: string;

  constructor(message: string, statusCode = 502, details?: unknown, paypalIssue?: string) {
    super(message, statusCode, 'PAYPAL_API_ERROR', details);
    this.paypalIssue = paypalIssue;
  }
}

/**
 * Thrown when a network timeout occurs while communicating with PayPal
 */
export class PayPalNetworkError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 504, 'PAYPAL_NETWORK_TIMEOUT', details);
  }
}

/**
 * Thrown when order state reconciliation fails or detects a mismatch
 */
export class PayPalReconciliationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, 'PAYPAL_RECONCILIATION_ERROR', details);
  }
}

/**
 * Thrown when security constraints are violated (e.g. attempting production endpoint in sandbox-only build)
 */
export class PayPalSecurityError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'PAYPAL_SECURITY_VIOLATION', details);
  }
}
