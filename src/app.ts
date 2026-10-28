import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'crypto';
import { EnvConfig, getConfig } from './config';
import { getLoggerOptions } from './common/logger';
import { AppError } from './common/errors';
import { InjectionScanner, defaultScanner } from './scanner';
import { PolicyEngine } from './policy';
import { IAuditRepository, PostgresAuditRepository } from './audit';
import { IPayPalSandboxAdapter, PayPalSandboxAdapter } from './payment';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import {
  healthRoutes,
  scanRoutes,
  policyRoutes,
  paymentRoutes,
  auditRoutes,
  authRoutes,
  userRoutes,
  integrationRoutes,
  approvalRoutes,
  storeRoutes,
  razorpayRoutes,
  scenariosRoutes,
  apiKeyRoutes,
  evaluateRoutes,
} from './routes';
import { IRiskAnalyzerProvider, OpenRouterRiskAnalyzer } from './ai';
import { IReviewerAuthService, PostgresReviewerAuthService, MemoryReviewerAuthService } from './auth';
import { IApiKeyService, PostgresApiKeyService, MemoryApiKeyService } from './auth/api-key-service';
import { HumanApprovalService, PostgresApprovalStore, MemoryApprovalStore } from './approval';
import { MemoryAuditRepository } from './audit/memory-audit-repo';
import { seedInitialData } from './common/seed';
import { IStoreRepository, PostgresStoreRepository, MemoryStoreRepository } from './store';
import { IRazorpayAdapter, RazorpayAdapter } from './payment/razorpay-client';

export interface AppDependencies {
  config?: EnvConfig;
  scanner?: InjectionScanner;
  policyEngine?: PolicyEngine;
  auditRepo?: IAuditRepository;
  paymentAdapter?: IPayPalSandboxAdapter;
  razorpayAdapter?: IRazorpayAdapter;
  aiRiskAnalyzer?: IRiskAnalyzerProvider;
  authService?: IReviewerAuthService;
  apiKeyService?: IApiKeyService;
  approvalService?: HumanApprovalService;
  storeRepo?: IStoreRepository;
}

