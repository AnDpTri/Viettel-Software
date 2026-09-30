import type { Prisma, PrismaClient } from '@prisma/client';

/** Thông tin thiết bị gắn với một phiên đăng nhập. */
export type ClientInfo = { deviceName: string; userAgent?: string; ipAddress?: string };

/** Cùng một số có thể lưu dạng 09… hoặc +849…; tìm theo cả hai để người dùng nhập kiểu nào cũng khớp. */
export function phoneVariants(value: string) {
  const phone = value.replace(/[\s.-]/g, '');
  if (phone.startsWith('+84')) return [phone, `0${phone.slice(3)}`];
  if (phone.startsWith('0')) return [phone, `+84${phone.slice(1)}`];
  return [phone];
}

export const publicUserSelect = {
  id: true,
  username: true,
  email: true,
  phone: true,
  fullName: true,
  timezone: true,
  currency: true,
  locale: true,
  theme: true,
  accountTier: true,
  vipExpiresAt: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  createdAt: true
} as const;

/** Truy vấn bảng người dùng và các loại token (refresh, đặt lại mật khẩu, xác minh email, OAuth). */
export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  // Người dùng
  createUser(data: Prisma.UserCreateInput) {
    return this.db.user.create({ data });
  }

  /** Tìm tài khoản đang hoạt động theo tên đăng nhập, email (không phân biệt hoa thường) hoặc số điện thoại. */
  findByIdentifier(identifier: string) {
    return this.db.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { username: identifier },
          { email: { equals: identifier, mode: 'insensitive' } },
          { phone: { in: phoneVariants(identifier) } }
        ]
      }
    });
  }

  findByEmail(email: string) {
    return this.db.user.findFirst({ where: { deletedAt: null, email: { equals: email, mode: 'insensitive' } } });
  }

  findById(id: string) {
    return this.db.user.findUniqueOrThrow({ where: { id } });
  }

  publicProfile(id: string) {
    return this.db.user.findUniqueOrThrow({ where: { id }, select: publicUserSelect });
  }

  // Refresh token
  createRefreshToken(data: Prisma.RefreshTokenUncheckedCreateInput) {
    return this.db.refreshToken.create({ data });
  }

  findRefreshToken(id: string) {
    return this.db.refreshToken.findUnique({ where: { id }, include: { user: true } });
  }

  /** Thu hồi token cũ và tạo token kế tiếp trong cùng chuỗi phiên, trong một transaction. */
  /** Thu hồi token hiện tại và tạo token kế tiếp. Chỉ thu hồi khi token còn hiệu lực (cập nhật có điều kiện), nên hai
   * request đồng thời cùng một token chỉ một bên thắng; trả `false` cho bên thua. */
  rotateRefreshToken(currentId: string, next: Prisma.RefreshTokenUncheckedCreateInput) {
    return this.db.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: new Date(), lastUsedAt: new Date() }
      });
      if (claimed.count !== 1) return false;
      await tx.refreshToken.create({ data: next });
      return true;
    });
  }

  revokeTokens(where: Prisma.RefreshTokenWhereInput) {
    return this.db.refreshToken.updateMany({ where: { ...where, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  activeSessions(userId: string) {
    return this.db.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        familyId: true,
        deviceName: true,
        userAgent: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true
      },
      orderBy: { lastUsedAt: 'desc' }
    });
  }

  // Mật khẩu
  /** Token đặt lại/xác minh tạo gần nhất của người dùng, để giãn cách gửi thư. */
  lastPasswordResetAt(userId: string) {
    return this.db.passwordResetToken
      .findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
      .then((row) => row?.createdAt ?? null);
  }

  lastVerificationAt(userId: string) {
    return this.db.verificationToken
      .findFirst({ where: { userId, type: 'EMAIL' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
      .then((row) => row?.createdAt ?? null);
  }

  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    return this.db.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  findPasswordResetToken(tokenHash: string) {
    return this.db.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  /** Đặt mật khẩu mới, đánh dấu token (nếu có) đã dùng và thu hồi mọi phiên, trong một transaction. Token đặt lại chỉ
   * được chiếm khi chưa dùng, nên hai request đồng thời không dùng được một liên kết hai lần; trả `false` nếu thua. */
  setPassword(userId: string, passwordHash: string, usedResetTokenId?: string) {
    return this.db.$transaction(async (tx) => {
      if (usedResetTokenId) {
        const claimed = await tx.passwordResetToken.updateMany({
          where: { id: usedResetTokenId, usedAt: null },
          data: { usedAt: new Date() }
        });
        if (claimed.count !== 1) return false;
      }
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return true;
    });
  }

  // Xác minh email
  createVerificationToken(userId: string, tokenHash: string, expiresAt: Date) {
    return this.db.verificationToken.create({ data: { userId, type: 'EMAIL', tokenHash, expiresAt } });
  }

  findVerificationToken(tokenHash: string) {
    return this.db.verificationToken.findUnique({ where: { tokenHash } });
  }

  /** Đánh dấu token đã dùng (có điều kiện chưa dùng) và xác minh email; trả `false` nếu token vừa bị dùng ở request khác. */
  confirmEmail(tokenId: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const claimed = await tx.verificationToken.updateMany({
        where: { id: tokenId, usedAt: null },
        data: { usedAt: new Date() }
      });
      if (claimed.count !== 1) return false;
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
      return true;
    });
  }

  // OAuth
  findOAuthAccount(provider: string, providerUserId: string) {
    return this.db.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      include: { user: true }
    });
  }

  findUserByExactEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }

  createOAuthAccount(data: Prisma.OAuthAccountUncheckedCreateInput) {
    return this.db.oAuthAccount.create({ data, include: { user: true } });
  }
}
