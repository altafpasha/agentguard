import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { EnvConfig } from '../config/env';
import { PolicyEngine } from '../policy';
import { IAuditRepository } from '../audit';
import { HumanApprovalService } from '../approval/service';
import { IRazorpayAdapter, RazorpayAdapter } from '../payment/razorpay-client';
import { ValidationError } from '../common/errors';
import { parseMoneyToCents } from '../policy/money';
import { z } from 'zod';

export interface RazorpayRouteOptions {
  config: EnvConfig;
  policyEngine: PolicyEngine;
  auditRepo: IAuditRepository;
  approvalService?: HumanApprovalService;
  razorpayAdapter?: IRazorpayAdapter;
}

const razorpayOrderSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  amount: z.union([z.number().positive(), z.string().min(1)]),
  currency: z.string().default('INR'),
  notes: z.record(z.string()).optional(),
  receipt: z.string().optional(),
  customer: z
    .object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      contact: z.string().optional(),
    })
    .optional(),
  authorizationToken: z.string().optional(),
  bypassGuard: z.boolean().optional(),
});

const razorpayVerifySchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  paymentId: z.string().min(1, 'paymentId is required'),
  signature: z.string().min(1, 'signature is required'),
});

const razorpayEvaluateSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  amount: z.union([z.number().positive(), z.string().min(1)]),
  currency: z.string().default('INR'),
  merchant: z.string().optional(),
  operation: z.string().default('create_razorpay_order'),
  tool: z.string().default('razorpay_payment'),
  metadata: z.record(z.unknown()).optional(),
});

