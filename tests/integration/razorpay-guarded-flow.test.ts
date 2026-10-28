import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import * as crypto from 'crypto';
import { buildApp } from '../../src/app';
import { MemoryReviewerAuthService } from '../../src/auth/service';
import { MemoryAuditRepository } from '../../src/audit/memory-audit-repo';
import { EnvConfig } from '../../src/config';

describe('Guarded Razorpay Integration Flow Tests', () => {
  let app: FastifyInstance;
  let auditRepo: MemoryAuditRepository;
  let authService: MemoryReviewerAuthService;

  const testKeySecret = 'test_secret_for_razorpay_tests';
  const testWebhookSecret = 'test_webhook_secret_key_123';

  const testConfig: EnvConfig = {
    NODE_ENV: 'test',
    PORT: 3001,
    HOST: '127.0.0.1',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'memory://test',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL: 'test-model',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENROUTER_TIMEOUT_MS: 5000,
    OPENROUTER_MAX_RETRIES: 1,
    OPENROUTER_MAX_CONTEXT_CHARS: 4000,
    OPENROUTER_RATE_LIMIT_RPM: 60,
    PAYPAL_CLIENT_ID: 'test-client',
    PAYPAL_CLIENT_SECRET: 'test-secret',
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_API_BASE_URL: 'https://api-m.sandbox.paypal.com',
    PAYPAL_ALLOW_LIVE_EXECUTION: false,
    PAYPAL_TIMEOUT_MS: 5000,
    POLICY_MAX_TRANSACTION_AMOUNT: 50,
    POLICY_MAX_DAILY_AMOUNT: 200,
    POLICY_ALLOWED_CURRENCIES: ['USD', 'INR', 'EUR'],
    POLICY_REQUIRE_HUMAN_APPROVAL_THRESHOLD: 25,
    POLICY_REQUIRE_AI_RISK_ANALYSIS: false,
    POLICY_RECIPIENT_DENYLIST: ['blocked@attacker.com'],
    RAZORPAY_KEY_ID: 'rzp_test_simulated_mode',
    RAZORPAY_KEY_SECRET: testKeySecret,
    RAZORPAY_WEBHOOK_SECRET: testWebhookSecret,
    RAZORPAY_ALLOW_LIVE_EXECUTION: false,
  };

  beforeAll(async () => {
    authService = new MemoryReviewerAuthService();
    auditRepo = new MemoryAuditRepository();
    app = buildApp({
      config: testConfig,
      authService,
      auditRepo,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/integrations/razorpay/config returns public key and currency config', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/razorpay/config',
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.currency).toBe('INR');
    expect(json.data.keyId).toBeDefined();
  });

  it('POST /api/v1/integrations/razorpay/evaluate returns ALLOW for compliant action', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/razorpay/evaluate',
      payload: {
        agentId: 'travel-agent-1',
        amount: 20.0,
        currency: 'INR',
        merchant: 'merchant@company.com',
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.decision).toBe('ALLOW');
    expect(json.authorizationToken).toBeDefined();
  });

  it('POST /api/v1/integrations/razorpay/orders creates simulated order when ALLOW', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/razorpay/orders',
      payload: {
        agentId: 'travel-agent-1',
        amount: 20.0,
        currency: 'INR',
        receipt: 'rcpt_order_1',
        customer: {
          email: 'customer@example.com',
          name: 'Jane Doe',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.status).toBe('ALLOWED');
    expect(json.decision).toBe('ALLOW');
    expect(json.order).toBeDefined();
    expect(json.order.id).toMatch(/^order_sim_/);
    expect(json.order.amount).toBe(2000); // 20.00 in paise
  });

  it('POST /api/v1/integrations/razorpay/orders returns 403 BLOCK and halts execution when exceeding limit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/razorpay/orders',
      payload: {
        agentId: 'travel-agent-1',
        amount: 150000.0, // Exceeds 50.00 limit
        currency: 'INR',
      },
    });

    expect(res.statusCode).toBe(403);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.decision).toBe('BLOCK');
    expect(json.status).toBe('BLOCKED');
    expect(json.order).toBeUndefined();
  });

  it('POST /api/v1/integrations/razorpay/orders returns 202 HOLD when exceeding human review threshold', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/razorpay/orders',
      payload: {
        agentId: 'travel-agent-1',
        amount: 35.0, // Exceeds 25.00 threshold
        currency: 'USD',
      },
    });

    expect(res.statusCode).toBe(202);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.decision).toBe('HOLD');
    expect(json.status).toBe('PENDING_APPROVAL');
    expect(json.pendingApprovalId).toBeDefined();
    expect(json.order).toBeUndefined(); // Razorpay order was NEVER created
  });

  it('POST /api/v1/integrations/razorpay/verify-payment verifies valid HMAC-SHA256 signature', async () => {
    const orderId = 'order_test_998877';
    const paymentId = 'pay_test_445566';
    const validSignature = crypto
      .createHmac('sha256', testKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/razorpay/verify-payment',
      payload: {
        orderId,
        paymentId,
        signature: validSignature,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.verified).toBe(true);
  });

  it('POST /api/v1/integrations/razorpay/verify-payment rejects tampered signature with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/razorpay/verify-payment',
      payload: {
        orderId: 'order_test_998877',
        paymentId: 'pay_test_445566',
        signature: 'invalid_tampered_signature_string',
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.verified).toBe(false);
    expect(json.error).toBe('INVALID_SIGNATURE');
  });

  it('POST /api/v1/integrations/razorpay/webhook accepts valid signature and rejects forged webhook', async () => {
    const webhookPayload = JSON.stringify({
      event: 'order.paid',
      payload: {
        order: { entity: { id: 'order_test_998877', amount: 2000, status: 'paid' } },
      },
    });

    const validSignature = crypto
      .createHmac('sha256', testWebhookSecret)
      .update(webhookPayload)
      .digest('hex');

    // 1. Valid webhook
    const validRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/razorpay/webhook',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': validSignature,
      },
      payload: webhookPayload,
    });

    expect(validRes.statusCode).toBe(200);

    // 2. Forged signature
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/razorpay/webhook',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': 'forged_signature_hex',
      },
      payload: webhookPayload,
    });

    expect(invalidRes.statusCode).toBe(400);
  });
});
