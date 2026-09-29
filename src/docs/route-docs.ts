import type { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
// Nạp phần mở rộng .openapi() cho Zod trước khi các route đặt tên schema.
import '../core/http/zod';

/** Mô tả một endpoint. Schema body/query chính là schema Zod mà handler dùng để kiểm tra dữ liệu, nên tài liệu không lệch với code. */
export interface RouteDoc {
  summary: string;
  /** Nhóm trong Swagger UI; mặc định theo router. */
  tag?: string;
  description?: string;
  /** Body JSON; dùng named() để đưa schema thành component có tên trong tài liệu. */
  body?: ZodTypeAny;
  query?: AnyZodObject;
  /** Body multipart/form-data: tên trường tệp. */
  file?: string;
  /** Mã HTTP khi thành công (mặc định 200). */
  status?: number;
  /** Kiểu phản hồi không theo envelope JSON. */
  produces?: 'csv' | 'file' | 'redirect';
  /** Có phân trang: phản hồi kèm meta { page, limit, total, totalPages }. */
  paginated?: boolean;
  /** Các lỗi nghiệp vụ đáng chú ý: { 409: 'DUPLICATE_RESOURCE – ...' }. */
  errors?: Record<number, string>;
}

const registry = new WeakMap<Router, Map<string, RouteDoc>>();

/** Gắn tài liệu cho các route của một router, khóa dạng 'POST /register' đúng như khai báo trên router. */
export function documentRoutes(router: Router, docs: Record<string, RouteDoc>) {
  const map = registry.get(router) ?? new Map<string, RouteDoc>();
  for (const [key, doc] of Object.entries(docs)) {
    const [method = '', path = ''] = key.split(' ');
    map.set(`${method.toLowerCase()} ${path}`, doc);
  }
  registry.set(router, map);
}

export function routeDoc(router: Router, method: string, path: string) {
  return registry.get(router)?.get(`${method.toLowerCase()} ${path}`);
}

/** Đặt tên component cho schema (hiện ở mục Schemas của Swagger UI). */
export const named = <T extends ZodTypeAny>(name: string, schema: T) => schema.openapi(name) as T;
