import {
  AgentGuardConfig,
  EvaluateRequest,
  EvaluationResult,
  ApprovalRecord,
  WaitForApprovalOptions,
  PromptScanResult,
} from './types';
import {
  AgentGuardError,
  AgentGuardTimeoutError,
  AgentGuardGatewayError,
  parseErrorResponse,
} from './errors';

export class AgentGuard {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly workspaceId?: string;

  constructor(config: AgentGuardConfig) {
    if (!config.baseUrl || typeof config.baseUrl !== 'string') {
      throw new AgentGuardError('AgentGuard baseUrl is required and must be a valid URL.');
    }
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new AgentGuardError('AgentGuard apiKey is required.');
    }

    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey.trim();
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.maxRetries = config.maxRetries ?? 2;
    this.workspaceId = config.workspaceId;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'X-API-Key': this.apiKey,
      'User-Agent': 'agentguard-sdk-typescript/1.0.1',
      ...(config.headers || {}),
    };
  }

  /**
   * Pre-flight policy evaluation for autonomous AI agents and backend actions.
   *
   * Evaluates the intended action against deterministic spending caps, tool whitelists,
   * human approval thresholds, and adversarial prompt injection heuristic filters.
   *
   * Strict Fail-Closed Guarantee:
   * Timeouts, network interruptions, or gateway 5xx errors throw explicit typed errors.
   * To safely swallow exceptions into an authoritative BLOCK decision, use evaluateSafely().
   */
  public async evaluate(request: EvaluateRequest): Promise<EvaluationResult> {
    if (!request || !request.action) {
      throw new AgentGuardError('Evaluation request must contain an "action" field.');
    }

    const url = `${this.baseUrl}/api/v1/evaluate`;
    const requestId = request.idempotencyKey || `sdk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      'X-Request-Id': requestId,
    };

    if (this.workspaceId) {
      headers['X-Workspace-Id'] = this.workspaceId;
    }

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.code === 23 || err?.name === 'AbortError') {
        throw new AgentGuardTimeoutError(`AgentGuard evaluation timed out after ${this.timeoutMs}ms. Operation halted.`, requestId);
      }
      throw new AgentGuardGatewayError(`Failed to connect to AgentGuard gateway at ${this.baseUrl}: ${err.message}`, 503, requestId, err);
    }

    const responseRequestId = response.headers.get('x-request-id') || requestId;

    let body: any;
    try {
      body = await response.json();
    } catch (err) {
      if (!response.ok) {
        throw new AgentGuardGatewayError(`AgentGuard returned non-JSON response with HTTP ${response.status}`, response.status, responseRequestId);
      }
      throw new AgentGuardGatewayError(`Failed to parse AgentGuard JSON response: ${err}`, 500, responseRequestId);
    }

    // HTTP 200 (ALLOW), HTTP 202 (HOLD), HTTP 403 (BLOCK from policy violation)
    if (body && (body.status === 'ALLOW' || body.status === 'HOLD' || body.status === 'BLOCK')) {
      const status = body.status;
      return {
        status,
        decision: status,
        isAllowed: status === 'ALLOW',
        isHeld: status === 'HOLD',
        isBlocked: status === 'BLOCK',
        reason: body.reason || (status === 'ALLOW' ? 'Action permitted by policy' : 'Action restricted by policy'),
        violations: Array.isArray(body.violations) ? body.violations : [],
        requestId: body.requestId || responseRequestId,
        policyId: body.policyId,
        policyVersion: body.policyVersion,
        pendingApprovalId: body.pendingApprovalId,
        authorizationToken: body.authorizationToken,
        amountFormatted: body.amountFormatted,
        amountCents: body.amountCents,
        currency: body.currency,
        timestamp: body.timestamp || new Date().toISOString(),
        metadata: body.metadata,
      };
    }

    // For other errors (e.g. 401 unauthorized, 400 validation, 429 rate limit, 500 server error)
    if (!response.ok) {
      throw parseErrorResponse(response.status, body, responseRequestId);
    }

    throw new AgentGuardGatewayError(`Malformed evaluation response received from AgentGuard gateway`, response.status, responseRequestId, body);
  }

  /**
   * Safe evaluation wrapper with strict fail-closed guarantee.
   * Never throws exceptions; on any network failure or timeout, returns an authoritative BLOCK decision.
   */
  public async evaluateSafely(request: EvaluateRequest): Promise<EvaluationResult> {
    try {
      return await this.evaluate(request);
    } catch (err: any) {
      const reason = err instanceof AgentGuardError ? err.message : String(err);
      return {
        status: 'BLOCK',
        decision: 'BLOCK',
        isAllowed: false,
        isHeld: false,
        isBlocked: true,
        reason: `FAIL_CLOSED: ${reason}`,
        violations: [`Gateway communication error: ${reason}`],
        requestId: err?.requestId || `fail_closed_${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Retrieve human review approval record by ID.
   */
  public async getApproval(approvalId: string): Promise<ApprovalRecord> {
    if (!approvalId || typeof approvalId !== 'string') {
      throw new AgentGuardError('Approval ID is required.');
    }

    const url = `${this.baseUrl}/api/v1/approvals/${encodeURIComponent(approvalId)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: this.defaultHeaders,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new AgentGuardTimeoutError(`Request to fetch approval '${approvalId}' timed out.`);
      }
      throw new AgentGuardGatewayError(`Failed to fetch approval '${approvalId}': ${err.message}`, 503);
    }

    const body = await response.json();
    if (!response.ok) {
      throw parseErrorResponse(response.status, body);
    }

    return body as ApprovalRecord;
  }

  /**
   * Poll a held transaction until an operator approves, rejects, or it times out.
   */
  public async waitForApproval(
    approvalId: string,
    options: WaitForApprovalOptions = {}
  ): Promise<ApprovalRecord> {
    const pollIntervalMs = options.pollIntervalMs ?? 1000;
    const timeoutMs = options.timeoutMs ?? 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const record = await this.getApproval(approvalId);
      if (record.status !== 'PENDING') {
        return record;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new AgentGuardTimeoutError(`Timed out waiting for approval on '${approvalId}' after ${timeoutMs}ms.`);
  }

  /**
   * Scan prompt text for adversarial prompt injection heuristics.
   *
   * Evaluates input against detection rules for system prompt overrides,
   * jailbreak evasion, delimiter spoofing, and financial redirection attempts.
   *
   * Note on Gateway HTTP Statuses:
   * - Clean Prompt (No threat): Gateway responds HTTP 200 with isThreatDetected: false.
   * - Threat Detected: Gateway authoritatively rejects input with HTTP 403 Forbidden
   *   and includes the structured ScanResult (findings, riskScore, threatLevel).
   *   This method returns the validated PromptScanResult rather than throwing an exception.
   * - Unrelated 403 (Permission/Auth): Throws AgentGuardForbiddenError.
   */
  public async scanPrompt(input: string): Promise<PromptScanResult> {
    if (typeof input !== 'string') {
      throw new AgentGuardError('Prompt scan input must be a string.');
    }

    const url = `${this.baseUrl}/api/v1/scan`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify({ input }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.code === 23 || err?.name === 'AbortError') {
        throw new AgentGuardTimeoutError(`AgentGuard prompt scan timed out after ${this.timeoutMs}ms.`);
      }
      throw new AgentGuardGatewayError(`Failed to connect to AgentGuard gateway at ${this.baseUrl}: ${err.message}`, 503);
    }

    const responseRequestId = response.headers.get('x-request-id') || undefined;

    let body: any;
    try {
      body = await response.json();
    } catch (err) {
      if (!response.ok) {
        throw new AgentGuardGatewayError(`AgentGuard returned non-JSON response with HTTP ${response.status}`, response.status, responseRequestId);
      }
      throw new AgentGuardGatewayError(`Failed to parse AgentGuard JSON response: ${err}`, 500, responseRequestId);
    }

    // Authoritative threat scan result:
    // HTTP 200 (Clean / No threat detected) or HTTP 403 (Threat detected by security rules)
    const isRecognizedScanResult =
      body !== null &&
      typeof body === 'object' &&
      typeof body.isThreatDetected === 'boolean' &&
      typeof body.riskScore === 'number' &&
      typeof body.threatLevel === 'string' &&
      Array.isArray(body.findings);

    if (isRecognizedScanResult) {
      // Return validated scan result if clean (HTTP 200) or detected threat (HTTP 403)
      if (response.status === 200 || (response.status === 403 && body.isThreatDetected === true)) {
        return {
          isThreatDetected: body.isThreatDetected,
          riskScore: body.riskScore,
          threatLevel: body.threatLevel,
          findings: body.findings,
          sanitizedInput: typeof body.sanitizedInput === 'string' ? body.sanitizedInput : input,
          requestId: body.requestId || responseRequestId,
          agentId: body.agentId,
          scanDurationMs: body.scanDurationMs,
        };
      }
    }

    // For other errors (401 unauthorized, unexpected 403 forbidden, 400 validation, 500 gateway error)
    if (!response.ok) {
      throw parseErrorResponse(response.status, body, responseRequestId);
    }

    throw new AgentGuardGatewayError(`Malformed prompt scan response received from AgentGuard gateway`, response.status, responseRequestId, body);
  }
}

