/**
 * In-memory sliding window rate limiter and 429 backoff coordinator for AI provider calls.
 */
export class AIRateLimiter {
  private readonly maxRequestsPerMinute: number;
  private readonly windowMs: number;
  private requestTimestamps: number[] = [];
  private lockedUntilMs: number = 0;

  constructor(options: { maxRequestsPerMinute?: number; windowMs?: number } = {}) {
    this.maxRequestsPerMinute = options.maxRequestsPerMinute ?? 20;
    this.windowMs = options.windowMs ?? 60_000;
  }

  /**
   * Check if a request can be dispatched right now.
   * If rejected, returns reason and estimated wait time in ms.
   */
  public tryAcquire(): { allowed: boolean; waitMs?: number; reason?: string } {
    const now = Date.now();

    // Check if currently under 429 Retry-After lock
    if (now < this.lockedUntilMs) {
      const waitMs = this.lockedUntilMs - now;
      return {
        allowed: false,
        waitMs,
        reason: `Rate limit active from upstream provider. Retry after ${Math.ceil(waitMs / 1000)}s.`,
      };
    }

    // Prune timestamps older than window
    const windowStart = now - this.windowMs;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > windowStart);

    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      const oldest = this.requestTimestamps[0] ?? now;
      const waitMs = oldest + this.windowMs - now;
      return {
        allowed: false,
        waitMs: Math.max(waitMs, 100),
        reason: `Local rate limit of ${this.maxRequestsPerMinute} req/min exceeded. Wait ${Math.ceil(waitMs / 1000)}s.`,
      };
    }

    // Record request timestamp
    this.requestTimestamps.push(now);
    return { allowed: true };
  }

  /**
   * Record an upstream 429 Too Many Requests response with optional Retry-After header
   */
  public recordRateLimitHit(retryAfterSeconds: number = 60): void {
    const cooldownMs = Math.max(retryAfterSeconds, 1) * 1000;
    this.lockedUntilMs = Date.now() + cooldownMs;
  }

  /**
   * Current number of requests recorded in the current active window
   */
  public getActiveRequestCount(): number {
    const windowStart = Date.now() - this.windowMs;
    return this.requestTimestamps.filter((ts) => ts > windowStart).length;
  }

  /**
   * Reset rate limiter state (useful for tests)
   */
  public reset(): void {
    this.requestTimestamps = [];
    this.lockedUntilMs = 0;
  }
}
