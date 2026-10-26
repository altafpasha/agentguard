/**
 * Base Application Error
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, errorCode = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Request validation failure (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Prompt injection or adversarial attack detected (403)
 */
export class InjectionDetectedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 403, 'PROMPT_INJECTION_DETECTED', details);
  }
}

/**
 * Deterministic policy violation (403)
 */
export class PolicyViolationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 403, 'POLICY_VIOLATION', details);
  }
}

/**
 * Human approval is required before proceeding (202 or 403)
 */
export class HumanApprovalRequiredError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 202, 'HUMAN_APPROVAL_REQUIRED', details);
  }
}

/**
 * Resource not found (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Authentication failure or missing credentials (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

/**
 * State conflict or duplicate action (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * PayPal Adapter Error or Not Implemented (501 or 502)
 */
export class PaymentAdapterError extends AppError {
  constructor(message: string, statusCode = 502, errorCode = 'PAYMENT_ADAPTER_ERROR', details?: unknown) {
    super(message, statusCode, errorCode, details);
  }
}

/**
 * Explicit error indicating payment execution is guarded pending foundation verification
 */
export class PaymentExecutionNotEnabledError extends AppError {
  constructor(
    message = 'PayPal sandbox payment execution is pending foundation verification and live credentials. Request passed all security checks but was not dispatched to external payment processor.'
  ) {
    super(message, 501, 'PAYMENT_EXECUTION_NOT_ENABLED');
  }
}

/**
 * OpenRouter AI provider error (502)
 */
export class AIProviderError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, 'AI_PROVIDER_ERROR', details);
  }
}
