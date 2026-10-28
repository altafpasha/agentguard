import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PolicyEngine } from '../policy';
import { IAuditRepository } from '../audit';
import { HumanApprovalService } from '../approval/service';
import { IApiKeyService } from '../auth/api-key-service';
import { IReviewerAuthService } from '../auth/service';
import { createDualAuthHook } from '../auth/middleware';
import { InjectionScanner, ScanFinding } from '../scanner';
import { ValidationError } from '../common/errors';
import { z } from 'zod';

export interface EvaluateRouteOptions {
  policyEngine: PolicyEngine;
  auditRepo: IAuditRepository;
  approvalService?: HumanApprovalService;
  apiKeyService?: IApiKeyService;
  authService?: IReviewerAuthService;
  scanner?: InjectionScanner;
}

const evaluateRequestSchema = z.object({
  action: z.string().min(1, 'action is required'),
  amount: z.union([z.number().nonnegative(), z.string()]).optional(),
  currency: z.string().length(3).optional().default('USD'),
  recipient: z
    .union([
      z.string(),
      z.object({
        email: z.string().optional(),
        name: z.string().optional(),
        merchantId: z.string().optional(),
      }),
    ])
    .optional(),
  description: z.string().optional(),
  agentId: z.string().optional(),
  tool: z.string().optional(),
  operation: z.string().optional(),
  promptContext: z.string().optional(),
  humanApprovalToken: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
});

