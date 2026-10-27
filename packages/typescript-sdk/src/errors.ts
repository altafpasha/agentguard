export class AgentGuardError extends Error {
  public readonly statusCode?: number;
  public readonly errorCode?: string;
  public readonly requestId?: string;
  public readonly details?: unknown;

  public get status(): number | undefined {
    return this.statusCode;
  }

  public get code(): string | undefined {
    return this.errorCode;
  }

  constructor(message: string, options: { statusCode?: number; errorCode?: string; requestId?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'AgentGuardError';
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
    this.requestId = options.requestId;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AgentGuardAuthenticationError extends AgentGuardError {
  constructor(message = 'Authentication failed. Please verify your AgentGuard API key.', requestId?: string, details?: unknown) {
    super(message, { statusCode: 401, errorCode: 'AUTHENTICATION_FAILED', requestId, details });
    this.name = 'AgentGuardAuthenticationError';
  }
}

export class AgentGuardForbiddenError extends AgentGuardError {
  constructor(message = 'Permission denied. The API key lacks the necessary permissions.', requestId?: string, details?: unknown) {
    super(message, { statusCode: 403, errorCode: 'FORBIDDEN', requestId, details });
    this.name = 'AgentGuardForbiddenError';
  }
}

export class AgentGuardValidationError extends AgentGuardError {
  constructor(message = 'Invalid request parameters.', requestId?: string, details?: unknown) {
    super(message, { statusCode: 400, errorCode: 'VALIDATION_ERROR', requestId, details });
    this.name = 'AgentGuardValidationError';
  }
}

export class AgentGuardNotFoundError extends AgentGuardError {
  constructor(message = 'Requested resource not found.', requestId?: string, details?: unknown) {
    super(message, { statusCode: 404, errorCode: 'NOT_FOUND', requestId, details });
    this.name = 'AgentGuardNotFoundError';
  }
}

export class AgentGuardRateLimitError extends AgentGuardError {
  constructor(message = 'Rate limit exceeded. Please back off before retrying.', requestId?: string, details?: unknown) {
    super(message, { statusCode: 429, errorCode: 'RATE_LIMIT_EXCEEDED', requestId, details });
    this.name = 'AgentGuardRateLimitError';
  }
}

export class AgentGuardTimeoutError extends AgentGuardError {
  constructor(message = 'AgentGuard evaluation request timed out.', requestId?: string) {
    super(message, { statusCode: 408, errorCode: 'TIMEOUT', requestId });
    this.name = 'AgentGuardTimeoutError';
  }
}

export class AgentGuardGatewayError extends AgentGuardError {
  constructor(message = 'AgentGuard gateway error or service unavailable.', statusCode = 500, requestId?: string, details?: unknown) {
    super(message, { statusCode, errorCode: 'GATEWAY_ERROR', requestId, details });
    this.name = 'AgentGuardGatewayError';
  }
}

export function parseErrorResponse(statusCode: number, body: any, requestId?: string): AgentGuardError {
  const message = body?.message || body?.error || `AgentGuard request failed with HTTP ${statusCode}`;
  const errorCode = body?.errorCode || body?.error;
  const details = body?.details;

  if (statusCode === 401) {
    return new AgentGuardAuthenticationError(message, requestId, details);
  }
  if (statusCode === 403) {
    return new AgentGuardForbiddenError(message, requestId, details);
  }
  if (statusCode === 400) {
    return new AgentGuardValidationError(message, requestId, details);
  }
  if (statusCode === 404) {
    return new AgentGuardNotFoundError(message, requestId, details);
  }
  if (statusCode === 429) {
    return new AgentGuardRateLimitError(message, requestId, details);
  }
  if (statusCode >= 500) {
    return new AgentGuardGatewayError(message, statusCode, requestId, details);
  }
  return new AgentGuardError(message, { statusCode, errorCode, requestId, details });
}
