import type { Request } from 'express';
import type { AnyZodObject } from 'zod';
import { AppError } from '../errors/app-error';
import { uuid } from './validation';

/** ID người dùng đã xác thực. Chỉ dùng sau middleware `authenticate`. */
export function currentUserId(req: Request): string {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.');
  return req.user.id;
}

/** Đọc và kiểm tra tham số đường dẫn dạng UUID (mặc định `:id`). */
export function uuidParam(req: Request, name = 'id'): string {
  return uuid.parse(req.params[name]);
}

/** Schema PATCH: mọi trường tùy chọn nhưng phải gửi ít nhất một trường. */
export function patchSchema<T extends AnyZodObject>(schema: T) {
  return schema.partial().refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.');
}
