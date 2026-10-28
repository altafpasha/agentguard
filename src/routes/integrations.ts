import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IAuditRepository } from '../audit';
import { IReviewerAuthService } from '../auth/service';
import { createReviewerAuthHook } from '../auth/middleware';
import { EnvConfig } from '../config';
import { Pool } from 'pg';

export interface IntegrationRouteOptions {
  config: EnvConfig;
  auditRepo: IAuditRepository;
  authService?: IReviewerAuthService;
}

export interface IntegrationStatusItem {
  id: string;
  name: string;
  category: 'core' | 'database' | 'payment' | 'ai';
  isConfigured: boolean;
  status: 'connected' | 'disconnected' | 'degraded' | 'not_configured';
  lastCheckedAt: string;
  latencyMs?: number;
  errorMessage?: string;
  details: Record<string, unknown>;
  setupGuide: string;
}

function maskSecret(val?: string): string {
  if (!val || val.length === 0) return 'Not Configured';
  if (val.startsWith('placeholder') || val.includes('placeholder')) return 'Placeholder / Demo';
  if (val.length <= 8) return '••••••••';
  return `${val.substring(0, 4)}••••${val.substring(val.length - 4)}`;
}

function maskUrl(urlStr?: string): string {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr);
    if (parsed.password) {
      parsed.password = '••••••••';
    }
    return parsed.toString();
  } catch {
    return urlStr.replace(/:([^:@]+)@/, ':••••••••@');
  }
}

