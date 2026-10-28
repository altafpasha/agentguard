import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import { RazorpayAdapter } from '../../src/payment/razorpay-client';

describe('RazorpayAdapter Unit Tests', () => {
  const testSecret = 'secret_test_key_12345';
  const testWebhookSecret = 'webhook_secret_key_67890';

  it('initializes in simulation mode when placeholder credentials are provided', () => {
    const adapter = new RazorpayAdapter({
      keyId: 'rzp_test_placeholder_key_id',
      keySecret: 'placeholder_secret',
      webhookSecret: testWebhookSecret,
      allowLiveExecution: false,
    });

    expect(adapter.isLiveExecutionAllowed()).toBe(false);
    const config = adapter.getPublicConfig();
    expect(config.isConfigured).toBe(false);
    expect(config.isLiveAllowed).toBe(false);
    expect(config.currency).toBe('INR');
  });

  it('creates simulated order deterministically without external network calls', async () => {
    const adapter = new RazorpayAdapter({
      keyId: 'rzp_test_placeholder_key_id',
      keySecret: 'placeholder_secret',
    });

    const order = await adapter.createOrder({
      amountCents: 350000n, // 3500.00 INR
      currency: 'INR',
      receipt: 'rcpt_test_001',
      notes: { agent_id: 'test_agent' },
    });

    expect(order.id).toMatch(/^order_sim_/);
    expect(order.amount).toBe(350000);
    expect(order.currency).toBe('INR');
    expect(order.status).toBe('created');
    expect(order.isSimulated).toBe(true);
    expect(order.receipt).toBe('rcpt_test_001');

    // Fetching the simulated order
    const fetched = await adapter.fetchOrder(order.id);
    expect(fetched.id).toBe(order.id);
    expect(fetched.amount).toBe(350000);
  });

  it('verifies valid HMAC-SHA256 payment signature correctly', () => {
    const adapter = new RazorpayAdapter({
      keyId: 'rzp_test_real_id',
      keySecret: testSecret,
    });

    const orderId = 'order_123456';
    const paymentId = 'pay_987654';
    const validSignature = crypto
      .createHmac('sha256', testSecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = adapter.verifyPaymentSignature({
      orderId,
      paymentId,
      signature: validSignature,
    });

    expect(isValid).toBe(true);
  });

  it('rejects tampered or mismatched payment signature', () => {
    const adapter = new RazorpayAdapter({
      keyId: 'rzp_test_real_id',
      keySecret: testSecret,
    });

    const orderId = 'order_123456';
    const paymentId = 'pay_987654';
    const forgedSignature = 'forged_tampered_signature_hex_value';

    const isValid = adapter.verifyPaymentSignature({
      orderId,
      paymentId,
      signature: forgedSignature,
    });

    expect(isValid).toBe(false);
  });

  it('verifies valid webhook signature with constant-time equality', () => {
    const adapter = new RazorpayAdapter({
      keyId: 'rzp_test_id',
      keySecret: testSecret,
      webhookSecret: testWebhookSecret,
    });

    const payload = JSON.stringify({ event: 'order.paid', id: 'evt_123' });
    const validSignature = crypto
      .createHmac('sha256', testWebhookSecret)
      .update(payload)
      .digest('hex');

    const isValid = adapter.verifyWebhookSignature(payload, validSignature);
    expect(isValid).toBe(true);
  });

  it('rejects invalid or forged webhook signatures', () => {
    const adapter = new RazorpayAdapter({
      keyId: 'rzp_test_id',
      keySecret: testSecret,
      webhookSecret: testWebhookSecret,
    });

    const payload = JSON.stringify({ event: 'order.paid', id: 'evt_123' });
    const invalidSignature = 'invalid_webhook_signature';

    const isValid = adapter.verifyWebhookSignature(payload, invalidSignature);
    expect(isValid).toBe(false);
  });
});
