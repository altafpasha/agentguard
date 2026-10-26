import {
  CaptureOrderOptions,
  CreateOrderOptions,
  IPayPalClient,
  OrderReconciliationResult,
  PayPalCaptureResponse,
  PayPalConfig,
  PayPalOAuthToken,
  PayPalOrderResponse,
} from './types';
import {
  PayPalAuthError,
  PayPalApiError,
  PayPalNetworkError,
  PayPalReconciliationError,
  PayPalSecurityError,
} from './errors';

const DEFAULT_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TOKEN_BUFFER_SECONDS = 60;

export class PayPalClient implements IPayPalClient {
  private config: PayPalConfig;
  private cachedToken: PayPalOAuthToken | null = null;
  private tokenInFlightPromise: Promise<string> | null = null;

  constructor(config: PayPalConfig) {
    // Security constraint: enforce Sandbox exclusively in hackathon build
    if (config.environment !== 'sandbox') {
      throw new PayPalSecurityError(
        'Production / Live PayPal environment is strictly disabled in AgentGuard. Only sandbox environment is supported.'
      );
    }

    if (
      config.apiBaseUrl.includes('api-m.paypal.com') &&
      !config.apiBaseUrl.includes('sandbox')
    ) {
      throw new PayPalSecurityError(
        'Production PayPal API endpoint is strictly prohibited in AgentGuard. Must use sandbox endpoint.'
      );
    }

    this.config = {
      ...config,
      apiBaseUrl: config.apiBaseUrl || DEFAULT_SANDBOX_BASE_URL,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      tokenExpiryBufferSeconds: config.tokenExpiryBufferSeconds ?? DEFAULT_TOKEN_BUFFER_SECONDS,
    };
  }

  /**
   * Check whether real (non-placeholder) credentials are provided
   */
  public isConfigured(): boolean {
    const { clientId, clientSecret } = this.config;
    return Boolean(
      clientId &&
      clientSecret &&
      !clientId.includes('placeholder') &&
      !clientSecret.includes('placeholder') &&
      clientId.length > 5 &&
      clientSecret.length > 5
    );
  }

  /**
   * Acquire OAuth2 access token with in-memory caching and request coalescing
   */
  public async getAccessToken(forceRefresh = false): Promise<string> {
    if (!this.isConfigured()) {
      throw new PayPalAuthError(
        'PayPal Sandbox credentials are not configured or are placeholder values.',
        { configured: false }
      );
    }

    const bufferMs = (this.config.tokenExpiryBufferSeconds ?? DEFAULT_TOKEN_BUFFER_SECONDS) * 1000;

    // Return cached token if still valid and not within the expiration buffer
    if (!forceRefresh && this.cachedToken && Date.now() < this.cachedToken.expires_at - bufferMs) {
      return this.cachedToken.access_token;
    }

    // Coalesce concurrent refresh requests to prevent thundering herd
    if (this.tokenInFlightPromise) {
      return this.tokenInFlightPromise;
    }

    this.tokenInFlightPromise = this.requestNewOAuthToken().finally(() => {
      this.tokenInFlightPromise = null;
    });

    return this.tokenInFlightPromise;
  }

  /**
   * Internal OAuth request to /v1/oauth2/token
   */
  private async requestNewOAuthToken(): Promise<string> {
    const endpoint = `${this.config.apiBaseUrl.replace(/\/+$/, '')}/v1/oauth2/token`;
    const authHeader = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64'
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'Accept-Language': 'en_US',
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // Never log or leak credentials in error message
        throw new PayPalAuthError(
          `PayPal Sandbox OAuth authentication failed: HTTP ${response.status}`,
          { status: response.status, responseText: errorText }
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
      };

      if (!data.access_token || typeof data.expires_in !== 'number') {
        throw new PayPalAuthError('Malformed OAuth response from PayPal Sandbox.');
      }

      this.cachedToken = {
        access_token: data.access_token,
        token_type: data.token_type || 'Bearer',
        expires_in: data.expires_in,
        expires_at: Date.now() + data.expires_in * 1000,
      };

      return this.cachedToken.access_token;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof PayPalAuthError) {
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new PayPalNetworkError(
          `PayPal OAuth token request timed out after ${this.config.timeoutMs}ms.`
        );
      }