export const integrationRoutes: FastifyPluginAsync<IntegrationRouteOptions> = async (
  fastify: FastifyInstance,
  options: IntegrationRouteOptions
) => {
  const { config, auditRepo, authService } = options;
  const requireAuth = authService ? createReviewerAuthHook(authService) : null;

  async function checkGateway(overrides?: { logLevel?: string }): Promise<IntegrationStatusItem> {
    const start = Date.now();
    return {
      id: 'gateway',
      name: 'AgentGuard Security Gateway',
      category: 'core',
      isConfigured: true,
      status: 'connected',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: Date.now() - start,
      details: {
        version: '1.0.0',
        environment: config.NODE_ENV,
        host: config.HOST,
        port: config.PORT,
        logLevel: overrides?.logLevel || config.LOG_LEVEL,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      setupGuide: 'Runs locally or in Docker on port 3001. Evaluates deterministic policies and intercepts prompt attacks.',
    };
  }

  async function checkPostgres(overrides?: { connectionUrl?: string }): Promise<IntegrationStatusItem> {
    const rawUrl = overrides?.connectionUrl || config.DATABASE_URL;
    const isConfigured = Boolean(rawUrl && !rawUrl.startsWith('memory:'));

    if (!isConfigured) {
      return {
        id: 'postgres',
        name: 'PostgreSQL Audit & Policy Store',
        category: 'database',
        isConfigured: false,
        status: 'not_configured',
        lastCheckedAt: new Date().toISOString(),
        details: { storageMode: 'In-Memory volatile mode' },
        setupGuide: 'Provide a PostgreSQL 16 connection string in DATABASE_URL.',
      };
    }

    const start = Date.now();
    try {
      let isConnected = false;
      if (overrides?.connectionUrl) {
        const testPool = new Pool({
          connectionString: overrides.connectionUrl,
          connectionTimeoutMillis: 5000,
        });
        try {
          await testPool.query('SELECT 1');
          isConnected = true;
        } finally {
          await testPool.end().catch(() => {});
        }
      } else {
        isConnected = await auditRepo.healthCheck();
      }
      const latencyMs = Date.now() - start;

      return {
        id: 'postgres',
        name: 'PostgreSQL Audit & Policy Store',
        category: 'database',
        isConfigured: true,
        status: isConnected ? 'connected' : 'disconnected',
        lastCheckedAt: new Date().toISOString(),
        latencyMs,
        details: {
          connectionUrl: maskUrl(rawUrl),
          durableStorage: isConnected,
        },
        setupGuide: 'Ensure PostgreSQL container is running on the docker network or accessible via host:port.',
      };
    } catch (err: any) {
      return {
        id: 'postgres',
        name: 'PostgreSQL Audit & Policy Store',
        category: 'database',
        isConfigured: true,
        status: 'disconnected',
        lastCheckedAt: new Date().toISOString(),
        errorMessage: err.message,
        details: {
          connectionUrl: maskUrl(rawUrl),
        },
        setupGuide: 'Check PostgreSQL credentials and network connectivity.',
      };
    }
  }

  async function checkPayPal(overrides?: {
    clientId?: string;
    clientSecret?: string;
    apiBaseUrl?: string;
    environment?: string;
  }): Promise<IntegrationStatusItem> {
    const clientId = (overrides?.clientId || config.PAYPAL_CLIENT_ID || '').trim();
    const clientSecret = (overrides?.clientSecret || config.PAYPAL_CLIENT_SECRET || '').trim();
    const environment = overrides?.environment || config.PAYPAL_ENVIRONMENT || 'sandbox';
    const apiBaseUrl = (overrides?.apiBaseUrl || config.PAYPAL_API_BASE_URL || 'https://api-m.sandbox.paypal.com').trim();

    const isConfigured = Boolean(
      clientId &&
      !clientId.includes('placeholder') &&
      clientSecret &&
      !clientSecret.includes('placeholder')
    );

    const maskedClientId = maskSecret(clientId);

    if (!isConfigured) {
      return {
        id: 'paypal',
        name: 'PayPal Sandbox Adapter',
        category: 'payment',
        isConfigured: false,
        status: 'not_configured',
        lastCheckedAt: new Date().toISOString(),
        details: {
          environment,
          apiBaseUrl,
          clientId: maskedClientId,
          allowLiveExecution: config.PAYPAL_ALLOW_LIVE_EXECUTION,
        },
        setupGuide: 'Register at developer.paypal.com and configure PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.',
      };
    }

    const start = Date.now();
    try {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${apiBaseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - start;

      if (res.ok) {
        return {
          id: 'paypal',
          name: 'PayPal Sandbox Adapter',
          category: 'payment',
          isConfigured: true,
          status: 'connected',
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          details: {
            environment,
            apiBaseUrl,
            clientId: maskedClientId,
            allowLiveExecution: config.PAYPAL_ALLOW_LIVE_EXECUTION,
            oauthValidation: 'PASSED',
          },
          setupGuide: 'Connected to official PayPal Sandbox REST API.',
        };
      } else {
        const errorText = await res.text();
        return {
          id: 'paypal',
          name: 'PayPal Sandbox Adapter',
          category: 'payment',
          isConfigured: true,
          status: 'degraded',
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          errorMessage: `PayPal OAuth responded with HTTP ${res.status}: ${errorText.substring(0, 100)}`,
          details: {
            environment,
            apiBaseUrl,
            clientId: maskedClientId,
            oauthValidation: 'FAILED',
          },
          setupGuide: 'Verify PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET match your PayPal Developer Dashboard app.',
        };
      }
    } catch (err: any) {
      return {
        id: 'paypal',
        name: 'PayPal Sandbox Adapter',
        category: 'payment',
        isConfigured: true,
        status: 'disconnected',
        lastCheckedAt: new Date().toISOString(),
        errorMessage: err.name === 'AbortError' ? 'Connection timed out' : err.message,
        details: {
          environment,
          apiBaseUrl,
          clientId: maskedClientId,
        },
        setupGuide: 'Check internet access and DNS resolution from your server.',
      };
    }
  }

  async function checkOpenRouter(overrides?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }): Promise<IntegrationStatusItem> {
    const apiKey = (overrides?.apiKey || config.OPENROUTER_API_KEY || '').trim();
    const model = (overrides?.model || config.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet').trim();
    const baseUrl = (overrides?.baseUrl || config.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').trim();

    const isConfigured = Boolean(
      apiKey &&
      !apiKey.includes('placeholder')
    );

    const maskedKey = maskSecret(apiKey);

    if (!isConfigured) {
      return {
        id: 'openrouter',
        name: 'OpenRouter AI Risk Analyzer',
        category: 'ai',
        isConfigured: false,
        status: 'not_configured',
        lastCheckedAt: new Date().toISOString(),
        details: {
          model,
          apiKey: maskedKey,
          baseUrl,
        },
        setupGuide: 'Obtain an API key from openrouter.ai and set OPENROUTER_API_KEY in .env.',
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://agentguard.dev',
          'X-Title': 'AgentGuard Security Gateway',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - start;

      if (res.ok) {
        return {
          id: 'openrouter',
          name: 'OpenRouter AI Risk Analyzer',
          category: 'ai',
          isConfigured: true,
          status: 'connected',
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          details: {
            model,
            apiKey: maskedKey,
            apiValidation: 'PASSED',
            baseUrl,
          },
          setupGuide: 'Connected to OpenRouter API. Evaluates secondary LLM contextual risks.',
        };
      } else {
        return {
          id: 'openrouter',
          name: 'OpenRouter AI Risk Analyzer',
          category: 'ai',
          isConfigured: true,
          status: 'degraded',
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          errorMessage: `OpenRouter responded with HTTP ${res.status}`,
          details: {
            model,
            apiKey: maskedKey,
            baseUrl,
          },
          setupGuide: 'Verify your OpenRouter API key has sufficient credits and valid permissions.',
        };
      }
    } catch (err: any) {
      return {
        id: 'openrouter',
        name: 'OpenRouter AI Risk Analyzer',
        category: 'ai',
        isConfigured: true,
        status: 'disconnected',
        lastCheckedAt: new Date().toISOString(),
        errorMessage: err.name === 'AbortError' ? 'Connection timed out' : err.message,
        details: {
          model,
          apiKey: maskedKey,
          baseUrl,
        },
        setupGuide: 'Verify outbound HTTPS connectivity to openrouter.ai.',
      };
    }
  }

  /**
   * Get overall integrations health and status
   */
  fastify.get(
    '/api/v1/integrations/status',
    { preHandler: requireAuth ? [requireAuth] : [] },
    async (_req, reply) => {
      const [gateway, postgres, paypal, openrouter] = await Promise.all([
        checkGateway(),
        checkPostgres(),
        checkPayPal(),
        checkOpenRouter(),
      ]);

      return reply.status(200).send({
        timestamp: new Date().toISOString(),
        integrations: [gateway, postgres, paypal, openrouter],
      });
    }
  );

  /**
   * Test specific integration live (supports optional credentials in body)
   */
  fastify.post(
    '/api/v1/integrations/test/:id',
    { preHandler: requireAuth ? [requireAuth] : [] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body as Record<string, any>) || {};

      let result: IntegrationStatusItem;
      if (id === 'gateway') {
        result = await checkGateway(body);
      } else if (id === 'postgres') {
        result = await checkPostgres(body);
      } else if (id === 'paypal') {
        result = await checkPayPal(body);
      } else if (id === 'openrouter') {
        result = await checkOpenRouter(body);
      } else {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: `Integration '${id}' is not supported.`,
        });
      }

      return reply.status(200).send({
        message: `Tested integration '${id}'. Status: ${result.status}`,
        integration: result,
      });
    }
  );

  /**
   * Save and apply new integration configuration
   */
  fastify.post(
    '/api/v1/integrations/configure/:id',
    { preHandler: requireAuth ? [requireAuth] : [] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body as Record<string, any>) || {};

      if (id === 'paypal') {
        if (body.clientId) {
          config.PAYPAL_CLIENT_ID = String(body.clientId).trim();
          process.env.PAYPAL_CLIENT_ID = config.PAYPAL_CLIENT_ID;
        }
        if (body.clientSecret) {
          config.PAYPAL_CLIENT_SECRET = String(body.clientSecret).trim();
          process.env.PAYPAL_CLIENT_SECRET = config.PAYPAL_CLIENT_SECRET;
        }
        if (body.environment) {
          config.PAYPAL_ENVIRONMENT = body.environment === 'live' ? 'live' as any : 'sandbox';
          process.env.PAYPAL_ENVIRONMENT = config.PAYPAL_ENVIRONMENT;
        }
        if (body.apiBaseUrl) {
          config.PAYPAL_API_BASE_URL = String(body.apiBaseUrl).trim();
          process.env.PAYPAL_API_BASE_URL = config.PAYPAL_API_BASE_URL;
        }
        const updated = await checkPayPal();
        return reply.status(200).send({
          message: 'PayPal integration configuration updated and verified.',
          integration: updated,
        });
      } else if (id === 'openrouter') {
        if (body.apiKey) {
          config.OPENROUTER_API_KEY = String(body.apiKey).trim();
          process.env.OPENROUTER_API_KEY = config.OPENROUTER_API_KEY;
        }
        if (body.model) {
          config.OPENROUTER_MODEL = String(body.model).trim();
          process.env.OPENROUTER_MODEL = config.OPENROUTER_MODEL;
        }
        if (body.baseUrl) {
          config.OPENROUTER_BASE_URL = String(body.baseUrl).trim();
          process.env.OPENROUTER_BASE_URL = config.OPENROUTER_BASE_URL;
        }
        const updated = await checkOpenRouter();
        return reply.status(200).send({
          message: 'OpenRouter AI integration configuration updated and verified.',
          integration: updated,
        });
      } else if (id === 'postgres') {
        if (body.connectionUrl) {
          config.DATABASE_URL = String(body.connectionUrl).trim();
          process.env.DATABASE_URL = config.DATABASE_URL;
        }
        const updated = await checkPostgres();
        return reply.status(200).send({
          message: 'PostgreSQL integration configuration updated and verified.',
          integration: updated,
        });
      } else if (id === 'gateway') {
        if (body.logLevel) {
          config.LOG_LEVEL = body.logLevel;
          process.env.LOG_LEVEL = config.LOG_LEVEL;
        }
        const updated = await checkGateway();
        return reply.status(200).send({
          message: 'Gateway configuration updated.',
          integration: updated,
        });
      }

      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: `Integration '${id}' is not supported.`,
      });
    }
  );
};
