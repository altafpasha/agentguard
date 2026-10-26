import { PaymentOrderRequest } from '../common/types';

/**
 * Deterministic Decision Contract
 * - ALLOW: policy permits the specific action. Server issues an authorization token.
 * - HOLD: action is persisted as pending approval; payment execution is prohibited.
 * - BLOCK: action is denied; payment execution is prohibited.
 */
export type PolicyDecision = 'ALLOW' | 'HOLD' | 'BLOCK';

/**
 * Standard Decision Record representing a versioned authorization decision
 */
export interface AuthorizationDecisionRecord {
  id?: string;
  requestId: string;
  agentId: string;
  policyId: string;
  policyVersion: number;
  tool: string;
  operation: string;
  amountCents: bigint;
  amountFormatted: string;
  currency: string;
  merchant: string;
  decision: PolicyDecision;
  reason: string;
  violations: string[];
  authorizationToken?: string | null;
  isExecuted: boolean;
  executedAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

/**
 * Versioned, validated policy definition
 */
export interface PolicyDefinition {
  id?: string;
  policyId: string;
  version: number;
  maxAmountCents: bigint;
  maxDailyAmountCents: bigint;
  approvalThresholdCents: bigint;
  allowedCurrencies: string[];
  allowedMerchants?: string[] | null; // null or undefined means all non-blocked merchants allowed
  blockedMerchants: string[];
  allowedTools: string[];
  allowedOperations: string[];
  velocityLimit: number; // max requests per window
  velocityWindowSeconds: number; // e.g. 3600s
  isActive: boolean;
  createdAt: string;
}

/**
 * Request payload for deterministic policy authorization inspection
 */
export interface AuthorizationRequest {
  requestId: string;
  agentId: string;
  tool: string; // e.g. 'paypal_payment'
  operation: string; // e.g. 'capture_payment' or 'create_order'
  amount: number | string;
  currency: string;
  merchant: {
    email: string;
    name?: string;
    merchantId?: string;
  };
  description: string;
  humanApprovalToken?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Storage contract for policies, cumulative daily spends, velocity tracking, and decision records
 */
export interface IPolicyStore {
  getActivePolicy(policyId: string): Promise<PolicyDefinition | null>;
  createPolicyVersion(policy: Omit<PolicyDefinition, 'id' | 'createdAt'>): Promise<PolicyDefinition>;
  getPolicyHistory(policyId: string): Promise<PolicyDefinition[]>;
  getDecisionByRequestId(requestId: string): Promise<AuthorizationDecisionRecord | null>;
  saveDecision(record: AuthorizationDecisionRecord): Promise<AuthorizationDecisionRecord>;
  markExecuted(requestId: string, authorizationToken: string): Promise<boolean>;
  getDailySpend(agentId: string, utcDate: string): Promise<bigint>;
  recordSpendWithAtomicCheck(
    agentId: string,
    utcDate: string,
    amountCents: bigint,
    dailyLimitCents: bigint
  ): Promise<{ success: boolean; currentDailySpendCents: bigint }>;
  getVelocityCount(agentId: string, sinceUtc: string): Promise<number>;
  recordVelocity(agentId: string, requestId: string, timestampUtc: string): Promise<void>;
}

/**
 * Backwards compatibility interfaces
 */
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
  decision: 'ALLOW' | 'DENY' | 'REQUIRE_HUMAN_APPROVAL';
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
