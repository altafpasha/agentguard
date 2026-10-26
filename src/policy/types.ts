import { PaymentOrderRequest, PolicyDecisionType } from '../common/types';

export interface PolicyViolation {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: 'BLOCK' | 'WARN';
  field?: string;
  expected?: string | number;
  actual?: string | number;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecisionType;
  allowed: boolean;
  requiresHumanApproval: boolean;
  violations: PolicyViolation[];
  evaluatedRules: string[];
  evaluationTimestamp: string;
  agentId: string;
  amount: number;
  currency: string;
}

export interface SpendTracker {
  getDailySpend(agentId: string): Promise<number>;
  recordSpend(agentId: string, amount: number): Promise<void>;
}

export interface PolicyContext {
  request: PaymentOrderRequest;
  dailySpentSoFar?: number;
}

export interface IPolicyRule {
  id: string;
  name: string;
  evaluate(context: PolicyContext): Promise<PolicyViolation | null> | PolicyViolation | null;
}
