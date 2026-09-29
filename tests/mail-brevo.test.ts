import { afterEach, describe, expect, it, vi } from 'vitest';

// Cấu hình giống bản triển khai Render: gửi email qua API HTTPS của Brevo.
vi.hoisted(() => {
  process.env.BREVO_API_KEY = 'brevo-test-key';
  process.env.MAIL_FROM = 'so-moc@example.com';
});

import { mailProvider, sendPasswordReset } from '../src/services/mail.service';
import { client, registerUser } from './helpers/api';

const sent: Array<{ headers: Record<string, string>; body: { sender: { email: string; name: string }; to: Array<{ email: string }>; subject: string; htmlContent: string; textContent: string } }> = [];

function stubBrevo(status = 201) {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    sent.push({ headers: init.headers, body: JSON.parse(init.body) });
    return new Response(status < 300 ? '{"messageId":"m1"}' : '{"message":"Key not found"}', { status });
  }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Gửi email qua Brevo', () => {
  it('ưu tiên Brevo khi có khóa API', () => {
    expect(mailProvider()).toBe('brevo');
  });

  it('quên mật khẩu gửi thư thật tới đúng email, kèm liên kết đặt lại', async () => {
    const email = `brevo_${Date.now()}@example.com`;
    stubBrevo();
    await registerUser({ email });
    expect(sent[0]!.body.subject).toBe('Xác minh email Sổ Mộc');
    stubBrevo();
    const response = await client().post('/auth/forgot-password').send({ email: email.toUpperCase() });
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    const message = sent[0]!;
    expect(message.headers['api-key']).toBe('brevo-test-key');
    expect(message.body.sender).toEqual({ email: 'so-moc@example.com', name: 'Sổ Mộc' });
    expect(message.body.to).toEqual([{ email }]);
    expect(message.body.subject).toBe('Đặt lại mật khẩu Sổ Mộc');
    expect(message.body.htmlContent).toContain('http://localhost:3000/reset-password?token=');
    expect(message.body.textContent).toContain('15 phút');
  });

  it('Brevo lỗi: quên mật khẩu vẫn trả thông báo chung, còn gửi lại thư xác minh báo lỗi rõ ràng', async () => {
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => { warnings.push(String(line)); });
    stubBrevo(401);
    const user = await registerUser({ email: `fail_${Date.now()}@example.com` });
    const forgot = await client().post('/auth/forgot-password').send({ email: `fail_${Date.now()}@example.com` });
    expect(forgot.status).toBe(200);
    const verify = await user.api.post('/auth/verification/email/send');
    expect(verify.status).toBe(503);
    expect(verify.body.error.code).toBe('EMAIL_DELIVERY_FAILED');
    expect(warnings.join('\n')).toContain('mail_delivery_failed');
    await expect(sendPasswordReset('x@example.com', 'token')).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED', details: { provider: 'brevo' } });
  });
});
