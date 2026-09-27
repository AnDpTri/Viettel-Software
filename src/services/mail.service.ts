import nodemailer from 'nodemailer';
import { config } from '../config';

export async function sendPasswordReset(recipient: string, resetToken: string): Promise<void> {
  const resetUrl = `${config.APP_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;
  if (!config.SMTP_HOST) {
    if (config.NODE_ENV !== 'production') console.info(`[DEV] Link đặt lại mật khẩu cho ${recipient}: ${resetUrl}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
  });
  await transporter.sendMail({
    from: config.SMTP_FROM,
    to: recipient,
    subject: 'Đặt lại mật khẩu Sổ thu chi',
    text: `Liên kết đặt lại mật khẩu (hết hạn sau ${config.RESET_TOKEN_EXPIRES_MINUTES} phút): ${resetUrl}`,
    html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu.</p><p><a href="${resetUrl}">Đặt lại mật khẩu</a></p>`
  });
}
