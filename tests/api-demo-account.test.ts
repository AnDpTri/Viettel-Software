import { beforeAll, describe, expect, it, vi } from 'vitest';

// Giống bản triển khai nộp cho người đánh giá: bật tài khoản dùng thử công khai.
vi.hoisted(() => { process.env.SEED_DEMO = 'true'; });

import { client, PASSWORD, registerUser, type TestUser } from './helpers/api';

let demo: TestUser;

beforeAll(async () => {
  const response = await client().post('/auth/register').send({ username: 'demo', password: PASSWORD });
  demo = { ...(await registerUser()), id: response.body.data.user.id, username: 'demo', accessToken: response.body.data.accessToken, api: client(response.body.data.accessToken) } as TestUser;
});

describe('Tài khoản demo dùng chung', () => {
  it('trang đăng nhập hiện gợi ý tài khoản demo', async () => {
    expect((await client().get('/auth/oauth/providers')).body.data.demoEnabled).toBe(true);
  });

  it('không cho đổi mật khẩu, đổi thông tin khôi phục hay xóa tài khoản', async () => {
    const changePassword = await demo.api.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'ChiemQuyen@2026' });
    expect(changePassword.status).toBe(403);
    expect(changePassword.body.error.code).toBe('DEMO_ACCOUNT_PROTECTED');
    expect((await demo.api.patch('/profile').send({ email: 'ke-xau@example.com' })).body.error.code).toBe('DEMO_ACCOUNT_PROTECTED');
    expect((await demo.api.delete('/productivity/account').send({ confirmation: 'XOA TAI KHOAN' })).body.error.code).toBe('DEMO_ACCOUNT_PROTECTED');
    expect((await client().post('/auth/login').send({ identifier: 'demo', password: PASSWORD })).status).toBe(200);
  });

  it('vẫn dùng bình thường các chức năng khác, và tài khoản khác không bị ảnh hưởng', async () => {
    expect((await demo.api.patch('/profile').send({ fullName: 'Mentor thử' })).body.data.fullName).toBe('Mentor thử');
    expect((await demo.api.post('/wallets').send({ name: 'Ví thử' })).status).toBe(201);
    const normal = await registerUser();
    expect((await normal.api.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'MatKhauMoi@2026' })).status).toBe(200);
  });
});
