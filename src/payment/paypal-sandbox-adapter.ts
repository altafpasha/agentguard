import {
  IPayPalClient,
  IPayPalSandboxAdapter,
  OrderReconciliationResult,
  PayPalConfig,
  PayPalOrderResponse,
  PaymentExecutionResult,
} from './types';
import { PayPalClient } from './paypal-client';
import { PaymentOrderRequest } from '../common/types';
import { PaymentExecutionNotEnabledError } from '../common/errors';
import { PayPalReconciliationError } from './errors';

export class PayPalSandboxAdapter implements IPayPalSandboxAdapter {
  private client: IPayPalClient;
  private allowLiveExecution: boolean;

  constructor(
    configOrClient: PayPalConfig | IPayPalClient,
    allowLiveExecution = false
  ) {
    if ('createOrder' in configOrClient && typeof configOrClient.createOrder === 'function') {
      this.client = configOrClient;
    } else {
      this.client = new PayPalClient(configOrClient as PayPalConfig);
    }
    this.allowLiveExecution = allowLiveExecution;
  }

  /**
   * Check whether real non-placeholder credentials have been supplied
   */
  public isConfigured(): boolean {
    return this.client.isConfigured();
  }

  /**
   * Verify credentials against PayPal Sandbox OAuth endpoint
   */
  public async verifyCredentials(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const token = await this.client.getAccessToken(true);
      return Boolean(token && token.length > 0);
    } catch {
      return false;
    }
  }

  /**
   * Create Sandbox Order resource (Separated from execution)
   */
  public async createOrder(
    request: PaymentOrderRequest,
    requestId: string
  ): Promise<PayPalOrderResponse> {
    return this.client.createOrder({
      requestId,
      purchaseData: {
        agentId: request.agentId,
        amount: request.amount,
        currency: request.currency,
        recipient: request.recipient,
        description: request.description,
        intent: request.intent || 'CAPTURE',
        referenceId: requestId,
      },
    });
  }

  /**
   * Retrieve Order details from PayPal Sandbox
   */
  public async getOrderDetails(orderId: string): Promise<PayPalOrderResponse> {
    return this.client.getOrder(orderId);
  }

  /**
   * Reconcile Order details against expectations
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
    return this.client.reconcileOrder(orderId, expectedContext);
  }

  /**
   * Execute Payment for an Authorized Request.
   *
   * STRICT INTEGRITY & SEPARATION RULES:
   * 1. Never capture merely because an AI agent requests it.
   * 2. When live execution is disabled, throw PaymentExecutionNotEnabledError.
   * 3. Reconciles state before executing, and prevents blind retries on timeout.
   */
  public async executePayment(
    request: PaymentOrderRequest,
    requestId: string,
    preApprovedOrderId?: string
  ): Promise<PaymentExecutionResult> {
    const timestamp = new Date().toISOString();

    // 1. Guard check: foundation phase execution flag
    if (!this.allowLiveExecution) {
      throw new PaymentExecutionNotEnabledError(
        'PayPal sandbox payment execution is pending foundation verification and live credentials. Gateway security verification passed, but payment execution is currently guarded.'
      );
    }

    // 2. Check credentials configuration
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
        executionTimestamp: timestamp,
      };
    }

    try {
      // 3. If pre-approved order ID is provided, reconcile and capture it
      if (preApprovedOrderId) {
        // Reconcile order details before capture
        const reconciliation = await this.client.reconcileOrder(preApprovedOrderId, {
          amount: request.amount,
          currency: request.currency,
          recipientEmail: request.recipient.email,
        });

        if (!reconciliation.isReconciled) {
          throw new PayPalReconciliationError(
            `Order verification failed before capture: ${reconciliation.discrepancies.join(', ')}`,
            { orderId: preApprovedOrderId, discrepancies: reconciliation.discrepancies }
          );
        }

        // If order already completed, return reconciled status safely
        if (reconciliation.status === 'COMPLETED' && reconciliation.captureStatus === 'COMPLETED') {
          return {
            executed: true,
            status: 'COMPLETED',
            message: `PayPal Sandbox order ${preApprovedOrderId} already successfully captured.`,
            requestId,
            agentId: request.agentId,
            amount: request.amount,
            currency: request.currency,
            recipientEmail: request.recipient.email,
            paypalOrderId: preApprovedOrderId,
            paypalCaptureId: reconciliation.captureId,
            executionTimestamp: timestamp,
            reconciliation,
          };
        }

        // Capture the approved order with idempotency
        const captureRes = await this.client.captureOrder({
          orderId: preApprovedOrderId,
          requestId,
          expectedAmount: request.amount,
          expectedCurrency: request.currency,
          expectedRecipientEmail: request.recipient.email,
        });

        const captureId = captureRes.purchase_units[0]?.payments?.captures?.[0]?.id;

        return {
          executed: true,
          status: 'COMPLETED',
          message: `PayPal Sandbox order ${preApprovedOrderId} captured successfully.`,
          requestId,
          agentId: request.agentId,
          amount: request.amount,
          currency: request.currency,
          recipientEmail: request.recipient.email,
          paypalOrderId: preApprovedOrderId,
          paypalCaptureId: captureId,
          executionTimestamp: timestamp,
        };
      }

      // 4. If no pre-approved order ID, create the sandbox order resource
      const order = await this.client.createOrder({
        requestId,
        purchaseData: {
          agentId: request.agentId,
          amount: request.amount,
          currency: request.currency,
          recipient: request.recipient,
          description: request.description,
          intent: request.intent || 'CAPTURE',
          referenceId: requestId,
        },
      });

      const approvalUrl = order.links.find((l) => l.rel === 'approve')?.href;

      return {
        executed: true,
        status: 'PAYPAL_ORDER_CREATED',
        message: `PayPal Sandbox order created with id ${order.id}. Awaiting buyer approval before capture.`,
        requestId,
        agentId: request.agentId,
        amount: request.amount,
        currency: request.currency,
        recipientEmail: request.recipient.email,
        paypalOrderId: order.id,
        approvalUrl,
        executionTimestamp: timestamp,
      };
    } catch (err) {
      return {
        executed: false,
        status: 'FAILED',
        message: `PayPal Sandbox payment dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
        requestId,
        agentId: request.agentId,
        amount: request.amount,
        currency: request.currency,
        recipientEmail: request.recipient.email,
        executionTimestamp: timestamp,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
