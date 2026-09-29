import type { Prisma } from '@prisma/client';

/** Đọc cột JSON dạng object an toàn; giá trị null, mảng hay kiểu nguyên thủy trả về object rỗng. */
export function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