      throw new PayPalAuthError(
        `PayPal OAuth network connection failure: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Create Sandbox Order (POST /v2/checkout/orders) using validated, server-generated purchase data
   */
  public async createOrder(options: CreateOrderOptions): Promise<PayPalOrderResponse> {
    const { requestId, purchaseData } = options;

    // Validate purchase parameters prior to calling PayPal API
    if (!purchaseData.amount || purchaseData.amount <= 0 || !Number.isFinite(purchaseData.amount)) {
      throw new PayPalApiError('Invalid purchase amount: must be a positive finite number.', 400);
    }

    if (!purchaseData.currency || purchaseData.currency.trim().length !== 3) {
      throw new PayPalApiError(
        'Invalid currency code: must be a 3-letter ISO code (e.g. USD).',
        400
      );
    }

    if (!purchaseData.recipient?.email || !purchaseData.recipient.email.includes('@')) {
      throw new PayPalApiError('Invalid recipient: email address is required.', 400);
    }

    const currencyCode = purchaseData.currency.trim().toUpperCase();
    const formattedAmount = purchaseData.amount.toFixed(2);
    const referenceId = purchaseData.referenceId || requestId;

    const payload = {
      intent: purchaseData.intent || 'CAPTURE',
      purchase_units: [
        {
          reference_id: referenceId,
          description: purchaseData.description,
          amount: {
            currency_code: currencyCode,
            value: formattedAmount,
          },
          payee: {
            email_address: purchaseData.recipient.email.toLowerCase(),
            ...(purchaseData.recipient.merchantId
              ? { merchant_id: purchaseData.recipient.merchantId }
              : {}),
          },
        },
      ],
      application_context: {
        brand_name: 'AgentGuard Security Gateway',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: 'https://agentguard.security/checkout/complete',
        cancel_url: 'https://agentguard.security/checkout/cancelled',
      },
    };

    const token = await this.getAccessToken();
    const endpoint = `${this.config.apiBaseUrl.replace(/\/+$/, '')}/v2/checkout/orders`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': requestId, // Enforce idempotency
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 401 token expiry retry
      if (response.status === 401) {
        this.cachedToken = null;
        const freshToken = await this.getAccessToken(true);
        return this.retryCreateOrderWithToken(freshToken, endpoint, payload, requestId);
      }

      const responseBody = await response.json();

      if (!response.ok) {
        const issue = (responseBody as { details?: Array<{ issue?: string }> })?.details?.[0]
          ?.issue;
        throw new PayPalApiError(
          `PayPal Sandbox order creation failed: HTTP ${response.status}`,
          response.status,
          responseBody,
          issue
        );
      }

      return responseBody as PayPalOrderResponse;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof PayPalApiError || err instanceof PayPalAuthError) {
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new PayPalNetworkError(
          `PayPal createOrder timed out after ${this.config.timeoutMs}ms. PayPal-Request-Id was preserved for safe idempotency.`
        );
      }

      throw new PayPalApiError(
        `PayPal createOrder network error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async retryCreateOrderWithToken(
    token: string,
    endpoint: string,
    payload: unknown,
    requestId: string
  ): Promise<PayPalOrderResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': requestId,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        throw new PayPalApiError(`PayPal createOrder retry failed: HTTP ${response.status}`, response.status, data);
      }

      return data as PayPalOrderResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Retrieve order details (GET /v2/checkout/orders/{id}) with bounded retries for safe idempotent reads
   */
  public async getOrder(orderId: string): Promise<PayPalOrderResponse> {
    if (!orderId || typeof orderId !== 'string') {
      throw new PayPalApiError('orderId is required to retrieve order details.', 400);
    }

    const token = await this.getAccessToken();
    const endpoint = `${this.config.apiBaseUrl.replace(/\/+$/, '')}/v2/checkout/orders/${encodeURIComponent(orderId)}`;
    const maxRetries = this.config.maxRetries ?? DEFAULT_MAX_RETRIES;

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 401 && attempt <= maxRetries) {
          this.cachedToken = null;
          await this.getAccessToken(true);
          continue;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new PayPalApiError(
            `PayPal Sandbox getOrder failed: HTTP ${response.status}`,
            response.status,
            data
          );
        }

