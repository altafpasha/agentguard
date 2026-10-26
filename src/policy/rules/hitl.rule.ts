import { IPolicyRule, PolicyContext, PolicyViolation } from '../types';

export class HitlRule implements IPolicyRule {
  public readonly id = 'POL-004';
  public readonly name = 'Human-in-the-Loop Threshold Validation';

  constructor(private readonly hitlThreshold: number) {}

  public evaluate(context: PolicyContext): PolicyViolation | null {
    const { request } = context;

    if (request.amount > this.hitlThreshold) {
      const hasValidApproval =
        typeof request.humanApprovalToken === 'string' &&
        request.humanApprovalToken.trim().length >= 8;

      if (!hasValidApproval) {
        return {
          ruleId: this.id,
          ruleName: this.name,
          severity: 'WARN',
          message: `Transaction amount ${request.amount} ${request.currency} exceeds auto-approval threshold of ${this.hitlThreshold} ${request.currency}. Explicit human approval token required.`,
          field: 'humanApprovalToken',
          expected: `Token for amounts > ${this.hitlThreshold}`,
          actual: request.humanApprovalToken ? 'Invalid' : 'Missing',
        };
      }
    }

    return null;
  }
}
