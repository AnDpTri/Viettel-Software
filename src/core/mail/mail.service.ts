import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { AppError } from '../errors/app-error';
import { logger } from '../observability/logger';

type MailMessage = { to: string; subject: string; text: string; html: string; link: string };

/** Kênh gửi đang dùng. Brevo đi qua HTTPS nên chạy được cả trên nền tảng chặn cổng SMTP (Render bản miễn phí chặn 25/465/587). */
export function mailProvider(): 'brevo' | 'smtp' | 'log' | 'none' {
  if (config.BREVO_API_KEY) return 'brevo';
  if (config.SMTP_HOST) return 'smtp';
  return config.NODE_ENV === 'production' ? 'none' : 'log';
}

const sender = () => ({ email: config.MAIL_FROM ?? config.SMTP_FROM, name: config.MAIL_FROM_NAME });

async function sendWithBrevo(message: MailMessage) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.BREVO_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: sender(),
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html
    }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Brevo HTTP ${response.status}: ${detail}`);
  }
}

async function sendWithSmtp(message: MailMessage) {
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
  });
  const from = sender();
  await transporter.sendMail({
    from: `"${from.name}" <${from.email}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
}

/** Gửi một email. Lỗi được chuẩn hóa thành 503 EMAIL_DELIVERY_FAILED; nơi gọi tự quyết định báo cho người dùng hay chỉ ghi log. */
async function deliver(message: MailMessage) {
  const provider = mailProvider();
  if (provider === 'log') {
    // Môi trường phát triển không cấu hình gửi thư: in liên kết ra console để vẫn thử được luồng.
    console.info(`[DEV] ${message.subject} cho ${message.to}: ${message.link}`);
    return;
  }
  if (provider === 'none')
    throw new AppError(
      503,
      'EMAIL_DELIVERY_FAILED',
      'Máy chủ chưa cấu hình dịch vụ gửi email (BREVO_API_KEY hoặc SMTP_HOST).'
    );
  try {
    await (provider === 'brevo' ? sendWithBrevo(message) : sendWithSmtp(message));
  } catch (error) {
    throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'Chưa gửi được email, vui lòng thử lại sau.', {
      provider,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Ghi log lỗi gửi thư mà không lộ cho người dùng (dùng ở quên mật khẩu và đăng ký). */
export function logMailFailure(purpose: string, error: unknown) {
  const detail =
    error instanceof AppError
      ? { code: error.code, details: error.details }
      : { reason: error instanceof Error ? error.message : String(error) };
  logger.warn({ event: 'mail_delivery_failed', purpose, provider: mailProvider(), ...detail }, 'mail_delivery_failed');
}

const layout = (
  title: string,
  body: string,
  link: string,
  action: string
) => `<!doctype html><html lang="vi"><body style="margin:0;background:#f6f3ea;font-family:Arial,sans-serif;color:#1d2a24">
<div style="max-width:520px;margin:24px auto;background:#fffcf5;border:1px solid #dce3dc;border-radius:8px;padding:28px">
<p style="margin:0 0 4px;font-size:13px;color:#596b62">Sổ Mộc · Sổ thu chi cá nhân</p>
<h1 style="margin:0 0 16px;font-size:22px">${title}</h1>
<p style="font-size:15px;line-height:1.6">${body}</p>
<p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#174c3c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${action}</a></p>
<p style="font-size:13px;color:#596b62;line-height:1.5">Nút không hoạt động? Mở liên kết sau:<br><a href="${link}" style="color:#23654f;word-break:break-all">${link}</a></p>
<p style="font-size:13px;color:#596b62">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
</div></body></html>`;

export async function sendPasswordReset(recipient: string, resetToken: string): Promise<void> {
  const link = `${config.APP_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const minutes = config.RESET_TOKEN_EXPIRES_MINUTES;
  await deliver({
    to: recipient,
    subject: 'Đặt lại mật khẩu Sổ Mộc',
    link,
    text: `Bạn vừa yêu cầu đặt lại mật khẩu Sổ Mộc. Mở liên kết sau trong ${minutes} phút để đặt mật khẩu mới: ${link}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html: layout(
      'Đặt lại mật khẩu',
      `Bạn vừa yêu cầu đặt lại mật khẩu. Liên kết có hiệu lực trong <b>${minutes} phút</b> và chỉ dùng được một lần.`,
      link,
      'Đặt mật khẩu mới'
    )
  });
}

export async function sendVerificationEmail(recipient: string, token: string): Promise<void> {
  const link = `${config.APP_URL}/?verify=${encodeURIComponent(token)}`;
  await deliver({
    to: recipient,
    subject: 'Xác minh email Sổ Mộc',
    link,
    text: `Xác nhận đây là email của bạn để dùng khi cần lấy lại mật khẩu: ${link}`,
    html: layout(
      'Xác minh email của bạn',
      'Xác nhận đây là email của bạn. Sổ Mộc dùng email này để gửi liên kết khi bạn cần lấy lại mật khẩu.',
      link,
      'Xác minh email'
    )
  });
}

/** Giao diện gửi thư được tiêm vào các service xác thực (dễ thay bằng bản giả khi test). */
export interface Mailer {
  sendPasswordReset(recipient: string, token: string): Promise<void>;
  sendVerificationEmail(recipient: string, token: string): Promise<void>;
}

export const mailer: Mailer = { sendPasswordReset, sendVerificationEmail };
