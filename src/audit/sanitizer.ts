const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'clientsecret',
  'authorization',
  'cardnumber',
  'cvv',
  'humanapprovaltoken',
  'serverauthorizationtoken',
  'sessiontoken',
  'refreshtoken',
]);

function isSensitiveKey(lowerKey: string): boolean {
  if (SENSITIVE_KEYS.has(lowerKey)) return true;
  return (
    lowerKey.includes('token') ||
    lowerKey.includes('secret') ||
    lowerKey.includes('password') ||
    lowerKey.includes('apikey') ||
    lowerKey.includes('credential') ||
    lowerKey.includes('authassertion')
  );
}

/**
 * Recursively sanitize objects so secrets, tokens, and credentials are never stored in plaintext
 */
export function sanitizeAuditPayload(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  if (Array.isArray(obj)) {
    return { items: obj.map((item) => sanitizeAuditPayload(item)) };
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, '');

    if (isSensitiveKey(lowerKey)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string' && (value.startsWith('auth_') || value.startsWith('Bearer '))) {
      result[key] = `${value.slice(0, 8)}...[REDACTED]`;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeAuditPayload(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) => (typeof v === 'object' ? sanitizeAuditPayload(v) : v));
    } else {
      result[key] = value;
    }
  }

  return result;
}
