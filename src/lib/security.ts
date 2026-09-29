import { createHash, randomBytes } from 'node:crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';

export type AccessPayload = { sub: string; username: string; type: 'access' };
export type RefreshPayload = { sub: string; jti: string; type: 'refresh' };

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');

export function signAccessToken(user: { id: string; username: string }): string {
  return jwt.sign(
    { sub: user.id, username: user.username, type: 'access' } satisfies AccessPayload,
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRES_IN } as SignOptions
  );
}

export function signRefreshToken(userId: string, tokenId: string): string {
  return jwt.sign({ sub: userId, jti: tokenId, type: 'refresh' } satisfies RefreshPayload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshPayload;
}

export function tokenExpiry(token: string): Date {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) throw new Error('Token không có thời hạn.');
  return new Date(decoded.exp * 1000);
}
