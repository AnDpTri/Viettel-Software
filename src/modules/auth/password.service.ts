import { AppError } from '../../core/errors/app-error';
import type { Mailer } from '../../core/mail/mail.service';
import { logMailFailure } from '../../core/mail/mail.service';
import { hashPassword, verifyPassword } from '../../core/security/password';
import { hashToken, randomToken } from '../../core/security/tokens';
import { assertNotProtectedDemo } from '../../shared/demo-account';
import type { AuthRepository } from './auth.repository';

export const MAIL_COOLDOWN_MS = 60_000;

/** Đổi mật khẩu và quên mật khẩu qua email. Mọi thay đổi mật khẩu đều thu hồi các phiên đang hoạt động. */
export class PasswordService {
  constructor(
    private readonly auth: AuthRepository,
    private readonly mailer: Mailer,
    private readonly resetTtlMinutes: number
  ) {}

  /** Gửi liên kết đặt lại (token ngẫu nhiên 256 bit, chỉ lưu dạng băm). Trả người dùng được yêu cầu (để ghi nhật ký)
   * hoặc `null`. Lỗi gửi thư chỉ ghi log để phản hồi luôn giống nhau, không lộ email nào đã đăng ký. */
  async requestReset(email: string) {
    const user = await this.auth.findByEmail(email);
    if (!user?.email) return null;
    // Giãn cách: trong MAIL_COOLDOWN_MS kể từ thư trước thì bỏ qua âm thầm (phản hồi vẫn như cũ), chống spam hộp thư.
    const last = await this.auth.lastPasswordResetAt(user.id);
    if (last && Date.now() - last.getTime() < MAIL_COOLDOWN_MS) return null;
    const token = randomToken();
    await this.auth.createPasswordResetToken(
      user.id,
      hashToken(token),
      new Date(Date.now() + this.resetTtlMinutes * 60_000)
    );
    await this.mailer.sendPasswordReset(user.email, token).catch((error) => logMailFailure('password_reset', error));
    return user;
  }

  async reset(token: string, newPassword: string) {
    const invalid = () =>
      new AppError(
        400,
        'INVALID_RESET_TOKEN',
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.'
      );
    const stored = await this.auth.findPasswordResetToken(hashToken(token));
    if (!stored || stored.usedAt || stored.expiresAt <= new Date()) throw invalid();
    if (!(await this.auth.setPassword(stored.userId, await hashPassword(newPassword), stored.id))) throw invalid();
  }

  /** Đổi mật khẩu khi đã đăng nhập; tài khoản demo dùng chung không được đổi. */
  async change(userId: string, username: string | undefined, currentPassword: string, newPassword: string) {
    assertNotProtectedDemo(username, 'đổi mật khẩu');
    const user = await this.auth.findById(userId);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError(400, 'WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng.');
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new AppError(400, 'SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    }
    await this.auth.setPassword(user.id, await hashPassword(newPassword));
  }
}
