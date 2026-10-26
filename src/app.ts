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
import {
  healthRoutes,
  scanRoutes,
  policyRoutes,
  paymentRoutes,
  auditRoutes,
  authRoutes,
  approvalRoutes,
} from './routes';
import { IRiskAnalyzerProvider, OpenRouterRiskAnalyzer } from './ai';
import { IReviewerAuthService, PostgresReviewerAuthService, MemoryReviewerAuthService } from './auth';
import { HumanApprovalService, PostgresApprovalStore, MemoryApprovalStore } from './approval';
import { MemoryAuditRepository } from './audit/memory-audit-repo';
import { seedInitialData } from './common/seed';

export interface AppDependencies {
  config?: EnvConfig;
  scanner?: InjectionScanner;
  policyEngine?: PolicyEngine;
  auditRepo?: IAuditRepository;
  paymentAdapter?: IPayPalSandboxAdapter;
  aiRiskAnalyzer?: IRiskAnalyzerProvider;
  authService?: IReviewerAuthService;
  approvalService?: HumanApprovalService;
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

  // Register CORS
  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Reviewer-Token'],
    exposedHeaders: ['X-Request-Id'],
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

  // Seed demo data for development and live dashboard when not running vitest
  if (config.NODE_ENV !== 'test') {
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
  app.register(approvalRoutes, { approvalService, authService });
  app.register(policyRoutes, { policyEngine, auditRepo, aiRiskAnalyzer, approvalService, authService });
  app.register(paymentRoutes, { scanner, policyEngine, paymentAdapter, auditRepo, approvalService });
  app.register(auditRoutes, { auditRepo });

  return app;
}
