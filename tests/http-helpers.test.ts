import multer from 'multer';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { asyncHandler } from '../src/lib/async-handler';
import { AppError, forbidden, notFound } from '../src/lib/errors';
import { pageMeta, success } from '../src/lib/response';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler';

function mockResponse() {
  const response = { status: vi.fn(), json: vi.fn() } as any;
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

describe('HTTP helpers', () => {
  it('tạo response và metadata thống nhất', () => {
    const res = mockResponse();
    success(res, { id: 1 }, 'Đã xong', 201, pageMeta(2, 10, 25));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Đã xong', data: { id: 1 }, meta: { page: 2, limit: 10, total: 25, totalPages: 3 } });
  });

  it('tạo lỗi nghiệp vụ chuẩn', () => {
    expect(notFound('Ví')).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Ví không tồn tại.' });
    expect(forbidden()).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('asyncHandler chuyển lỗi về next', async () => {
    const next = vi.fn();
    asyncHandler(async () => { throw new Error('boom'); })({} as any, {} as any, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' })));
  });

  it('notFoundHandler tạo lỗi route', () => {
    const next = vi.fn();
    notFoundHandler({} as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'ROUTE_NOT_FOUND' }));
  });

  it('errorHandler xử lý AppError, Zod, upload và lỗi lạ', () => {
    const res = mockResponse();
    errorHandler(new AppError(409, 'CONFLICT', 'Xung đột', { id: 1 }), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenLastCalledWith(409);
    z.string().min(3).safeParse('x').error && errorHandler(z.string().min(3).safeParse('x').error, {} as any, res, vi.fn());
    expect(res.status).toHaveBeenLastCalledWith(422);
    errorHandler(new multer.MulterError('LIMIT_FILE_SIZE'), {} as any, res, vi.fn());
    expect(res.json).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'UPLOAD_ERROR' }) }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    errorHandler(new Error('unknown'), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenLastCalledWith(500);
  });
});
