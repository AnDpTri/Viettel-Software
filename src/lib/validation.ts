import { z } from 'zod';

export const uuid = z.string().uuid('ID không đúng định dạng UUID.');
export const money = z.coerce.number().positive('Số tiền phải lớn hơn 0.').max(999_999_999_999);
export const dateString = z.string().datetime({ offset: true }).or(z.string().date());

export function paging(query: unknown) {
  return z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .parse(query);
}
