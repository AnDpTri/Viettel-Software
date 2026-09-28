import { Prisma } from '@prisma/client';
import { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', 'Đường dẫn API không tồn tại.'));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  res.locals ??= {};
  if (error instanceof ZodError) {
    res.locals.errorCode = 'VALIDATION_ERROR';
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ.', details: error.flatten() } });
  }
  if (error instanceof AppError) {
    res.locals.errorCode = error.code;
    return res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
  }
  if (error instanceof multer.MulterError) {
    res.locals.errorCode = 'UPLOAD_ERROR';
    return res.status(422).json({ success: false, error: { code: 'UPLOAD_ERROR', message: error.code === 'LIMIT_FILE_SIZE' ? 'Tệp vượt quá dung lượng cho phép.' : error.message } });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.locals.errorCode = 'DUPLICATE_RESOURCE';
    return res.status(409).json({ success: false, error: { code: 'DUPLICATE_RESOURCE', message: 'Dữ liệu đã tồn tại.' } });
  }
  res.locals.errorCode = 'INTERNAL_ERROR';
  console.error(JSON.stringify({ level: 'error', event: 'unhandled_error', requestId: res.locals.requestId ?? null, method: req.method, path: req.originalUrl, error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) }));
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.' } });
};