export const evaluateRoutes: FastifyPluginAsync<EvaluateRouteOptions> = async (
  fastify: FastifyInstance,
  options: EvaluateRouteOptions
) => {
  const { policyEngine, auditRepo, approvalService, apiKeyService, authService, scanner } = options;

  // Enforce API key or Reviewer session authentication with 'evaluate' permission
  const authHook = createDualAuthHook(authService, apiKeyService, 'evaluate');

  /**
   * Official SDK Security Evaluation Endpoint
   * Consumed by @codesec-ai/agentguard (Node/TypeScript) and codesec-agentguard (Python).
   *
   * Authoritatively evaluates actions against:
   * 1. Adversarial prompt injection scanning (if promptContext is present)
   * 2. Deterministic spending caps, velocity limits, and tool permissions
   * 3. Human-in-the-Loop approval workflows (HOLD)
   */
  fastify.post('/api/v1/evaluate', { preHandler: [authHook] }, async (req, reply) => {
    const parseResult = evaluateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid evaluation payload', parseResult.error.flatten());
    }

    const payload = parseResult.data;
    const requestId = (payload.idempotencyKey || req.id as string) || `eval_${Date.now()}`;
    const callerApp = req.apiKey?.name || req.reviewer?.username || 'sdk-client';
    const agentId = payload.agentId || callerApp;

    // Normalizing recipient
    let recipientEmail = 'merchant@agentguard.internal';
    let recipientName = 'External Merchant';

    if (typeof payload.recipient === 'string') {
      recipientEmail = payload.recipient.includes('@') ? payload.recipient : 'recipient@agentguard.internal';
      recipientName = payload.recipient;
    } else if (payload.recipient) {
      recipientEmail = payload.recipient.email || recipientEmail;
      recipientName = payload.recipient.name || recipientName;
    }

    // 1. Prompt Injection Scanning (if promptContext provided)
    if (scanner && payload.promptContext && payload.promptContext.trim().length > 0) {
      const scanResult = scanner.scan(payload.promptContext);
      if (scanResult.isThreatDetected) {
        const violations = scanResult.findings.map((f: ScanFinding) => `Prompt threat: [${f.category}] ${f.description}`);

        await auditRepo.recordEvent({
          requestId,
          agentId,
          action: payload.action,
          eventType: 'INJECTION_BLOCKED',
          status: 'BLOCKED',
          decision: 'BLOCK',
          decisionReasons: violations,
          merchant: recipientEmail,
          payloadSummary: {
            action: payload.action,
            threatScore: scanResult.riskScore,
            violations,
            apiKeyId: req.apiKey?.id,
            apiKeyPrefix: req.apiKey?.keyPrefix,
          },
          errorMessage: 'Detected adversarial prompt injection patterns in evaluation context',
        });

        return reply.status(403).send({
          status: 'BLOCK',
          decision: 'BLOCK',
          isAllowed: false,
          isHeld: false,
          isBlocked: true,
          reason: 'Detected adversarial prompt injection patterns in input context',
          violations,
          requestId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 2. Policy Engine Authorization
    const numericAmount = payload.amount !== undefined ? Number(payload.amount) : 0;
    const currency = (payload.currency || 'USD').toUpperCase();
    const tool = payload.tool || (payload.action.startsWith('razorpay') ? 'razorpay_payment' : 'payment');
    const operation = payload.operation || payload.action;

    const decisionRecord = await policyEngine.authorize({
      requestId,
      agentId,
      tool,
      operation,
      amount: numericAmount,
      currency,
      merchant: {
        email: recipientEmail,
        name: recipientName,
      },
      description: payload.description || `SDK evaluation for action: ${payload.action}`,
      humanApprovalToken: payload.humanApprovalToken,
      metadata: payload.metadata,
    });

    let pendingApprovalId: string | undefined;

    // 3. Human Approval (HOLD) Workflow
    if (decisionRecord.decision === 'HOLD' && approvalService) {
      const pending = await approvalService.createPendingApproval({
        requestId,
        agentId,
        policyId: decisionRecord.policyId,
        policyVersion: decisionRecord.policyVersion,
        tool: decisionRecord.tool,
        operation: decisionRecord.operation,
        amountCents: decisionRecord.amountCents,
        amountFormatted: decisionRecord.amountFormatted,
        currency: decisionRecord.currency,
        merchant: decisionRecord.merchant,
        description: payload.description || `Held action: ${payload.action}`,
        riskReasons: decisionRecord.violations,
      });
      pendingApprovalId = pending.id;
    }

    // 4. Record Audit Event for Dashboard Visibility
    let auditEventType: 'POLICY_APPROVED' | 'POLICY_BLOCKED' | 'APPROVAL_REQUIRED' = 'POLICY_APPROVED';
    let auditStatus: 'SUCCESS' | 'BLOCKED' | 'PENDING_APPROVAL' = 'SUCCESS';

    if (decisionRecord.decision === 'BLOCK') {
      auditEventType = 'POLICY_BLOCKED';
      auditStatus = 'BLOCKED';
    } else if (decisionRecord.decision === 'HOLD') {
      auditEventType = 'APPROVAL_REQUIRED';
      auditStatus = 'PENDING_APPROVAL';
    }

    await auditRepo.recordEvent({
      requestId,
      agentId,
      action: payload.action,
      eventType: auditEventType,
      status: auditStatus,
      decision: decisionRecord.decision,
      decisionReasons: decisionRecord.violations,
      amountCents: decisionRecord.amountCents,
      amountFormatted: decisionRecord.amountFormatted,
      currency: decisionRecord.currency,
      merchant: recipientEmail,
      policyVersion: decisionRecord.policyVersion,
      payloadSummary: {
        action: payload.action,
        policyId: decisionRecord.policyId,
        policyVersion: decisionRecord.policyVersion,
        violations: decisionRecord.violations,
        pendingApprovalId,
        apiKeyId: req.apiKey?.id,
        apiKeyPrefix: req.apiKey?.keyPrefix,
        workspaceId: req.apiKey?.workspaceId || 'default',
        metadata: payload.metadata,
      },
      errorMessage: decisionRecord.decision === 'BLOCK' ? decisionRecord.reason : undefined,
    });

    // 5. Authoritative Response
    const statusCode = decisionRecord.decision === 'ALLOW' ? 200 : decisionRecord.decision === 'HOLD' ? 202 : 403;

    return reply.status(statusCode).send({
      status: decisionRecord.decision,
      decision: decisionRecord.decision,
      isAllowed: decisionRecord.decision === 'ALLOW',
      isHeld: decisionRecord.decision === 'HOLD',
      isBlocked: decisionRecord.decision === 'BLOCK',
      reason: decisionRecord.reason,
      violations: decisionRecord.violations,
      requestId,
      policyId: decisionRecord.policyId,
      policyVersion: decisionRecord.policyVersion,
      pendingApprovalId,
      authorizationToken: decisionRecord.authorizationToken,
      amountFormatted: decisionRecord.amountFormatted,
      amountCents: decisionRecord.amountCents.toString(),
      currency: decisionRecord.currency,
      timestamp: new Date().toISOString(),
      metadata: payload.metadata,
    });
  });
};
