import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { InjectionScanner } from '../scanner';
import { PolicyEngine } from '../policy';
import { IPayPalSandboxAdapter } from '../payment';
import { IAuditRepository } from '../audit';
import { HumanApprovalService } from '../approval/service';
import { PendingApprovalRecord } from '../approval/types';
import {
  paymentInitiateRequestSchema,
  createOrderRequestSchema,
  captureOrderRequestSchema,
} from './schemas';
import {
  ValidationError,
  InjectionDetectedError,
  PolicyViolationError,
  HumanApprovalRequiredError,
  ConflictError,
} from '../common/errors';

export interface PaymentRouteOptions {
  scanner: InjectionScanner;
  policyEngine: PolicyEngine;
  paymentAdapter: IPayPalSandboxAdapter;
  auditRepo: IAuditRepository;
  approvalService?: HumanApprovalService;
}

export const paymentRoutes: FastifyPluginAsync<PaymentRouteOptions> = async (
  fastify: FastifyInstance,
  options: PaymentRouteOptions
) => {
  const { scanner, policyEngine, paymentAdapter, auditRepo, approvalService } = options;

  /**
   * 1. Create Sandbox Order (Separated from payment execution)
   * Prepares the PayPal Sandbox Order resource. Does NOT capture payment.
   */
  fastify.post('/api/v1/payments/orders', async (req, reply) => {
    const parseResult = createOrderRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid order creation payload', parseResult.error.flatten());
    }

    const payload = parseResult.data;
    const requestId = req.id as string;

    // Audit order creation request
    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: 'REQUEST_RECEIVED',
      status: 'SUCCESS',
      payloadSummary: {
        operation: 'CREATE_ORDER',
        amount: payload.amount,
        currency: payload.currency,
        recipientEmail: payload.recipient.email,
        description: payload.description,
      },
    });

    // Threat Scanner
    const textToScan = [payload.promptContext, payload.description].filter(Boolean).join(' \n ');
    const scanResult = scanner.scan(textToScan);

    if (scanResult.isThreatDetected) {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'INJECTION_BLOCKED',
        status: 'BLOCKED',
        riskScore: scanResult.riskScore,
        payloadSummary: { findings: scanResult.findings },
        errorMessage: 'Order creation rejected due to detected prompt injection.',
      });

      throw new InjectionDetectedError(
        'Order creation rejected: prompt injection detected in agent context.',
        { scanResult }
      );
    }

    // Deterministic Policy Check
    const policyResult = await policyEngine.evaluate({
      request: {
        agentId: payload.agentId,
        requestId,
        amount: payload.amount,
        currency: payload.currency,
        recipient: payload.recipient,
        description: payload.description,
      },
    });

    if (policyResult.decision === 'DENY') {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'POLICY_BLOCKED',
        status: 'BLOCKED',
        policyDecision: 'DENY',
        payloadSummary: { violations: policyResult.violations },
      });

      throw new PolicyViolationError('Order creation blocked by security policy.', {
        violations: policyResult.violations,
      });
    }

    // Create PayPal Sandbox Order
    const order = await paymentAdapter.createOrder(
      {
        agentId: payload.agentId,
        requestId,
        amount: payload.amount,
        currency: payload.currency,
        recipient: payload.recipient,
        description: payload.description,
        intent: payload.intent || 'CAPTURE',
      },
      requestId
    );

    const approveLink = order.links?.find((l) => l.rel === 'approve')?.href;

    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: 'ORDER_CREATED',
      status: 'SUCCESS',
      payloadSummary: {
        paypalOrderId: order.id,
        status: order.status,
        approveLink,
      },
    });

    return reply.status(201).send({
      requestId,
      orderId: order.id,
      status: order.status,
      intent: order.intent,
      links: order.links,
      approvalUrl: approveLink,
      securityVerification: {
        injectionScan: 'PASSED',
        policyDecision: policyResult.decision,
      },
    });
  });

  /**
   * 2. Retrieve & Reconcile Order Details
   */
  fastify.get('/api/v1/payments/orders/:orderId', async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const query = req.query as {
      amount?: string;
      currency?: string;
      recipientEmail?: string;
      referenceId?: string;
    };

    const order = await paymentAdapter.getOrderDetails(orderId);

    // Optional reconciliation if parameters are provided
    let reconciliation = null;
    if (query.amount || query.currency || query.recipientEmail || query.referenceId) {
      reconciliation = await paymentAdapter.reconcileOrder(orderId, {
        amount: query.amount ? parseFloat(query.amount) : undefined,
        currency: query.currency,
        recipientEmail: query.recipientEmail,
        referenceId: query.referenceId,
      });
    }

    return reply.status(200).send({
      orderId: order.id,
      status: order.status,
      intent: order.intent,
      purchase_units: order.purchase_units,
      links: order.links,
      reconciliation,
    });
  });

  /**
   * 3. Capture Approved Order (Payment Execution)
   * Strictly requires deterministic policy authorization before any payment execution call.
   */
  fastify.post('/api/v1/payments/orders/:orderId/capture', async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const parseResult = captureOrderRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid order capture payload', parseResult.error.flatten());
    }

    const payload = parseResult.data;
    const requestId = req.id as string;

    // Audit capture request
    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: 'REQUEST_RECEIVED',
      status: 'SUCCESS',
      payloadSummary: {
        operation: 'CAPTURE_ORDER',
        orderId,
        amount: payload.amount,
        currency: payload.currency,
      },
    });

    // 1. Adversarial Injection Scan
    const textToScan = [payload.promptContext, payload.description].filter(Boolean).join(' \n ');
    const scanResult = scanner.scan(textToScan);

    if (scanResult.isThreatDetected) {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'INJECTION_BLOCKED',
        status: 'BLOCKED',
        riskScore: scanResult.riskScore,
        errorMessage: 'Capture rejected due to detected prompt injection.',
      });

      throw new InjectionDetectedError('Capture rejected: adversarial injection detected.', {
        scanResult,
      });
    }

    // Pre-validate human approval token if supplied
    let approvedCapturePendingRecord: PendingApprovalRecord | null = null;
    if (payload.humanApprovalToken) {
      if (!approvalService) {
        throw new PolicyViolationError('Human approval service is unavailable.');
      }
      const pendingRecord = await approvalService.getStore().getPendingApprovalByToken(payload.humanApprovalToken);
      if (!pendingRecord) {
        throw new PolicyViolationError('Invalid or unrecognized human approval token.');
      }
      if (pendingRecord.status !== 'APPROVED') {
        throw new PolicyViolationError(`Approval token is not in APPROVED state (current status: ${pendingRecord.status}).`);
      }
      if (pendingRecord.isConsumed) {
        throw new ConflictError('Single-use server authorization token has already been consumed. Replay rejected.');
      }
      if (pendingRecord.tokenExpiresAt && Date.now() > new Date(pendingRecord.tokenExpiresAt).getTime()) {
        throw new PolicyViolationError('Human approval token has expired.');
      }

      // Verify parameter integrity against approval token
      const reqAmountCents = BigInt(Math.round(payload.amount * 100));
      if (
        pendingRecord.amountCents !== reqAmountCents ||
        pendingRecord.currency.toUpperCase() !== payload.currency.toUpperCase() ||
        pendingRecord.merchant.toLowerCase() !== payload.recipient.email.toLowerCase() ||
        pendingRecord.agentId !== payload.agentId
      ) {
        throw new PolicyViolationError(
          'Transaction parameter tampering detected: amount, currency, or merchant does not match human approval token.'
        );
      }
      approvedCapturePendingRecord = pendingRecord;
    }

    // 2. Deterministic Policy Authorization
    const authRecord = await policyEngine.authorize({
      requestId,
      agentId: payload.agentId,
      tool: 'paypal_payment',
      operation: 'capture_payment',
      amount: payload.amount,
      currency: payload.currency,
      merchant: payload.recipient,
      description: payload.description || 'Order capture',
      humanApprovalToken: payload.humanApprovalToken,
    });

    if (authRecord.decision === 'BLOCK') {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'POLICY_BLOCKED',
        status: 'BLOCKED',
        policyDecision: 'BLOCK',
        payloadSummary: { violations: authRecord.violations, reason: authRecord.reason },
        errorMessage: `Payment capture blocked by deterministic policy: ${authRecord.reason}`,
      });

      throw new PolicyViolationError(
        `Payment capture blocked by deterministic policy: ${authRecord.reason}`,
        { violations: authRecord.violations }
      );
    }

    if (authRecord.decision === 'HOLD') {
      let pendingApprovalId: string | undefined;
      if (approvalService) {
        const pending = await approvalService.createPendingApproval({
          requestId,
          agentId: payload.agentId,
          policyId: authRecord.policyId,
          policyVersion: authRecord.policyVersion,
          tool: 'paypal_payment',
          operation: 'capture_payment',
          amountCents: authRecord.amountCents,
          amountFormatted: authRecord.amountFormatted,
          currency: authRecord.currency,
          merchant: authRecord.merchant,
          description: payload.description || 'Order capture',
          riskReasons: authRecord.violations,
        });
        pendingApprovalId = pending.id;
      }

      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'APPROVAL_REQUIRED',
        status: 'PENDING_APPROVAL',
        policyDecision: 'HOLD',
        payloadSummary: {
          violations: authRecord.violations,
          reason: authRecord.reason,
          approvalId: pendingApprovalId,
        },
      });

      throw new HumanApprovalRequiredError(
        'Transaction exceeds automated authorization threshold. Explicit human approval token required.',
        { violations: authRecord.violations, approvalId: pendingApprovalId }
      );
    }

    // 3. Authorized -> Proceed to Execute Payment with server-issued authorization token
    if (payload.humanApprovalToken && approvalService) {
      await approvalService.consumeAuthorization({
        serverAuthorizationToken: payload.humanApprovalToken,
        requestId: approvedCapturePendingRecord?.requestId ?? requestId,
        agentId: payload.agentId,
        tool: approvedCapturePendingRecord?.tool ?? 'paypal_payment',
        operation: approvedCapturePendingRecord?.operation ?? 'capture_payment',
        amountCents: BigInt(Math.round(payload.amount * 100)),
        currency: payload.currency,
        merchant: payload.recipient.email,
      });
    }

    const paymentResult = await paymentAdapter.executePayment(
      {
        agentId: payload.agentId,
        requestId,
        amount: payload.amount,
        currency: payload.currency,
        recipient: payload.recipient,
        description: payload.description || 'Order capture',
      },
      requestId,
      {
        preApprovedOrderId: orderId,
        serverAuthorizationToken: authRecord.authorizationToken || undefined,
      }
    );

    if (paymentResult.executed) {
      await policyEngine.recordApprovedSpend(payload.agentId, payload.amount);
    }

    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: paymentResult.executed ? 'PAYMENT_COMPLETED' : 'PAYMENT_FAILED',
      status: paymentResult.executed ? 'SUCCESS' : 'FAILED',
      payloadSummary: {
        orderId,
        executed: paymentResult.executed,
        paypalCaptureId: paymentResult.paypalCaptureId,
      },
    });

    const statusCode = paymentResult.executed
      ? 200
      : paymentResult.error === 'INVALID_SERVER_AUTHORIZATION' ||
        paymentResult.error === 'MISSING_SERVER_AUTHORIZATION'
      ? 403
      : 502;
    return reply.status(statusCode).send({
      ...paymentResult,
      securityVerification: {
        injectionScan: 'PASSED',
        policyDecision: 'ALLOW',
      },
    });
  });

  /**
   * 4. Unified Payment Initiation (Backwards-compatible gateway entrypoint)
   */
  fastify.post('/api/v1/payments/initiate', async (req, reply) => {
    // 1. Validate request payload schema
    const parseResult = paymentInitiateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid payment initiation payload', parseResult.error.flatten());
    }

    const payload = parseResult.data;
    const requestId = req.id as string;

    // 2. Audit initial request
    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: 'REQUEST_RECEIVED',
      status: 'SUCCESS',
      payloadSummary: {
        amount: payload.amount,
        currency: payload.currency,
        recipientEmail: payload.recipient.email,
        description: payload.description,
        dryRun: payload.dryRun ?? false,
      },
    });

    // 3. Prompt Injection and Adversarial Content Scan
    const textToScan = [payload.promptContext, payload.description].filter(Boolean).join(' \n ');
    const scanResult = scanner.scan(textToScan);

    if (scanResult.isThreatDetected) {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'INJECTION_BLOCKED',
        status: 'BLOCKED',
        riskScore: scanResult.riskScore,
        payloadSummary: {
          findings: scanResult.findings,
          threatLevel: scanResult.threatLevel,
        },
        errorMessage: 'Payment initiation aborted due to detected adversarial prompt injection.',
      });

      throw new InjectionDetectedError(
        'Payment initiation rejected: prompt injection or malicious instruction detected in agent context.',
        { scanResult }
      );
    }

    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: 'INJECTION_SCAN_PASSED',
      status: 'SUCCESS',
      riskScore: scanResult.riskScore,
    });

    // If a human approval token is provided, validate its presence and status in the approval store
    let approvedInitiatePendingRecord: PendingApprovalRecord | null = null;
    if (payload.humanApprovalToken) {
      if (!approvalService) {
        throw new PolicyViolationError('Human approval service is unavailable.');
      }
      const pendingRecord = await approvalService.getStore().getPendingApprovalByToken(payload.humanApprovalToken);
      if (!pendingRecord) {
        throw new PolicyViolationError('Invalid or unrecognized human approval token.');
      }
      if (pendingRecord.status !== 'APPROVED') {
        throw new PolicyViolationError(`Approval token is not in APPROVED state (current status: ${pendingRecord.status}).`);
      }
      if (pendingRecord.isConsumed) {
        throw new ConflictError('Single-use server authorization token has already been consumed. Replay rejected.');
      }
      if (pendingRecord.tokenExpiresAt && Date.now() > new Date(pendingRecord.tokenExpiresAt).getTime()) {
        throw new PolicyViolationError('Human approval token has expired.');
      }

      // Verify immutable parameters match the requested transaction
      const reqAmountCents = BigInt(Math.round(payload.amount * 100));
      if (
        pendingRecord.amountCents !== reqAmountCents ||
        pendingRecord.currency.toUpperCase() !== payload.currency.toUpperCase() ||
        pendingRecord.merchant.toLowerCase() !== payload.recipient.email.toLowerCase() ||
        pendingRecord.agentId !== payload.agentId
      ) {
        throw new PolicyViolationError(
          'Transaction parameter tampering detected: amount, currency, or merchant does not match human approval token.'
        );
      }
      approvedInitiatePendingRecord = pendingRecord;
    }

    // 4. Deterministic Policy Engine Evaluation (Strict Authority)
    const authRecord = await policyEngine.authorize({
      requestId,
      agentId: payload.agentId,
      tool: 'paypal_payment',
      operation: payload.orderId ? 'capture_payment' : 'create_order',
      amount: payload.amount,
      currency: payload.currency,
      merchant: payload.recipient,
      description: payload.description,
      humanApprovalToken: payload.humanApprovalToken,
    });

    // Idempotent replay: if this request was already executed, return cached successful result
    if (authRecord.isExecuted) {
      const priorEvents = await auditRepo.getEventsByRequestId(requestId);
      const completionEvent = priorEvents.find(
        (e) => e.eventType === 'PAYMENT_COMPLETED' || e.eventType === 'ORDER_CREATED'
      );
      if (completionEvent) {
        return reply.status(200).send({
          executed: true,
          status: (completionEvent.payloadSummary?.status as string) || 'PAYPAL_ORDER_CREATED',
          message: 'Idempotent request: returning previous execution result.',
          requestId,
          agentId: payload.agentId,
          amount: payload.amount,
          currency: payload.currency,
          recipientEmail: payload.recipient.email,
          paypalOrderId:
            (completionEvent.payloadSummary?.paypalOrderId as string) ||
            (completionEvent.payloadSummary?.orderId as string) ||
            completionEvent.paypalReference,
          idempotentReplay: true,
          securityVerification: {
            injectionScan: 'PASSED',
            policyDecision: 'ALLOW',
          },
        });
      }
    }

    if (authRecord.decision === 'BLOCK') {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'POLICY_BLOCKED',
        status: 'BLOCKED',
        policyDecision: 'BLOCK',
        payloadSummary: { violations: authRecord.violations, reason: authRecord.reason },
        errorMessage: `Payment initiation blocked by deterministic security policy: ${authRecord.reason}`,
      });

      throw new PolicyViolationError(
        `Payment initiation blocked by security policy rules: ${authRecord.reason}`,
        { violations: authRecord.violations }
      );
    }

    if (authRecord.decision === 'HOLD') {
      let pendingApprovalId: string | undefined;
      if (approvalService) {
        const pending = await approvalService.createPendingApproval({
          requestId,
          agentId: payload.agentId,
          policyId: authRecord.policyId,
          policyVersion: authRecord.policyVersion,
          tool: 'paypal_payment',
          operation: 'capture_payment',
          amountCents: authRecord.amountCents,
          amountFormatted: authRecord.amountFormatted,
          currency: authRecord.currency,
          merchant: authRecord.merchant,
          description: payload.description || 'Order capture',
          riskReasons: authRecord.violations,
        });
        pendingApprovalId = pending.id;
      }

      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'APPROVAL_REQUIRED',
        status: 'PENDING_APPROVAL',
        policyDecision: 'HOLD',
        payloadSummary: {
          violations: authRecord.violations,
          reason: authRecord.reason,
          approvalId: pendingApprovalId,
        },
      });

      throw new HumanApprovalRequiredError(
        'Transaction exceeds automated authorization threshold. Explicit human approval token required.',
        { violations: authRecord.violations, approvalId: pendingApprovalId }
      );
    }

    // Policy Approved
    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: 'POLICY_APPROVED',
      status: 'SUCCESS',
      policyDecision: 'ALLOW',
    });

    // 5. Dry-Run Handling
    if (payload.dryRun) {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'PAYMENT_EXECUTION_GUARDED',
        status: 'GUARDED',
        payloadSummary: {
          dryRun: true,
          securityChecksPassed: true,
        },
      });

      return reply.status(200).send({
        requestId,
        agentId: payload.agentId,
        executed: false,
        status: 'DRY_RUN_PASSED',
        message: 'Security validation successful. Payment was not executed (dryRun=true requested).',
        securityVerification: {
          injectionScan: 'PASSED',
          policyDecision: 'ALLOW',
          riskScore: scanResult.riskScore,
        },
      });
    }

    // 6. Dispatch to Payment Adapter
    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: 'PAYMENT_ATTEMPTED',
      status: 'SUCCESS',
    });

    try {
      // Atomically consume human approval token on payment execution
      if (payload.humanApprovalToken && approvalService) {
        await approvalService.consumeAuthorization({
          serverAuthorizationToken: payload.humanApprovalToken,
          requestId: approvedInitiatePendingRecord?.requestId ?? requestId,
          agentId: payload.agentId,
          tool: approvedInitiatePendingRecord?.tool ?? 'paypal_payment',
          operation: approvedInitiatePendingRecord?.operation ?? (payload.orderId ? 'capture_payment' : 'create_order'),
          amountCents: BigInt(Math.round(payload.amount * 100)),
          currency: payload.currency,
          merchant: payload.recipient.email,
        });
      }

      const paymentResult = await paymentAdapter.executePayment(
        {
          agentId: payload.agentId,
          requestId,
          amount: payload.amount,
          currency: payload.currency,
          recipient: payload.recipient,
          description: payload.description,
          intent: payload.intent,
        },
        requestId,
        {
          preApprovedOrderId: payload.orderId,
          serverAuthorizationToken: payload.humanApprovalToken || authRecord.authorizationToken || undefined,
        }
      );

      // Record approved spend in policy tracker if payment was executed
      if (paymentResult.executed) {
        await policyEngine.recordApprovedSpend(payload.agentId, payload.amount);
      }

      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: paymentResult.executed ? 'PAYMENT_COMPLETED' : 'PAYMENT_EXECUTION_GUARDED',
        status: paymentResult.executed ? 'SUCCESS' : 'GUARDED',
        payloadSummary: {
          executed: paymentResult.executed,
          status: paymentResult.status,
          paypalOrderId: paymentResult.paypalOrderId,
        },
      });

      return reply.status(200).send({
        ...paymentResult,
        securityVerification: {
          injectionScan: 'PASSED',
          policyDecision: 'ALLOW',
          riskScore: scanResult.riskScore,
        },
      });
    } catch (err) {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'PAYMENT_FAILED',
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }
  });
};
