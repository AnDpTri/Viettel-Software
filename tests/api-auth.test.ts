import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app, client, PASSWORD, prisma, registerUser } from './helpers/api';

const anonymous = client();
const cookieValue = (cookies: string[] | undefined, name: string) => cookies?.find((item) => item.startsWith(`${name}=`))?.split(';')[0];

/** Mail/SMS ở môi trường test ghi ra console; bắt dòng log để lấy liên kết hoặc mã OTP như người dùng nhận được. */
function captureConsole() {
  const lines: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((line: unknown) => { lines.push(String(line)); });
  return lines;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Đăng ký và đăng nhập', () => {
  it('đăng ký chỉ với tên đăng nhập và mật khẩu, không tự tạo dữ liệu tài chính', async () => {
    const user = await registerUser({ fullName: '' });
    expect(user.cookie.join(';')).toContain('finance_refresh=');
    expect(await prisma.wallet.count({ where: { userId: user.id } })).toBe(0);
    const profile = await user.api.get('/profile');
    expect(profile.body.data).toMatchObject({ username: user.username, fullName: null, isVip: false });
  });

  it('từ chối mật khẩu yếu, định danh sai định dạng và tài khoản trùng', async () => {
    const weak = await anonymous.post('/auth/register').send({ username: 'abc_weak', password: 'password123' });
    expect(weak.status).toBe(422);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    const badName = await anonymous.post('/auth/register').send({ username: 'có dấu', password: PASSWORD });
    expect(badName.body.error.details.fieldErrors.username[0]).toContain('chữ không dấu');
    const user = await registerUser({ email: `${Date.now()}@example.com` });
    const duplicate = await anonymous.post('/auth/register').send({ username: user.username, password: PASSWORD });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatchObject({ code: 'DUPLICATE_RESOURCE', details: { fields: ['username'] } });
  });

  it('đăng nhập bằng tên đăng nhập, email hoặc số điện thoại; sai mật khẩu trả 401', async () => {
    const phone = `09${Date.now().toString().slice(-8)}`;
    const email = `login_${Date.now()}@example.com`;
    const user = await registerUser({ email, phone });
    for (const identifier of [user.username, email, email.toUpperCase(), ` ${email} `, phone]) {
      const response = await anonymous.post('/auth/login').send({ identifier, password: PASSWORD, remember: false, deviceName: 'Vitest' });
      expect(response.status).toBe(200);
      expect(response.body.data.user.id).toBe(user.id);
    }
    const wrong = await anonymous.post('/auth/login').send({ identifier: user.username, password: 'SaiMatKhau@2026' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('API cần đăng nhập từ chối thiếu token hoặc token giả', async () => {
    expect((await anonymous.get('/wallets')).body.error.code).toBe('UNAUTHORIZED');
    const fake = await client('khong-phai-jwt').get('/wallets');
    expect(fake.status).toBe(401);
    expect(fake.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('Phiên đăng nhập', () => {
  it('xoay vòng refresh token và khóa cả chuỗi khi token cũ bị dùng lại', async () => {
    const user = await registerUser();
    const first = await anonymous.post('/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(first.status).toBe(200);
    const reused = await anonymous.post('/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(reused.status).toBe(401);
    const afterReuse = await anonymous.post('/auth/refresh').send({ refreshToken: first.body.data.refreshToken });
    expect(afterReuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect((await anonymous.post('/auth/refresh').send({})).body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('khôi phục phiên từ cookie và báo trạng thái phiên', async () => {
    const user = await registerUser();
    const cookie = cookieValue(user.cookie, 'finance_refresh')!;
    const status = await request(app).get('/api/v1/auth/session-status').set('Cookie', cookie);
    expect(status.body.data.authenticated).toBe(true);
    expect((await anonymous.get('/auth/session-status')).body.data.authenticated).toBe(false);
    const broken = await request(app).get('/api/v1/auth/session-status').set('Cookie', 'finance_refresh=hong');
    expect(broken.body.data.authenticated).toBe(false);
    const restored = await request(app).post('/api/v1/auth/session').set('Cookie', cookie);
    expect(restored.status).toBe(200);
    expect(restored.body.data.user).toMatchObject({ id: user.id, isVip: false });
  });

  it('liệt kê, thu hồi từng thiết bị, đăng xuất và đăng xuất mọi nơi', async () => {
    const user = await registerUser();
    const second = await anonymous.post('/auth/login').send({ identifier: user.username, password: PASSWORD, deviceName: 'Điện thoại' });
    const sessions = await user.api.get('/auth/sessions');
    expect(sessions.body.data.length).toBe(2);
    const phone = sessions.body.data.find((item: { deviceName: string }) => item.deviceName === 'Điện thoại');
    expect((await user.api.delete(`/auth/sessions/${phone.familyId}`)).status).toBe(200);
    expect((await anonymous.post('/auth/refresh').send({ refreshToken: second.body.data.refreshToken })).status).toBe(401);
    const logout = await user.api.post('/auth/logout').send({ refreshToken: user.refreshToken });
    expect(logout.headers['set-cookie']?.[0]).toContain('Max-Age=0');
    expect((await anonymous.post('/auth/refresh').send({ refreshToken: user.refreshToken })).status).toBe(401);
    const other = await registerUser();
    expect((await other.api.post('/auth/logout-all')).status).toBe(200);
    expect((await anonymous.post('/auth/refresh').send({ refreshToken: other.refreshToken })).status).toBe(401);
  });
});

describe('Mật khẩu', () => {
  it('đổi mật khẩu: kiểm tra mật khẩu cũ, không cho trùng, thu hồi mọi phiên', async () => {
    const user = await registerUser();
    expect((await user.api.post('/auth/change-password').send({ currentPassword: 'Sai@2026abc', newPassword: 'MatKhauMoi@2026' })).body.error.code).toBe('WRONG_PASSWORD');
    expect((await user.api.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: PASSWORD })).body.error.code).toBe('SAME_PASSWORD');
    expect((await user.api.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'MatKhauMoi@2026' })).status).toBe(200);
    expect((await anonymous.post('/auth/refresh').send({ refreshToken: user.refreshToken })).status).toBe(401);
    expect((await anonymous.post('/auth/login').send({ identifier: user.username, password: 'MatKhauMoi@2026' })).status).toBe(200);
  });

  it('quên mật khẩu qua Email: gửi liên kết, đặt lại bằng token, token chỉ dùng một lần', async () => {
    const email = `reset_${Date.now()}@example.com`;
    const user = await registerUser({ email });
    const logs = captureConsole();
    const response = await anonymous.post('/auth/forgot-password').send({ email: email.toUpperCase() });
    expect(response.body.message).toBe('Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi.');
    const token = decodeURIComponent(logs.join('\n').match(/reset-password\?token=([^\s]+)/)![1]!);
    expect((await anonymous.post('/auth/reset-password').send({ token, newPassword: 'DatLaiEmail@2026' })).status).toBe(200);
    expect((await anonymous.post('/auth/reset-password').send({ token, newPassword: 'DatLaiLan2@2026' })).body.error.code).toBe('INVALID_RESET_TOKEN');
    expect((await anonymous.post('/auth/login').send({ identifier: user.username, password: 'DatLaiEmail@2026' })).status).toBe(200);
  });

  it('liên kết hết hạn hoặc sai không đặt lại được mật khẩu', async () => {
    const email = `expired_${Date.now()}@example.com`;
    const user = await registerUser({ email });
    const logs = captureConsole();
    await anonymous.post('/auth/forgot-password').send({ email });
    const token = decodeURIComponent(logs.join('\n').match(/reset-password\?token=([^\s]+)/)![1]!);
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await anonymous.post('/auth/reset-password').send({ token, newPassword: 'HetHan@20266' })).body.error.code).toBe('INVALID_RESET_TOKEN');
    expect((await anonymous.post('/auth/reset-password').send({ token: 'x'.repeat(64), newPassword: 'HetHan@20266' })).body.error.code).toBe('INVALID_RESET_TOKEN');
    expect((await anonymous.post('/auth/reset-password').send({ newPassword: 'HetHan@20266' })).status).toBe(422);
  });

  it('tài khoản không có email: không gửi gì nhưng vẫn trả cùng thông báo', async () => {
    const logs = captureConsole();
    await registerUser();
    const response = await anonymous.post('/auth/forgot-password').send({ email: 'khong-co@example.com' });
    expect(response.status).toBe(200);
    expect(logs.join('\n')).not.toContain('reset-password?token=');
  });

  it('không lộ tài khoản: email chưa đăng ký vẫn trả cùng thông báo', async () => {
    const response = await anonymous.post('/auth/forgot-password').send({ email: 'chua-dang-ky@example.com' });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi.');
  });

  it('quên mật khẩu chỉ nhận email, không nhận tên đăng nhập hay số điện thoại', async () => {
    const user = await registerUser({ email: `only_${Date.now()}@example.com` });
    for (const body of [{ identifier: user.username }, { email: user.username }, {}, { phone: '0901234567' }]) {
      const response = await anonymous.post('/auth/forgot-password').send(body);
      expect(response.status).toBe(422);
    }
    expect((await anonymous.post('/auth/forgot-password').send({})).body.error.details.fieldErrors.email[0]).toBe('Hãy nhập email của tài khoản.');
  });
});

describe('Xác minh email', () => {
  it('gửi và xác nhận liên kết xác minh; tài khoản không có email bị từ chối', async () => {
    const logs = captureConsole();
    const user = await registerUser({ email: `verify_${Date.now()}@example.com` });
    const token = decodeURIComponent(logs.join('\n').match(/\?verify=([^\s]+)/)![1]!);
    expect((await user.api.post('/auth/verification/email/send')).body.message).toBe('Đã gửi email xác minh.');
    expect((await anonymous.post('/auth/verification/email/confirm').send({ token })).status).toBe(200);
    expect((await anonymous.post('/auth/verification/email/confirm').send({ token })).body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
    expect((await user.api.post('/auth/verification/email/send')).body.message).toBe('Email đã được xác minh.');
    const noEmail = await registerUser();
    expect((await noEmail.api.post('/auth/verification/email/send')).body.error.code).toBe('EMAIL_REQUIRED');
  });
});

describe('Đăng nhập liên kết OAuth', () => {
  it('liệt kê nền tảng và chuyển hướng tới trang cấp quyền', async () => {
    expect((await anonymous.get('/auth/oauth/providers')).body.data).toMatchObject({ google: true, github: true });
    const start = await anonymous.get('/auth/oauth/google/start');
    expect(start.status).toBe(302);
    expect(start.headers.location).toContain('accounts.google.com');
    expect((await anonymous.get('/auth/oauth/github/start')).headers.location).toContain('github.com/login/oauth');
    expect((await anonymous.get('/auth/oauth/facebook/start')).status).toBe(422);
  });

  it('callback tạo tài khoản mới từ Google và GitHub, từ chối state giả', async () => {
    const id = Date.now().toString();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = url.includes('oauth2.googleapis.com') || url.includes('login/oauth/access_token') ? { access_token: 'tok' }
        : url.includes('openidconnect') ? { sub: `g${id}`, email: `g${id}@example.com`, name: 'Google User', email_verified: true }
          : url.endsWith('/user') ? { id: Number(id), login: `gh${id}`, name: null }
            : [{ email: `gh${id}@example.com`, primary: true, verified: true }];
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    }));
    for (const provider of ['google', 'github']) {
      const start = await anonymous.get(`/auth/oauth/${provider}/start`);
      const stateCookie = cookieValue(start.headers['set-cookie'] as unknown as string[], 'finance_oauth_state')!;
      const state = new URL(start.headers.location).searchParams.get('state');
      const callback = await request(app).get(`/api/v1/auth/oauth/${provider}/callback?code=abc&state=${state}`).set('Cookie', stateCookie);
      expect(callback.status).toBe(302);
      expect(callback.headers.location).toBe('/?oauth=success');
      // Lần hai: dùng lại tài khoản liên kết đã có.
      const again = await request(app).get(`/api/v1/auth/oauth/${provider}/callback?code=abc&state=${state}`).set('Cookie', stateCookie);
      expect(again.status).toBe(302);
    }
    expect(await prisma.oAuthAccount.count({ where: { providerUserId: { in: [`g${id}`, id] } } })).toBe(2);
    const forged = await request(app).get('/api/v1/auth/oauth/google/callback?code=abc&state=gia').set('Cookie', 'finance_oauth_state=that');
    expect(forged.body.error.code).toBe('INVALID_OAUTH_STATE');
  });

  it('báo lỗi khi nền tảng không trả access token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'bad_code' }))));
    const start = await anonymous.get('/auth/oauth/google/start');
    const stateCookie = cookieValue(start.headers['set-cookie'] as unknown as string[], 'finance_oauth_state')!;
    const state = new URL(start.headers.location).searchParams.get('state');
    const callback = await request(app).get(`/api/v1/auth/oauth/google/callback?code=abc&state=${state}`).set('Cookie', stateCookie);
    expect(callback.body.error.code).toBe('OAUTH_EXCHANGE_FAILED');
  });
});
