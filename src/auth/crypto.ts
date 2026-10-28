import * as crypto from 'crypto';

/**
 * Hash a password using scrypt and a cryptographic salt
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

/**
 * Verify a candidate password against the stored hash and salt in constant time
 */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const candidateHash = crypto.scryptSync(password, salt, 64);
    const storedBuffer = Buffer.from(storedHash, 'hex');

    if (candidateHash.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateHash, storedBuffer);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random session token
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a session token using SHA-256 for safe database storage
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically secure random invitation token
 */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash an invitation token using SHA-256 for safe database storage
 */
export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface TransactionDigestInput {
  requestId: string;
  agentId: string;
  tool: string;
  operation: string;
  amountCents: bigint | string | number;
  currency: string;
  merchant: string;
  policyVersion: number | string;
}

/**
 * Compute an immutable SHA-256 digest of critical transaction fields.
 * Binds approval cryptographically to the exact transaction parameters.
 */
export function createTransactionDigest(input: TransactionDigestInput): string {
  const canonical = [
    input.requestId.trim(),
    input.agentId.trim(),
    input.tool.trim(),
    input.operation.trim(),
    input.amountCents.toString(),
    input.currency.trim().toUpperCase(),
    input.merchant.trim().toLowerCase(),
    input.policyVersion.toString(),
  ].join('|');

  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Enforce strong password policy:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit or special character
 */
export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number or special character.' };
  }
  return { valid: true };
}
