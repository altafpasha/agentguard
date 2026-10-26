import { IPayPalSandboxAdapter, PayPalConfig, PaymentExecutionResult } from './types';
import { PaymentOrderRequest } from '../common/types';
import { PaymentExecutionNotEnabledError } from '../common/errors';

export class PayPalSandboxAdapter implements IPayPalSandboxAdapter {
  private config: PayPalConfig;
  private allowLiveExecution: boolean;

  constructor(config: PayPalConfig, allowLiveExecution = false) {
    this.config = config;
    this.allowLiveExecution = allowLiveExecution;
  }

  /**
   * Check whether non-placeholder credentials have been supplied
   */
  public isConfigured(): boolean {
    const { clientId, clientSecret } = this.config;
    return Boolean(
      clientId &&
      clientSecret &&
      !clientId.includes('placeholder') &&
      !clientSecret.includes('placeholder')
    );
  }

  /**
   * Check if PayPal credentials can obtain a token from PayPal sandbox
   */
  public async verifyCredentials(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      const response = await fetch(`${this.config.apiBaseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Initiate PayPal Sandbox Payment.
   *
   * STRICT INTEGRITY CONSTRAINTS:
   * 1. Does not pretend payment integration is complete or that payment succeeded.
   * 2. Never returns a fake successful status (e.g., 'COMPLETED' or 'APPROVED') when payment was not executed.
   * 3. Honors the STOP CONDITION: "Do not begin payment execution until the foundation builds and tests pass."
   */
  public async executePayment(
    request: PaymentOrderRequest,
    requestId: string
  ): Promise<PaymentExecutionResult> {
    // If live execution is not enabled (foundation phase), safely guard and return exact status
    if (!this.allowLiveExecution) {
      throw new PaymentExecutionNotEnabledError(
        'PayPal sandbox payment execution is pending foundation verification and live credentials. Gateway security verification passed, but payment execution is currently guarded.'
      );
    }

    // If live execution is enabled but credentials are placeholders
    if (!this.isConfigured()) {
      return {
        executed: false,
        status: 'EXECUTION_NOT_ENABLED',
        message: 'PayPal Sandbox credentials are placeholder values. Live sandbox dispatch aborted.',
        requestId,
        agentId: request.agentId,
        amount: request.amount,
        currency: request.currency,
        recipientEmail: request.recipient.email,
        executionTimestamp: new Date().toISOString(),
      };
    }

    // Live PayPal Sandbox API call (when enabled and configured)
    try {
      const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      const tokenRes = await fetch(`${this.config.apiBaseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (!tokenRes.ok) {
        return {
          executed: false,
          status: 'FAILED',
          message: `PayPal Sandbox OAuth authorization failed: HTTP ${tokenRes.status}`,
          requestId,
          agentId: request.agentId,
          amount: request.amount,
          currency: request.currency,
          recipientEmail: request.recipient.email,
          executionTimestamp: new Date().toISOString(),
          error: await tokenRes.text(),
        };
      }

      const tokenData = (await tokenRes.json()) as { access_token: string };

      // Dispatch order creation to PayPal Sandbox v2/checkout/orders
      const orderRes = await fetch(`${this.config.apiBaseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': requestId,
        },
        body: JSON.stringify({
          intent: request.intent ?? 'CAPTURE',
          purchase_units: [
            {
              amount: {
                currency_code: request.currency.toUpperCase(),
                value: request.amount.toFixed(2),
              },
              description: request.description,
              payee: {
                email_address: request.recipient.email,
              },
            },
          ],
        }),
      });

      const orderData = (await orderRes.json()) as { id?: string; status?: string; message?: string };

      if (!orderRes.ok) {
        return {
          executed: false,
          status: 'FAILED',
          message: `PayPal Sandbox order creation failed: ${orderData.message ?? 'Unknown error'}`,
          requestId,
          agentId: request.agentId,
          amount: request.amount,
          currency: request.currency,
          recipientEmail: request.recipient.email,
          executionTimestamp: new Date().toISOString(),
          error: JSON.stringify(orderData),
        };
      }

      return {
        executed: true,
        status: 'PAYPAL_API_PENDING',
        message: `PayPal Sandbox order created with id ${orderData.id}, awaiting approval/capture`,
        requestId,
        agentId: request.agentId,
        amount: request.amount,
        currency: request.currency,
        recipientEmail: request.recipient.email,
        paypalOrderId: orderData.id,
        executionTimestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        executed: false,
        status: 'FAILED',
        message: `PayPal Sandbox network connection failed: ${err instanceof Error ? err.message : String(err)}`,
        requestId,
        agentId: request.agentId,
        amount: request.amount,
        currency: request.currency,
        recipientEmail: request.recipient.email,
        executionTimestamp: new Date().toISOString(),
        error: String(err),
      };
    }
  }
}
