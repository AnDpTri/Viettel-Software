import type { Prisma } from '@prisma/client';
import { isVipAccount } from '../../shared/account-tier';
import { assertNotProtectedDemo } from '../../shared/demo-account';
import type { ProfileInput } from './profile.schemas';
import type { UserRepository } from './user.repository';

/** Trường hồ sơ được trả cho chính chủ tài khoản (không bao giờ gồm mật khẩu băm hay token). */
export const profileSelect = {
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
  preferences: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

export class ProfileService {
  constructor(private readonly users: UserRepository) {}

  async get(userId: string) {
    const user = await this.users.findById(userId, profileSelect);
    return { ...user, isVip: isVipAccount(user) };
  }

  /** Cập nhật hồ sơ; tài khoản demo dùng chung không được đổi email/số điện thoại (đường chiếm tài khoản). */
  async update(userId: string, username: string | undefined, input: ProfileInput) {
    if (input.email !== undefined || input.phone !== undefined) {
      assertNotProtectedDemo(username, 'đổi email hoặc số điện thoại');
    }
    const data = { ...input, preferences: input.preferences as Prisma.InputJsonValue | undefined };
    const user = await this.users.update(userId, data, profileSelect);
    return { ...user, isVip: isVipAccount(user) };
  }
}
