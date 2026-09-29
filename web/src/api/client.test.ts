import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, apiErrorMessage, onSessionExpired, session } from './client';

type Reply = { status: number; body: unknown };

function mockFetch(replies: Reply[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (!reply) throw new Error(`Không có phản hồi giả cho ${url}`);
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

beforeEach(() => {
  session.token = 'access-cu';
  session.refreshToken = 'refresh-cu';
});

afterEach(() => {
  vi.unstubAllGlobals();
  onSessionExpired(() => undefined);
});

describe('api', () => {
  it('gắn access token và trả phần data của phong bì phản hồi', async () => {
    const calls = mockFetch([{ status: 200, body: { success: true, data: { id: 1 } } }]);
    await expect(api('/wallets')).resolves.toEqual({ id: 1 });
    expect(calls[0]!.url).toBe('/api/v1/wallets');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer access-cu');
  });

  it('gặp 401 thì làm mới phiên một lần rồi gửi lại bằng token mới', async () => {
    const calls = mockFetch([
      { status: 401, body: { success: false, error: { code: 'UNAUTHORIZED' } } },
      { status: 200, body: { success: true, data: { accessToken: 'access-moi', refreshToken: 'refresh-moi' } } },
      { status: 200, body: { success: true, data: ['ok'] } }
    ]);
    await expect(api('/reports/summary')).resolves.toEqual(['ok']);
    expect(calls.map((call) => call.url)).toEqual([
      '/api/v1/reports/summary',
      '/api/v1/auth/refresh',
      '/api/v1/reports/summary'
    ]);
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ refreshToken: 'refresh-cu' });
    expect((calls[2]!.init.headers as Record<string, string>).Authorization).toBe('Bearer access-moi');
    expect(session).toEqual({ token: 'access-moi', refreshToken: 'refresh-moi' });
  });

  it('không làm mới được phiên thì báo hết phiên để quay về màn đăng nhập', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    mockFetch([
      { status: 401, body: {} },
      { status: 401, body: { success: false, error: { message: 'Phiên đã hết hạn' } } }
    ]);
    await expect(api('/budgets')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(expired).toHaveBeenCalledOnce();
  });

  it('lỗi nghiệp vụ trả ApiError kèm mã lỗi và thông điệp của trường đầu tiên', async () => {
    mockFetch([
      {
        status: 422,
        body: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu không hợp lệ',
            details: { fieldErrors: { amount: ['Số tiền phải lớn hơn 0'] } }
          }
        }
      }
    ]);
    const error = await api('/transactions', { method: 'POST', body: {} }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Số tiền phải lớn hơn 0' });
  });
});

describe('apiErrorMessage', () => {
  it('ưu tiên lỗi của trường, rồi lỗi của form, rồi thông điệp chung', () => {
    expect(apiErrorMessage({ error: { details: { formErrors: ['Sai định dạng'] }, message: 'x' } })).toBe(
      'Sai định dạng'
    );
    expect(apiErrorMessage({ error: { message: 'Không tìm thấy' } })).toBe('Không tìm thấy');
    expect(apiErrorMessage({})).toBe('Không thể kết nối hệ thống.');
  });
});
