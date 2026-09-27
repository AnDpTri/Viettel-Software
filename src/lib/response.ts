import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function success<T>(res: Response, data: T, message = 'Thành công.', statusCode = 200, meta?: PaginationMeta) {
  return res.status(statusCode).json({ success: true, message, data, ...(meta ? { meta } : {}) });
}

export function pageMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
