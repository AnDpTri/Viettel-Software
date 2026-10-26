import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';

describe('cloud readiness', () => {
  it('reports ready only after the dependency check succeeds', async () => {
    const check = vi.fn().mockResolvedValue([{ one: 1 }]);
    const response = await request(createApp(undefined, check)).get('/ready');
    expect(check).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'READY' } });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('keeps liveness available while returning 503 for an unavailable DB', async () => {
    const check = vi.fn().mockRejectedValue(new Error('private connection string'));
    const app = createApp(undefined, check);
    expect((await request(app).get('/health')).status).toBe(200);
    const response = await request(app).get('/ready');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('NOT_READY');
    expect(JSON.stringify(response.body)).not.toContain('private connection');
  });

  it('times out a dependency which never returns', async () => {
    const response = await request(createApp(undefined, () => new Promise(() => undefined))).get('/ready');
    expect(response.status).toBe(503);
  });
});
