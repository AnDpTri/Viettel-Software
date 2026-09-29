import { Prisma } from '@prisma/client';
import { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { logger } from '../observability/logger';
import { AppError } from './app-error';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', 'Đường dẫn API không tồn tại.'));
};

/** Tên trường tiếng Việt cho thông báo trùng dữ liệu (lỗi unique P2002). */
const FIELD_LABELS: Record<string, string> = {
  username: 'Tên đăng nhập',
  email: 'Email',
  phone: 'Số điện thoại',
  name: 'Tên',
  idempotency_key: 'Mã chống gửi trùng',
  token_hash: 'Mã xác thực'
};

const UPLOAD_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'Tệp vượt quá dung lượng cho phép.',
  LIMIT_FILE_COUNT: 'Gửi quá nhiều tệp trong một lần.',
  LIMIT_UNEXPECTED_FILE: 'Tên trường tệp không đúng hoặc gửi thừa tệp.',
  LIMIT_PART_COUNT: 'Biểu mẫu có quá nhiều phần.',
  LIMIT_FIELD_VALUE: 'Giá trị một trường trong biểu mẫu quá dài.'
};

type HttpError = { status: number; code: string; message: string; details?: unknown };

/** Chuyển mọi loại lỗi thành một phản hồi thống nhất { success: false, error: { code, message, details? } }. */
function toHttpError(error: unknown): HttpError | null {
  if (error instanceof ZodError)
    return { status: 422, code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ.', details: error.flatten() };
  if (error instanceof AppError)
    return {
      status: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    };
  if (error instanceof multer.MulterError)
    return { status: 422, code: 'UPLOAD_ERROR', message: UPLOAD_MESSAGES[error.code] ?? 'Tệp tải lên không hợp lệ.' };
  // Lỗi do express.json() sinh ra khi đọc body: trước đây rơi xuống 500 dù là lỗi của phía gửi.
  const bodyError = error as { type?: string; status?: number };
  if (bodyError?.type === 'entity.parse.failed')
    return { status: 400, code: 'INVALID_JSON', message: 'Nội dung gửi lên không phải JSON hợp lệ.' };
  if (bodyError?.type === 'entity.too.large')
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên vượt quá dung lượng cho phép (1 MB).' };
  if (bodyError?.type === 'encoding.unsupported' || bodyError?.type === 'charset.unsupported')
    return {
      status: 415,
      code: 'UNSUPPORTED_ENCODING',
      message: 'Bảng mã của nội dung gửi lên không được hỗ trợ, hãy dùng UTF-8.'
    };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const fields = ([] as string[]).concat((error.meta?.target as string[] | string | undefined) ?? []);
      const labels = fields.map((field) => FIELD_LABELS[field] ?? field);
      return {
        status: 409,
        code: 'DUPLICATE_RESOURCE',
        message: labels.length ? `${labels.join(', ')} đã tồn tại.` : 'Dữ liệu đã tồn tại.',
        ...(fields.length ? { details: { fields } } : {})
      };
    }
    if (error.code === 'P2025')
      return { status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu cần thao tác, có thể đã bị xóa.' };
    if (error.code === 'P2003')
      return {
        status: 409,
        code: 'RELATED_RESOURCE_CONFLICT',
        message: 'Dữ liệu đang được bản ghi khác sử dụng, hoặc tham chiếu tới bản ghi không tồn tại.'
      };
  }
  return null;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  res.locals ??= {};
  const known = toHttpError(error);
  if (known) {
    res.locals.errorCode = known.code;
    return res.status(known.status).json({
      success: false,
      error: { code: known.code, message: known.message, ...(known.details ? { details: known.details } : {}) }
    });
  }
  res.locals.errorCode = 'INTERNAL_ERROR';
  logger.error(
    {
      event: 'unhandled_error',
      requestId: res.locals.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      err: error
    },
    'unhandled_error'
  );
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.' }
  });
};
