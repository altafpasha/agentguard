import { IAuditRepository } from '../audit';
import { HumanApprovalService } from '../approval';
import { IReviewerAuthService } from '../auth';

export async function seedInitialData(
  auditRepo: IAuditRepository,
  approvalService?: HumanApprovalService,
  authService?: IReviewerAuthService
): Promise<void> {
  // 1. Seed default reviewer profiles
  if (authService) {
    try {
      await authService.seedReviewer(
        'darlene.robertson',
        'admin123',
        'Darlene Robertson',
        'SECURITY_ADMIN'
      );
      await authService.seedReviewer(
        'security_admin',
        'ChangeMeNow123!',
        'Security Lead Reviewer',
        'SECURITY_ADMIN'
      );
    } catch {}
  }

  // 2. Check if audit events already exist
  const existing = await auditRepo.getAllEvents(5);
  if (existing.length === 0) {
    const sampleEvents = [
      {
        requestId: 'req-prod-001',
        agentId: 'agent-finance-01',
        merchant: 'AWS Cloud Services',
        amountCents: 1499n,
        amountFormatted: '$14.99',
        currency: 'USD',
        decision: 'ALLOW',
        status: 'SUCCESS' as const,
        eventType: 'POLICY_APPROVED' as const,
        riskScore: 0.04,
        decisionReasons: ['Transaction amount within $50.00 policy cap', 'Merchant verified'],
        paypalReference: 'SANDBOX_ORD_77182939',
        payloadSummary: {
          operation: 'CAPTURE_PAYMENT',
          description: 'Automated invoice payment evaluated within deterministic limit.',
          sanitized: true,
        },
        createdAt: new Date().toISOString(),
      },
      {
        requestId: 'req-prod-002',
        agentId: 'agent-procure-hitl',
        merchant: 'Enterprise SaaS Vendor',
        amountCents: 3500n,
        amountFormatted: '$35.00',
        currency: 'USD',
        decision: 'HOLD',
        status: 'PENDING_APPROVAL' as const,
        eventType: 'APPROVAL_REQUIRED' as const,
        riskScore: 0.42,
        decisionReasons: ['Transaction exceeds $25.00 human approval threshold'],
        payloadSummary: {
          operation: 'CREATE_ORDER',
          description: 'Order exceeds $25.00 threshold; enqueued in approval queue.',
          sanitized: true,
        },
        createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
      },
      {
        requestId: 'req-prod-003',
        agentId: 'agent-adversarial-test',
        merchant: 'hacker@blackhat.com',
        amountCents: 9900n,
        amountFormatted: '$99.00',
        currency: 'USD',
        decision: 'BLOCK',
        status: 'BLOCKED' as const,
        eventType: 'POLICY_BLOCKED' as const,
        riskScore: 0.95,
        decisionReasons: ['Recipient is in blocked denylist', 'Exceeds maximum $50.00 transaction cap'],
        errorMessage: 'Blocked by deterministic security policy: Recipient is in blocked list',
        payloadSummary: {
          sanitized: true,
          recipient: 'hacker@blackhat.com',
        },
        createdAt: new Date(Date.now() - 40 * 60000).toISOString(),
      },
      {
        requestId: 'req-prod-004',
        agentId: 'agent-rogue-prompt',
        merchant: 'Unknown Gateway',
        amountCents: 4500n,
        amountFormatted: '$45.00',
        currency: 'USD',
        decision: 'BLOCK',
        status: 'BLOCKED' as const,
        eventType: 'INJECTION_BLOCKED' as const,
        riskScore: 0.98,
        decisionReasons: ['Adversarial prompt injection detected: DAN jailbreak pattern override.'],
        errorMessage: 'Blocked by Adversarial Injection Scanner: system prompt override attempt.',
        payloadSummary: {
          sanitized: true,
          findings: ['DAN override detected in prompt context'],
        },
        createdAt: new Date(Date.now() - 80 * 60000).toISOString(),
      },
      {
        requestId: 'req-prod-005',
        agentId: 'agent-dev',
        merchant: 'GitHub Marketplace',
        amountCents: 850n,
        amountFormatted: '$8.50',
        currency: 'USD',
        decision: 'ALLOW',
        status: 'SUCCESS' as const,
        eventType: 'PAYMENT_COMPLETED' as const,
        riskScore: 0.02,
        decisionReasons: ['Pre-authorized dev tool subscription renewal completed.'],
        paypalReference: 'SANDBOX_ORD_8829104',
        payloadSummary: {
          sanitized: true,
          operation: 'CAPTURE_PAYMENT',
        },
        createdAt: new Date(Date.now() - 150 * 60000).toISOString(),
      },
    ];

    for (const ev of sampleEvents) {
      await auditRepo.recordEvent(ev);
    }
  }

  // 3. Seed pending approval in approval store
  if (approvalService) {
    try {
      const pending = await approvalService.listPendingApprovals();
      if (pending.length === 0) {
        await approvalService.createPendingApproval({
          requestId: 'req-hitl-8821',
          agentId: 'agent-procure-hitl',
          policyId: 'default',
          policyVersion: 1,
          tool: 'paypal_payment',
          operation: 'capture_payment',
          amountCents: 3500n,
          amountFormatted: '$35.00',
          currency: 'USD',
          merchant: 'Enterprise SaaS Vendor',
          description: 'Annual license provisioning for DevOps team',
          riskScore: 0.35,
          riskReasons: ['Single transaction exceeds $25.00 human approval threshold'],
          expiresInSeconds: 3600,
        });

        await approvalService.createPendingApproval({
          requestId: 'req-hitl-8822',
          agentId: 'agent-support-hitl',
          policyId: 'default',
          policyVersion: 1,
          tool: 'paypal_payment',
          operation: 'create_order',
          amountCents: 4850n,
          amountFormatted: '$48.50',
          currency: 'USD',
          merchant: 'Customer Refund Gateway',
          description: 'Tier-2 customer loyalty credit compensation',
          riskScore: 0.42,
          riskReasons: ['Amount exceeds $25.00 HITL threshold; requires authorized supervisor review'],
          expiresInSeconds: 3600,
        });
      }
    } catch {}
  }
}
