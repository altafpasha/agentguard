export type AuditEventType =
  | 'REQUEST_RECEIVED'
  | 'INJECTION_SCAN_PASSED'
  | 'INJECTION_BLOCKED'
  | 'POLICY_EVALUATED'
  | 'POLICY_APPROVED'
  | 'POLICY_BLOCKED'
  | 'APPROVAL_REQUIRED'
  | 'ORDER_CREATED'
  | 'PAYMENT_ATTEMPTED'
  | 'PAYMENT_EXECUTION_GUARDED'
  | 'PAYMENT_COMPLETED'
  | 'PAYMENT_FAILED';

export type AuditEventStatus =
  | 'SUCCESS'
  | 'BLOCKED'
  | 'FAILED'
  | 'PENDING_APPROVAL'
  | 'GUARDED';

export interface AuditRecord {
  id?: string;
  requestId: string;
  agentId: string;
  eventType: AuditEventType;
  status: AuditEventStatus;
  riskScore?: number | null;
  policyDecision?: string | null;
  payloadSummary?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt?: string;
}

export interface IAuditRepository {
  recordEvent(event: AuditRecord): Promise<AuditRecord>;
  getEventsByRequestId(requestId: string): Promise<AuditRecord[]>;
  getEventsByAgentId(agentId: string, limit?: number): Promise<AuditRecord[]>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}