export const razorpayRoutes: FastifyPluginAsync<RazorpayRouteOptions> = async (
  fastify: FastifyInstance,
  options: RazorpayRouteOptions
) => {
  const { config, policyEngine, auditRepo, approvalService } = options;
  const adapter =
    options.razorpayAdapter ??
    new RazorpayAdapter({
      keyId: config.RAZORPAY_KEY_ID,
      keySecret: config.RAZORPAY_KEY_SECRET,
      webhookSecret: config.RAZORPAY_WEBHOOK_SECRET,
      allowLiveExecution: config.RAZORPAY_ALLOW_LIVE_EXECUTION,
    });

  /**
   * 1. Public Configuration & Status
   */
  fastify.get('/api/v1/integrations/razorpay/config', async () => {
    return {
      success: true,
      data: adapter.getPublicConfig(),
    };
  });

  /**
   * 2. Policy Evaluation Pre-flight
   * Merchant backends call this to check if an agent action is ALLOW, HOLD, or BLOCK.
   */
  fastify.post('/api/v1/integrations/razorpay/evaluate', async (req, reply) => {
    const parseResult = razorpayEvaluateSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid evaluation payload', parseResult.error.flatten());
    }

    const { agentId, amount, currency, merchant, operation, tool, metadata } = parseResult.data;
    const requestId = (req.id as string) || `eval_${Date.now()}`;
    const merchantEmail = merchant && merchant.includes('@') ? merchant : 'merchant@agentguard.internal';

    const authResult = await policyEngine.authorize({
      requestId,
      agentId,
      tool,
      operation,
      amount,
      currency: currency.toUpperCase(),
      merchant: {
        email: merchantEmail,
        name: merchant || 'Direct Merchant',
      },
      description: 'Razorpay payment pre-flight policy evaluation',
      metadata,
    });

    let pendingApprovalId: string | undefined;
    if (authResult.decision === 'HOLD' && approvalService) {
      try {
        const pending = await approvalService.createPendingApproval({
          requestId,
          agentId,
          policyId: authResult.policyId,
          policyVersion: authResult.policyVersion,
          tool,
          operation,
          amountCents: authResult.amountCents,
          amountFormatted: authResult.amountFormatted,
          currency: authResult.currency,
          merchant: authResult.merchant,
          description: 'Razorpay pre-flight payment approval required',
        });
        pendingApprovalId = pending.id;
      } catch {}
    }

    await auditRepo.recordEvent({
      requestId,
      agentId,
      eventType:
        authResult.decision === 'BLOCK'
          ? 'POLICY_BLOCKED'
          : authResult.decision === 'HOLD'
          ? 'APPROVAL_REQUIRED'
          : 'POLICY_APPROVED',
      status:
        authResult.decision === 'BLOCK'
          ? 'BLOCKED'
          : authResult.decision === 'HOLD'
          ? 'PENDING_APPROVAL'
          : 'SUCCESS',
      payloadSummary: {
        integration: 'razorpay',
        operation,
        amount,
        currency,
        decision: authResult.decision,
        reason: authResult.reason,
        policyId: authResult.policyId,
        policyVersion: authResult.policyVersion,
        pendingApprovalId,
      },
      policyDecision: authResult.decision,
    });

    return reply.status(200).send({
      success: true,
      decision: authResult.decision,
      decisionId: authResult.requestId,
      reason: authResult.reason,
      violations: authResult.violations,
      policyId: authResult.policyId,
      policyVersion: authResult.policyVersion,
      authorizationToken: authResult.authorizationToken,
      pendingApprovalId,
      evaluatedAt: authResult.createdAt,
      currency: authResult.currency,
      amount,
    });
  });

  /**
   * 3. Guarded Razorpay Order Creation
   * Executes the full guarded flow:
   * Evaluate Policy -> If BLOCK, reject -> If HOLD, register pending approval and return 202 -> If ALLOW, create order on Razorpay
   */
  fastify.post('/api/v1/integrations/razorpay/orders', async (req, reply) => {
    const parseResult = razorpayOrderSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid Razorpay order request', parseResult.error.flatten());
    }

    const payload = parseResult.data;
    const requestId = (req.id as string) || `order_${Date.now()}`;

    // Parse amount to minor currency units (paise/cents)
    let amountCents: bigint;
    try {
      amountCents = parseMoneyToCents(payload.amount);
    } catch {
      throw new ValidationError('Invalid amount format');
    }

    if (amountCents <= 0n) {
      throw new ValidationError('Order amount must be greater than zero');
    }

    const merchantEmail =
      payload.notes?.merchant && payload.notes.merchant.includes('@')
        ? payload.notes.merchant
        : 'merchant@agentguard.internal';

    // Step A: Policy Engine Authorization Evaluation
    const authResult = await policyEngine.authorize({
      requestId,
      agentId: payload.agentId,
      tool: 'razorpay_order',
      operation: 'create_razorpay_order',
      amount: payload.amount,
      currency: payload.currency.toUpperCase(),
      merchant: {
        email: merchantEmail,
        name: payload.notes?.merchant || 'Direct Merchant',
      },
      description: payload.receipt || 'Guarded Razorpay order creation',
      humanApprovalToken: payload.authorizationToken,
      metadata: {
        receipt: payload.receipt,
        customer: payload.customer,
      },
    });

    // Step B: Handle HOLD (Approval Required)
    if (authResult.decision === 'HOLD') {
      let pendingApprovalId: string | undefined;
      if (approvalService) {
        try {
          const pending = await approvalService.createPendingApproval({
            requestId,
            agentId: payload.agentId,
            policyId: authResult.policyId,
            policyVersion: authResult.policyVersion,
            tool: 'razorpay_order',
            operation: 'create_razorpay_order',
            amountCents,
            amountFormatted: authResult.amountFormatted,
            currency: payload.currency.toUpperCase(),
            merchant: merchantEmail,
            description: payload.receipt || 'Guarded Razorpay order creation',
          });
          pendingApprovalId = pending.id;
        } catch {}
      }

      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'APPROVAL_REQUIRED',
        status: 'PENDING_APPROVAL',
        payloadSummary: {
          integration: 'razorpay',
          action: 'create_order',
          amount: payload.amount,
          currency: payload.currency,
          decision: 'HOLD',
          reason: authResult.reason,
          pendingApprovalId,
        },
        policyDecision: 'HOLD',
      });

      return reply.status(202).send({
        success: false,
        status: 'PENDING_APPROVAL',
        decision: 'HOLD',
        pendingApprovalId,
        reason: authResult.reason || 'Transaction exceeds human review threshold. Review required before order creation.',
        message: 'Order creation paused. Action queued for human reviewer approval in AgentGuard.',
      });
    }

    // Step C: Handle BLOCK (Violations)
    if (authResult.decision === 'BLOCK') {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'POLICY_BLOCKED',
        status: 'BLOCKED',
        payloadSummary: {
          integration: 'razorpay',
          action: 'create_order',
          amount: payload.amount,
          currency: payload.currency,
          decision: 'BLOCK',
          reason: authResult.reason,
        },
        policyDecision: 'BLOCK',
      });

      return reply.status(403).send({
        success: false,
        status: 'BLOCKED',
        decision: 'BLOCK',
        reason: authResult.reason || 'Transaction rejected by AgentGuard policy.',
        violations: authResult.violations,
        message: 'Payment execution blocked by AgentGuard policy engine.',
      });
    }

    // Step D: Decision is ALLOW -> Safely create order through Razorpay Adapter
    try {
      const order = await adapter.createOrder({
        amountCents,
        currency: payload.currency.toUpperCase(),
        receipt: payload.receipt || `rcpt_${Date.now()}`,
        notes: {
          ...(payload.notes || {}),
          agentguard_decision_id: authResult.requestId,
          agentguard_agent_id: payload.agentId,
        },
        customer: payload.customer,
      });

      // Step E: Record Execution Audit Event
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'ORDER_CREATED',
        status: 'SUCCESS',
        payloadSummary: {
          integration: 'razorpay',
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          decisionId: authResult.requestId,
          authorizationToken: authResult.authorizationToken,
          isSimulated: order.isSimulated,
        },
      });

      return reply.status(201).send({
        success: true,
        status: 'ALLOWED',
        decision: 'ALLOW',
        decisionId: authResult.requestId,
        authorizationToken: authResult.authorizationToken,
        order,
      });
    } catch (orderErr: any) {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'PAYMENT_FAILED',
        status: 'FAILED',
        payloadSummary: {
          integration: 'razorpay',
          error: orderErr.message,
          amount: payload.amount,
          currency: payload.currency,
        },
      });

      return reply.status(502).send({
        success: false,
        status: 'GATEWAY_ERROR',
        message: `Failed to create order on Razorpay: ${orderErr.message}`,
      });
    }
  });

  /**
   * 4. Verify Razorpay Payment Signature
   * Verifies the cryptographic HMAC SHA-256 signature returned by Razorpay Checkout.
   */
  fastify.post('/api/v1/integrations/razorpay/verify-payment', async (req, reply) => {
    const parseResult = razorpayVerifySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid verification payload', parseResult.error.flatten());
    }

    const { orderId, paymentId, signature } = parseResult.data;
    const requestId = (req.id as string) || `verify_${Date.now()}`;

    const isValid = adapter.verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    await auditRepo.recordEvent({
      requestId,
      agentId: 'razorpay_verification_service',
      eventType: isValid ? 'PAYMENT_COMPLETED' : 'POLICY_BLOCKED',
      status: isValid ? 'SUCCESS' : 'FAILED',
      payloadSummary: {
        integration: 'razorpay',
        operation: 'VERIFY_PAYMENT_SIGNATURE',
        orderId,
        paymentId,
        signatureVerified: isValid,
      },
    });

    if (!isValid) {
      return reply.status(400).send({
        success: false,
        verified: false,
        error: 'INVALID_SIGNATURE',
        message: 'Cryptographic signature verification failed for Razorpay payment.',
      });
    }

    return reply.status(200).send({
      success: true,
      verified: true,
      message: 'Razorpay payment signature verified successfully.',
      orderId,
      paymentId,
    });
  });

  /**
   * 5. Webhook Receiver with HMAC-SHA256 Signature Verification
   */
  fastify.post('/api/v1/integrations/razorpay/webhook', async (req, reply) => {
    const signature = (req.headers['x-razorpay-signature'] as string) || '';
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const requestId = (req.id as string) || `wh_${Date.now()}`;

    const isValid = adapter.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      await auditRepo.recordEvent({
        requestId,
        agentId: 'razorpay_webhook_receiver',
        eventType: 'POLICY_BLOCKED',
        status: 'FAILED',
        payloadSummary: {
          integration: 'razorpay',
          error: 'WEBHOOK_SIGNATURE_MISMATCH',
          hasSignatureHeader: !!signature,
        },
      });

      return reply.status(400).send({
        success: false,
        error: 'WEBHOOK_SIGNATURE_INVALID',
        message: 'Webhook signature verification failed.',
      });
    }

    const event = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);

    await auditRepo.recordEvent({
      requestId,
      agentId: 'razorpay_webhook_receiver',
      eventType: 'REQUEST_RECEIVED',
      status: 'SUCCESS',
      payloadSummary: {
        integration: 'razorpay',
        webhookEvent: event.event || 'unknown',
        entityId: event.payload?.payment?.entity?.id || event.payload?.order?.entity?.id,
      },
    });

    return reply.status(200).send({
      received: true,
      event: event.event,
    });
  });
};
