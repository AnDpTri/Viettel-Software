import { randomUUID } from 'node:crypto';
import { AppError } from '../../core/errors/app-error';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  tokenExpiry,
  verifyRefreshToken
} from '../../core/security/tokens';
import type { AuthRepository, ClientInfo } from './auth.repository';

export type SessionTokens = { accessToken: string; refreshToken: string };

const invalidSession = () =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

/** Phiên đăng nhập: access token ngắn hạn, refresh token xoay vòng theo chuỗi (family) lưu dạng băm. Dùng lại một
 * refresh token đã bị thu hồi được coi là token bị đánh cắp và khóa cả chuỗi. */
export class SessionService {
  constructor(private readonly auth: AuthRepository) {}

  async issue(user: { id: string; username: string }, client: ClientInfo, remember = true): Promise<SessionTokens> {
    const tokenId = randomUUID();
    const refreshToken = signRefreshToken(user.id, tokenId);
    await this.auth.createRefreshToken({
      id: tokenId,
      familyId: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: tokenExpiry(refreshToken),
      deviceName: client.deviceName,
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
      remember
    });
    return { accessToken: signAccessToken(user), refreshToken };
  }

  /** Đổi refresh token lấy cặp token mới (token cũ bị thu hồi). */
  async rotate(refreshToken: string | undefined, client: Partial<ClientInfo>) {
    if (!refreshToken) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Không tìm thấy phiên đăng nhập.');
    let tokenId: string;
    try {
      tokenId = verifyRefreshToken(refreshToken).jti;
    } catch {
      throw invalidSession();
    }
    const stored = await this.auth.findRefreshToken(tokenId);
    if (
      !stored ||
      stored.expiresAt <= new Date() ||
      stored.tokenHash !== hashToken(refreshToken) ||
      stored.user.deletedAt
    ) {
      throw invalidSession();
    }
    if (stored.revokedAt) {
      await this.auth.revokeTokens({ familyId: stored.familyId });
      throw invalidSession();
    }
    const nextId = randomUUID();
    const nextRefresh = signRefreshToken(stored.userId, nextId);
    await this.auth.rotateRefreshToken(stored.id, {
      id: nextId,
      familyId: stored.familyId,
      userId: stored.userId,
      tokenHash: hashToken(nextRefresh),
      expiresAt: tokenExpiry(nextRefresh),
      deviceName: stored.deviceName,
      userAgent: client.userAgent ?? stored.userAgent,
      ipAddress: client.ipAddress ?? stored.ipAddress,
      remember: stored.remember
    });
    return {
      user: stored.user,
      accessToken: signAccessToken(stored.user),
      refreshToken: nextRefresh,
      remember: stored.remember
    };
  }

  /** Refresh token còn dùng được không (không xoay vòng). Token hỏng trả `null` để controller xóa cookie. */
  async isActive(refreshToken: string): Promise<boolean | null> {
    let tokenId: string;
    try {
      tokenId = verifyRefreshToken(refreshToken).jti;
    } catch {
      return null;
    }
    const stored = await this.auth.findRefreshToken(tokenId);
    return Boolean(
      stored && !stored.revokedAt && stored.expiresAt > new Date() && stored.tokenHash === hashToken(refreshToken)
    );
  }

  async revoke(userId: string, refreshToken: string | undefined) {
    if (refreshToken) await this.auth.revokeTokens({ userId, tokenHash: hashToken(refreshToken) });
  }

  revokeAll(userId: string) {
    return this.auth.revokeTokens({ userId });
  }

  revokeFamily(userId: string, familyId: string) {
    return this.auth.revokeTokens({ userId, familyId });
  }

  list(userId: string) {
    return this.auth.activeSessions(userId);
  }
}
