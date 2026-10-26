const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'clientsecret',
  'client_secret',
  'authorization',
  'card_number',
  'cvv',
  'humanapprovaltoken',
  'human_approval_token',
]);

/**
 * Recursively sanitize objects so secrets and credentials are redacted before audit storage
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

    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = '[REDACTED]';
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
