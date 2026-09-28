import { AgentAction, GoalStatus, Prisma, RecurrenceFrequency, TransactionStatus, TransactionType, WalletType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { nextOccurrence } from '../lib/recurrence';
import type { AgentToolName } from './ai.service';
import { APP_GUIDE, getOnboardingStatus, STARTER_CATEGORIES } from './onboarding.service';

export type AgentProposal = { tool: AgentToolName; arguments: Record<string, unknown> };
export const READ_AGENT_TOOLS = new Set<AgentToolName>(['SEARCH_TRANSACTIONS', 'FINANCIAL_SUMMARY', 'EXPORT_TRANSACTIONS_CSV', 'LIST_UPCOMING_BILLS', 'GET_ONBOARDING_STATUS', 'LIST_WALLETS', 'LIST_CATEGORIES', 'GET_APP_GUIDE']);
export const IMMEDIATE_AGENT_TOOLS = new Set<AgentToolName>(['SAVE_MEMORY', 'LIST_MEMORIES', 'DELETE_MEMORY', 'GET_CONVERSATION_HISTORY', 'PREVIEW_DATA_RESET', 'EXPORT_DATA_BACKUP']);
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Ngày không hợp lệ');
const money = z.coerce.number().positive().max(999_999_999_999);
const uuid = z.string().uuid();
const recurrence = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

function sameName(a: string, b: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
  const left = normalize(a); const right = normalize(b);
  return left === right || (left.length >= 3 && right.includes(left)) || (right.length >= 3 && left.includes(right));
}

/** Ưu tiên khớp chính xác trước khi khớp gần đúng, để "Dịch vụ" không bị nhầm sang danh mục con có tên chứa "dịch vụ". */
function findByName<T extends { name: string }>(rows: T[], name: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase().trim();
  const target = normalize(name);
  return rows.find((row) => normalize(row.name) === target) ?? rows.find((row) => sameName(row.name, name));
}

/** Ví/danh mục đang chờ xác nhận trong cùng một lượt chat. Tool ghi đến sau trong lượt đó được tham chiếu nó theo
 * tên (ví dụ tạo danh mục cha, danh mục con và khoản chi trong danh mục con cùng lúc); khi xác nhận cả nhóm, `ref`
 * được thay bằng ID thật theo đúng thứ tự tạo. */
export type PendingEntity = { ref: string; kind: 'wallet' | 'category'; name: string; type?: TransactionType; currency?: string };
type ResolvedWallet = { id: string | null; ref: string | null; name: string; currency: string };
type ResolvedCategory = { id: string | null; ref: string | null; name: string; type: TransactionType };

async function resolveWallet(userId: string, walletId?: string, walletName?: string, optional = false, pending: PendingEntity[] = []): Promise<ResolvedWallet | null> {
  const rows = await prisma.wallet.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } });
  const waitingWallets = pending.filter((item) => item.kind === 'wallet');
  const row = walletId ? rows.find((item) => item.id === walletId) : walletName ? findByName(rows, walletName) : rows.length === 1 && !waitingWallets.length ? rows[0] : undefined;
  if (row) return { id: row.id, ref: null, name: row.name, currency: row.currency };
  const waiting = walletName ? findByName(waitingWallets, walletName) : !walletId && !rows.length && waitingWallets.length === 1 ? waitingWallets[0] : undefined;
  if (waiting) return { id: null, ref: waiting.ref, name: waiting.name, currency: waiting.currency ?? 'VND' };
  if (!optional) throw new AppError(422, 'AGENT_NEEDS_WALLET', 'Tôi chưa xác định được ví. Bạn hãy nói rõ tên ví muốn sử dụng.');
  return null;
}

async function resolveCategory(userId: string, type: TransactionType | undefined, categoryId?: string, categoryName?: string, optional = true, pending: PendingEntity[] = []): Promise<ResolvedCategory | null> {
  if (!categoryId && !categoryName) return null;
  const rows = await prisma.category.findMany({ where: { userId, archivedAt: null, ...(type ? { type } : {}) } });
  const row = categoryId ? rows.find((item) => item.id === categoryId) : findByName(rows, categoryName!);
  if (row) return { id: row.id, ref: null, name: row.name, type: row.type };
  const waiting = categoryName ? findByName(pending.filter((item) => item.kind === 'category' && (!type || item.type === type)), categoryName) : undefined;
  if (waiting) return { id: null, ref: waiting.ref, name: waiting.name, type: waiting.type ?? type ?? 'EXPENSE' };
  if (!optional) throw new AppError(422, 'AGENT_NEEDS_CATEGORY', `Không tìm thấy danh mục “${categoryName ?? categoryId}” phù hợp.`);
  return null;
}

type ChangeRow = { label: string; from: unknown; to: unknown; kind?: 'money' | 'date' };
const CHANGE_LABELS: Record<string, [string, ChangeRow['kind']?]> = {
  amount: ['Số tiền', 'money'], occurredAt: ['Thời gian', 'date'], note: ['Ghi chú'], payee: ['Người nhận'], status: ['Trạng thái'],
  name: ['Tên'], type: ['Loại'], currency: ['Tiền tệ'], openingBalance: ['Số dư đầu kỳ', 'money'], startDate: ['Bắt đầu', 'date'],
  endDate: ['Kết thúc', 'date'], rollover: ['Chuyển phần dư'], targetAmount: ['Số tiền mục tiêu', 'money'], targetDate: ['Ngày mục tiêu', 'date']
};

/** Mô tả thay đổi dạng "Nhãn: cũ → mới" để thẻ xem trước đọc được, thay vì in nguyên object `changes` ra giao diện. */
function describeChanges(before: Record<string, unknown>, changes: Record<string, unknown>): ChangeRow[] {
  const plain = (value: unknown) => value instanceof Date ? value.toISOString() : value !== null && typeof value === 'object' ? Number(value) : value ?? null;
  return Object.entries(changes).filter(([key]) => CHANGE_LABELS[key]).map(([key, to]) => {
    const [label, kind] = CHANGE_LABELS[key]!;
    return { label, from: plain(before[key]), to: plain(to), ...(kind ? { kind } : {}) };
  });
}

async function categoryNameOf(userId: string, id: string | null | undefined) {
  if (!id) return null;
  return (await prisma.category.findFirst({ where: { id, userId }, select: { name: true } }))?.name ?? null;
}

async function owned<T extends { id: string }>(label: string, promise: Promise<T | null>) {
  const value = await promise;
  if (!value) throw notFound(label);
  return value;
}

function jsonSnapshot(value: unknown) { return JSON.parse(JSON.stringify(value)) as Record<string, unknown>; }
function date(value?: string) { return value ? new Date(value) : new Date(); }

type Prepared = { id: string; type: AgentToolName; payload: Record<string, unknown>; preview: Record<string, unknown>; risk?: string };

/** Tạo bản xem trước cho các tool ghi. Mọi action của cùng một lượt chat mang chung `batchId` để người dùng xác nhận,
 * hủy hoặc hoàn tác cả nhóm một lần. `pending` là danh sách ví/danh mục đang chờ trong lượt này: hàm đọc nó để tool sau
 * tham chiếu được bản ghi mà tool trước vừa đề xuất, và THÊM vào nó các ví/danh mục mới mà chính nó đề xuất. */
