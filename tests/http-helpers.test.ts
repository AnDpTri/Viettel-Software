import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { asyncHandler } from '../src/core/http/async-handler';
import { AppError, forbidden, notFound } from '../src/core/errors/app-error';
import { pageMeta, success } from '../src/core/http/response';
import { errorHandler, notFoundHandler } from '../src/core/errors/error-handler';

function mockResponse(): Response {
  const response = {} as Response;
  response.status = vi.fn().mockReturnValue(response);
  response.json = vi.fn().mockReturnValue(response);
  return response;
}

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('HTTP helpers', () => {
  it('tạo response và metadata thống nhất', () => {
    const res = mockResponse();
    success(res, { id: 1 }, 'Đã xong', 201, pageMeta(2, 10, 25));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Đã xong',
      data: { id: 1 },
      meta: { page: 2, limit: 10, total: 25, totalPages: 3 }
    });
  });

  it('tạo lỗi nghiệp vụ chuẩn', () => {
    expect(notFound('Ví')).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Ví không tồn tại.' });
    expect(forbidden()).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('asyncHandler chuyển lỗi về next', async () => {
    const next = mockNext();
    asyncHandler(async () => {
      throw new Error('boom');
    })({} as Request, {} as Response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' })));
  });

  it('notFoundHandler tạo lỗi route', () => {
    const next = mockNext();
    notFoundHandler({} as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'ROUTE_NOT_FOUND' }));
  });

  it('errorHandler xử lý AppError, Zod, upload và lỗi lạ', () => {
    const res = mockResponse();
    errorHandler(new AppError(409, 'CONFLICT', 'Xung đột', { id: 1 }), {} as Request, res, mockNext());
    expect(res.status).toHaveBeenLastCalledWith(409);
    const zodError = z.string().min(3).safeParse('x').error;
    if (zodError) errorHandler(zodError, {} as Request, res, mockNext());
    expect(res.status).toHaveBeenLastCalledWith(422);
    errorHandler(new multer.MulterError('LIMIT_FILE_SIZE'), {} as Request, res, mockNext());
    expect(res.json).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'UPLOAD_ERROR' }) })
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    errorHandler(new Error('unknown'), {} as Request, res, mockNext());
    expect(res.status).toHaveBeenLastCalledWith(500);
  });
});