        return data as PayPalOrderResponse;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err instanceof PayPalApiError && err.statusCode < 500 && err.statusCode !== 401) {
          throw err;
        }

        if (attempt > maxRetries) {
          break;
        }

        // Exponential backoff for read retries
        await new Promise((res) => setTimeout(res, attempt * 150));
      }
    }

    if (lastError instanceof PayPalApiError) {
      throw lastError;
    }

    throw new PayPalNetworkError(
      `Failed to retrieve PayPal order details after ${maxRetries + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }

  /**
   * Verify and reconcile order details against expected values
   */
  public async reconcileOrder(
    orderId: string,
    expectedContext?: {
      amount?: number;
      currency?: string;
      recipientEmail?: string;
      referenceId?: string;
    }
  ): Promise<OrderReconciliationResult> {
    const order = await this.getOrder(orderId);
    const discrepancies: string[] = [];

    const purchaseUnit = order.purchase_units[0];
    if (!purchaseUnit) {
      discrepancies.push('Order contains no purchase units.');
    }

    const orderAmount = purchaseUnit?.amount?.value ? parseFloat(purchaseUnit.amount.value) : 0;
    const orderCurrency = purchaseUnit?.amount?.currency_code?.toUpperCase() || '';
    const orderRecipient = purchaseUnit?.payee?.email_address?.toLowerCase();
    const orderReferenceId = purchaseUnit?.reference_id;

    if (expectedContext?.amount !== undefined) {
      if (Math.abs(orderAmount - expectedContext.amount) > 0.001) {
        discrepancies.push(
          `Amount mismatch: expected ${expectedContext.amount}, found ${orderAmount}`
        );
      }
    }

    if (expectedContext?.currency !== undefined) {
      if (orderCurrency !== expectedContext.currency.toUpperCase()) {
        discrepancies.push(
          `Currency mismatch: expected ${expectedContext.currency}, found ${orderCurrency}`
        );
      }
    }

    if (expectedContext?.recipientEmail !== undefined) {
      if (orderRecipient && orderRecipient !== expectedContext.recipientEmail.toLowerCase()) {
        discrepancies.push(
          `Recipient mismatch: expected ${expectedContext.recipientEmail}, found ${orderRecipient}`
        );
      }
    }

    if (expectedContext?.referenceId !== undefined) {
      if (orderReferenceId && orderReferenceId !== expectedContext.referenceId) {
        discrepancies.push(
          `Reference ID mismatch: expected ${expectedContext.referenceId}, found ${orderReferenceId}`
        );
      }
    }

    // Inspect capture status if present
    const capture = purchaseUnit?.payments?.captures?.[0];
    const captureStatus = capture?.status ?? 'NONE';
    const captureId = capture?.id;

    return {
      isReconciled: discrepancies.length === 0,
      orderId: order.id,
      status: order.status,
      captureStatus,
      captureId,
      amount: orderAmount,
      currency: orderCurrency,
      recipientEmail: orderRecipient,
      referenceId: orderReferenceId,
      discrepancies,
      reconciledAt: new Date().toISOString(),
    };
  }

  /**
   * Capture Payment for an Approved Order.
   *
   * CRITICAL SECURITY & INTEGRITY REQUIREMENT:
   * "Never blindly retry a non-idempotent payment action after an ambiguous network timeout. Reconcile its status first."
   */
  public async captureOrder(options: CaptureOrderOptions): Promise<PayPalCaptureResponse> {
    const { orderId, requestId } = options;

    if (!orderId) {
      throw new PayPalApiError('orderId is required to capture payment.', 400);
    }

    const token = await this.getAccessToken();
    const endpoint = `${this.config.apiBaseUrl.replace(/\/+$/, '')}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': requestId, // Enforce payment idempotency
          Prefer: 'return=representation',
        },
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new PayPalApiError(
          `PayPal Sandbox capture failed: HTTP ${response.status}`,
          response.status,
          data
        );
      }

      return data as PayPalCaptureResponse;
    } catch (err) {
      clearTimeout(timeoutId);

      // If HTTP error response was already received, rethrow directly
      if (err instanceof PayPalApiError || err instanceof PayPalAuthError) {
        throw err;
      }

      // AMBIGUOUS NETWORK TIMEOUT OR CONNECTION RESET:
      // DO NOT blindly retry capture! Reconcile order state first!
      try {
        const reconciliation = await this.reconcileOrder(orderId, {
          amount: options.expectedAmount,
          currency: options.expectedCurrency,
          recipientEmail: options.expectedRecipientEmail,
          referenceId: options.expectedReferenceId,
        });

        // Case A: The capture succeeded on PayPal's side before the network dropped!
        if (reconciliation.status === 'COMPLETED' && reconciliation.captureStatus === 'COMPLETED') {
          return {
            id: orderId,
            status: 'COMPLETED',
            purchase_units: [
              {
                reference_id: reconciliation.referenceId,
                amount: {
                  currency_code: reconciliation.currency,
                  value: reconciliation.amount.toFixed(2),
                },
                payments: {
                  captures: [
                    {
                      id: reconciliation.captureId || 'reconciled-capture',
                      status: 'COMPLETED',
                      amount: {
                        currency_code: reconciliation.currency,
                        value: reconciliation.amount.toFixed(2),
                      },
                    },
                  ],
                },
              },
            ],
          };
        }

        // Case B: Capture did not complete on PayPal's side (e.g. order still APPROVED or CREATED)
        throw new PayPalReconciliationError(
          `Network timeout during payment capture. State reconciled: Order status is ${reconciliation.status}, capture status is ${reconciliation.captureStatus}. Blind retry was safely prevented.`,
          { orderId, reconciliation }
        );
      } catch (reconcileErr) {
        if (reconcileErr instanceof PayPalReconciliationError) {
          throw reconcileErr;
        }

        throw new PayPalNetworkError(
          `Network timeout during capture. Subsequent state reconciliation query also failed: ${reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr)}`,
          { orderId, originalError: err instanceof Error ? err.message : String(err) }
        );
      }
    }
  }

  /**
   * Clear cached OAuth token
   */
  public clearTokenCache(): void {
    this.cachedToken = null;
  }
}
