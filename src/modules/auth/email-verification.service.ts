import { AppError } from '../../core/errors/app-error';
import type { Mailer } from '../../core/mail/mail.service';
import { hashToken, randomToken } from '../../core/security/tokens';
import type { AuthRepository } from './auth.repository';

const VERIFICATION_TTL_MS = 24 * 60 * 60_000;

/** Xác minh email: gửi liên kết chứa token ngẫu nhiên (chỉ lưu dạng băm), hiệu lực 24 giờ, dùng một lần. */
export class EmailVerificationService {
  constructor(
    private readonly auth: AuthRepository,
    private readonly mailer: Mailer
  ) {}

  async sendTo(userId: string, email: string) {
    const token = randomToken();
    await this.auth.createVerificationToken(userId, hashToken(token), new Date(Date.now() + VERIFICATION_TTL_MS));
    await this.mailer.sendVerificationEmail(email, token);
  }

  /** Gửi lại thư xác minh cho người dùng hiện tại; trả `false` nếu email đã được xác minh. */
  async resend(userId: string) {
    const user = await this.auth.findById(userId);
    if (!user.email) throw new AppError(422, 'EMAIL_REQUIRED', 'Tài khoản chưa có email.');
    if (user.emailVerifiedAt) return false;
    await this.sendTo(user.id, user.email);
    return true;
  }

  async confirm(token: string) {
    const stored = await this.auth.findVerificationToken(hashToken(token));
    if (!stored || stored.usedAt || stored.type !== 'EMAIL' || stored.expiresAt <= new Date()) {
      throw new AppError(400, 'INVALID_VERIFICATION_TOKEN', 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.');
    }
    await this.auth.confirmEmail(stored.id, stored.userId);
  }
}
