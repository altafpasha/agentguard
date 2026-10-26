import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine, InMemorySpendTracker } from '../../src/policy/engine';
import { AmountLimitRule } from '../../src/policy/rules/amount-limit.rule';
import { CurrencyRule } from '../../src/policy/rules/currency.rule';
import { RecipientRule } from '../../src/policy/rules/recipient.rule';
import { HitlRule } from '../../src/policy/rules/hitl.rule';
import { PaymentOrderRequest } from '../../src/common/types';

describe('Deterministic Policy Engine Module', () => {
  let engine: PolicyEngine;
  let spendTracker: InMemorySpendTracker;

  const validBaseRequest: PaymentOrderRequest = {
    agentId: 'agent-finance-01',
    amount: 15.0,
    currency: 'USD',
    recipient: { email: 'vendor@office-supplies.com' },
    description: 'Office supplies replenishment',
  };

  beforeEach(() => {
    spendTracker = new InMemorySpendTracker();
    engine = new PolicyEngine({
      rules: [
        new AmountLimitRule(50.0, 200.0), // max per-tx $50, max daily $200
        new CurrencyRule(['USD', 'EUR', 'GBP']),
        new RecipientRule(['malicious@attacker.com', 'fraud.com'], ['vendor@office-supplies.com', 'partner@corp.com']),
        new HitlRule(25.0), // requires human approval above $25
      ],
      spendTracker,
    });
  });

  it('ALLOWs compliant payment under all limits', async () => {
    const result = await engine.evaluate({ request: validBaseRequest });

    expect(result.decision).toBe('ALLOW');
    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('DENYs payment when single transaction exceeds max amount limit', async () => {
    const excessiveRequest: PaymentOrderRequest = {
      ...validBaseRequest,
      amount: 75.0, // Exceeds $50 limit
    };

    const result = await engine.evaluate({ request: excessiveRequest });

    expect(result.decision).toBe('DENY');
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'POL-001' && v.field === 'amount')).toBe(true);
  });

  it('DENYs payment when daily velocity cumulative spend exceeds daily limit', async () => {
    // Record $180 spent earlier today
    await spendTracker.recordSpend('agent-finance-01', 180.0);

    // Now agent tries to spend $30 ($180 + $30 = $210 > $200 max)
    const nextRequest: PaymentOrderRequest = {
      ...validBaseRequest,
      amount: 30.0,
    };

    const result = await engine.evaluate({ request: nextRequest });

    expect(result.decision).toBe('DENY');
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'POL-001' && v.field === 'dailySpend')).toBe(true);
  });

  it('DENYs payment when currency is not in allowed list', async () => {
    const unsupportedCurrencyRequest: PaymentOrderRequest = {
      ...validBaseRequest,
      currency: 'XYZ',
    };

    const result = await engine.evaluate({ request: unsupportedCurrencyRequest });

    expect(result.decision).toBe('DENY');
    expect(result.violations.some((v) => v.ruleId === 'POL-002')).toBe(true);
  });

  it('DENYs payment to a denylisted recipient email or domain', async () => {
    const blockedRecipientRequest: PaymentOrderRequest = {
      ...validBaseRequest,
      recipient: { email: 'malicious@attacker.com' },
    };

    const result = await engine.evaluate({ request: blockedRecipientRequest });

    expect(result.decision).toBe('DENY');
    expect(result.violations.some((v) => v.ruleId === 'POL-003')).toBe(true);
  });

  it('DENYs payment to a recipient not in the allowlist', async () => {
    const unapprovedRecipientRequest: PaymentOrderRequest = {
      ...validBaseRequest,
      recipient: { email: 'unknown@stranger.com' },
    };

    const result = await engine.evaluate({ request: unapprovedRecipientRequest });

    expect(result.decision).toBe('DENY');
    expect(result.violations.some((v) => v.ruleId === 'POL-003')).toBe(true);
  });

  it('requires human approval (REQUIRE_HUMAN_APPROVAL) when amount > threshold without token', async () => {
    const overHitlThresholdRequest: PaymentOrderRequest = {
      ...validBaseRequest,
      amount: 35.0, // > 25 threshold, but < 50 max
    };

    const result = await engine.evaluate({ request: overHitlThresholdRequest });

    expect(result.decision).toBe('REQUIRE_HUMAN_APPROVAL');
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'POL-004')).toBe(true);
  });

  it('ALLOWs transaction above HITL threshold when valid human approval token is provided', async () => {
    const approvedRequest: PaymentOrderRequest = {
      ...validBaseRequest,
      amount: 35.0,
      humanApprovalToken: 'human-approval-token-xyz-123',
    };

    const result = await engine.evaluate({ request: approvedRequest });

    expect(result.decision).toBe('ALLOW');
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
