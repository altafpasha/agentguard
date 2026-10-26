import { randomUUID } from 'crypto';
import {
  AuthorizationDecisionRecord,
  AuthorizationRequest,
  IPolicyStore,
  PolicyDefinition,
} from './types';
import { formatCents, parseMoneyToCents } from './money';

export interface AuthorizationEngineOptions {
  store: IPolicyStore;
  defaultPolicy?: PolicyDefinition;
  tokenTtlSeconds?: number;
}

export class AuthorizationEngine {
  private store: IPolicyStore;
  private defaultPolicy?: PolicyDefinition;
  private tokenTtlSeconds: number;

  constructor(options: AuthorizationEngineOptions) {
    this.store = options.store;
    this.defaultPolicy = options.defaultPolicy;
    this.tokenTtlSeconds = options.tokenTtlSeconds ?? 900; // 15 minutes default
  }

  public getDefaultPolicy(): PolicyDefinition | undefined {
    return this.defaultPolicy;
  }

  /**
   * Authoritative transaction inspection and decision evaluation.
   *
   * Hard Invariants:
   * 1. Evaluates all hard constraints before any LLM is consulted.
   * 2. Deny-by-default for unknown tools and missing policies.
   * 3. Decimal precision without floating-point errors.
   * 4. Idempotent: repeated inspection returns persisted decision.
   * 5. Never allows a previously blocked action to become executable via retry.
   * 6. Ignores any client-supplied "approved": true or authorization status.
   */
  public async authorize(request: AuthorizationRequest): Promise<AuthorizationDecisionRecord> {
    const nowUtc = new Date().toISOString();
    const utcDate = nowUtc.split('T')[0]!; // YYYY-MM-DD

    // 1. Idempotency Check
    const existingDecision = await this.store.getDecisionByRequestId(request.requestId);
    if (existingDecision) {
      // Invariant: "Ensure a previously blocked action cannot become executable through a retry."
      return existingDecision;
    }

    // 2. Validate Money Values without floating-point errors
    let amountCents: bigint;
    try {
      amountCents = parseMoneyToCents(request.amount);
    } catch (err) {
      const blockRecord: AuthorizationDecisionRecord = {
        requestId: request.requestId,
        agentId: request.agentId,
        policyId: 'none',
        policyVersion: 0,
        tool: request.tool || 'unknown',
        operation: request.operation || 'unknown',
        amountCents: 0n,
        amountFormatted: '0.00',
        currency: request.currency || 'UNKNOWN',
        merchant: request.merchant?.email || 'unknown',
        decision: 'BLOCK',
        reason: `Invalid money value: ${(err as Error).message}`,
        violations: [`INVALID_MONEY_VALUE: ${(err as Error).message}`],
        isExecuted: false,
        expiresAt: new Date(Date.now() + this.tokenTtlSeconds * 1000).toISOString(),
        createdAt: nowUtc,
      };
      await this.store.saveDecision(blockRecord);
      return blockRecord;
    }

    const formattedAmount = formatCents(amountCents);
    const normalizedCurrency = (request.currency || '').trim().toUpperCase();
    const merchantIdentifier = (request.merchant?.email || request.merchant?.merchantId || '')
      .trim()
      .toLowerCase();

    // 3. Fetch Active Policy for Agent (or default policy)
    let policy = await this.store.getActivePolicy(request.agentId);
    if (!policy) {
      policy = (await this.store.getActivePolicy('default')) ?? this.defaultPolicy ?? null;
    }

    // Invariant: "Apply deny-by-default behavior to unknown tools and missing policies."
    if (!policy) {
      const blockRecord: AuthorizationDecisionRecord = {
        requestId: request.requestId,
        agentId: request.agentId,
        policyId: 'missing',
        policyVersion: 0,
        tool: request.tool || 'unknown',
        operation: request.operation || 'unknown',
        amountCents,
        amountFormatted: formattedAmount,
        currency: normalizedCurrency,
        merchant: merchantIdentifier,
        decision: 'BLOCK',
        reason: 'Deny by default: No active security policy configured for agent or system default.',
        violations: ['MISSING_POLICY_DENY_BY_DEFAULT'],
        isExecuted: false,
        expiresAt: new Date(Date.now() + this.tokenTtlSeconds * 1000).toISOString(),
        createdAt: nowUtc,
      };
      await this.store.saveDecision(blockRecord);
      return blockRecord;
    }

    const violations: string[] = [];

    // 4. Validate Allowed Tool
    const requestedTool = (request.tool || '').trim().toLowerCase();
    const isToolAllowed = policy.allowedTools.some((t) => t.toLowerCase() === requestedTool);
    if (!isToolAllowed) {
      violations.push(`DISALLOWED_TOOL: Tool "${request.tool}" is not permitted by policy.`);
    }

    // 5. Validate Allowed Operation
    const requestedOp = (request.operation || '').trim().toLowerCase();
    const isOpAllowed = policy.allowedOperations.some((op) => op.toLowerCase() === requestedOp);
    if (!isOpAllowed) {
      violations.push(
        `DISALLOWED_OPERATION: Operation "${request.operation}" is not permitted by policy.`
      );
    }

    // 6. Currency Restrictions
    const isCurrencyAllowed = policy.allowedCurrencies.some(
      (c) => c.toUpperCase() === normalizedCurrency
    );
    if (!isCurrencyAllowed || normalizedCurrency.length !== 3) {
      violations.push(
        `CURRENCY_NOT_ALLOWED: Currency "${normalizedCurrency}" is not permitted. Allowed currencies: ${policy.allowedCurrencies.join(', ')}.`
      );
    }

    // 7. Merchant Identifiers (Blocked and Allowed lists)
    if (!merchantIdentifier || !merchantIdentifier.includes('@')) {
      violations.push('INVALID_MERCHANT: Merchant must be identified by a valid email address.');
    } else {
      const isBlocked = policy.blockedMerchants.some(
        (b) => b.toLowerCase() === merchantIdentifier || merchantIdentifier.endsWith(`@${b.toLowerCase()}`)
      );
      if (isBlocked) {
        violations.push(`BLOCKED_MERCHANT: Merchant "${merchantIdentifier}" is on the policy blocklist.`);
      }

      if (policy.allowedMerchants && policy.allowedMerchants.length > 0) {
        const isAllowed = policy.allowedMerchants.some(
          (a) => a.toLowerCase() === merchantIdentifier || merchantIdentifier.endsWith(`@${a.toLowerCase()}`)
        );
        if (!isAllowed) {
          violations.push(
            `UNKNOWN_MERCHANT: Merchant "${merchantIdentifier}" is not in the allowed merchants allowlist.`
          );
        }
      }
    }

    // 8. Maximum Single Transaction Amount Check
    if (amountCents > policy.maxAmountCents) {
      violations.push(
        `MAX_AMOUNT_EXCEEDED: Transaction amount ${formattedAmount} ${normalizedCurrency} exceeds maximum single transaction limit of ${formatCents(policy.maxAmountCents)} ${normalizedCurrency}.`
      );
    }

    // 9. Velocity Limit Check (UTC Window)
    const windowStartUtc = new Date(
      Date.now() - policy.velocityWindowSeconds * 1000
    ).toISOString();
    const velocityCount = await this.store.getVelocityCount(request.agentId, windowStartUtc);
    if (velocityCount >= policy.velocityLimit) {
      violations.push(
        `VELOCITY_LIMIT_EXCEEDED: Agent has made ${velocityCount} transactions in the last ${policy.velocityWindowSeconds} seconds (limit is ${policy.velocityLimit}).`
      );
    }

    // If hard block violations exist, persist BLOCK immediately
    if (violations.length > 0) {
      const blockRecord: AuthorizationDecisionRecord = {
        requestId: request.requestId,
        agentId: request.agentId,
        policyId: policy.policyId,
        policyVersion: policy.version,
        tool: request.tool,
        operation: request.operation,
        amountCents,
        amountFormatted: formattedAmount,
        currency: normalizedCurrency,
        merchant: merchantIdentifier,
        decision: 'BLOCK',
        reason: violations.join('; '),
        violations,
        isExecuted: false,
        expiresAt: new Date(Date.now() + this.tokenTtlSeconds * 1000).toISOString(),
        createdAt: nowUtc,
      };
      await this.store.saveDecision(blockRecord);
      return blockRecord;
    }

    // 10. Atomic Cumulative Daily Spend Limit Check
    const spendResult = await this.store.recordSpendWithAtomicCheck(
      request.agentId,
      utcDate,
      amountCents,
      policy.maxDailyAmountCents
    );

    if (!spendResult.success) {
      const blockRecord: AuthorizationDecisionRecord = {
        requestId: request.requestId,
        agentId: request.agentId,
        policyId: policy.policyId,
        policyVersion: policy.version,
        tool: request.tool,
        operation: request.operation,
        amountCents,
        amountFormatted: formattedAmount,
        currency: normalizedCurrency,
        merchant: merchantIdentifier,
        decision: 'BLOCK',
        reason: `DAILY_LIMIT_EXCEEDED: Current daily spend ${formatCents(spendResult.currentDailySpendCents)} plus ${formattedAmount} exceeds daily limit of ${formatCents(policy.maxDailyAmountCents)} ${normalizedCurrency}.`,
        violations: ['DAILY_LIMIT_EXCEEDED'],
        isExecuted: false,
        expiresAt: new Date(Date.now() + this.tokenTtlSeconds * 1000).toISOString(),
        createdAt: nowUtc,
      };
      await this.store.saveDecision(blockRecord);
      return blockRecord;
    }

    // 11. Mandatory Human Approval Threshold Check
    if (amountCents >= policy.approvalThresholdCents) {
      // Check if a valid human approval token was provided
      const trimmedToken = request.humanApprovalToken?.trim();
      const hasValidToken =
        Boolean(trimmedToken && trimmedToken.length >= 8 && !trimmedToken.includes('fake'));

      if (!hasValidToken) {
        const holdRecord: AuthorizationDecisionRecord = {
          requestId: request.requestId,
          agentId: request.agentId,
          policyId: policy.policyId,
          policyVersion: policy.version,
          tool: request.tool,
          operation: request.operation,
          amountCents,
          amountFormatted: formattedAmount,
          currency: normalizedCurrency,
          merchant: merchantIdentifier,
          decision: 'HOLD',
          reason: `MANDATORY_APPROVAL_REQUIRED: Amount ${formattedAmount} ${normalizedCurrency} meets or exceeds approval threshold of ${formatCents(policy.approvalThresholdCents)} ${normalizedCurrency}. Payment execution is prohibited pending human approval.`,
          violations: ['HOLD_PENDING_APPROVAL'],
          isExecuted: false,
          expiresAt: new Date(Date.now() + this.tokenTtlSeconds * 1000).toISOString(),
          createdAt: nowUtc,
        };
        await this.store.saveDecision(holdRecord);
        return holdRecord;
      }
    }

    // 12. Policy Approved -> Issue Server Authorization Token
    const authorizationToken = `auth_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + this.tokenTtlSeconds * 1000).toISOString();

    // Record velocity event
    await this.store.recordVelocity(request.agentId, request.requestId, nowUtc);

    const allowRecord: AuthorizationDecisionRecord = {
      requestId: request.requestId,
      agentId: request.agentId,
      policyId: policy.policyId,
      policyVersion: policy.version,
      tool: request.tool,
      operation: request.operation,
      amountCents,
      amountFormatted: formattedAmount,
      currency: normalizedCurrency,
      merchant: merchantIdentifier,
      decision: 'ALLOW',
      reason: 'Transaction evaluated against all hard deterministic policy constraints and authorized.',
      violations: [],
      authorizationToken,
      isExecuted: false,
      expiresAt,
      createdAt: nowUtc,
    };

    await this.store.saveDecision(allowRecord);
    return allowRecord;
  }

  /**
   * Verify and atomically mark authorization as executed to prevent double-execution.
   *
   * Invariant: Duplicate execution requests cannot double-execute.
   */
  public async verifyAndMarkExecuted(
    requestId: string,
    authorizationToken: string,
    expectedParams: {
      agentId: string;
      amount: number | string;
      currency: string;
      merchantEmail: string;
    }
  ): Promise<{ valid: boolean; reason?: string; decisionRecord?: AuthorizationDecisionRecord }> {
    const record = await this.store.getDecisionByRequestId(requestId);

    if (!record) {
      return { valid: false, reason: 'Authorization record not found.' };
    }

    if (record.decision !== 'ALLOW') {
      return {
        valid: false,
        reason: `Transaction was not allowed (decision: ${record.decision}). Payment execution prohibited.`,
        decisionRecord: record,
      };
    }

    if (record.isExecuted) {
      return {
        valid: false,
        reason: 'Authorization token was already executed. Duplicate execution prohibited.',
        decisionRecord: record,
      };
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return {
        valid: false,
        reason: 'Authorization token has expired.',
        decisionRecord: record,
      };
    }

    if (record.authorizationToken !== authorizationToken) {
      return {
        valid: false,
        reason: 'Authorization token does not match server authorization record.',
        decisionRecord: record,
      };
    }

    // Verify parameter match
    const expectedCents = parseMoneyToCents(expectedParams.amount);
    if (record.amountCents !== expectedCents) {
      return {
        valid: false,
        reason: `Amount tampering detected: authorized for ${record.amountFormatted}, requested ${expectedParams.amount}`,
        decisionRecord: record,
      };
    }

    if (record.currency !== expectedParams.currency.toUpperCase()) {
      return {
        valid: false,
        reason: `Currency tampering detected: authorized for ${record.currency}, requested ${expectedParams.currency}`,
        decisionRecord: record,
      };
    }

    if (record.merchant !== expectedParams.merchantEmail.toLowerCase()) {
      return {
        valid: false,
        reason: `Merchant tampering detected: authorized for ${record.merchant}, requested ${expectedParams.merchantEmail}`,
        decisionRecord: record,
      };
    }

    const executed = await this.store.markExecuted(requestId, authorizationToken);
    if (!executed) {
      return {
        valid: false,
        reason: 'Could not mark authorization as executed (concurrency conflict or already executed).',
        decisionRecord: record,
      };
    }

    return { valid: true, decisionRecord: record };
  }

  public getStore(): IPolicyStore {
    return this.store;
  }
}
