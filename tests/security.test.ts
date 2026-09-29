import { describe, expect, it } from 'vitest';
import {
  hashToken,
  randomToken,
  signAccessToken,
  signRefreshToken,
  tokenExpiry,
  verifyAccessToken,
  verifyRefreshToken
} from '../src/lib/security';

describe('security', () => {
  it('hash token ổn định và token ngẫu nhiên đủ mạnh', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abcd'));
    expect(randomToken()).toHaveLength(64);
  });

  it('ký và xác minh access token', () => {
    const token = signAccessToken({ id: 'user-1', username: 'demo' });
    expect(verifyAccessToken(token)).toMatchObject({ sub: 'user-1', username: 'demo', type: 'access' });
    expect(tokenExpiry(token).getTime()).toBeGreaterThan(Date.now());
  });

  it('ký và xác minh refresh token', () => {
    const token = signRefreshToken('user-1', 'token-1');
    expect(verifyRefreshToken(token)).toMatchObject({ sub: 'user-1', jti: 'token-1', type: 'refresh' });
  });

  it('từ chối token sai loại/secret', () => {
    expect(() => verifyRefreshToken(signAccessToken({ id: 'u', username: 'x' }))).toThrow();
    expect(() => tokenExpiry('not-a-jwt')).toThrow('Token không có thời hạn.');
  });
});
