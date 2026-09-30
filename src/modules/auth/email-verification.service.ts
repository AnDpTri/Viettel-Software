import { AppError } from '../../core/errors/app-error';
import type { Mailer } from '../../core/mail/mail.service';
import { hashToken, randomToken } from '../../core/security/tokens';
import type { AuthRepository } from './auth.repository';
import { MAIL_COOLDOWN_MS } from './password.service';

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
    const last = await this.auth.lastVerificationAt(user.id);
    if (last && Date.now() - last.getTime() < MAIL_COOLDOWN_MS) {
      throw new AppError(429, 'EMAIL_COOLDOWN', 'Thư xác minh vừa được gửi, hãy chờ một phút rồi thử lại.');
    }
    await this.sendTo(user.id, user.email);
    return true;
  }

  async confirm(token: string) {
    const invalid = () =>
      new AppError(400, 'INVALID_VERIFICATION_TOKEN', 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.');
    const stored = await this.auth.findVerificationToken(hashToken(token));
    if (!stored || stored.usedAt || stored.type !== 'EMAIL' || stored.expiresAt <= new Date()) throw invalid();
    if (!(await this.auth.confirmEmail(stored.id, stored.userId))) throw invalid();
  }
}
