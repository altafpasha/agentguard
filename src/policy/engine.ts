import {
  IPolicyRule,
  PolicyContext,
  PolicyEvaluationResult,
  PolicyViolation,
  SpendTracker,
} from './types';
import { AmountLimitRule } from './rules/amount-limit.rule';
import { CurrencyRule } from './rules/currency.rule';
import { RecipientRule } from './rules/recipient.rule';
import { HitlRule } from './rules/hitl.rule';
import { EnvConfig } from '../config/env';

export class InMemorySpendTracker implements SpendTracker {
  private spends = new Map<string, Array<{ amount: number; timestamp: number }>>();

  public async getDailySpend(agentId: string): Promise<number> {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const history = this.spends.get(agentId) ?? [];
    const valid = history.filter((h) => h.timestamp > oneDayAgo);
    this.spends.set(agentId, valid);
    return valid.reduce((sum, h) => sum + h.amount, 0);
  }

  public async recordSpend(agentId: string, amount: number): Promise<void> {
    const history = this.spends.get(agentId) ?? [];
    history.push({ amount, timestamp: Date.now() });
    this.spends.set(agentId, history);
  }

  public clear(): void {
    this.spends.clear();
  }
}

export interface PolicyEngineOptions {
  rules?: IPolicyRule[];
  spendTracker?: SpendTracker;
}

export class PolicyEngine {
  private rules: IPolicyRule[];
  private spendTracker: SpendTracker;

  constructor(options: PolicyEngineOptions = {}) {
    this.rules = options.rules ?? [];
    this.spendTracker = options.spendTracker ?? new InMemorySpendTracker();
  }

  /**
   * Factory method to create PolicyEngine configured from application configuration
   */
  public static fromConfig(config: EnvConfig, spendTracker?: SpendTracker): PolicyEngine {
    const rules: IPolicyRule[] = [
      new AmountLimitRule(config.POLICY_MAX_TRANSACTION_AMOUNT, config.POLICY_MAX_DAILY_AMOUNT),
      new CurrencyRule(config.POLICY_ALLOWED_CURRENCIES),
      new RecipientRule(config.POLICY_RECIPIENT_DENYLIST),
      new HitlRule(config.POLICY_REQUIRE_HUMAN_APPROVAL_THRESHOLD),
    ];

    return new PolicyEngine({ rules, spendTracker });
  }

  /**
   * Add a custom rule to the engine
   */
  public addRule(rule: IPolicyRule): void {
    this.rules.push(rule);
  }

  /**
   * Evaluate a payment request against all configured deterministic rules
   */
  public async evaluate(context: PolicyContext): Promise<PolicyEvaluationResult> {
    const { request } = context;
    const evaluatedRules: string[] = [];
    const violations: PolicyViolation[] = [];

    // Calculate spend history if not provided
    let dailySpent = context.dailySpentSoFar;
    if (dailySpent === undefined) {
      dailySpent = await this.spendTracker.getDailySpend(request.agentId);
    }

    const evaluationContext: PolicyContext = {
      ...context,
      dailySpentSoFar: dailySpent,
    };

    for (const rule of this.rules) {
      evaluatedRules.push(rule.id);
      const violation = await rule.evaluate(evaluationContext);
      if (violation) {
        violations.push(violation);
      }
    }

    // Determine decision
    const hasBlock = violations.some((v) => v.severity === 'BLOCK');
    const hasWarn = violations.some((v) => v.severity === 'WARN');

    let decision: 'ALLOW' | 'DENY' | 'REQUIRE_HUMAN_APPROVAL' = 'ALLOW';
    if (hasBlock) {
      decision = 'DENY';
    } else if (hasWarn) {
      decision = 'REQUIRE_HUMAN_APPROVAL';
    }

    return {
      decision,
      allowed: decision === 'ALLOW',
      requiresHumanApproval: decision === 'REQUIRE_HUMAN_APPROVAL',
      violations,
      evaluatedRules,
      evaluationTimestamp: new Date().toISOString(),
      agentId: request.agentId,
      amount: request.amount,
      currency: request.currency,
    };
  }

  /**
   * Record approved spend after execution
   */
  public async recordApprovedSpend(agentId: string, amount: number): Promise<void> {
    await this.spendTracker.recordSpend(agentId, amount);
  }

  public getSpendTracker(): SpendTracker {
    return this.spendTracker;
  }
}
