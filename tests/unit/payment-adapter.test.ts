import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PayPalSandboxAdapter } from '../../src/payment/paypal-sandbox-adapter';
import { PaymentExecutionNotEnabledError } from '../../src/common/errors';
import { PaymentOrderRequest } from '../../src/common/types';

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
    // Constraint: "Do not pretend PayPal integration is implemented."
    // Constraint: "Do not add a fake successful payment response."
    const guardedAdapter = new PayPalSandboxAdapter(
      {
        clientId: 'sandbox_client_id_placeholder',
        clientSecret: 'sandbox_client_secret_placeholder',
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

    it('returns true when OAuth token response is ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
      } as Response);

      const adapter = new PayPalSandboxAdapter({
        clientId: 'real_client_id_123',
        clientSecret: 'real_client_secret_456',
        environment: 'sandbox',
        apiBaseUrl: 'https://api-m.sandbox.paypal.com',
      });

      const isValid = await adapter.verifyCredentials();
      expect(isValid).toBe(true);
    });

    it('returns false when OAuth token endpoint fails or throws', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const adapter = new PayPalSandboxAdapter({
        clientId: 'real_client_id_123',
        clientSecret: 'real_client_secret_456',
        environment: 'sandbox',
        apiBaseUrl: 'https://api-m.sandbox.paypal.com',
      });

      const isValid = await adapter.verifyCredentials();
      expect(isValid).toBe(false);
    });
  });

  describe('executePayment with live execution enabled and configured credentials', () => {
    const liveConfig = {
      clientId: 'valid_client_id_abc',
      clientSecret: 'valid_client_secret_xyz',
      environment: 'sandbox' as const,
      apiBaseUrl: 'https://api-m.sandbox.paypal.com',
    };

    it('successfully creates order when PayPal API succeeds', async () => {
      const mockFetch = vi
        .fn()
        // 1st call: OAuth token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'test_token_123' }),
        } as Response)
        // 2nd call: Create order
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'ORDER-999-ABC', status: 'CREATED' }),
        } as Response);

      globalThis.fetch = mockFetch;

      const adapter = new PayPalSandboxAdapter(liveConfig, true);
      const result = await adapter.executePayment(sampleRequest, 'req-live-1');

      expect(result.executed).toBe(true);
      expect(result.status).toBe('PAYPAL_API_PENDING');
      expect(result.paypalOrderId).toBe('ORDER-999-ABC');
      expect(result.message).toContain('ORDER-999-ABC');
    });

    it('handles OAuth token failure gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid client credentials',
      } as Response);

      const adapter = new PayPalSandboxAdapter(liveConfig, true);
      const result = await adapter.executePayment(sampleRequest, 'req-live-2');

      expect(result.executed).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.message).toContain('OAuth authorization failed');
      expect(result.error).toContain('Invalid client credentials');
    });

    it('handles order creation failure from PayPal API gracefully', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'test_token_123' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Currency not supported for merchant' }),
        } as Response);

      const adapter = new PayPalSandboxAdapter(liveConfig, true);
      const result = await adapter.executePayment(sampleRequest, 'req-live-3');

      expect(result.executed).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.message).toContain('Currency not supported for merchant');
    });

    it('handles network failure gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection timed out'));

      const adapter = new PayPalSandboxAdapter(liveConfig, true);
      const result = await adapter.executePayment(sampleRequest, 'req-live-4');

      expect(result.executed).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.message).toContain('PayPal Sandbox network connection failed');
    });
  });
});
