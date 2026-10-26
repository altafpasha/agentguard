import { IAuditRepository, AuditRecord } from './types';
import { sanitizeAuditPayload } from './sanitizer';

export class MemoryAuditRepository implements IAuditRepository {
  private events: AuditRecord[] = [];
  private isHealthy = true;

  public async recordEvent(event: AuditRecord): Promise<AuditRecord> {
    const record: AuditRecord = {
      ...event,
      id: event.id ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      riskResult: sanitizeAuditPayload(event.riskResult),
      payloadSummary: sanitizeAuditPayload(event.payloadSummary),
      createdAt: event.createdAt ?? new Date().toISOString(),
    };
    this.events.push(record);
    return record;
  }

  public async getEventsByRequestId(requestId: string): Promise<AuditRecord[]> {
    return this.events.filter((e) => e.requestId === requestId);
  }

  public async getEventsByAgentId(agentId: string, limit = 50): Promise<AuditRecord[]> {
    return this.events
      .filter((e) => e.agentId === agentId)
      .slice(-limit)
      .reverse();
  }

  public async healthCheck(): Promise<boolean> {
    return this.isHealthy;
  }

  public setHealthy(healthy: boolean): void {
    this.isHealthy = healthy;
  }

  public async close(): Promise<void> {
    this.events = [];
  }

  public clear(): void {
    this.events = [];
  }

  public async getAllEvents(limit = 100): Promise<AuditRecord[]> {
    return this.events.slice().reverse().slice(0, limit);
  }
}
