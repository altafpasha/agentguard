import { IPolicyRule, PolicyContext, PolicyViolation } from '../types';

export class AmountLimitRule implements IPolicyRule {
  public readonly id = 'POL-001';
  public readonly name = 'Transaction and Daily Velocity Limit';

  constructor(
    private readonly maxTransactionAmount: number,
    private readonly maxDailyAmount: number
  ) {}

  public evaluate(context: PolicyContext): PolicyViolation | null {
    const { request, dailySpentSoFar = 0 } = context;

    // Check individual transaction limit
    if (request.amount > this.maxTransactionAmount) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: 'BLOCK',
        message: `Transaction amount ${request.amount} ${request.currency} exceeds maximum allowed limit of ${this.maxTransactionAmount} ${request.currency}`,
        field: 'amount',
        expected: this.maxTransactionAmount,
        actual: request.amount,
      };
    }

    // Check daily velocity limit
    const projectedDailyTotal = dailySpentSoFar + request.amount;
    if (projectedDailyTotal > this.maxDailyAmount) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: 'BLOCK',
        message: `Transaction would cause 24h spending (${projectedDailyTotal.toFixed(2)} ${request.currency}) to exceed daily limit of ${this.maxDailyAmount} ${request.currency}`,
        field: 'dailySpend',
        expected: this.maxDailyAmount,
        actual: projectedDailyTotal,
      };
    }

    return null;
  }
}
