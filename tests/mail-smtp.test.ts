import { afterEach, describe, expect, it, vi } from 'vitest';

// Cấu hình tự host: gửi qua máy chủ SMTP (ví dụ Mailpit trong docker compose).
vi.hoisted(() => {
  process.env.SMTP_HOST = 'smtp.test.local';
  process.env.SMTP_USER = 'mailer';
  process.env.SMTP_PASS = 'mailer-pass';
});

const sendMail = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));

import nodemailer from 'nodemailer';
import { mailProvider, sendPasswordReset, sendVerificationEmail } from '../src/services/mail.service';

afterEach(() => { sendMail.mockReset(); });

describe('Gửi email qua SMTP', () => {
  it('dùng SMTP khi không có khóa Brevo', async () => {
    expect(mailProvider()).toBe('smtp');
    await sendPasswordReset('ban@example.com', 'abc');
    await sendVerificationEmail('ban@example.com', 'xyz');
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.test.local', auth: { user: 'mailer', pass: 'mailer-pass' } }));
    expect(sendMail.mock.calls.map(([mail]) => mail.subject)).toEqual(['Đặt lại mật khẩu Sổ Mộc', 'Xác minh email Sổ Mộc']);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: 'ban@example.com', from: '"Sổ Mộc" <no-reply@finance.local>' });
  });

  it('lỗi SMTP được chuẩn hóa thành EMAIL_DELIVERY_FAILED', async () => {
    sendMail.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));
    await expect(sendPasswordReset('ban@example.com', 'abc')).rejects.toMatchObject({ statusCode: 503, code: 'EMAIL_DELIVERY_FAILED', details: { provider: 'smtp', reason: 'connect ETIMEDOUT' } });
  });
});
