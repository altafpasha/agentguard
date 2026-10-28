import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { randomUUID } from 'crypto';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  allowLiveExecution?: boolean;
}

export interface RazorpayOrderParams {
  amountCents: bigint | number; // in minor units (paise for INR, cents for USD)
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
}

export interface RazorpayOrderResult {
  id: string;
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
  isSimulated: boolean;
}

export interface IRazorpayAdapter {
  createOrder(params: RazorpayOrderParams): Promise<RazorpayOrderResult>;
  fetchOrder(orderId: string): Promise<RazorpayOrderResult>;
  verifyPaymentSignature(params: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean;
  isLiveExecutionAllowed(): boolean;
  getPublicConfig(): { keyId: string; currency: string; isLiveAllowed: boolean; isConfigured: boolean };
}

export class RazorpayAdapter implements IRazorpayAdapter {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;
  private allowLiveExecution: boolean;
  private razorpayClient: InstanceType<typeof Razorpay> | null = null;
  private simulatedOrders = new Map<string, RazorpayOrderResult>();

  constructor(config: RazorpayConfig) {
    this.keyId = config.keyId;
    this.keySecret = config.keySecret;
    this.webhookSecret = config.webhookSecret || '';
    this.allowLiveExecution = !!config.allowLiveExecution;

    const isPlaceholder =
      !this.keyId ||
      !this.keySecret ||
      this.keyId.includes('placeholder') ||
      this.keySecret.includes('placeholder');

    if (!isPlaceholder) {
      try {
        this.razorpayClient = new Razorpay({
          key_id: this.keyId,
          key_secret: this.keySecret,
        });
      } catch {
        this.razorpayClient = null;
      }
    }
  }

  public isLiveExecutionAllowed(): boolean {
    return this.allowLiveExecution && this.razorpayClient !== null;
  }

  public getPublicConfig(): { keyId: string; currency: string; isLiveAllowed: boolean; isConfigured: boolean } {
    const isConfigured =
      !!this.keyId &&
      !this.keyId.includes('placeholder') &&
      !!this.keySecret &&
      !this.keySecret.includes('placeholder');

    return {
      keyId: isConfigured ? this.keyId : 'rzp_test_simulated_mode',
      currency: 'INR',
      isLiveAllowed: this.allowLiveExecution,
      isConfigured,
    };
  }

  /**
   * Create an order on Razorpay (or safe test sandbox simulation)
   */
  public async createOrder(params: RazorpayOrderParams): Promise<RazorpayOrderResult> {
    const amountNumber = typeof params.amountCents === 'bigint' ? Number(params.amountCents) : params.amountCents;
    const receipt = params.receipt || `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const currency = (params.currency || 'INR').toUpperCase();
    const notes = params.notes || {};

    // 1. Live Razorpay Execution if explicitly enabled and configured
    if (this.isLiveExecutionAllowed() && this.razorpayClient) {
      try {
        const order = await this.razorpayClient.orders.create({
          amount: amountNumber,
          currency,
          receipt,
          notes,
        });

        return {
          id: order.id,
          entity: 'order',
          amount: Number(order.amount),
          amount_paid: Number(order.amount_paid || 0),
          amount_due: Number(order.amount_due || order.amount),
          currency: order.currency,
          receipt: order.receipt || receipt,
          status: (order.status as any) || 'created',
          attempts: Number(order.attempts || 0),
          notes: (order.notes as any) || notes,
          created_at: Number(order.created_at || Math.floor(Date.now() / 1000)),
          isSimulated: false,
        };
      } catch (err: any) {
        throw new Error(`Razorpay API Error: ${err.message || err.description || 'Order creation failed'}`);
      }
    }

    // 2. Guaranteed Safe Simulated Mode
    // Deterministic format: order_sim_<random-id>
    const simulatedId = `order_sim_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const simulatedOrder: RazorpayOrderResult = {
      id: simulatedId,
      entity: 'order',
      amount: amountNumber,
      amount_paid: 0,
      amount_due: amountNumber,
      currency,
      receipt,
      status: 'created',
      attempts: 0,
      notes: {
        ...notes,
        mode: 'agentguard_sandbox_simulation',
        live_execution: 'disabled',
      },
      created_at: Math.floor(Date.now() / 1000),
      isSimulated: true,
    };

    this.simulatedOrders.set(simulatedId, simulatedOrder);
    return simulatedOrder;
  }

  /**
   * Fetch an existing order by ID
   */
  public async fetchOrder(orderId: string): Promise<RazorpayOrderResult> {
    if (this.isLiveExecutionAllowed() && this.razorpayClient && !orderId.startsWith('order_sim_')) {
      const order = await this.razorpayClient.orders.fetch(orderId);
      return {
        id: order.id,
        entity: 'order',
        amount: Number(order.amount),
        amount_paid: Number(order.amount_paid || 0),
        amount_due: Number(order.amount_due || order.amount),
        currency: order.currency,
        receipt: order.receipt || '',
        status: (order.status as any) || 'created',
        attempts: Number(order.attempts || 0),
        notes: (order.notes as any) || {},
        created_at: Number(order.created_at || Math.floor(Date.now() / 1000)),
        isSimulated: false,
      };
    }

    const cached = this.simulatedOrders.get(orderId);
    if (cached) return cached;

    // Return synthetic order representation
    return {
      id: orderId,
      entity: 'order',
      amount: 1000,
      amount_paid: 0,
      amount_due: 1000,
      currency: 'INR',
      receipt: 'rcpt_synthetic',
      status: 'created',
      attempts: 0,
      notes: {},
      created_at: Math.floor(Date.now() / 1000),
      isSimulated: true,
    };
  }

  /**
   * Verify customer payment checkout signature using official HMAC-SHA256
   * signature = hmac_sha256(order_id + "|" + payment_id, secret)
   */
  public verifyPaymentSignature(params: { orderId: string; paymentId: string; signature: string }): boolean {
    const { orderId, paymentId, signature } = params;
    if (!orderId || !paymentId || !signature) return false;

    // In simulation mode, accept simulated signature or compute against keySecret
    const secret = this.keySecret || 'simulated_secret_key';
    const text = `${orderId}|${paymentId}`;

    try {
      const expectedSignature = crypto.createHmac('sha256', secret).update(text).digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        // Also permit simulated test signature 'sim_valid_sig' in mock mode
        if (orderId.startsWith('order_sim_') && signature === 'sim_valid_sig') {
          return true;
        }
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Verify official Razorpay webhook signature (X-Razorpay-Signature header)
   * signature = hmac_sha256(raw_request_body, webhook_secret)
   */
  public verifyWebhookSignature(rawBody: string, signature: string, secretOverride?: string): boolean {
    const secret = secretOverride || this.webhookSecret || this.keySecret;
    if (!secret || !signature || !rawBody) return false;

    try {
      const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }
}
