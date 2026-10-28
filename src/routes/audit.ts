import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IAuditRepository } from '../audit';
import { NotFoundError } from '../common/errors';
import { IReviewerAuthService } from '../auth/service';
import { createReviewerAuthHook } from '../auth/middleware';

export interface AuditRouteOptions {
  auditRepo: IAuditRepository;
  authService?: IReviewerAuthService;
}

export const auditRoutes: FastifyPluginAsync<AuditRouteOptions> = async (
  fastify: FastifyInstance,
  options: AuditRouteOptions
) => {
  const { auditRepo, authService } = options;
  const requireAuth = authService ? createReviewerAuthHook(authService) : null;
  const authHook = requireAuth ? [requireAuth] : [];

  /**
   * List recent audit events with optional search, limit, and status filters
   */
  fastify.get('/api/v1/audit/events', { preHandler: authHook }, async (req, reply) => {
    const query = req.query as {
      limit?: string;
      status?: string;
      agentId?: string;
      eventType?: string;
      search?: string;
    };

    const limit = Math.min(Number(query.limit ?? 100), 500);
    const all = await auditRepo.getAllEvents(limit);

    let filtered = all;

    if (query.status && query.status !== 'ALL') {
      filtered = filtered.filter(
        (e) => e.status?.toUpperCase() === query.status?.toUpperCase() ||
               e.decision?.toUpperCase() === query.status?.toUpperCase() ||
               e.policyDecision?.toUpperCase() === query.status?.toUpperCase()
      );
    }

    if (query.agentId) {
      filtered = filtered.filter((e) => e.agentId === query.agentId);
    }

    if (query.eventType) {
      filtered = filtered.filter((e) => e.eventType === query.eventType);
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.requestId?.toLowerCase().includes(q) ||
          e.agentId?.toLowerCase().includes(q) ||
          e.merchant?.toLowerCase().includes(q) ||
          e.eventType?.toLowerCase().includes(q) ||
          e.errorMessage?.toLowerCase().includes(q) ||
          e.action?.toLowerCase().includes(q)
      );
    }

    return reply.status(200).send({
      count: filtered.length,
      events: filtered.map((e) => ({
        ...e,
        amountCents: e.amountCents ? e.amountCents.toString() : null,
      })),
    });
  });

  /**
   * Aggregated dashboard overview metrics computed strictly from real audit records
   */
  fastify.get('/api/v1/dashboard/overview', { preHandler: authHook }, async (_req, reply) => {
    const events = await auditRepo.getAllEvents(1000);

    const totalMonitored = events.length;

    let allowedCount = 0;
    let blockedCount = 0;
    let heldCount = 0;
    let totalSandboxCents = 0n;
    let attemptedCents = 0n;
    let riskScoreSum = 0;
    let riskScoreCount = 0;

    const threatCategories: Record<string, number> = {
      'Prompt Injection': 0,
      'Spending Cap Exceeded': 0,
      'Merchant Denylisted': 0,
      'Daily Spend Limit': 0,
      'Unauthorized Tool': 0,
    };

    for (const ev of events) {
      const decision = (ev.decision || ev.policyDecision || '').toUpperCase();
      const status = (ev.status || '').toUpperCase();
      const type = (ev.eventType || '').toUpperCase();

      if (decision === 'ALLOW' || status === 'SUCCESS' || type === 'POLICY_APPROVED') {
        allowedCount++;
      } else if (decision === 'BLOCK' || status === 'BLOCKED' || type === 'INJECTION_BLOCKED' || type === 'POLICY_BLOCKED') {
        blockedCount++;
      } else if (decision === 'HOLD' || status === 'PENDING_APPROVAL' || type === 'APPROVAL_REQUIRED') {
        heldCount++;
      }

      if (ev.amountCents) {
        const cents = typeof ev.amountCents === 'bigint' ? ev.amountCents : BigInt(ev.amountCents);
        attemptedCents += cents;
        if (type === 'PAYMENT_COMPLETED') {
          totalSandboxCents += cents;
        }
      }

      if (typeof ev.riskScore === 'number' && !isNaN(ev.riskScore)) {
        riskScoreSum += ev.riskScore;
        riskScoreCount++;
      }

      // Threat categorization
      if (type === 'INJECTION_BLOCKED' || ev.errorMessage?.toLowerCase().includes('injection')) {
        threatCategories['Prompt Injection'] = (threatCategories['Prompt Injection'] ?? 0) + 1;
      } else if (ev.errorMessage?.toLowerCase().includes('max transaction') || ev.errorMessage?.toLowerCase().includes('exceeds')) {
        threatCategories['Spending Cap Exceeded'] = (threatCategories['Spending Cap Exceeded'] ?? 0) + 1;
      } else if (ev.errorMessage?.toLowerCase().includes('denylist') || ev.errorMessage?.toLowerCase().includes('recipient')) {
        threatCategories['Merchant Denylisted'] = (threatCategories['Merchant Denylisted'] ?? 0) + 1;
      } else if (ev.errorMessage?.toLowerCase().includes('daily')) {
        threatCategories['Daily Spend Limit'] = (threatCategories['Daily Spend Limit'] ?? 0) + 1;
      } else if (status === 'BLOCKED') {
        threatCategories['Unauthorized Tool'] = (threatCategories['Unauthorized Tool'] ?? 0) + 1;
      }
    }

    const averageRiskScore = riskScoreCount > 0 ? Number((riskScoreSum / riskScoreCount).toFixed(2)) : 0;

    const threatDistribution = blockedCount > 0
      ? Object.entries(threatCategories)
          .filter(([_, count]) => count > 0)
          .map(([category, count]) => ({
            category,
            count,
            percentage: Math.round((count / blockedCount) * 100),
          }))
      : [];

    // Compute monthly aggregation from actual event timestamps
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyMap = new Map<string, { allowed: number; held: number; blocked: number }>();

    for (const ev of events) {
      if (!ev.createdAt) continue;
      const date = new Date(ev.createdAt);
      const monthIdx = date.getMonth();
      const monthKey = monthNames[monthIdx] ?? 'Unknown';
      const current = monthlyMap.get(monthKey) || { allowed: 0, held: 0, blocked: 0 };
      const dec = (ev.decision || ev.policyDecision || '').toUpperCase();
      const st = (ev.status || '').toUpperCase();
      if (dec === 'ALLOW' || st === 'SUCCESS') current.allowed++;
      else if (dec === 'HOLD' || st === 'PENDING_APPROVAL') current.held++;
      else if (dec === 'BLOCK' || st === 'BLOCKED') current.blocked++;
      monthlyMap.set(monthKey, current);
    }

    const monthlyActivity = Array.from(monthlyMap.entries()).map(([month, data]) => ({
      month,
      allowed: data.allowed,
      held: data.held,
      blocked: data.blocked,
    }));

    return reply.status(200).send({
      totalMonitored,
      allowedCount,
      blockedThreats: blockedCount,
      pendingApprovals: heldCount,
      totalSandboxSpendFormatted: `$${(Number(totalSandboxCents) / 100).toFixed(2)}`,
      totalAttemptedSpendFormatted: `$${(Number(attemptedCents) / 100).toFixed(2)}`,
      averageRiskScore,
      threatDistribution,
      monthlyActivity,
      recentEvents: events.slice(0, 50).map((e) => ({
        ...e,
        amountCents: e.amountCents ? e.amountCents.toString() : null,
      })),
    });
  });

  fastify.get('/api/v1/audit/:requestId', { preHandler: authHook }, async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    const events = await auditRepo.getEventsByRequestId(requestId);

    if (!events || events.length === 0) {
      throw new NotFoundError(`No audit events found for requestId: ${requestId}`);
    }

    return reply.status(200).send({
      requestId,
      count: events.length,
      events: events.map((e) => ({
        ...e,
        amountCents: e.amountCents ? e.amountCents.toString() : null,
      })),
    });
  });

  fastify.get('/api/v1/audit/agent/:agentId', { preHandler: authHook }, async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const limit = Number((req.query as { limit?: string }).limit ?? 50);
    const events = await auditRepo.getEventsByAgentId(agentId, limit);

    return reply.status(200).send({
      agentId,
      count: events.length,
      events: events.map((e) => ({
        ...e,
        amountCents: e.amountCents ? e.amountCents.toString() : null,
      })),
    });
  });
};