export async function prepareAgentActions(userId: string, conversationId: string, proposals: AgentProposal[], options: { batchId?: string | null; pending?: PendingEntity[] } = {}) {
  const pending = options.pending ?? [];
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });
  const prepared: Prepared[] = [];
  const push = (item: Omit<Prepared, 'id'>, id: string = randomUUID()) => { prepared.push({ id, ...item }); return id; };
  for (const proposal of proposals.filter((item) => !READ_AGENT_TOOLS.has(item.tool) && !IMMEDIATE_AGENT_TOOLS.has(item.tool))) {
    const a = proposal.arguments;
    if (proposal.tool === 'CREATE_TRANSACTION') {
      const input = z.object({ type: z.enum(['INCOME', 'EXPENSE']), amount: money, walletId: uuid.optional(), walletName: z.string().max(100).optional(), categoryId: uuid.optional(), categoryName: z.string().max(100).optional(), occurredAt: isoDate.optional(), note: z.string().max(500).optional(), payee: z.string().max(160).optional() }).parse(a);
      const wallet = (await resolveWallet(userId, input.walletId, input.walletName, false, pending))!;
      const category = await resolveCategory(userId, input.type, input.categoryId, input.categoryName, true, pending);
      const payload = { type: input.type, amount: input.amount, walletId: wallet.id, walletRef: wallet.ref, categoryId: category?.id ?? null, categoryRef: category?.ref ?? null, occurredAt: date(input.occurredAt).toISOString(), note: input.note ?? null, payee: input.payee ?? null };
      push({ type: proposal.tool, payload, preview: { title: input.type === 'INCOME' ? 'Ghi khoản thu' : 'Ghi khoản chi', amount: input.amount, currency: wallet.currency, wallet: wallet.name, category: category?.name ?? 'Chưa phân loại', occurredAt: payload.occurredAt, note: input.note ?? null } });
    } else if (proposal.tool === 'UPDATE_TRANSACTION') {
      const input = z.object({ transactionId: uuid, amount: money.optional(), categoryId: uuid.nullable().optional(), categoryName: z.string().max(100).optional(), occurredAt: isoDate.optional(), note: z.string().max(500).nullable().optional(), payee: z.string().max(160).nullable().optional(), status: z.enum(['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED', 'CANCELLED']).optional() }).parse(a);
      const before = await owned('Giao dịch', prisma.transaction.findFirst({ where: { id: input.transactionId, userId, deletedAt: null } }));
      const changesCategory = input.categoryId !== undefined || Boolean(input.categoryName);
      const category = input.categoryId === null ? null : changesCategory ? await resolveCategory(userId, before.type, input.categoryId ?? undefined, input.categoryName, false, pending) : null;
      const changes = { ...(input.amount ? { amount: input.amount } : {}), ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt).toISOString() } : {}), ...(input.note !== undefined ? { note: input.note } : {}), ...(input.payee !== undefined ? { payee: input.payee } : {}), ...(input.status ? { status: input.status } : {}), ...(changesCategory ? { categoryId: category?.id ?? null } : {}) };
      const rows = describeChanges(before as unknown as Record<string, unknown>, changes);
      if (changesCategory) rows.unshift({ label: 'Danh mục', from: await categoryNameOf(userId, before.categoryId) ?? 'Chưa phân loại', to: category?.name ?? 'Chưa phân loại' });
      push({ type: proposal.tool, payload: { transactionId: before.id, changes, categoryRef: category?.ref ?? null, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật giao dịch', amount: Number(before.amount), note: before.note, changes: rows } });
    } else if (proposal.tool === 'DELETE_TRANSACTION') {
      const { transactionId } = z.object({ transactionId: uuid }).parse(a);
      const before = await owned('Giao dịch', prisma.transaction.findFirst({ where: { id: transactionId, userId, deletedAt: null }, include: { wallet: true, category: true } }));
      push({ type: proposal.tool, risk: 'HIGH', payload: { transactionId }, preview: { title: 'Xóa giao dịch', amount: Number(before.amount), wallet: before.wallet.name, category: before.category?.name ?? 'Chưa phân loại', occurredAt: before.occurredAt, note: before.note } });
    } else if (proposal.tool === 'CREATE_TRANSFER') {
      const input = z.object({ amount: money, sourceWalletId: uuid.optional(), sourceWalletName: z.string().max(100).optional(), destinationWalletId: uuid.optional(), destinationWalletName: z.string().max(100).optional(), occurredAt: isoDate.optional(), note: z.string().max(500).optional() }).parse(a);
      const source = (await resolveWallet(userId, input.sourceWalletId, input.sourceWalletName, false, pending))!; const destination = (await resolveWallet(userId, input.destinationWalletId, input.destinationWalletName, false, pending))!;
      if ((source.id ?? source.ref) === (destination.id ?? destination.ref)) throw new AppError(422, 'INVALID_TRANSFER', 'Ví nguồn và ví đích phải khác nhau.');
      if (source.currency !== destination.currency) throw new AppError(422, 'CURRENCY_MISMATCH', 'Hai ví phải cùng loại tiền tệ.');
      push({ type: proposal.tool, payload: { amount: input.amount, sourceWalletId: source.id, sourceWalletRef: source.ref, destinationWalletId: destination.id, destinationWalletRef: destination.ref, occurredAt: date(input.occurredAt).toISOString(), note: input.note ?? null }, preview: { title: 'Chuyển tiền', amount: input.amount, currency: source.currency, from: source.name, to: destination.name } });
    } else if (proposal.tool === 'BULK_CATEGORIZE') {
      const input = z.object({ transactionIds: z.array(uuid).min(1).max(500), categoryId: uuid.optional(), categoryName: z.string().max(100).optional() }).parse(a);
      const rows = await prisma.transaction.findMany({ where: { id: { in: input.transactionIds }, userId, deletedAt: null } });
      if (rows.length !== input.transactionIds.length) throw new AppError(404, 'TRANSACTIONS_NOT_FOUND', 'Một số giao dịch không tồn tại.');
      const types = new Set(rows.map((row) => row.type)); if (types.size !== 1 || types.has('TRANSFER')) throw new AppError(422, 'MIXED_TRANSACTION_TYPES', 'Chỉ có thể phân loại hàng loạt các giao dịch cùng loại thu hoặc chi.');
      const category = (await resolveCategory(userId, rows[0]!.type, input.categoryId, input.categoryName, false, pending))!;
      push({ type: proposal.tool, payload: { ids: input.transactionIds, categoryId: category.id, categoryRef: category.ref, before: rows.map((row) => ({ id: row.id, categoryId: row.categoryId })) }, preview: { title: 'Phân loại hàng loạt', count: rows.length, category: category.name } });
    } else if (proposal.tool === 'CREATE_WALLET') {
      const input = z.object({ name: z.string().trim().min(1).max(100), type: z.nativeEnum(WalletType).default('CASH'), currency: z.string().length(3).transform((v) => v.toUpperCase()).optional(), openingBalance: z.coerce.number().min(-999_999_999_999).max(999_999_999_999).default(0) }).parse(a);
      if (await prisma.wallet.findFirst({ where: { userId, name: { equals: input.name, mode: 'insensitive' } } }) || pending.some((item) => item.kind === 'wallet' && item.name.toLowerCase() === input.name.toLowerCase())) throw new AppError(409, 'WALLET_EXISTS', `Ví “${input.name}” đã tồn tại.`);
      const payload = { ...input, currency: input.currency ?? user.currency };
      const id = push({ type: proposal.tool, payload, preview: { title: 'Tạo ví', name: payload.name, walletType: payload.type, currency: payload.currency, openingBalance: payload.openingBalance } });
      pending.push({ ref: id, kind: 'wallet', name: payload.name, currency: payload.currency });
    } else if (proposal.tool === 'UPDATE_WALLET') {
      const input = z.object({ walletId: uuid, name: z.string().min(1).max(100).optional(), type: z.nativeEnum(WalletType).optional(), currency: z.string().length(3).optional(), openingBalance: z.coerce.number().optional() }).parse(a);
      const before = await owned('Ví', prisma.wallet.findFirst({ where: { id: input.walletId, userId, archivedAt: null } }));
      const { walletId, ...changes } = input; push({ type: proposal.tool, payload: { walletId, changes, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật ví', wallet: before.name, changes: describeChanges(before as unknown as Record<string, unknown>, changes) } });
    } else if (proposal.tool === 'ARCHIVE_WALLET') {
      const input = z.object({ walletId: uuid }).parse(a); const row = await owned('Ví', prisma.wallet.findFirst({ where: { id: input.walletId, userId, archivedAt: null } }));
      push({ type: proposal.tool, risk: 'HIGH', payload: input, preview: { title: 'Lưu trữ ví', wallet: row.name } });
    } else if (proposal.tool === 'CREATE_CATEGORY') {
      const input = z.object({ name: z.string().trim().min(1).max(100), type: z.enum(['INCOME', 'EXPENSE']), parentId: uuid.optional(), parentName: z.string().max(100).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#4F7668') }).parse(a);
      const parent = input.parentId || input.parentName ? (await resolveCategory(userId, input.type, input.parentId, input.parentName, false, pending))! : null;
      const duplicate = await prisma.category.findFirst({ where: { userId, archivedAt: null, type: input.type, parentId: parent?.id ?? null, name: { equals: input.name, mode: 'insensitive' } } });
      if (duplicate || pending.some((item) => item.kind === 'category' && item.type === input.type && item.name.toLowerCase() === input.name.toLowerCase())) throw new AppError(409, 'CATEGORY_EXISTS', `Danh mục “${input.name}” đã tồn tại.`);
      const id = push({ type: proposal.tool, payload: { name: input.name, type: input.type, parentId: parent?.id ?? null, parentRef: parent?.ref ?? null, color: input.color }, preview: { title: parent ? 'Tạo danh mục con' : 'Tạo danh mục', name: input.name, type: input.type, parent: parent?.name ?? null } });
      pending.push({ ref: id, kind: 'category', name: input.name, type: input.type });
    } else if (proposal.tool === 'CREATE_STARTER_CATEGORIES') {
      z.object({}).parse(a);
      const existing = await prisma.category.findMany({ where: { userId, archivedAt: null }, select: { name: true, type: true } });
      const keys = new Set(existing.map((item) => `${item.type}:${item.name.toLocaleLowerCase('vi-VN')}`));
      const categories = STARTER_CATEGORIES.filter((item) => !keys.has(`${item.type}:${item.name.toLocaleLowerCase('vi-VN')}`));
      if (!categories.length) throw new AppError(409, 'STARTER_CATEGORIES_EXIST', 'Bộ danh mục gợi ý đã có sẵn trong tài khoản.');
      const id = push({ type: proposal.tool, payload: { categories }, preview: { title: 'Tạo bộ danh mục khởi đầu', count: categories.length, categories: categories.map((item) => item.name).join(', ') } });
      for (const item of categories) pending.push({ ref: `${id}:${item.name}`, kind: 'category', name: item.name, type: item.type });
    } else if (proposal.tool === 'UPDATE_CATEGORY') {
      const input = z.object({ categoryId: uuid, name: z.string().min(1).max(100).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), parentId: uuid.nullable().optional(), parentName: z.string().max(100).optional() }).parse(a);
      const before = await owned('Danh mục', prisma.category.findFirst({ where: { id: input.categoryId, userId, archivedAt: null } }));
      const changesParent = input.parentId !== undefined || Boolean(input.parentName);
      const parent = input.parentId === null ? null : changesParent ? (await resolveCategory(userId, before.type, input.parentId ?? undefined, input.parentName, false, pending))! : null;
      if (parent && (parent.id === before.id)) throw new AppError(422, 'INVALID_PARENT', 'Danh mục không thể là cha của chính nó.');
      const changes = { ...(input.name ? { name: input.name } : {}), ...(input.color ? { color: input.color } : {}), ...(changesParent ? { parentId: parent?.id ?? null } : {}) };
      const rows = describeChanges(before as unknown as Record<string, unknown>, changes);
      if (changesParent) rows.push({ label: 'Danh mục cha', from: await categoryNameOf(userId, before.parentId) ?? 'Không có', to: parent?.name ?? 'Không có' });
      push({ type: proposal.tool, payload: { categoryId: before.id, changes, parentRef: parent?.ref ?? null, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật danh mục', category: before.name, changes: rows } });
    } else if (proposal.tool === 'ARCHIVE_CATEGORY') {
      const input = z.object({ categoryId: uuid }).parse(a); const row = await owned('Danh mục', prisma.category.findFirst({ where: { id: input.categoryId, userId, archivedAt: null } }));
      push({ type: proposal.tool, risk: 'HIGH', payload: input, preview: { title: 'Lưu trữ danh mục', category: row.name } });
    } else if (proposal.tool === 'CREATE_BUDGET') {
      const input = z.object({ name: z.string().min(1).max(100), amount: money, categoryId: uuid.optional(), categoryName: z.string().max(100).optional(), startDate: isoDate, endDate: isoDate, rollover: z.boolean().default(false) }).parse(a);
      if (new Date(input.endDate) < new Date(input.startDate)) throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày kết thúc phải sau ngày bắt đầu.');
      const category = await resolveCategory(userId, 'EXPENSE', input.categoryId, input.categoryName, true, pending);
      const payload = { name: input.name, amount: input.amount, categoryId: category?.id ?? null, categoryRef: category?.ref ?? null, startDate: input.startDate, endDate: input.endDate, rollover: input.rollover };
      push({ type: proposal.tool, payload, preview: { title: 'Tạo ngân sách', name: input.name, amount: input.amount, category: category?.name ?? 'Tất cả', startDate: input.startDate, endDate: input.endDate, rollover: input.rollover, currency: user.currency } });
    } else if (proposal.tool === 'UPDATE_BUDGET') {
      const input = z.object({ budgetId: uuid, name: z.string().min(1).max(100).optional(), amount: money.optional(), startDate: isoDate.optional(), endDate: isoDate.optional(), rollover: z.boolean().optional() }).parse(a);
      const before = await owned('Ngân sách', prisma.budget.findFirst({ where: { id: input.budgetId, userId, deletedAt: null } })); const { budgetId, ...changes } = input;
      push({ type: proposal.tool, payload: { budgetId, changes, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật ngân sách', budget: before.name, changes: describeChanges(before as unknown as Record<string, unknown>, changes) } });
    } else if (proposal.tool === 'DELETE_BUDGET') {
      const input = z.object({ budgetId: uuid }).parse(a); const row = await owned('Ngân sách', prisma.budget.findFirst({ where: { id: input.budgetId, userId, deletedAt: null } }));
      push({ type: proposal.tool, risk: 'HIGH', payload: input, preview: { title: 'Xóa ngân sách', budget: row.name, amount: Number(row.amount) } });
    } else if (proposal.tool === 'CREATE_GOAL') {
      const input = z.object({ name: z.string().min(1).max(120), targetAmount: money, currentAmount: z.coerce.number().min(0).default(0), targetDate: isoDate.optional() }).parse(a);
      if (input.currentAmount > input.targetAmount) throw new AppError(422, 'INVALID_GOAL_AMOUNT', 'Số tiền hiện có không thể lớn hơn mục tiêu.');
      push({ type: proposal.tool, payload: input, preview: { title: 'Tạo mục tiêu', ...input, currency: user.currency } });
    } else if (proposal.tool === 'UPDATE_GOAL') {
      const input = z.object({ goalId: uuid, name: z.string().min(1).max(120).optional(), targetAmount: money.optional(), targetDate: isoDate.nullable().optional(), status: z.nativeEnum(GoalStatus).optional() }).parse(a);
      const before = await owned('Mục tiêu', prisma.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } })); const { goalId, ...changes } = input;
      push({ type: proposal.tool, payload: { goalId, changes, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật mục tiêu', goal: before.name, changes: describeChanges(before as unknown as Record<string, unknown>, changes) } });
    } else if (proposal.tool === 'CONTRIBUTE_GOAL') {
      const input = z.object({ goalId: uuid, amount: money, note: z.string().max(255).optional() }).parse(a); const goal = await owned('Mục tiêu', prisma.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
      push({ type: proposal.tool, payload: input, preview: { title: 'Đóng góp mục tiêu', goal: goal.name, amount: input.amount, currentAmount: Number(goal.currentAmount), currency: user.currency } });
    } else if (proposal.tool === 'PAUSE_GOAL') {
      const input = z.object({ goalId: uuid, paused: z.boolean().default(true) }).parse(a); const goal = await owned('Mục tiêu', prisma.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
      push({ type: proposal.tool, payload: input, preview: { title: input.paused ? 'Tạm dừng mục tiêu' : 'Tiếp tục mục tiêu', goal: goal.name } });
    } else if (proposal.tool === 'DELETE_GOAL') {
      const input = z.object({ goalId: uuid }).parse(a); const goal = await owned('Mục tiêu', prisma.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
      push({ type: proposal.tool, risk: 'HIGH', payload: input, preview: { title: 'Xóa mục tiêu', goal: goal.name } });
    } else if (proposal.tool === 'CREATE_BILL') {
      const input = z.object({ name: z.string().min(1).max(120), amount: money, dueAt: isoDate, walletId: uuid.optional(), walletName: z.string().max(100).optional(), recurrence: recurrence.optional() }).parse(a);
      const wallet = await resolveWallet(userId, input.walletId, input.walletName, true, pending);
      const payload = { name: input.name, amount: input.amount, dueAt: input.dueAt, recurrence: input.recurrence ?? null, walletId: wallet?.id ?? null, walletRef: wallet?.ref ?? null };
      push({ type: proposal.tool, payload, preview: { title: 'Tạo hóa đơn', name: input.name, amount: input.amount, dueAt: input.dueAt, wallet: wallet?.name ?? 'Chưa chọn', recurrence: input.recurrence ?? null } });
    } else if (proposal.tool === 'PAY_BILL') {
      const input = z.object({ billId: uuid, walletId: uuid.optional(), walletName: z.string().max(100).optional(), occurredAt: isoDate.optional() }).parse(a); const bill = await owned('Hóa đơn', prisma.bill.findFirst({ where: { id: input.billId, userId } }));
      const wallet = (await resolveWallet(userId, input.walletId ?? bill.walletId ?? undefined, input.walletName, false, pending))!;
      push({ type: proposal.tool, payload: { billId: input.billId, occurredAt: input.occurredAt ?? null, walletId: wallet.id, walletRef: wallet.ref }, preview: { title: 'Thanh toán hóa đơn', bill: bill.name, amount: Number(bill.amount), wallet: wallet.name } });
    } else if (proposal.tool === 'CREATE_RECURRING') {
      const input = z.object({ name: z.string().min(1).max(120), type: z.enum(['INCOME', 'EXPENSE']), amount: money, walletId: uuid.optional(), walletName: z.string().max(100).optional(), categoryId: uuid.optional(), categoryName: z.string().max(100).optional(), frequency: recurrence, nextRunAt: isoDate, autoPost: z.boolean().default(false) }).parse(a);
      const wallet = (await resolveWallet(userId, input.walletId, input.walletName, false, pending))!; const category = await resolveCategory(userId, input.type, input.categoryId, input.categoryName, true, pending);
      const payload = { name: input.name, type: input.type, amount: input.amount, frequency: input.frequency, nextRunAt: input.nextRunAt, autoPost: input.autoPost, walletId: wallet.id, walletRef: wallet.ref, categoryId: category?.id ?? null, categoryRef: category?.ref ?? null };
      push({ type: proposal.tool, payload, preview: { title: 'Tạo giao dịch định kỳ', name: input.name, amount: input.amount, wallet: wallet.name, category: category?.name ?? null, frequency: input.frequency, nextRunAt: input.nextRunAt, autoPost: input.autoPost } });
    } else if (proposal.tool === 'CREATE_AUTOMATION_RULE') {
      const input = z.object({ name: z.string().min(1).max(120), field: z.enum(['note', 'payee', 'reference', 'amount']), operator: z.enum(['contains', 'equals', 'startsWith', 'gte', 'lte']), value: z.string().min(1).max(255), categoryId: uuid.optional(), categoryName: z.string().max(100).optional(), tagName: z.string().max(50).optional(), priority: z.coerce.number().int().min(0).max(1000).default(0) }).parse(a);
      const category = await resolveCategory(userId, undefined, input.categoryId, input.categoryName, true, pending);
      const payload = { name: input.name, field: input.field, operator: input.operator, value: input.value, tagName: input.tagName ?? null, priority: input.priority, categoryId: category?.id ?? null, categoryRef: category?.ref ?? null };
      push({ type: proposal.tool, payload, preview: { title: 'Tạo quy tắc tự động', name: input.name, field: input.field, operator: input.operator, value: input.value, category: category?.name ?? null, tagName: input.tagName ?? null, priority: input.priority } });
    } else if (proposal.tool === 'RECONCILE_WALLET') {
      const input = z.object({ walletId: uuid.optional(), walletName: z.string().max(100).optional(), actualBalance: z.coerce.number(), occurredAt: isoDate.optional(), note: z.string().max(500).optional() }).parse(a);
      const resolved = (await resolveWallet(userId, input.walletId, input.walletName))!;
      const wallet = await owned('Ví', prisma.wallet.findFirst({ where: { id: resolved.id!, userId } }));
      const rows = await prisma.transaction.findMany({ where: { userId, deletedAt: null, status: { not: 'CANCELLED' }, OR: [{ walletId: wallet.id }, { destinationWalletId: wallet.id }] } });
      let current = Number(wallet.openingBalance); for (const row of rows) current += row.type === 'INCOME' || (row.type === 'TRANSFER' && row.destinationWalletId === wallet.id) ? Number(row.amount) : -Number(row.amount);
      const difference = input.actualBalance - current; if (Math.abs(difference) < 0.0001) throw new AppError(422, 'ALREADY_RECONCILED', 'Số dư ví đã khớp, không cần điều chỉnh.');
      push({ type: proposal.tool, payload: { walletId: wallet.id, type: difference > 0 ? 'INCOME' : 'EXPENSE', amount: Math.abs(difference), occurredAt: date(input.occurredAt).toISOString(), note: input.note ?? 'Điều chỉnh đối soát' }, preview: { title: 'Đối soát ví', wallet: wallet.name, currentBalance: current, actualBalance: input.actualBalance, adjustment: difference, currency: wallet.currency } });
    }
  }
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  // Ghi createdAt tăng dần tường minh: các lệnh trong cùng transaction có CURRENT_TIMESTAMP giống hệt nhau, mà thứ tự
  // tạo chính là thứ tự thực thi của nhóm (danh mục cha phải được tạo trước danh mục con và khoản chi tham chiếu nó).
  const startedAt = Date.now();
  return prisma.$transaction(prepared.map((item, index) => prisma.agentAction.create({ data: { id: item.id, userId, conversationId, batchId: options.batchId ?? null, type: item.type, risk: item.risk ?? 'NORMAL', payload: item.payload as Prisma.InputJsonValue, preview: item.preview as Prisma.InputJsonValue, expiresAt, createdAt: new Date(startedAt + index) } })));
}

export async function executeReadAgentTools(userId: string, proposals: AgentProposal[]) {
  const results: Array<{ tool: AgentToolName; summary: string; data?: unknown; attachment?: { label: string; url: string } }> = [];
  for (const proposal of proposals.filter((item) => READ_AGENT_TOOLS.has(item.tool))) {
    const a = proposal.arguments;
    if (proposal.tool === 'SEARCH_TRANSACTIONS') {
      const input = z.object({ query: z.string().max(200).optional(), type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(), walletName: z.string().max(100).optional(), categoryName: z.string().max(100).optional(), from: isoDate.optional(), to: isoDate.optional(), minAmount: z.coerce.number().optional(), maxAmount: z.coerce.number().optional(), limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(a);
      const wallet = input.walletName ? await resolveWallet(userId, undefined, input.walletName, true) : null; const category = input.categoryName ? await resolveCategory(userId, input.type as TransactionType | undefined, undefined, input.categoryName) : null;
      const rows = await prisma.transaction.findMany({ where: { userId, deletedAt: null, ...(input.type ? { type: input.type } : {}), ...(wallet?.id ? { OR: [{ walletId: wallet.id }, { destinationWalletId: wallet.id }] } : {}), ...(category?.id ? { categoryId: category.id } : {}), ...(input.from || input.to ? { occurredAt: { ...(input.from ? { gte: new Date(input.from) } : {}), ...(input.to ? { lte: new Date(input.to) } : {}) } } : {}), ...(input.minAmount !== undefined || input.maxAmount !== undefined ? { amount: { ...(input.minAmount !== undefined ? { gte: input.minAmount } : {}), ...(input.maxAmount !== undefined ? { lte: input.maxAmount } : {}) } } : {}), ...(input.query ? { OR: [{ note: { contains: input.query, mode: 'insensitive' } }, { payee: { contains: input.query, mode: 'insensitive' } }] } : {}) }, include: { wallet: { select: { name: true, currency: true } }, category: { select: { name: true } } }, orderBy: { occurredAt: 'desc' }, take: input.limit });
      const data = rows.map((row) => ({ id: row.id, date: row.occurredAt.toISOString(), type: row.type, amount: Number(row.amount), currency: row.wallet.currency, wallet: row.wallet.name, category: row.category?.name ?? null, note: row.note }));
      const lines = data.slice(0, 8).map((item, index) => `${index + 1}. ${new Date(item.date).toLocaleDateString('vi-VN')} · ${item.type === 'INCOME' ? 'Thu' : item.type === 'EXPENSE' ? 'Chi' : 'Chuyển'} ${item.amount.toLocaleString('vi-VN')} ${item.currency} · ${item.category ?? item.note ?? 'Chưa phân loại'} · ví ${item.wallet}`).join('\n');
      results.push({ tool: proposal.tool, summary: data.length ? `Tìm thấy ${data.length} giao dịch phù hợp:\n${lines}` : 'Không tìm thấy giao dịch phù hợp.', data });
    } else if (proposal.tool === 'FINANCIAL_SUMMARY') {
      const input = z.object({ from: isoDate.optional(), to: isoDate.optional() }).parse(a); const from = input.from ? new Date(input.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1); const to = input.to ? new Date(input.to) : new Date();
      const rows = await prisma.transaction.findMany({ where: { userId, deletedAt: null, occurredAt: { gte: from, lte: to }, status: { not: 'CANCELLED' }, type: { in: ['INCOME', 'EXPENSE'] } } });
      const income = rows.filter((row) => row.type === 'INCOME').reduce((sum, row) => sum + Number(row.amount), 0); const expense = rows.filter((row) => row.type === 'EXPENSE').reduce((sum, row) => sum + Number(row.amount), 0);
      results.push({ tool: proposal.tool, summary: `Từ ${from.toLocaleDateString('vi-VN')} đến ${to.toLocaleDateString('vi-VN')}: thu ${income.toLocaleString('vi-VN')}, chi ${expense.toLocaleString('vi-VN')}, ròng ${(income - expense).toLocaleString('vi-VN')}.`, data: { from, to, income, expense, net: income - expense, transactionCount: rows.length } });
    } else if (proposal.tool === 'EXPORT_TRANSACTIONS_CSV') {
      const input = z.object({ from: isoDate.optional(), to: isoDate.optional(), type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(), walletName: z.string().optional(), categoryName: z.string().optional() }).parse(a); const params = new URLSearchParams();
      if (input.from) params.set('from', input.from); if (input.to) params.set('to', input.to); if (input.type) params.set('type', input.type);
      const wallet = input.walletName ? await resolveWallet(userId, undefined, input.walletName, true) : null; const category = input.categoryName ? await resolveCategory(userId, input.type as TransactionType | undefined, undefined, input.categoryName) : null;
      if (wallet?.id) params.set('walletId', wallet.id); if (category?.id) params.set('categoryId', category.id); const url = `/api/v1/transactions/export.csv${params.size ? `?${params}` : ''}`;
      results.push({ tool: proposal.tool, summary: 'Tôi đã chuẩn bị đường dẫn tải báo cáo CSV.', attachment: { label: 'Tải CSV giao dịch', url } });
    } else if (proposal.tool === 'LIST_UPCOMING_BILLS') {
      const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(a); const until = new Date(Date.now() + days * 86_400_000);
      const rows = await prisma.bill.findMany({ where: { userId, status: { in: ['UPCOMING', 'OVERDUE'] }, dueAt: { lte: until } }, orderBy: { dueAt: 'asc' }, take: 50 }); const data = rows.map((row) => ({ id: row.id, name: row.name, amount: Number(row.amount), dueAt: row.dueAt, status: row.status }));
      const lines = data.slice(0, 10).map((item, index) => `${index + 1}. ${item.name}: ${item.amount.toLocaleString('vi-VN')} · hạn ${new Date(item.dueAt).toLocaleDateString('vi-VN')} · ${item.status}`).join('\n');
      results.push({ tool: proposal.tool, summary: data.length ? `Có ${data.length} hóa đơn đến hạn trong ${days} ngày tới:\n${lines}` : `Không có hóa đơn đến hạn trong ${days} ngày tới.`, data });
    } else if (proposal.tool === 'GET_ONBOARDING_STATUS') {
      z.object({}).parse(a);
      const status = await getOnboardingStatus(userId); const next = status.nextStep;
      results.push({ tool: proposal.tool, summary: status.completed ? 'Người dùng đã hoàn thành các bước thiết lập cơ bản.' : `Người dùng đã hoàn thành ${status.completedCount}/${status.totalSteps} bước. Bước phù hợp tiếp theo: ${next?.title}.`, data: { ...status, uiActions: next ? [{ type: 'OPEN_VIEW', view: next.view, label: next.actionLabel }] : [{ type: 'OPEN_VIEW', view: 'dashboard', label: 'Xem tổng quan' }] } });
    } else if (proposal.tool === 'LIST_WALLETS') {
      z.object({}).parse(a);
      const rows = await prisma.wallet.findMany({ where: { userId, archivedAt: null }, select: { id: true, name: true, type: true, currency: true, openingBalance: true }, orderBy: { sortOrder: 'asc' } });
      const items = rows.map((item) => ({ ...item, openingBalance: Number(item.openingBalance) }));
      results.push({ tool: proposal.tool, summary: items.length ? `Có ${items.length} ví đang hoạt động: ${items.map((item) => item.name).join(', ')}.` : 'Chưa có ví nào. Hãy hướng dẫn người dùng tạo ví đầu tiên.', data: { items, uiActions: [{ type: 'OPEN_VIEW', view: 'wallets', label: items.length ? 'Xem các ví' : 'Tạo ví đầu tiên' }] } });
    } else if (proposal.tool === 'LIST_CATEGORIES') {
      const input = z.object({ type: z.enum(['INCOME', 'EXPENSE']).optional() }).parse(a);
      const rows = await prisma.category.findMany({ where: { userId, archivedAt: null, ...(input.type ? { type: input.type } : {}) }, select: { id: true, name: true, type: true, parentId: true }, orderBy: { sortOrder: 'asc' } });
      results.push({ tool: proposal.tool, summary: rows.length ? `Có ${rows.length} danh mục phù hợp: ${rows.slice(0, 15).map((item) => item.name).join(', ')}.` : 'Chưa có danh mục phù hợp.', data: { items: rows, uiActions: [{ type: 'OPEN_VIEW', view: 'categories', label: rows.length ? 'Xem danh mục' : 'Thiết lập danh mục' }] } });
    } else if (proposal.tool === 'GET_APP_GUIDE') {
      const { topic } = z.object({ topic: z.enum(['dashboard', 'transactions', 'wallets', 'categories', 'budgets', 'goals', 'reports', 'planning', 'insights', 'profile']).optional() }).parse(a);
      const entries = topic ? [APP_GUIDE[topic]] : Object.values(APP_GUIDE);
      results.push({ tool: proposal.tool, summary: entries.map((item) => `${item.title}: ${item.description}`).join('\n'), data: { items: entries, uiActions: topic ? [{ type: 'OPEN_VIEW', view: APP_GUIDE[topic].view, label: `Mở ${APP_GUIDE[topic].title}` }] : [] } });
    }
  }
  return results;
}

export async function executeImmediateAgentTool(userId: string, conversationId: string, proposal: AgentProposal) {
  const a = proposal.arguments;
  if (proposal.tool === 'SAVE_MEMORY') {
    const input = z.object({ content: z.string().trim().min(1).max(500), kind: z.enum(['PREFERENCE', 'CONTEXT', 'OTHER']).default('PREFERENCE') }).parse(a);
    const existing = await prisma.assistantMemory.findFirst({
      where: { userId, content: { equals: input.content, mode: 'insensitive' } }
    });
    const memory = existing
      ? await prisma.assistantMemory.update({ where: { id: existing.id }, data: { kind: input.kind, confirmed: true, expiresAt: null } })
      : await prisma.assistantMemory.create({ data: { userId, kind: input.kind, content: input.content, confirmed: true } });
    return { tool: proposal.tool, summary: `Đã ghi nhớ: “${memory.content}”.`, data: { id: memory.id, kind: memory.kind, content: memory.content } };
  }
  if (proposal.tool === 'LIST_MEMORIES') {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(a);
    const memories = await prisma.assistantMemory.findMany({ where: { userId, confirmed: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { updatedAt: 'desc' }, take: limit });
    const data = memories.map((item) => ({ id: item.id, kind: item.kind, content: item.content, updatedAt: item.updatedAt }));
    return { tool: proposal.tool, summary: data.length ? `Có ${data.length} ghi nhớ dài hạn.` : 'Chưa có ghi nhớ dài hạn nào.', data };
  }
  if (proposal.tool === 'DELETE_MEMORY') {
    const { memoryId } = z.object({ memoryId: uuid }).parse(a);
    const deleted = await prisma.assistantMemory.deleteMany({ where: { id: memoryId, userId } });
    if (!deleted.count) throw notFound('Ghi nhớ');
    return { tool: proposal.tool, summary: 'Đã xóa ghi nhớ theo yêu cầu.', data: { memoryId } };
  }
  if (proposal.tool === 'GET_CONVERSATION_HISTORY') {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(30).default(12) }).parse(a);
    const conversation = await prisma.assistantConversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } });
    if (!conversation) throw notFound('Cuộc trò chuyện');
    const rows = await prisma.assistantMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
    const data = rows.reverse().map((item) => ({ role: item.role.toLowerCase(), content: item.content, createdAt: item.createdAt }));
    return { tool: proposal.tool, summary: `Đã đọc ${data.length} tin nhắn gần nhất trong cuộc trò chuyện này.`, data };
  }
  if (proposal.tool === 'PREVIEW_DATA_RESET') {
    const { scope } = z.object({ scope: z.enum(['TRANSACTIONS', 'ALL_FINANCIAL_DATA']) }).parse(a);
    const transactionCount = await prisma.transaction.count({ where: { userId, deletedAt: null } });
    if (scope === 'TRANSACTIONS') return { tool: proposal.tool, summary: `Nếu làm lại sổ giao dịch, ${transactionCount} giao dịch hiện tại sẽ bị ảnh hưởng. Chưa có dữ liệu nào bị xóa.`, data: { scope, transactionCount, destructive: true, executed: false } };
    const [walletCount, categoryCount, budgetCount, goalCount, billCount, recurringCount, automationCount] = await Promise.all([
      prisma.wallet.count({ where: { userId, archivedAt: null } }), prisma.category.count({ where: { userId, archivedAt: null } }),
      prisma.budget.count({ where: { userId, deletedAt: null } }), prisma.goal.count({ where: { userId, deletedAt: null } }),
      prisma.bill.count({ where: { userId } }), prisma.recurringRule.count({ where: { userId } }), prisma.automationRule.count({ where: { userId } })
    ]);
    const data = { scope, transactionCount, walletCount, categoryCount, budgetCount, goalCount, billCount, recurringCount, automationCount, destructive: true, executed: false };
    return { tool: proposal.tool, summary: `Bản xem trước làm lại toàn bộ dữ liệu tài chính: ${transactionCount} giao dịch, ${walletCount} ví, ${categoryCount} danh mục, ${budgetCount} ngân sách, ${goalCount} mục tiêu, ${billCount} hóa đơn, ${recurringCount} lịch định kỳ và ${automationCount} quy tắc sẽ bị ảnh hưởng. Chưa có dữ liệu nào bị xóa.`, data };
  }
  if (proposal.tool === 'EXPORT_DATA_BACKUP') {
    z.object({}).parse(a);
    return { tool: proposal.tool, summary: 'Đã chuẩn bị liên kết tải bản sao dữ liệu cá nhân.', attachment: { label: 'Tải bản sao dữ liệu JSON', url: '/api/v1/productivity/data-export', filename: 'so-moc-backup.json' } };
  }
  throw new AppError(422, 'UNSUPPORTED_AGENT_TOOL', 'Công cụ này chưa được hỗ trợ.');
}

type Refs = Map<string, string>;
type Applied = { entity: { id: string }; undo: Record<string, unknown>; created: Array<[string, string]> };

/** ID thật cho một tham chiếu: `ref` trỏ tới ví/danh mục được tạo bởi action đứng trước trong cùng nhóm. */
function refId(id: unknown, ref: unknown, refs: Refs) {
  if (typeof ref === 'string' && ref) {
    const resolved = refs.get(ref);
    if (!resolved) throw new AppError(409, 'AGENT_REF_MISSING', 'Một bản ghi mà thay đổi này phụ thuộc chưa được tạo trong nhóm.');
    return resolved;
  }
  return (id as string | null | undefined) ?? null;
}

async function applyAgentAction(tx: Prisma.TransactionClient, userId: string, action: AgentAction, refs: Refs): Promise<Applied> {
  const p = action.payload as Record<string, any>; let entity: { id: string }; let undo: Record<string, unknown>; const created: Array<[string, string]> = [];
  const deleteCreated = (entityType: string, id: string) => ({ mode: 'deleteCreated', entityType, entityId: id });
  if (action.type === 'CREATE_TRANSACTION' || action.type === 'RECONCILE_WALLET') entity = await tx.transaction.create({ data: { userId, walletId: refId(p.walletId, p.walletRef, refs)!, categoryId: refId(p.categoryId, p.categoryRef, refs), type: p.type as TransactionType, amount: p.amount, occurredAt: new Date(p.occurredAt), note: p.note ?? null, payee: p.payee ?? null, status: action.type === 'RECONCILE_WALLET' ? 'RECONCILED' : 'CLEARED', idempotencyKey: `agent:${action.id}` } }), undo = deleteCreated('transaction', entity.id);
  else if (action.type === 'CREATE_TRANSFER') entity = await tx.transaction.create({ data: { userId, walletId: refId(p.sourceWalletId, p.sourceWalletRef, refs)!, destinationWalletId: refId(p.destinationWalletId, p.destinationWalletRef, refs), type: 'TRANSFER', amount: p.amount, occurredAt: new Date(p.occurredAt), note: p.note, status: 'CLEARED', idempotencyKey: `agent:${action.id}` } }), undo = deleteCreated('transaction', entity.id);
  else if (action.type === 'UPDATE_TRANSACTION') { const changes = { ...p.changes, ...(p.categoryRef ? { categoryId: refId(null, p.categoryRef, refs) } : {}), ...(p.changes.occurredAt ? { occurredAt: new Date(p.changes.occurredAt) } : {}) }; entity = await tx.transaction.update({ where: { id: p.transactionId }, data: changes }); undo = { mode: 'restore', entityType: 'transaction', entityId: entity.id, data: p.before }; }
  else if (action.type === 'DELETE_TRANSACTION') entity = await tx.transaction.update({ where: { id: p.transactionId }, data: { deletedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'transaction', entityId: entity.id };
  else if (action.type === 'BULK_CATEGORIZE') { await tx.transaction.updateMany({ where: { id: { in: p.ids }, userId }, data: { categoryId: refId(p.categoryId, p.categoryRef, refs) } }); entity = { id: action.id }; undo = { mode: 'bulkCategories', data: p.before }; }
  else if (action.type === 'CREATE_WALLET') { entity = await tx.wallet.create({ data: { userId, name: p.name, type: p.type as WalletType, currency: p.currency, openingBalance: p.openingBalance } }); undo = deleteCreated('wallet', entity.id); created.push([action.id, entity.id]); }
  else if (action.type === 'UPDATE_WALLET') entity = await tx.wallet.update({ where: { id: p.walletId }, data: p.changes }), undo = { mode: 'restore', entityType: 'wallet', entityId: entity.id, data: p.before };
  else if (action.type === 'ARCHIVE_WALLET') entity = await tx.wallet.update({ where: { id: p.walletId }, data: { archivedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'wallet', entityId: entity.id };
  else if (action.type === 'CREATE_CATEGORY') { entity = await tx.category.create({ data: { userId, name: p.name, type: p.type as TransactionType, parentId: refId(p.parentId, p.parentRef, refs), color: p.color } }); undo = deleteCreated('category', entity.id); created.push([action.id, entity.id]); }
  else if (action.type === 'CREATE_STARTER_CATEGORIES') { const rows = []; for (const [sortOrder, item] of (p.categories as Array<Record<string, any>>).entries()) { const row = await tx.category.create({ data: { userId, name: item.name, type: item.type as TransactionType, icon: item.icon, color: item.color, sortOrder } }); rows.push(row); created.push([`${action.id}:${item.name}`, row.id]); } entity = { id: action.id }; undo = { mode: 'archiveManyCategories', ids: rows.map((item) => item.id) }; }
  else if (action.type === 'UPDATE_CATEGORY') { const changes = { ...p.changes, ...(p.parentRef ? { parentId: refId(null, p.parentRef, refs) } : {}) }; entity = await tx.category.update({ where: { id: p.categoryId }, data: changes }); undo = { mode: 'restore', entityType: 'category', entityId: entity.id, data: p.before }; }
  else if (action.type === 'ARCHIVE_CATEGORY') entity = await tx.category.update({ where: { id: p.categoryId }, data: { archivedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'category', entityId: entity.id };
  else if (action.type === 'CREATE_BUDGET') entity = await tx.budget.create({ data: { userId, name: p.name, amount: p.amount, categoryId: refId(p.categoryId, p.categoryRef, refs), startDate: new Date(p.startDate), endDate: new Date(p.endDate), rollover: p.rollover } }), undo = deleteCreated('budget', entity.id);
  else if (action.type === 'UPDATE_BUDGET') entity = await tx.budget.update({ where: { id: p.budgetId }, data: { ...p.changes, ...(p.changes.startDate ? { startDate: new Date(p.changes.startDate) } : {}), ...(p.changes.endDate ? { endDate: new Date(p.changes.endDate) } : {}) } }), undo = { mode: 'restore', entityType: 'budget', entityId: entity.id, data: p.before };
  else if (action.type === 'DELETE_BUDGET') entity = await tx.budget.update({ where: { id: p.budgetId }, data: { deletedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'budget', entityId: entity.id };
  else if (action.type === 'CREATE_GOAL') entity = await tx.goal.create({ data: { userId, name: p.name, targetAmount: p.targetAmount, currentAmount: p.currentAmount, targetDate: p.targetDate ? new Date(p.targetDate) : null } }), undo = deleteCreated('goal', entity.id);
  else if (action.type === 'UPDATE_GOAL') entity = await tx.goal.update({ where: { id: p.goalId }, data: { ...p.changes, ...(p.changes.targetDate ? { targetDate: new Date(p.changes.targetDate) } : {}) } }), undo = { mode: 'restore', entityType: 'goal', entityId: entity.id, data: p.before };
  else if (action.type === 'CONTRIBUTE_GOAL') { const goal = await tx.goal.findUniqueOrThrow({ where: { id: p.goalId } }); const contribution = await tx.goalContribution.create({ data: { goalId: p.goalId, amount: p.amount, note: p.note } }); entity = await tx.goal.update({ where: { id: p.goalId }, data: { currentAmount: { increment: p.amount }, ...(Number(goal.currentAmount) + Number(p.amount) >= Number(goal.targetAmount) ? { status: 'COMPLETED' } : {}) } }); undo = { mode: 'goalContribution', entityId: entity.id, contributionId: contribution.id, previousAmount: Number(goal.currentAmount), previousStatus: goal.status }; }
  else if (action.type === 'PAUSE_GOAL') { const goal = await tx.goal.findUniqueOrThrow({ where: { id: p.goalId } }); entity = await tx.goal.update({ where: { id: p.goalId }, data: { pausedAt: p.paused ? new Date() : null } }); undo = { mode: 'restore', entityType: 'goal', entityId: entity.id, data: jsonSnapshot(goal) }; }
  else if (action.type === 'DELETE_GOAL') entity = await tx.goal.update({ where: { id: p.goalId }, data: { deletedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'goal', entityId: entity.id };
  else if (action.type === 'CREATE_BILL') entity = await tx.bill.create({ data: { userId, name: p.name, amount: p.amount, dueAt: new Date(p.dueAt), walletId: refId(p.walletId, p.walletRef, refs), recurrence: (p.recurrence ?? undefined) as RecurrenceFrequency | undefined } }), undo = deleteCreated('bill', entity.id);
  else if (action.type === 'PAY_BILL') { const bill = await tx.bill.findUniqueOrThrow({ where: { id: p.billId } }); const transaction = await tx.transaction.create({ data: { userId, walletId: refId(p.walletId, p.walletRef, refs)!, type: 'EXPENSE', amount: bill.amount, occurredAt: date(p.occurredAt ?? undefined), note: `Thanh toán: ${bill.name}`, idempotencyKey: `agent:${action.id}` } }); entity = await tx.bill.update({ where: { id: bill.id }, data: bill.recurrence ? { dueAt: nextOccurrence(bill.dueAt, bill.recurrence), status: 'UPCOMING' } : { status: 'PAID' } }); undo = { mode: 'payBill', entityId: bill.id, transactionId: transaction.id, data: jsonSnapshot(bill) }; }
  else if (action.type === 'CREATE_RECURRING') entity = await tx.recurringRule.create({ data: { userId, name: p.name, type: p.type as TransactionType, amount: p.amount, walletId: refId(p.walletId, p.walletRef, refs)!, categoryId: refId(p.categoryId, p.categoryRef, refs), frequency: p.frequency as RecurrenceFrequency, nextRunAt: new Date(p.nextRunAt), autoPost: p.autoPost } }), undo = deleteCreated('recurring', entity.id);
  else if (action.type === 'CREATE_AUTOMATION_RULE') entity = await tx.automationRule.create({ data: { userId, name: p.name, field: p.field, operator: p.operator, value: p.value, categoryId: refId(p.categoryId, p.categoryRef, refs), tagName: p.tagName ?? undefined, priority: p.priority } }), undo = deleteCreated('automation', entity.id);
  else throw new AppError(422, 'UNSUPPORTED_AGENT_ACTION', 'Agent chưa hỗ trợ hành động này.');
  return { entity, undo, created };
}

async function applyAgentUndo(tx: Prisma.TransactionClient, userId: string, action: AgentAction) {
  const u = action.undoData as Record<string, any>; const type = u.entityType as string;
  if (u.mode === 'deleteCreated') {
    if (type === 'transaction') await tx.transaction.update({ where: { id: u.entityId }, data: { deletedAt: new Date() } });
    else if (type === 'wallet') await tx.wallet.update({ where: { id: u.entityId }, data: { archivedAt: new Date() } });
    else if (type === 'category') await tx.category.update({ where: { id: u.entityId }, data: { archivedAt: new Date() } });
    else if (type === 'budget') await tx.budget.update({ where: { id: u.entityId }, data: { deletedAt: new Date() } });
    else if (type === 'goal') await tx.goal.update({ where: { id: u.entityId }, data: { deletedAt: new Date() } });
    else if (type === 'bill') await tx.bill.delete({ where: { id: u.entityId } });
    else if (type === 'recurring') await tx.recurringRule.delete({ where: { id: u.entityId } });
    else if (type === 'automation') await tx.automationRule.delete({ where: { id: u.entityId } });
  } else if (u.mode === 'restoreDelete') {
    if (type === 'transaction') await tx.transaction.update({ where: { id: u.entityId }, data: { deletedAt: null } });
    else if (type === 'wallet') await tx.wallet.update({ where: { id: u.entityId }, data: { archivedAt: null } });
    else if (type === 'category') await tx.category.update({ where: { id: u.entityId }, data: { archivedAt: null } });
    else if (type === 'budget') await tx.budget.update({ where: { id: u.entityId }, data: { deletedAt: null } });
    else if (type === 'goal') await tx.goal.update({ where: { id: u.entityId }, data: { deletedAt: null } });
  } else if (u.mode === 'bulkCategories') for (const row of u.data) await tx.transaction.update({ where: { id: row.id }, data: { categoryId: row.categoryId } });
  else if (u.mode === 'archiveManyCategories') await tx.category.updateMany({ where: { id: { in: u.ids }, userId }, data: { archivedAt: new Date() } });
  else if (u.mode === 'goalContribution') { await tx.goalContribution.delete({ where: { id: u.contributionId } }); await tx.goal.update({ where: { id: u.entityId }, data: { currentAmount: u.previousAmount, status: u.previousStatus } }); }
  else if (u.mode === 'payBill') { await tx.transaction.update({ where: { id: u.transactionId }, data: { deletedAt: new Date() } }); await tx.bill.update({ where: { id: u.entityId }, data: { dueAt: new Date(u.data.dueAt), status: u.data.status } }); }
  else if (u.mode === 'restore') {
    const d = { ...u.data }; delete d.id; delete d.userId; delete d.createdAt; delete d.updatedAt;
    for (const key of ['occurredAt', 'startDate', 'endDate', 'targetDate', 'pausedAt', 'archivedAt', 'deletedAt']) if (d[key]) d[key] = new Date(d[key]);
    if (type === 'transaction') await tx.transaction.update({ where: { id: u.entityId }, data: d });
    else if (type === 'wallet') await tx.wallet.update({ where: { id: u.entityId }, data: d });
    else if (type === 'category') await tx.category.update({ where: { id: u.entityId }, data: d });
    else if (type === 'budget') await tx.budget.update({ where: { id: u.entityId }, data: d });
    else if (type === 'goal') await tx.goal.update({ where: { id: u.entityId }, data: d });
  }
}

/** Mọi action cùng nhóm với `actionId` (action cũ không có batchId được coi là nhóm một phần tử), theo thứ tự tạo. */
async function actionGroup(client: Prisma.TransactionClient | typeof prisma, userId: string, actionId: string) {
  const anchor = await client.agentAction.findFirst({ where: { id: actionId, userId } });
  if (!anchor) throw notFound('Hành động');
  if (!anchor.batchId) return [anchor];
  return client.agentAction.findMany({ where: { userId, batchId: anchor.batchId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

/** Xác nhận cả nhóm: thực thi mọi action đang chờ theo đúng thứ tự tạo, trong MỘT transaction. Một action lỗi thì
 * toàn bộ nhóm rollback, không để lại nửa chừng (ví dụ đã tạo danh mục nhưng chưa ghi khoản chi vào đó). */
export async function executeAgentAction(userId: string, actionId: string) {
  const group = await actionGroup(prisma, userId, actionId);
  const pending = group.filter((item) => item.status === 'PENDING');
  if (!pending.length) throw new AppError(409, 'ACTION_NOT_PENDING', 'Hành động này không còn chờ xác nhận.');
  if (pending.some((item) => item.expiresAt < new Date())) {
    await prisma.agentAction.updateMany({ where: { id: { in: pending.map((item) => item.id) }, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    throw new AppError(410, 'ACTION_EXPIRED', 'Bản xem trước đã hết hạn.');
  }
  return prisma.$transaction(async (tx) => {
    const refs: Refs = new Map();
    for (const action of pending) {
      // Chiếm action bằng cập nhật có điều kiện để hai lần bấm xác nhận đồng thời không thực thi hai lần.
      const claimed = await tx.agentAction.updateMany({ where: { id: action.id, status: 'PENDING' }, data: { status: 'EXECUTED' } });
      if (claimed.count !== 1) throw new AppError(409, 'ACTION_NOT_PENDING', 'Hành động này không còn chờ xác nhận.');
      const { entity, undo, created } = await applyAgentAction(tx, userId, action, refs);
      for (const [key, value] of created) refs.set(key, value);
      await tx.agentAction.update({ where: { id: action.id }, data: { executedAt: new Date(), result: { entityId: entity.id, entityType: action.type.toLowerCase() }, undoData: undo as Prisma.InputJsonValue } });
    }
    return actionGroup(tx, userId, actionId);
  }, { timeout: 30_000 });
}

export async function cancelAgentAction(userId: string, actionId: string) {
  const group = await actionGroup(prisma, userId, actionId);
  const result = await prisma.agentAction.updateMany({ where: { id: { in: group.map((item) => item.id) }, userId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (!result.count) throw new AppError(409, 'ACTION_NOT_PENDING', 'Hành động này không còn chờ xác nhận.');
  return actionGroup(prisma, userId, actionId);
}

/** Hoàn tác cả nhóm theo thứ tự NGƯỢC với lúc tạo (khoản chi trước, rồi danh mục con, rồi danh mục cha). */
export async function undoAgentAction(userId: string, actionId: string) {
  return prisma.$transaction(async (tx) => {
    const group = await actionGroup(tx, userId, actionId);
    const executed = group.filter((item) => item.status === 'EXECUTED' && item.undoData);
    if (!executed.length) throw new AppError(409, 'ACTION_NOT_UNDOABLE', 'Hành động này không thể hoàn tác.');
    for (const action of [...executed].reverse()) {
      await applyAgentUndo(tx, userId, action);
      await tx.agentAction.update({ where: { id: action.id }, data: { status: 'UNDONE' } });
    }
    return actionGroup(tx, userId, actionId);
  }, { timeout: 30_000 });
}

export function publicAgentAction(action: AgentAction) { return { id: action.id, batchId: action.batchId, type: action.type, risk: action.risk, status: action.status, preview: action.preview, result: action.result, expiresAt: action.expiresAt, executedAt: action.executedAt, createdAt: action.createdAt }; }
