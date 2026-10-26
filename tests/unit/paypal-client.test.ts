import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PayPalClient } from '../../src/payment/paypal-client';
import {
  PayPalAuthError,
  PayPalApiError,
  PayPalNetworkError,
  PayPalReconciliationError,
  PayPalSecurityError,
} from '../../src/payment/errors';

describe('PayPalClient Module (Sandbox REST API)', () => {
  const originalFetch = globalThis.fetch;

  const validConfig = {
    clientId: 'test-sandbox-client-id-12345',
    clientSecret: 'test-sandbox-client-secret-67890',
    environment: 'sandbox' as const,
    apiBaseUrl: 'https://api-m.sandbox.paypal.com',
    timeoutMs: 500,
    maxRetries: 1,
    tokenExpiryBufferSeconds: 60,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Security & Configuration Constraints', () => {
    it('strictly forbids live/production environment in hackathon build', () => {
      expect(() => {
        new PayPalClient({
          ...validConfig,
          environment: 'live' as unknown as 'sandbox',
        });
      }).toThrow(PayPalSecurityError);
    });

    it('strictly forbids live PayPal API base URL', () => {
      expect(() => {
        new PayPalClient({
          ...validConfig,
          apiBaseUrl: 'https://api-m.paypal.com',
        });
      }).toThrow(PayPalSecurityError);
    });

    it('detects placeholder credentials accurately', () => {
      const placeholderClient = new PayPalClient({
        ...validConfig,
        clientId: 'sandbox_client_id_placeholder',
        clientSecret: 'sandbox_client_secret_placeholder',
      });
      expect(placeholderClient.isConfigured()).toBe(false);

      const realConfigClient = new PayPalClient(validConfig);
      expect(realConfigClient.isConfigured()).toBe(true);
    });
  });

  describe('OAuth2 Token Acquisition & Caching', () => {
    it('obtains OAuth token and caches it until shortly before expiration', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'access-token-alpha',
          token_type: 'Bearer',
          expires_in: 3600, // 1 hour
        }),
      } as Response);
      globalThis.fetch = mockFetch;

      const client = new PayPalClient(validConfig);

      // Call 1: triggers network request
      const token1 = await client.getAccessToken();
      expect(token1).toBe('access-token-alpha');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Call 2: should return cached token without network request
      const token2 = await client.getAccessToken();
      expect(token2).toBe('access-token-alpha');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('coalesces concurrent token requests to prevent thundering herd', async () => {
      let resolveCall: (res: unknown) => void = () => {};
      const pendingPromise = new Promise((resolve) => {
        resolveCall = resolve;
      });

      const mockFetch = vi.fn().mockReturnValue(pendingPromise);
      globalThis.fetch = mockFetch;

      const client = new PayPalClient(validConfig);

      // Trigger 3 concurrent calls
      const p1 = client.getAccessToken();
      const p2 = client.getAccessToken();
      const p3 = client.getAccessToken();

      // Resolve the mock network call
      resolveCall({
        ok: true,
        json: async () => ({
          access_token: 'coalesced-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBe('coalesced-token');
      expect(r2).toBe('coalesced-token');
      expect(r3).toBe('coalesced-token');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles OAuth failure safely without leaking client secret', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"error":"invalid_client","error_description":"Client Authentication failed"}',
      } as Response);

      const client = new PayPalClient(validConfig);

      try {
        await client.getAccessToken();
        expect.unreachable('Should have thrown PayPalAuthError');
      } catch (err) {
        expect(err).toBeInstanceOf(PayPalAuthError);
        const error = err as PayPalAuthError;
        expect(error.message).toContain('HTTP 401');
        // Ensure secret is NOT leaked
        expect(error.message).not.toContain(validConfig.clientSecret);
      }
    });

    it('refreshes token when forceRefresh is true', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'token-v1',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'token-v2',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        } as Response);

      globalThis.fetch = mockFetch;
      const client = new PayPalClient(validConfig);

      const t1 = await client.getAccessToken();
      expect(t1).toBe('token-v1');

      const t2 = await client.getAccessToken(true); // forceRefresh
      expect(t2).toBe('token-v2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Order Creation (createOrder)', () => {
    it('validates amount, currency, and recipient before calling PayPal', async () => {
      const client = new PayPalClient(validConfig);

      // Invalid amount (0)
      await expect(
        client.createOrder({
          requestId: 'req-1',
          purchaseData: {
            agentId: 'agent-1',
            amount: 0,
            currency: 'USD',
            recipient: { email: 'vendor@store.com' },
            description: 'Item',
          },
        })
      ).rejects.toThrow(PayPalApiError);

      // Invalid currency (must be 3 chars)
      await expect(
        client.createOrder({
          requestId: 'req-2',
          purchaseData: {
            agentId: 'agent-1',
            amount: 10,
            currency: 'US_DOLLAR',
            recipient: { email: 'vendor@store.com' },
            description: 'Item',
          },
        })
      ).rejects.toThrow(PayPalApiError);

      // Invalid recipient email
      await expect(
        client.createOrder({
          requestId: 'req-3',
          purchaseData: {
            agentId: 'agent-1',
            amount: 10,
            currency: 'USD',
            recipient: { email: 'invalid-email-address' },
            description: 'Item',
          },
        })
      ).rejects.toThrow(PayPalApiError);
    });

    it('creates sandbox order using validated purchase data and PayPal-Request-Id header', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      let capturedBody: string | undefined;

      const mockFetch = vi
        .fn()
        // 1: OAuth token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'token-order-test', token_type: 'Bearer', expires_in: 3600 }),
        } as Response)
        // 2: Create order
        .mockImplementationOnce((_url, init) => {
          capturedHeaders = init?.headers;
          capturedBody = init?.body as string;
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              id: 'SANDBOX-ORDER-555',
              status: 'CREATED',
              intent: 'CAPTURE',
              purchase_units: [
                {
                  reference_id: 'req-order-123',
                  amount: { currency_code: 'USD', value: '25.50' },
                  payee: { email_address: 'merchant@sandbox.paypal.com' },
                },
              ],
              links: [
                {
                  href: 'https://www.sandbox.paypal.com/checkoutnow?token=SANDBOX-ORDER-555',
                  rel: 'approve',
                  method: 'GET',
                },
              ],
            }),
          } as Response);
        });

      globalThis.fetch = mockFetch;
      const client = new PayPalClient(validConfig);

      const order = await client.createOrder({
        requestId: 'req-order-123',
        purchaseData: {
          agentId: 'agent-finance',
          amount: 25.5,
          currency: 'USD',
          recipient: { email: 'merchant@sandbox.paypal.com' },
          description: 'Software subscription',
        },
      });

      expect(order.id).toBe('SANDBOX-ORDER-555');
      expect(order.status).toBe('CREATED');

      // Verify headers passed to PayPal
      const headers = capturedHeaders as Record<string, string>;
      expect(headers['PayPal-Request-Id']).toBe('req-order-123');
      expect(headers['Authorization']).toBe('Bearer token-order-test');

      // Verify server-generated purchase payload
      const body = JSON.parse(capturedBody!);
      expect(body.purchase_units[0].amount.value).toBe('25.50');
      expect(body.purchase_units[0].amount.currency_code).toBe('USD');
      expect(body.purchase_units[0].payee.email_address).toBe('merchant@sandbox.paypal.com');
    });

    it('retries once if 401 token expired during order creation', async () => {
      const mockFetch = vi
        .fn()
        // 1: initial token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'expired-token', token_type: 'Bearer', expires_in: 3600 }),
        } as Response)
        // 2: createOrder returns 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ name: 'AUTHENTICATION_FAILURE' }),
        } as Response)
        // 3: refresh token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'fresh-token', token_type: 'Bearer', expires_in: 3600 }),
        } as Response)
        // 4: createOrder retry returns 201
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ id: 'ORDER-RETRY-SUCCESS', status: 'CREATED', links: [] }),
        } as Response);

      globalThis.fetch = mockFetch;
      const client = new PayPalClient(validConfig);

      const order = await client.createOrder({
        requestId: 'req-retry-test',
        purchaseData: {
          agentId: 'agent-1',
          amount: 10,
          currency: 'USD',
          recipient: { email: 'vendor@store.com' },
          description: 'Retry item',
        },
      });

      expect(order.id).toBe('ORDER-RETRY-SUCCESS');
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('throws PayPalNetworkError when network times out during createOrder', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'token-timeout', token_type: 'Bearer', expires_in: 3600 }),
        } as Response)
        .mockImplementationOnce(() => {
          const timeoutErr = new Error('Connection timed out');
          timeoutErr.name = 'AbortError';
          return Promise.reject(timeoutErr);
        });

      const client = new PayPalClient(validConfig);
      await expect(
        client.createOrder({
          requestId: 'req-timeout-test',
          purchaseData: {
            agentId: 'agent-1',
            amount: 10,
            currency: 'USD',
            recipient: { email: 'vendor@store.com' },
            description: 'Timeout test item',
          },
        })
      ).rejects.toThrow(PayPalNetworkError);
    });
  });

  describe('Order Details Retrieval & Reconciliation (getOrder & reconcileOrder)', () => {
    it('retrieves order details and reconciles context matching perfectly', async () => {
      globalThis.fetch = vi
        .fn()
        // token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'token-get', token_type: 'Bearer', expires_in: 3600 }),
        } as Response)
        // getOrder
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'ORDER-RECONCILE-1',
            status: 'APPROVED',
            purchase_units: [
              {
                reference_id: 'ref-tx-999',
                amount: { currency_code: 'USD', value: '45.00' },
                payee: { email_address: 'verified@merchant.com' },
              },
            ],
            links: [],
          }),
        } as Response);

      const client = new PayPalClient(validConfig);
      const reconciliation = await client.reconcileOrder('ORDER-RECONCILE-1', {
        amount: 45.0,
        currency: 'USD',
        recipientEmail: 'verified@merchant.com',
        referenceId: 'ref-tx-999',
      });

      expect(reconciliation.isReconciled).toBe(true);
      expect(reconciliation.discrepancies).toHaveLength(0);
      expect(reconciliation.status).toBe('APPROVED');
      expect(reconciliation.amount).toBe(45);
      expect(reconciliation.currency).toBe('USD');
    });

    it('identifies discrepancies when amount, currency, or recipient mismatch', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'token-mismatch', token_type: 'Bearer', expires_in: 3600 }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'ORDER-DISCREPANCY',
            status: 'CREATED',
            purchase_units: [
              {
                reference_id: 'original-ref',
                amount: { currency_code: 'EUR', value: '10.00' },
                payee: { email_address: 'wrong-recipient@merchant.com' },
              },
            ],
            links: [],
          }),
        } as Response);

      const client = new PayPalClient(validConfig);
      const reconciliation = await client.reconcileOrder('ORDER-DISCREPANCY', {
        amount: 50.0, // expected 50, found 10
        currency: 'USD', // expected USD, found EUR
        recipientEmail: 'intended@merchant.com', // expected intended, found wrong-recipient
      });

      expect(reconciliation.isReconciled).toBe(false);
      expect(reconciliation.discrepancies.length).toBeGreaterThanOrEqual(3);
      expect(reconciliation.discrepancies.some((d) => d.includes('Amount mismatch'))).toBe(true);
      expect(reconciliation.discrepancies.some((d) => d.includes('Currency mismatch'))).toBe(true);
      expect(reconciliation.discrepancies.some((d) => d.includes('Recipient mismatch'))).toBe(true);
    });
  });

  describe('Ambiguous Network Timeout & Reconciliation on Capture (Requirement #8)', () => {
    it('does NOT blindly retry capture on timeout; reconciles order state first and recovers if already COMPLETED', async () => {
      // Scenario: Capture POST timed out over network, but PayPal actually received and executed it!
      const client = new PayPalClient(validConfig);

      const mockFetch = vi
        .fn()
        // 1: token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'token-cap-1', token_type: 'Bearer', expires_in: 3600 }),
        } as Response)
        // 2: captureOrder throws AbortError (network timeout)
        .mockImplementationOnce(() => {
          const timeoutErr = new Error('The operation was aborted');
          timeoutErr.name = 'AbortError';
          return Promise.reject(timeoutErr);
        })
        // 3: Reconcile query GET /v2/checkout/orders/{id}
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'ORDER-CAPTURED-BEFORE-TIMEOUT',
            status: 'COMPLETED',
            purchase_units: [
              {
                reference_id: 'ref-tx-001',
                amount: { currency_code: 'USD', value: '30.00' },
                payee: { email_address: 'merchant@store.com' },
                payments: {
                  captures: [
                    {
                      id: 'CAPTURE-ID-777',
                      status: 'COMPLETED',
                      amount: { currency_code: 'USD', value: '30.00' },
                    },
                  ],
                },
              },
            ],
            links: [],
          }),
        } as Response);

      globalThis.fetch = mockFetch;

      const result = await client.captureOrder({
        orderId: 'ORDER-CAPTURED-BEFORE-TIMEOUT',
        requestId: 'req-cap-timeout',
        expectedAmount: 30.0,
        expectedCurrency: 'USD',
        expectedRecipientEmail: 'merchant@store.com',
      });

      // Recovers successfully from verified PayPal state without duplicate charge!
      expect(result.status).toBe('COMPLETED');
      expect(result.purchase_units[0]?.payments?.captures?.[0]?.id).toBe('CAPTURE-ID-777');
    });

    it('does NOT blindly retry capture when reconciled state shows order is still APPROVED (safely halts and reports)', async () => {
      const client = new PayPalClient(validConfig);

      globalThis.fetch = vi
        .fn()
        // 1: token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'token-cap-2', token_type: 'Bearer', expires_in: 3600 }),
        } as Response)
        // 2: captureOrder throws AbortError
        .mockImplementationOnce(() => {
          const timeoutErr = new Error('Connection timed out');
          timeoutErr.name = 'AbortError';
          return Promise.reject(timeoutErr);
        })
        // 3: Reconcile query GET shows order is still APPROVED (not captured yet)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'ORDER-STILL-APPROVED',
            status: 'APPROVED',
            purchase_units: [
              {
                amount: { currency_code: 'USD', value: '30.00' },
                payee: { email_address: 'merchant@store.com' },
              },
            ],
            links: [],
          }),
        } as Response);

      await expect(
        client.captureOrder({
          orderId: 'ORDER-STILL-APPROVED',
          requestId: 'req-cap-timeout-2',
        })
      ).rejects.toThrow(PayPalReconciliationError);
    });
  });
});
