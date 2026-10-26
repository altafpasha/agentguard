import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PayPalSandboxAdapter } from '../../src/payment/paypal-sandbox-adapter';
import { PaymentExecutionNotEnabledError } from '../../src/common/errors';
import { PaymentOrderRequest } from '../../src/common/types';
import { IPayPalClient } from '../../src/payment/types';

describe('PayPal Sandbox Adapter Module', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sampleRequest: PaymentOrderRequest = {
    agentId: 'agent-01',
    amount: 20.0,
    currency: 'USD',
    recipient: { email: 'merchant@sandbox.paypal.com' },
    description: 'Sandbox API testing payment',
  };

  it('detects placeholder credentials accurately', () => {
    const adapterWithPlaceholders = new PayPalSandboxAdapter({
      clientId: 'sandbox_client_id_placeholder',
      clientSecret: 'sandbox_client_secret_placeholder',
      environment: 'sandbox',
      apiBaseUrl: 'https://api-m.sandbox.paypal.com',
    });

    expect(adapterWithPlaceholders.isConfigured()).toBe(false);

    const adapterWithRealConfig = new PayPalSandboxAdapter({
      clientId: 'AbCdEf1234567890',
      clientSecret: 'ZyXwVu0987654321',
      environment: 'sandbox',
      apiBaseUrl: 'https://api-m.sandbox.paypal.com',
    });

    expect(adapterWithRealConfig.isConfigured()).toBe(true);
  });

  it('strictly enforces guarded execution in foundation phase (does NOT return fake success)', async () => {
    const guardedAdapter = new PayPalSandboxAdapter(
      {
        clientId: 'AbCdEf1234567890',
        clientSecret: 'ZyXwVu0987654321',
        environment: 'sandbox',
        apiBaseUrl: 'https://api-m.sandbox.paypal.com',
      },
      false // allowLiveExecution = false in foundation phase
    );

    await expect(
      guardedAdapter.executePayment(sampleRequest, 'req-test-123')
    ).rejects.toThrow(PaymentExecutionNotEnabledError);
  });

  it('returns explicit unexecuted status when credentials are not configured', async () => {
    const adapter = new PayPalSandboxAdapter(
      {
        clientId: 'placeholder_id',
        clientSecret: 'placeholder_secret',
        environment: 'sandbox',
        apiBaseUrl: 'https://api-m.sandbox.paypal.com',
      },
      true // allowLiveExecution = true but with placeholder credentials
    );

    const result = await adapter.executePayment(sampleRequest, 'req-test-456');

    expect(result.executed).toBe(false);
    expect(result.status).toBe('EXECUTION_NOT_ENABLED');
    expect(result.message).toContain('placeholder values');
  });

  describe('verifyCredentials', () => {
    it('returns false immediately when not configured', async () => {
      const adapter = new PayPalSandboxAdapter({
        clientId: 'placeholder_id',
        clientSecret: 'placeholder_secret',
        environment: 'sandbox',
        apiBaseUrl: 'https://api-m.sandbox.paypal.com',
      });

      const isValid = await adapter.verifyCredentials();
      expect(isValid).toBe(false);
    });

    it('returns true when client obtains access token successfully', async () => {
      const mockClient: IPayPalClient = {
        isConfigured: () => true,
        getAccessToken: vi.fn().mockResolvedValue('token-verified'),
        createOrder: vi.fn(),
        getOrder: vi.fn(),
        captureOrder: vi.fn(),
        reconcileOrder: vi.fn(),
      };

      const adapter = new PayPalSandboxAdapter(mockClient, true);
      const isValid = await adapter.verifyCredentials();
      expect(isValid).toBe(true);
    });

    it('returns false when client throws authentication error', async () => {
      const mockClient: IPayPalClient = {
        isConfigured: () => true,
        getAccessToken: vi.fn().mockRejectedValue(new Error('Auth failed')),
        createOrder: vi.fn(),
        getOrder: vi.fn(),
        captureOrder: vi.fn(),
        reconcileOrder: vi.fn(),
      };

      const adapter = new PayPalSandboxAdapter(mockClient, true);
      const isValid = await adapter.verifyCredentials();
      expect(isValid).toBe(false);
    });
  });

  describe('executePayment with mockable client', () => {
    it('creates sandbox order when no preApprovedOrderId is provided and live execution is enabled', async () => {
      const mockClient: IPayPalClient = {
        isConfigured: () => true,
        getAccessToken: vi.fn().mockResolvedValue('mock-token'),
        createOrder: vi.fn().mockResolvedValue({
          id: 'SANDBOX-ORDER-NEW-1',
          status: 'CREATED',
          intent: 'CAPTURE',
          purchase_units: [],
          links: [
            { href: 'https://www.sandbox.paypal.com/checkoutnow?token=SANDBOX-ORDER-NEW-1', rel: 'approve', method: 'GET' },
          ],
        }),
        getOrder: vi.fn(),
        captureOrder: vi.fn(),
        reconcileOrder: vi.fn(),
      };

      const adapter = new PayPalSandboxAdapter(mockClient, true);
      const result = await adapter.executePayment(sampleRequest, 'req-live-1');

      expect(result.executed).toBe(true);
      expect(result.status).toBe('PAYPAL_ORDER_CREATED');
      expect(result.paypalOrderId).toBe('SANDBOX-ORDER-NEW-1');
      expect(result.approvalUrl).toContain('SANDBOX-ORDER-NEW-1');
    });

    it('reconciles and captures pre-approved order when preApprovedOrderId is provided', async () => {
      const mockClient: IPayPalClient = {
        isConfigured: () => true,
        getAccessToken: vi.fn().mockResolvedValue('mock-token'),
        createOrder: vi.fn(),
        getOrder: vi.fn(),
        reconcileOrder: vi.fn().mockResolvedValue({
          isReconciled: true,
          orderId: 'PRE-APPROVED-ORDER-77',
          status: 'APPROVED',
          amount: 20.0,
          currency: 'USD',
          discrepancies: [],
          reconciledAt: new Date().toISOString(),
        }),
        captureOrder: vi.fn().mockResolvedValue({
          id: 'PRE-APPROVED-ORDER-77',
          status: 'COMPLETED',
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: 'CAPTURE-77-XYZ',
                    status: 'COMPLETED',
                    amount: { currency_code: 'USD', value: '20.00' },
                  },
                ],
              },
            },
          ],
        }),
      };

      const adapter = new PayPalSandboxAdapter(mockClient, true);
      const result = await adapter.executePayment(sampleRequest, 'req-cap-1', 'PRE-APPROVED-ORDER-77');

      expect(result.executed).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.paypalOrderId).toBe('PRE-APPROVED-ORDER-77');
      expect(result.paypalCaptureId).toBe('CAPTURE-77-XYZ');
    });

    it('handles reconciliation failure before capture safely', async () => {
      const mockClient: IPayPalClient = {
        isConfigured: () => true,
        getAccessToken: vi.fn().mockResolvedValue('mock-token'),
        createOrder: vi.fn(),
        getOrder: vi.fn(),
        reconcileOrder: vi.fn().mockResolvedValue({
          isReconciled: false,
          orderId: 'ORDER-TAMPERED',
          status: 'APPROVED',
          amount: 200.0, // Expected 20
          currency: 'USD',
          discrepancies: ['Amount mismatch: expected 20, found 200'],
          reconciledAt: new Date().toISOString(),
        }),
        captureOrder: vi.fn(),
      };

      const adapter = new PayPalSandboxAdapter(mockClient, true);
      const result = await adapter.executePayment(sampleRequest, 'req-tamper', 'ORDER-TAMPERED');

      expect(result.executed).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Amount mismatch');
      expect(mockClient.captureOrder).not.toHaveBeenCalled();
    });

    it('delegates createOrder, getOrderDetails, and reconcileOrder directly', async () => {
      const mockClient: IPayPalClient = {
        isConfigured: () => true,
        getAccessToken: vi.fn().mockResolvedValue('mock-token'),
        createOrder: vi.fn().mockResolvedValue({ id: 'O-1', status: 'CREATED', intent: 'CAPTURE', purchase_units: [], links: [] }),
        getOrder: vi.fn().mockResolvedValue({ id: 'O-1', status: 'APPROVED', intent: 'CAPTURE', purchase_units: [], links: [] }),
        reconcileOrder: vi.fn().mockResolvedValue({ isReconciled: true, orderId: 'O-1', status: 'APPROVED', amount: 20, currency: 'USD', discrepancies: [], reconciledAt: '' }),
        captureOrder: vi.fn(),
      };

      const adapter = new PayPalSandboxAdapter(mockClient, true);

      const created = await adapter.createOrder(sampleRequest, 'req-del-1');
      expect(created.id).toBe('O-1');

      const details = await adapter.getOrderDetails('O-1');
      expect(details.status).toBe('APPROVED');

      const rec = await adapter.reconcileOrder('O-1');
      expect(rec.isReconciled).toBe(true);
    });
  });
});
