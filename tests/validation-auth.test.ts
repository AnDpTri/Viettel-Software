import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { paging } from '../src/core/http/validation';
import { authenticate } from '../src/core/security/authenticate';
import { signAccessToken, signRefreshToken } from '../src/core/security/tokens';

describe('validation và auth middleware', () => {
  const response = {} as Response;
  const next = () => vi.fn() as unknown as NextFunction;

  it('chuẩn hóa phân trang và giới hạn dữ liệu', () => {
    expect(paging({})).toEqual({ page: 1, limit: 20 });
    expect(paging({ page: '2', limit: '100' })).toEqual({ page: 2, limit: 100 });
    expect(() => paging({ page: 0 })).toThrow();
    expect(() => paging({ limit: 101 })).toThrow();
  });

  it('nhận access token hợp lệ', () => {
    const req = {
      headers: { authorization: `Bearer ${signAccessToken({ id: 'u1', username: 'demo' })}` }
    } as unknown as Request;
    const nextHandler = next();
    authenticate(req, response, nextHandler);
    expect(req.user).toEqual({ id: 'u1', username: 'demo' });
    expect(nextHandler).toHaveBeenCalledWith();
  });

  it('từ chối khi thiếu, sai hoặc dùng refresh token', () => {
    for (const authorization of [undefined, 'Basic abc', 'Bearer invalid', `Bearer ${signRefreshToken('u1', 'r1')}`]) {
      const nextHandler = next();
      const request = { headers: { authorization } } as unknown as Request;
      authenticate(request, response, nextHandler);
      expect(nextHandler).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    }
  });
});
