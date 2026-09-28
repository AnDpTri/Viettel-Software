import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/middleware/error-handler';
import { createRateLimiter, requestLogger } from '../src/middleware/request-observability';

afterEach(() => {
  process.env.NODE_ENV = 'test';
  vi.restoreAllMocks();
});

describe('request observability', () => {
  it('giữ request ID từ client và trả lại trong response', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    const response = await request(app).get('/ping').set('x-request-id', 'trace-e2e');
    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('trace-e2e');
  });

  it('sinh request ID và ghi structured access log ngoài test', async () => {
    process.env.NODE_ENV = 'development';
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const app = express();
    app.use(requestLogger);
    app.get('/ping', (_req, res) => res.status(204).send());
    const response = await request(app).get('/ping');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ event: 'http_request', method: 'GET', path: '/ping', statusCode: 204 });
  });

  it('giới hạn request theo IP và trả header retry', async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60_000, max: 2, keyPrefix: 'test' }));
    app.get('/limited', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const first = await request(app).get('/limited');
    const second = await request(app).get('/limited');
    const third = await request(app).get('/limited');
    expect(first.headers['x-ratelimit-remaining']).toBe('1');
    expect(second.headers['x-ratelimit-remaining']).toBe('0');
    expect(third.status).toBe(429);
    expect(third.headers['retry-after']).toBeDefined();
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });
});
