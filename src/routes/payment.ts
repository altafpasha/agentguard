import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { InjectionScanner } from '../scanner';
import { PolicyEngine } from '../policy';
import { IPayPalSandboxAdapter } from '../payment';
import { IAuditRepository } from '../audit';
import { paymentInitiateRequestSchema } from './schemas';
import {
  ValidationError,
  InjectionDetectedError,
  PolicyViolationError,
  HumanApprovalRequiredError,
} from '../common/errors';

export interface PaymentRouteOptions {
  scanner: InjectionScanner;
  policyEngine: PolicyEngine;
  paymentAdapter: IPayPalSandboxAdapter;
  auditRepo: IAuditRepository;
}

export const paymentRoutes: FastifyPluginAsync<PaymentRouteOptions> = async (
  fastify: FastifyInstance,
  options: PaymentRouteOptions
) => {
  const { scanner, policyEngine, paymentAdapter, auditRepo } = options;

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

    // 4. Deterministic Policy Engine Evaluation (Strict Authority)
    const policyResult = await policyEngine.evaluate({
      request: {
        agentId: payload.agentId,
        requestId,
        amount: payload.amount,
        currency: payload.currency,
        recipient: payload.recipient,
        description: payload.description,
        humanApprovalToken: payload.humanApprovalToken,
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
        errorMessage: 'Payment initiation blocked by deterministic security policy.',
      });

      throw new PolicyViolationError('Payment initiation blocked by security policy rules.', {
        violations: policyResult.violations,
      });
    }

    if (policyResult.decision === 'REQUIRE_HUMAN_APPROVAL') {
      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId,
        eventType: 'APPROVAL_REQUIRED',
        status: 'PENDING_APPROVAL',
        policyDecision: 'REQUIRE_HUMAN_APPROVAL',
        payloadSummary: { violations: policyResult.violations },
      });

      throw new HumanApprovalRequiredError(
        'Transaction exceeds automated authorization threshold. Explicit human approval token required.',
        { violations: policyResult.violations }
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

    // 5. Payment Adapter Dispatch
    // If dryRun requested or foundation mode active, record guarded status and do not return fake success
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

    // Dispatch to payment adapter
    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId,
      eventType: 'PAYMENT_ATTEMPTED',
      status: 'SUCCESS',
    });

    try {
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
        requestId
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