export function buildApp(dependencies: AppDependencies = {}): FastifyInstance {
  const config = dependencies.config ?? getConfig();

  const app = fastify({
    bodyLimit: 524288, // 512 KB payload limit (mitigates memory exhaustion and payload abuse)
    logger: getLoggerOptions(config.LOG_LEVEL),
    genReqId: (req) => {
      const headerReqId = req.headers['x-request-id'];
      if (typeof headerReqId === 'string' && headerReqId.trim().length > 0) {
        return headerReqId;
      }
      return randomUUID();
    },
  });

  // Allow empty JSON bodies gracefully without throwing FST_ERR_CTP_EMPTY_JSON_BODY
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim().length === 0)) {
      return done(null, {});
    }
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Register CORS
  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Reviewer-Token', 'X-API-Key'],
    exposedHeaders: ['X-Request-Id'],
  });

  // Register OpenAPI / Swagger Documentation
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'AgentGuard Security Gateway API',
        description: 'Autonomous AI-Agent Security Gateway & Deterministic Policy Enforcement for PayPal Transactions',
        version: '1.0.0',
        contact: {
          name: 'AgentGuard Security Team',
          url: 'https://github.com/altafpasha/agentguard',
        },
      },
      servers: [
        { url: `http://localhost:${config.PORT}`, description: 'Local Gateway' },
      ],
      tags: [
        { name: 'Storefront', description: 'Storefront catalog, server-calculated checkout, and PayPal order return verification' },
        { name: 'Payments', description: 'Guarded payment initiation, sandbox order creation, and capture' },
        { name: 'Approvals', description: 'Human-in-the-Loop review queue, token issuance, and replay protection' },
        { name: 'Policies', description: 'Deterministic policy limits, daily spend caps, and merchant allow/denylists' },
        { name: 'Audit', description: 'Tamper-evident forensic audit logs and event search' },
        { name: 'Health', description: 'System health and sandbox readiness check' },
      ],
    },
  });

  app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
  });

  // Security Headers and Request ID Echo Hook
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('x-xss-protection', '1; mode=block');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');

    if (request.url.startsWith('/api/')) {
      reply.header('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      reply.header('pragma', 'no-cache');
    }
  });

  // Initialize service dependencies
  const scanner = dependencies.scanner ?? defaultScanner;
  const policyEngine = dependencies.policyEngine ?? PolicyEngine.fromConfig(config);
  const auditRepo =
    dependencies.auditRepo ?? new PostgresAuditRepository(config.DATABASE_URL);

  const isTestOrMemory =
    auditRepo instanceof MemoryAuditRepository ||
    config.NODE_ENV === 'test' ||
    config.DATABASE_URL.startsWith('memory:');

  const authService =
    dependencies.authService ??
    (isTestOrMemory
      ? new MemoryReviewerAuthService()
      : new PostgresReviewerAuthService(config.DATABASE_URL));

  const apiKeyService =
    dependencies.apiKeyService ??
    (isTestOrMemory
      ? new MemoryApiKeyService()
      : new PostgresApiKeyService(config.DATABASE_URL));

  const approvalService =
    dependencies.approvalService ??
    new HumanApprovalService({
      store: isTestOrMemory
        ? new MemoryApprovalStore()
        : new PostgresApprovalStore(config.DATABASE_URL),
      policyEngine,
      auditRepo,
    });

  // Wire approval store to policyEngine so threshold evaluation validates tokens directly
  policyEngine.setApprovalStore(approvalService.getStore());

  const storeRepo =
    dependencies.storeRepo ??
    (isTestOrMemory
      ? new MemoryStoreRepository()
      : new PostgresStoreRepository(config.DATABASE_URL));

  const paymentAdapter =
    dependencies.paymentAdapter ??
    new PayPalSandboxAdapter(
      {
        clientId: config.PAYPAL_CLIENT_ID,
        clientSecret: config.PAYPAL_CLIENT_SECRET,
        environment: config.PAYPAL_ENVIRONMENT,
        apiBaseUrl: config.PAYPAL_API_BASE_URL,
        timeoutMs: config.PAYPAL_TIMEOUT_MS,
      },
      config.PAYPAL_ALLOW_LIVE_EXECUTION,
      policyEngine.getAuthorizationEngine(),
      approvalService
    );

  const razorpayAdapter =
    dependencies.razorpayAdapter ??
    new RazorpayAdapter({
      keyId: config.RAZORPAY_KEY_ID,
      keySecret: config.RAZORPAY_KEY_SECRET,
      webhookSecret: config.RAZORPAY_WEBHOOK_SECRET,
      allowLiveExecution: config.RAZORPAY_ALLOW_LIVE_EXECUTION,
    });

  const aiRiskAnalyzer =
    dependencies.aiRiskAnalyzer ??
    new OpenRouterRiskAnalyzer({
      apiKey: config.OPENROUTER_API_KEY,
      model: config.OPENROUTER_MODEL,
      baseUrl: config.OPENROUTER_BASE_URL,
      timeoutMs: config.OPENROUTER_TIMEOUT_MS,
      maxRetries: config.OPENROUTER_MAX_RETRIES,
      maxContextChars: config.OPENROUTER_MAX_CONTEXT_CHARS,
      rateLimitRpm: config.OPENROUTER_RATE_LIMIT_RPM,
    });

  // Only seed sample demo data when explicitly enabled via SEED_DEMO_DATA=true.
  // In self-hosted production installations, the system begins clean with no precreated users or fake events.
  if (process.env.SEED_DEMO_DATA === 'true') {
    void seedInitialData(auditRepo, approvalService, authService).catch(() => {});
  }

  // Centralized Error Handler
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id as string;
    const timestamp = new Date().toISOString();

    const err = error as { statusCode?: number; errorCode?: string; message?: string; validation?: unknown; details?: unknown };

    request.log.error({
      err: error,
      requestId,
      statusCode: err.statusCode ?? 500,
    });

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.errorCode,
        message: error.message,
        requestId,
        timestamp,
        details: error.details,
      });
    }

    // Fastify schema validation error
    if (err.validation !== undefined) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'VALIDATION_ERROR',
        message: err.message ?? 'Validation failed',
        requestId,
        timestamp,
        details: err.validation,
      });
    }

    // Unhandled / Internal Server Error
    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500;

    return reply.status(statusCode).send({
      statusCode,
      error: statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
      message: config.NODE_ENV === 'production' && statusCode === 500
        ? 'An unexpected internal error occurred'
        : (err.message ?? 'An unexpected error occurred'),
      requestId,
      timestamp,
    });
  });

  // Centralized 404 Not Found Handler
  app.setNotFoundHandler((request, reply) => {
    const requestId = request.id as string;
    const timestamp = new Date().toISOString();
    return reply.status(404).send({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: `Route ${request.method}:${request.url} not found`,
      requestId,
      timestamp,
    });
  });

  // Register Routes
  app.register(healthRoutes, { auditRepo });
  app.register(scanRoutes, { scanner, auditRepo });
  app.register(authRoutes, { authService });
  app.register(userRoutes, { authService, auditRepo });
  app.register(integrationRoutes, { config, auditRepo, authService });
  app.register(approvalRoutes, { approvalService, authService, apiKeyService });
  app.register(apiKeyRoutes, { apiKeyService, authService, auditRepo });
  app.register(evaluateRoutes, { policyEngine, auditRepo, approvalService, apiKeyService, authService, scanner });
  app.register(policyRoutes, { policyEngine, auditRepo, aiRiskAnalyzer, approvalService, authService });
  app.register(paymentRoutes, { scanner, policyEngine, paymentAdapter, auditRepo, approvalService });
  app.register(razorpayRoutes, { config, policyEngine, auditRepo, approvalService, razorpayAdapter });
  app.register(scenariosRoutes, { config, scanner, policyEngine, auditRepo, approvalService });
  app.register(auditRoutes, { auditRepo, authService });
  app.register(storeRoutes, { storeRepo, scanner, policyEngine, paymentAdapter, auditRepo, approvalService });

  return app;
}
