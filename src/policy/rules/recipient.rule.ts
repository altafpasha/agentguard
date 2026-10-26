import { IPolicyRule, PolicyContext, PolicyViolation } from '../types';

export class RecipientRule implements IPolicyRule {
  public readonly id = 'POL-003';
  public readonly name = 'Recipient Allowlist and Denylist Filtering';

  private denylist: Set<string>;
  private allowlist: Set<string> | null;

  constructor(denylist: string[] = [], allowlist?: string[]) {
    this.denylist = new Set(denylist.map((d) => d.toLowerCase().trim()).filter(Boolean));
    this.allowlist = allowlist && allowlist.length > 0
      ? new Set(allowlist.map((a) => a.toLowerCase().trim()).filter(Boolean))
      : null;
  }

  public evaluate(context: PolicyContext): PolicyViolation | null {
    const recipientEmail = context.request.recipient.email.toLowerCase().trim();
    const recipientDomain = recipientEmail.includes('@') ? recipientEmail.split('@')[1] : '';

    // Check denylist
    if (this.denylist.has(recipientEmail) || (recipientDomain && this.denylist.has(recipientDomain))) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: 'BLOCK',
        message: `Recipient '${recipientEmail}' is in the security denylist and cannot receive payments`,
        field: 'recipient.email',
      };
    }

    // Check allowlist (if configured)
    if (this.allowlist !== null && !this.allowlist.has(recipientEmail) && !(recipientDomain && this.allowlist.has(recipientDomain))) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: 'BLOCK',
        message: `Recipient '${recipientEmail}' is not in the authorized recipient allowlist`,
        field: 'recipient.email',
      };
    }

    return null;
  }
}
