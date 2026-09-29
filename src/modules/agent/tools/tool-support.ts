import type { PrismaClient, TransactionType } from '@prisma/client';
import { z } from 'zod';
import { AppError, notFound } from '../../../core/errors/app-error';
import type { PendingEntity } from '../agent.types';

/** Client Prisma dùng cho tool: có thể là client gốc hoặc client trong transaction. */
export type DbClient = PrismaClient;

export const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Ngày không hợp lệ');
export const money = z.coerce.number().positive().max(999_999_999_999);
export const uuid = z.string().uuid();
export const recurrence = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

export function sameName(a: string, b: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .toLowerCase()
      .trim();
  const left = normalize(a);
  const right = normalize(b);
  return left === right || (left.length >= 3 && right.includes(left)) || (right.length >= 3 && left.includes(right));
}

/** Ưu tiên khớp chính xác trước khi khớp gần đúng, để "Dịch vụ" không bị nhầm sang danh mục con có tên chứa "dịch vụ". */
export function findByName<T extends { name: string }>(rows: T[], name: string) {
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase().trim();
  const target = normalize(name);
  return rows.find((row) => normalize(row.name) === target) ?? rows.find((row) => sameName(row.name, name));
}

type ResolvedWallet = { id: string | null; ref: string | null; name: string; currency: string };
type ResolvedCategory = { id: string | null; ref: string | null; name: string; type: TransactionType };

export async function resolveWallet(
  db: DbClient,
  userId: string,
  walletId?: string,
  walletName?: string,
  optional = false,
  pending: PendingEntity[] = []
): Promise<ResolvedWallet | null> {
  const rows = await db.wallet.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } });
  const waitingWallets = pending.filter((item) => item.kind === 'wallet');
  const row = walletId
    ? rows.find((item) => item.id === walletId)
    : walletName
      ? findByName(rows, walletName)
      : rows.length === 1 && !waitingWallets.length
        ? rows[0]
        : undefined;
  if (row) return { id: row.id, ref: null, name: row.name, currency: row.currency };
  const waiting = walletName
    ? findByName(waitingWallets, walletName)
    : !walletId && !rows.length && waitingWallets.length === 1
      ? waitingWallets[0]
      : undefined;
  if (waiting) return { id: null, ref: waiting.ref, name: waiting.name, currency: waiting.currency ?? 'VND' };
  if (!optional)
    throw new AppError(422, 'AGENT_NEEDS_WALLET', 'Tôi chưa xác định được ví. Bạn hãy nói rõ tên ví muốn sử dụng.');
  return null;
}

export async function resolveCategory(
  db: DbClient,
  userId: string,
  type: TransactionType | undefined,
  categoryId?: string,
  categoryName?: string,
  optional = true,
  pending: PendingEntity[] = []
): Promise<ResolvedCategory | null> {
  if (!categoryId && !categoryName) return null;
  const rows = await db.category.findMany({ where: { userId, archivedAt: null, ...(type ? { type } : {}) } });
  const row = categoryId ? rows.find((item) => item.id === categoryId) : findByName(rows, categoryName!);
  if (row) return { id: row.id, ref: null, name: row.name, type: row.type };
  const waiting = categoryName
    ? findByName(
        pending.filter((item) => item.kind === 'category' && (!type || item.type === type)),
        categoryName
      )
    : undefined;
  if (waiting) return { id: null, ref: waiting.ref, name: waiting.name, type: waiting.type ?? type ?? 'EXPENSE' };
  if (!optional)
    throw new AppError(422, 'AGENT_NEEDS_CATEGORY', `Không tìm thấy danh mục “${categoryName ?? categoryId}” phù hợp.`);
  return null;
}

type ChangeRow = { label: string; from: unknown; to: unknown; kind?: 'money' | 'date' };
const CHANGE_LABELS: Record<string, [string, ChangeRow['kind']?]> = {
  amount: ['Số tiền', 'money'],
  occurredAt: ['Thời gian', 'date'],
  note: ['Ghi chú'],
  payee: ['Người nhận'],
  status: ['Trạng thái'],
  name: ['Tên'],
  type: ['Loại'],
  currency: ['Tiền tệ'],
  openingBalance: ['Số dư đầu kỳ', 'money'],
  startDate: ['Bắt đầu', 'date'],
  endDate: ['Kết thúc', 'date'],
  rollover: ['Chuyển phần dư'],
  targetAmount: ['Số tiền mục tiêu', 'money'],
  targetDate: ['Ngày mục tiêu', 'date']
};

/** Mô tả thay đổi dạng "Nhãn: cũ → mới" để thẻ xem trước đọc được, thay vì in nguyên object `changes` ra giao diện. */
export function describeChanges(before: Record<string, unknown>, changes: Record<string, unknown>): ChangeRow[] {
  const plain = (value: unknown) =>
    value instanceof Date
      ? value.toISOString()
      : value !== null && typeof value === 'object'
        ? Number(value)
        : (value ?? null);
  return Object.entries(changes)
    .filter(([key]) => CHANGE_LABELS[key])
    .map(([key, to]) => {
      const [label, kind] = CHANGE_LABELS[key]!;
      return { label, from: plain(before[key]), to: plain(to), ...(kind ? { kind } : {}) };
    });
}

export async function categoryNameOf(db: DbClient, userId: string, id: string | null | undefined) {
  if (!id) return null;
  return (await db.category.findFirst({ where: { id, userId }, select: { name: true } }))?.name ?? null;
}

export async function owned<T extends { id: string }>(label: string, promise: Promise<T | null>) {
  const value = await promise;
  if (!value) throw notFound(label);
  return value;
}

export function jsonSnapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
export function date(value?: string) {
  return value ? new Date(value) : new Date();
}
