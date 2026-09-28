import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { clearOAuthStateCookie, clearRefreshCookie, readCookie, setOAuthStateCookie, setRefreshCookie } from '../src/lib/cookies';
import { nextOccurrence } from '../src/lib/recurrence';

describe('recurrence', () => {
  const date = new Date('2026-01-15T10:00:00.000Z');

  it.each([
    ['DAILY', 2, '2026-01-17T10:00:00.000Z'],
    ['WEEKLY', 2, '2026-01-29T10:00:00.000Z'],
    ['MONTHLY', 2, '2026-03-15T10:00:00.000Z'],
    ['QUARTERLY', 2, '2026-07-15T10:00:00.000Z'],
    ['YEARLY', 2, '2028-01-15T10:00:00.000Z']
  ] as const)('tính kỳ %s tiếp theo', (frequency, interval, expected) => {
    expect(nextOccurrence(date, frequency, interval).toISOString()).toBe(expected);
  });
});

describe('cookie helpers', () => {
  it('đọc cookie và xử lý header trống', () => {
    expect(readCookie({ headers: {} } as never, 'token')).toBeUndefined();
    expect(readCookie({ headers: { cookie: 'a=1; token=hello%20world; c=3' } } as never, 'token')).toBe('hello world');
    expect(readCookie({ headers: { cookie: 'a=1' } } as never, 'missing')).toBeUndefined();
  });

  it('thiết lập và xóa refresh cookie ở chế độ ghi nhớ', async () => {
    const app = express();
    app.get('/set', (_req, res) => { setRefreshCookie(res, 'refresh-token', true); res.sendStatus(204); });
    app.get('/clear', (_req, res) => { clearRefreshCookie(res); res.sendStatus(204); });
    const set = await request(app).get('/set');
    const clear = await request(app).get('/clear');
    expect(set.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(set.headers['set-cookie'][0]).toContain('Max-Age=2592000');
    expect(clear.headers['set-cookie'][0]).toContain('Max-Age=0');
  });

  it('thiết lập session cookie và state OAuth', async () => {
    const app = express();
    app.get('/session', (_req, res) => { setRefreshCookie(res, 'session-token', false); res.sendStatus(204); });
    app.get('/oauth', (_req, res) => { setOAuthStateCookie(res, 'state'); clearOAuthStateCookie(res); res.sendStatus(204); });
    const session = await request(app).get('/session');
    const oauth = await request(app).get('/oauth');
    expect(session.headers['set-cookie'][0]).not.toContain('Max-Age=2592000');
    expect(oauth.headers['set-cookie']).toHaveLength(2);
    expect(oauth.headers['set-cookie'][0]).toContain('finance_oauth_state=state');
  });
});
