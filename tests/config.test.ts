import { describe, expect, it } from 'vitest';
import { isAiConfigured, loadConfig } from '../src/core/config/env';

const required = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@example.test:5432/finance',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-thirty-two-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-thirty-two-characters',
  DEEPSEEK_API_KEY: 'test-secret-not-a-real-key'
};

describe('deployment configuration', () => {
  it('derives the public URL and CORS origin from Render hostname', () => {
    const config = loadConfig({ ...required, RENDER_EXTERNAL_HOSTNAME: 'so-moc-finance.onrender.com' });
    expect(config.APP_URL).toBe('https://so-moc-finance.onrender.com');
    expect(config.CORS_ORIGIN).toBe('https://so-moc-finance.onrender.com');
  });

  it('trusts one proxy hop on Render only, unless configured explicitly', () => {
    expect(loadConfig(required).TRUST_PROXY).toBe(0);
    expect(loadConfig({ ...required, RENDER: 'true' }).TRUST_PROXY).toBe(1);
    expect(loadConfig({ ...required, RENDER: 'true', TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
  });

  it('keeps explicitly configured public URLs', () => {
    const config = loadConfig({
      ...required,
      RENDER_EXTERNAL_HOSTNAME: 'ignored.onrender.com',
      APP_URL: 'https://finance.example.com',
      CORS_ORIGIN: 'https://app.example.com'
    });
    expect(config.APP_URL).toBe('https://finance.example.com');
    expect(config.CORS_ORIGIN).toBe('https://app.example.com');
  });

  it('rejects the removed local AI provider', () => {
    expect(() => loadConfig({ ...required, AI_PROVIDER: 'local' })).toThrow(/AI_PROVIDER/);
  });

  it('starts without an AI key so the packaged app runs anywhere; only AI features are disabled', () => {
    const config = loadConfig({ ...required, DEEPSEEK_API_KEY: '' });
    expect(isAiConfigured(config)).toBe(false);
    expect(isAiConfigured(loadConfig(required))).toBe(true);
    expect(isAiConfigured(loadConfig({ ...required, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-openai-key' }))).toBe(
      true
    );
  });
});
