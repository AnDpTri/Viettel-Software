import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';

/** Một app Express cho mỗi file test; mọi request đi qua middleware, validation và Prisma thật trên schema test. */
export const app = createApp();
export const PASSWORD = 'MatKhauTest@2026';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Client gọi /api/v1 kèm access token của một người dùng. */
export function client(token?: string) {
  const call = (method: Method) => (path: string) => {
    const req = request(app)[method](`/api/v1${path}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  return { get: call('get'), post: call('post'), patch: call('patch'), put: call('put'), delete: call('delete') };
}

export type TestUser = Awaited<ReturnType<typeof registerUser>>;

/** Đăng ký qua API và trả về token, thông tin người dùng và client đã đăng nhập. */
export async function registerUser(extra: Record<string, unknown> = {}) {
  const username = `t_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const response = await client()
    .post('/auth/register')
    .send({ username, password: PASSWORD, fullName: 'Người Kiểm Thử', ...extra });
  if (response.status !== 201) throw new Error(`Đăng ký thất bại: ${response.status} ${JSON.stringify(response.body)}`);
  const { user, accessToken, refreshToken } = response.body.data;
  return {
    id: user.id as string,
    username,
    accessToken: accessToken as string,
    refreshToken: refreshToken as string,
    api: client(accessToken),
    cookie: response.headers['set-cookie'] as unknown as string[]
  };
}

/** Tạo nhanh ví, danh mục thu/chi mặc định cho các test nghiệp vụ. */
export async function seedBasics(user: TestUser) {
  const cash = (await user.api.post('/wallets').send({ name: 'Tiền mặt', type: 'CASH', openingBalance: 1_000_000 }))
    .body.data;
  const bank = (await user.api.post('/wallets').send({ name: 'Ngân hàng', type: 'BANK', openingBalance: 5_000_000 }))
    .body.data;
  const food = (await user.api.post('/categories').send({ name: 'Ăn uống', type: 'EXPENSE' })).body.data;
  const salary = (await user.api.post('/categories').send({ name: 'Lương', type: 'INCOME' })).body.data;
  return { cash, bank, food, salary };
}

export { prisma };
