import { IPolicyRule, PolicyContext, PolicyViolation } from '../types';

export class CurrencyRule implements IPolicyRule {
  public readonly id = 'POL-002';
  public readonly name = 'Currency Whitelist Validation';

  private allowedCurrencies: Set<string>;

  constructor(allowedCurrencies: string[]) {
    this.allowedCurrencies = new Set(allowedCurrencies.map((c) => c.toUpperCase()));
  }

  public evaluate(context: PolicyContext): PolicyViolation | null {
    const currency = context.request.currency.toUpperCase();

    if (!this.allowedCurrencies.has(currency)) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: 'BLOCK',
        message: `Currency '${currency}' is not permitted. Allowed currencies: ${Array.from(this.allowedCurrencies).join(', ')}`,
        field: 'currency',
        expected: Array.from(this.allowedCurrencies).join(','),
        actual: currency,
      };
    }

    return null;
  }
}
