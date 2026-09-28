import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const required = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@example.test:5432/finance',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-thirty-two-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-thirty-two-characters'
};

describe('deployment configuration', () => {
  it('derives the public URL and CORS origin from Render hostname', () => {
    const config = loadConfig({ ...required, RENDER_EXTERNAL_HOSTNAME: 'so-moc-finance.onrender.com' });
    expect(config.APP_URL).toBe('https://so-moc-finance.onrender.com');
    expect(config.CORS_ORIGIN).toBe('https://so-moc-finance.onrender.com');
  });

  it('keeps explicitly configured public URLs', () => {
    const config = loadConfig({ ...required, RENDER_EXTERNAL_HOSTNAME: 'ignored.onrender.com', APP_URL: 'https://finance.example.com', CORS_ORIGIN: 'https://app.example.com' });
    expect(config.APP_URL).toBe('https://finance.example.com');
    expect(config.CORS_ORIGIN).toBe('https://app.example.com');
  });
});
