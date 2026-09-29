import { z } from '../../core/http/zod';
import { AppError } from '../../core/errors/app-error';
import { dateString } from '../../core/http/validation';

/** Báo cáo trả JSON mặc định; ?format=csv trả tệp CSV UTF-8 (có BOM để Excel đọc đúng tiếng Việt). */
export const formatQuery = z.object({
  format: z
    .enum(['json', 'csv'])
    .default('json')
    .openapi({ description: 'csv: trả tệp CSV UTF-8 có BOM thay cho JSON' })
});

export const periodQuery = z.object({
  from: dateString.optional().openapi({ description: 'Mặc định: ngày đầu tháng hiện tại', example: '2026-09-01' }),
  to: dateString.optional().openapi({ description: 'Mặc định: hôm nay', example: '2026-09-30' })
});

export const wantsCsv = (query: Record<string, unknown>) =>
  formatQuery.parse({ format: query.format }).format === 'csv';

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

/** Ngày dạng YYYY-MM-DD được hiểu là cả ngày: `from` từ 00:00, `to` tới 23:59:59.999 (UTC). */
export function periodBoundary(value: string, endOfDay: boolean) {
  if (!dateOnlyPattern.test(value)) return new Date(value);
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
}

/** Kỳ báo cáo từ query; mặc định từ đầu tháng tới hết hôm nay. */
export function reportPeriod(query: Record<string, unknown>, now = new Date()) {
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const input = periodQuery.parse(query);
  const from = input.from ? periodBoundary(input.from, false) : defaultFrom;
  const to = input.to ? periodBoundary(input.to, true) : defaultTo;
  if (from > to) throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  return { from, to };
}
