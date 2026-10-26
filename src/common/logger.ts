import type { FastifyServerOptions } from 'fastify';

/**
 * List of object paths and headers to automatically redact in logs.
 * This guarantees secrets, authorization headers, and payment keys
 * are never printed to stdout or written to logs.
 */
export const SENSITIVE_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers["paypal-auth-assertion"]',
  'body.paypalClientSecret',
  'body.openrouterApiKey',
  'body.clientSecret',
  'body.apiKey',
  'body.secret',
  'body.password',
  'body.card_number',
  'body.cvv',
  '*.paypalClientSecret',
  '*.openrouterApiKey',
  '*.clientSecret',
  '*.apiKey',
  '*.secret',
  '*.password',
  '*.token',
  '*.humanApprovalToken',
];

/**
 * Build Fastify logger options with redaction
 */
export function getLoggerOptions(logLevel = 'info'): NonNullable<FastifyServerOptions['logger']> {
  return {
    level: logLevel,
    redact: {
      paths: SENSITIVE_LOG_PATHS,
      censor: '[REDACTED_SECRET]',
    },
    serializers: {
      req(req: { method?: string; url?: string; routeOptions?: { url?: string }; params?: unknown; headers: Record<string, unknown> }) {
        return {
          method: req.method,
          url: req.url,
          path: req.routeOptions?.url ?? req.url,
          parameters: req.params,
          headers: {
            host: req.headers.host,
            'user-agent': req.headers['user-agent'],
            'x-request-id': req.headers['x-request-id'],
          },
        };
      },
    },
  };
}
