import { describe, it, expect } from 'vitest';
import { loadConfig, maskSecret, getSanitizedConfig } from '../../src/config/env';

describe('Config Module', () => {
  it('loads default configuration when valid environment is provided', () => {
    const config = loadConfig({
      PORT: '3000',
      HOST: '0.0.0.0',
      NODE_ENV: 'test',
    });

    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.NODE_ENV).toBe('test');
    expect(config.POLICY_MAX_TRANSACTION_AMOUNT).toBe(50.0);
    expect(config.POLICY_ALLOWED_CURRENCIES).toEqual(['USD', 'EUR', 'GBP']);
  });

  it('fails fast on invalid port', () => {
    expect(() =>
      loadConfig({
        PORT: 'not-a-number',
      })
    ).toThrow('AgentGuard Configuration Error');
  });

  it('fails fast on invalid URL for DATABASE_URL', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'invalid-url',
      })
    ).toThrow('AgentGuard Configuration Error');
  });

  it('correctly masks secrets in diagnostic output', () => {
    expect(maskSecret('')).toBe('[EMPTY]');
    expect(maskSecret('short')).toBe('****');
    expect(maskSecret('secret-token-value-12345')).toBe('secr...2345');
  });

  it('redacts sensitive credentials in getSanitizedConfig', () => {
    const config = loadConfig({
      OPENROUTER_API_KEY: 'sk-or-v1-my-secret-key-12345',
      PAYPAL_CLIENT_SECRET: 'my-paypal-secret-987654',
      DATABASE_URL: 'postgresql://myuser:mypassword@localhost:5432/mydb',
    });

    const sanitized = getSanitizedConfig(config);
    expect(sanitized.OPENROUTER_API_KEY).not.toBe('sk-or-v1-my-secret-key-12345');
    expect(String(sanitized.OPENROUTER_API_KEY)).toContain('...');
    expect(sanitized.PAYPAL_CLIENT_SECRET).not.toBe('my-paypal-secret-987654');
    expect(String(sanitized.DATABASE_URL)).not.toContain('mypassword');
    expect(String(sanitized.DATABASE_URL)).toContain('[REDACTED]');
  });
});
