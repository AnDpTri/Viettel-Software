import type { User } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { logMailFailure } from '../../core/mail/mail.service';
import { hashPassword, verifyPassword } from '../../core/security/password';
import { isVipAccount } from '../../shared/account-tier';
import type { AuthRepository, ClientInfo } from './auth.repository';
import type { EmailVerificationService } from './email-verification.service';
import type { LoginInput, RegisterInput } from './auth.schemas';
import type { SessionService } from './session.service';

/** Thông tin người dùng trả về sau đăng nhập/đăng ký (không có mật khẩu băm hay trường nội bộ). */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    timezone: user.timezone,
    currency: user.currency,
    locale: user.locale,
    theme: user.theme,
    accountTier: user.accountTier,
    vipExpiresAt: user.vipExpiresAt,
    isVip: isVipAccount(user),
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt
  };
}

export class AuthService {
  constructor(
    private readonly auth: AuthRepository,
    private readonly sessions: SessionService,
    private readonly verification: EmailVerificationService
  ) {}

  /** Đăng ký chỉ cần tên đăng nhập và mật khẩu; có email thì gửi thư xác minh (lỗi gửi thư không làm hỏng đăng ký). */
  async register(input: RegisterInput, client: ClientInfo) {
    const { password, remember, ...profile } = input;
    const user = await this.auth.createUser({ ...profile, passwordHash: await hashPassword(password) });
    const tokens = await this.sessions.issue(user, client, remember);
    if (user.email) {
      await this.verification.sendTo(user.id, user.email).catch((error) => logMailFailure('email_verification', error));
    }
    return { user, tokens, remember };
  }

  /** Đăng nhập bằng tên đăng nhập, email hoặc số điện thoại. Sai thông tin trả cùng một lỗi (không lộ tài khoản nào tồn tại). */
  async login(input: LoginInput, client: ClientInfo) {
    const user = await this.auth.findByIdentifier(input.identifier);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Thông tin đăng nhập không đúng.');
    }
    return { user, tokens: await this.sessions.issue(user, client, input.remember) };
  }

  async publicProfile(userId: string) {
    const user = await this.auth.publicProfile(userId);
    return { ...user, isVip: isVipAccount(user) };
  }
}
