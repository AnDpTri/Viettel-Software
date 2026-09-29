import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('app smoke test', () => {
  const app = createApp();

  it('health check dùng response envelope', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'UP' } });
  });

  it('phục vụ Swagger UI', async () => {
    const response = await request(app).get('/api-docs/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Sổ thu chi API');
  });

  it('phục vụ màn hình đặt lại mật khẩu từ liên kết email', async () => {
    const response = await request(app).get('/reset-password?token=test-token');
    expect(response.status).toBe(200);
    expect(response.text).toContain('id="login-form"');
  });

  it('không cache response API để tránh dữ liệu 304 cũ trên dashboard', async () => {
    const response = await request(app).get('/api/v1/wallets');
    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('trả lỗi thống nhất cho route không tồn tại', async () => {
    const response = await request(app).get('/khong-ton-tai');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Đường dẫn API không tồn tại.' }
    });
  });
});
