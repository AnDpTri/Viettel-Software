import { AgentAction, GoalStatus, Prisma, RecurrenceFrequency, TransactionStatus, TransactionType, WalletType } from '@prisma/client';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { nextOccurrence } from '../lib/recurrence';
import type { AgentToolName } from './ai.service';

export type AgentProposal = { tool: AgentToolName; arguments: Record<string, unknown> };
export const READ_AGENT_TOOLS = new Set<AgentToolName>(['SEARCH_TRANSACTIONS', 'FINANCIAL_SUMMARY', 'EXPORT_TRANSACTIONS_CSV', 'LIST_UPCOMING_BILLS']);
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Ngày không hợp lệ');
const money = z.coerce.number().positive().max(999_999_999_999);
const uuid = z.string().uuid();
const recurrence = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

function sameName(a: string, b: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
  const left = normalize(a); const right = normalize(b);
  return left === right || (left.length >= 3 && right.includes(left)) || (right.length >= 3 && left.includes(right));
}

async function resolveWallet(userId: string, walletId?: string, walletName?: string, optional = false) {
  const rows = await prisma.wallet.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } });
  const item = walletId ? rows.find((row) => row.id === walletId) : walletName ? rows.find((row) => sameName(row.name, walletName)) : rows.length === 1 ? rows[0] : undefined;
  if (!item && !optional) throw new AppError(422, 'AGENT_NEEDS_WALLET', 'Tôi chưa xác định được ví. Bạn hãy nói rõ tên ví muốn sử dụng.');
  return item ?? null;
}

async function resolveCategory(userId: string, type: TransactionType | undefined, categoryId?: string, categoryName?: string, optional = true) {
  if (!categoryId && !categoryName) return null;
  const rows = await prisma.category.findMany({ where: { userId, archivedAt: null, ...(type ? { type } : {}) } });
  const item = categoryId ? rows.find((row) => row.id === categoryId) : rows.find((row) => sameName(row.name, categoryName!));
  if (!item && !optional) throw new AppError(422, 'AGENT_NEEDS_CATEGORY', `Không tìm thấy danh mục “${categoryName ?? categoryId}” phù hợp.`);
  return item ?? null;
}

async function owned<T extends { id: string }>(label: string, promise: Promise<T | null>) {
  const value = await promise;
  if (!value) throw notFound(label);
  return value;
}

function jsonSnapshot(value: unknown) { return JSON.parse(JSON.stringify(value)) as Record<string, unknown>; }
function date(value?: string) { return value ? new Date(value) : new Date(); }

type Prepared = { type: AgentToolName; payload: Record<string, unknown>; preview: Record<string, unknown>; risk?: string };

export async function prepareAgentActions(userId: string, conversationId: string, proposals: AgentProposal[]) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });
  const prepared: Prepared[] = [];
  for (const proposal of proposals.filter((item) => !READ_AGENT_TOOLS.has(item.tool))) {
    const a = proposal.arguments;
    if (proposal.tool === 'CREATE_TRANSACTION') {
      const input = z.object({ type: z.enum(['INCOME', 'EXPENSE']), amount: money, walletId: uuid.optional(), walletName: z.string().max(100).optional(), categoryId: uuid.optional(), categoryName: z.string().max(100).optional(), occurredAt: isoDate.optional(), note: z.string().max(500).optional(), payee: z.string().max(160).optional() }).parse(a);
      const wallet = await resolveWallet(userId, input.walletId, input.walletName);
      const category = await resolveCategory(userId, input.type, input.categoryId, input.categoryName);
      const payload = { ...input, walletId: wallet!.id, categoryId: category?.id ?? null, occurredAt: date(input.occurredAt).toISOString() };
      prepared.push({ type: proposal.tool, payload, preview: { title: input.type === 'INCOME' ? 'Ghi khoản thu' : 'Ghi khoản chi', amount: input.amount, currency: wallet!.currency, wallet: wallet!.name, category: category?.name ?? 'Chưa phân loại', occurredAt: payload.occurredAt, note: input.note ?? null } });
    } else if (proposal.tool === 'UPDATE_TRANSACTION') {
      const input = z.object({ transactionId: uuid, amount: money.optional(), categoryId: uuid.nullable().optional(), categoryName: z.string().max(100).optional(), occurredAt: isoDate.optional(), note: z.string().max(500).nullable().optional(), payee: z.string().max(160).nullable().optional(), status: z.enum(['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED', 'CANCELLED']).optional() }).parse(a);
      const before = await owned('Giao dịch', prisma.transaction.findFirst({ where: { id: input.transactionId, userId, deletedAt: null } }));
      const category = input.categoryId === null ? null : await resolveCategory(userId, before.type, input.categoryId, input.categoryName);
      const changes = { ...(input.amount ? { amount: input.amount } : {}), ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt).toISOString() } : {}), ...(input.note !== undefined ? { note: input.note } : {}), ...(input.payee !== undefined ? { payee: input.payee } : {}), ...(input.status ? { status: input.status } : {}), ...(input.categoryId !== undefined || input.categoryName ? { categoryId: category?.id ?? null } : {}) };
      prepared.push({ type: proposal.tool, payload: { transactionId: before.id, changes, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật giao dịch', amount: Number(before.amount), changes } });
    } else if (proposal.tool === 'DELETE_TRANSACTION') {
      const { transactionId } = z.object({ transactionId: uuid }).parse(a);
      const before = await owned('Giao dịch', prisma.transaction.findFirst({ where: { id: transactionId, userId, deletedAt: null }, include: { wallet: true, category: true } }));
      prepared.push({ type: proposal.tool, risk: 'HIGH', payload: { transactionId }, preview: { title: 'Xóa giao dịch', amount: Number(before.amount), wallet: before.wallet.name, category: before.category?.name ?? 'Chưa phân loại', occurredAt: before.occurredAt }, });
    } else if (proposal.tool === 'CREATE_TRANSFER') {
      const input = z.object({ amount: money, sourceWalletId: uuid.optional(), sourceWalletName: z.string().max(100).optional(), destinationWalletId: uuid.optional(), destinationWalletName: z.string().max(100).optional(), occurredAt: isoDate.optional(), note: z.string().max(500).optional() }).parse(a);
      const source = await resolveWallet(userId, input.sourceWalletId, input.sourceWalletName); const destination = await resolveWallet(userId, input.destinationWalletId, input.destinationWalletName);
      if (source!.id === destination!.id) throw new AppError(422, 'INVALID_TRANSFER', 'Ví nguồn và ví đích phải khác nhau.');
      if (source!.currency !== destination!.currency) throw new AppError(422, 'CURRENCY_MISMATCH', 'Hai ví phải cùng loại tiền tệ.');
      prepared.push({ type: proposal.tool, payload: { amount: input.amount, sourceWalletId: source!.id, destinationWalletId: destination!.id, occurredAt: date(input.occurredAt).toISOString(), note: input.note ?? null }, preview: { title: 'Chuyển tiền', amount: input.amount, currency: source!.currency, from: source!.name, to: destination!.name } });
    } else if (proposal.tool === 'BULK_CATEGORIZE') {
      const input = z.object({ transactionIds: z.array(uuid).min(1).max(500), categoryId: uuid.optional(), categoryName: z.string().max(100).optional() }).parse(a);
      const rows = await prisma.transaction.findMany({ where: { id: { in: input.transactionIds }, userId, deletedAt: null } });
      if (rows.length !== input.transactionIds.length) throw new AppError(404, 'TRANSACTIONS_NOT_FOUND', 'Một số giao dịch không tồn tại.');
      const types = new Set(rows.map((row) => row.type)); if (types.size !== 1 || types.has('TRANSFER')) throw new AppError(422, 'MIXED_TRANSACTION_TYPES', 'Chỉ có thể phân loại hàng loạt các giao dịch cùng loại thu hoặc chi.');
      const category = await resolveCategory(userId, rows[0]!.type, input.categoryId, input.categoryName, false);
      prepared.push({ type: proposal.tool, payload: { ids: input.transactionIds, categoryId: category!.id, before: rows.map((row) => ({ id: row.id, categoryId: row.categoryId })) }, preview: { title: 'Phân loại hàng loạt', count: rows.length, category: category!.name } });
    } else if (proposal.tool === 'CREATE_WALLET') {
      const input = z.object({ name: z.string().trim().min(1).max(100), type: z.nativeEnum(WalletType).default('CASH'), currency: z.string().length(3).transform((v) => v.toUpperCase()).optional(), openingBalance: z.coerce.number().min(-999_999_999_999).max(999_999_999_999).default(0) }).parse(a);
      if (await prisma.wallet.findFirst({ where: { userId, name: { equals: input.name, mode: 'insensitive' } } })) throw new AppError(409, 'WALLET_EXISTS', `Ví “${input.name}” đã tồn tại.`);
      const payload = { ...input, currency: input.currency ?? user.currency };
      prepared.push({ type: proposal.tool, payload, preview: { title: 'Tạo ví', ...payload } });
    } else if (proposal.tool === 'UPDATE_WALLET') {
      const input = z.object({ walletId: uuid, name: z.string().min(1).max(100).optional(), type: z.nativeEnum(WalletType).optional(), currency: z.string().length(3).optional(), openingBalance: z.coerce.number().optional() }).parse(a);
      const before = await owned('Ví', prisma.wallet.findFirst({ where: { id: input.walletId, userId, archivedAt: null } }));
      const { walletId, ...changes } = input; prepared.push({ type: proposal.tool, payload: { walletId, changes, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật ví', wallet: before.name, changes } });
    } else if (proposal.tool === 'ARCHIVE_WALLET') {
      const input = z.object({ walletId: uuid }).parse(a); const row = await owned('Ví', prisma.wallet.findFirst({ where: { id: input.walletId, userId, archivedAt: null } }));
      prepared.push({ type: proposal.tool, risk: 'HIGH', payload: input, preview: { title: 'Lưu trữ ví', wallet: row.name } });
    } else if (proposal.tool === 'CREATE_CATEGORY') {
      const input = z.object({ name: z.string().min(1).max(100), type: z.enum(['INCOME', 'EXPENSE']), parentId: uuid.optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#4F7668') }).parse(a);
      prepared.push({ type: proposal.tool, payload: input, preview: { title: 'Tạo danh mục', ...input } });
    } else if (proposal.tool === 'UPDATE_CATEGORY') {
      const input = z.object({ categoryId: uuid, name: z.string().min(1).max(100).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), parentId: uuid.nullable().optional() }).parse(a);
      const before = await owned('Danh mục', prisma.category.findFirst({ where: { id: input.categoryId, userId, archivedAt: null } })); const { categoryId, ...changes } = input;
      prepared.push({ type: proposal.tool, payload: { categoryId, changes, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật danh mục', category: before.name, changes } });
    } else if (proposal.tool === 'ARCHIVE_CATEGORY') {
      const input = z.object({ categoryId: uuid }).parse(a); const row = await owned('Danh mục', prisma.category.findFirst({ where: { id: input.categoryId, userId, archivedAt: null } }));
      prepared.push({ type: proposal.tool, risk: 'HIGH', payload: input, preview: { title: 'Lưu trữ danh mục', category: row.name } });
    } else if (proposal.tool === 'CREATE_BUDGET') {
      const input = z.object({ name: z.string().min(1).max(100), amount: money, categoryId: uuid.optional(), categoryName: z.string().max(100).optional(), startDate: isoDate, endDate: isoDate, rollover: z.boolean().default(false) }).parse(a);
      if (new Date(input.endDate) < new Date(input.startDate)) throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày kết thúc phải sau ngày bắt đầu.');
      const category = await resolveCategory(userId, 'EXPENSE', input.categoryId, input.categoryName);
      const payload = { name: input.name, amount: input.amount, categoryId: category?.id ?? null, startDate: input.startDate, endDate: input.endDate, rollover: input.rollover };
      prepared.push({ type: proposal.tool, payload, preview: { title: 'Tạo ngân sách', ...payload, category: category?.name ?? 'Tất cả', currency: user.currency } });
    } else if (proposal.tool === 'UPDATE_BUDGET') {
      const input = z.object({ budgetId: uuid, name: z.string().min(1).max(100).optional(), amount: money.optional(), startDate: isoDate.optional(), endDate: isoDate.optional(), rollover: z.boolean().optional() }).parse(a);
      const before = await owned('Ngân sách', prisma.budget.findFirst({ where: { id: input.budgetId, userId, deletedAt: null } })); const { budgetId, ...changes } = input;
      prepared.push({ type: proposal.tool, payload: { budgetId, changes, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật ngân sách', budget: before.name, changes } });
    } else if (proposal.tool === 'DELETE_BUDGET') {
      const input = z.object({ budgetId: uuid }).parse(a); const row = await owned('Ngân sách', prisma.budget.findFirst({ where: { id: input.budgetId, userId, deletedAt: null } }));
      prepared.push({ type: proposal.tool, risk: 'HIGH', payload: input, preview: { title: 'Xóa ngân sách', budget: row.name, amount: Number(row.amount) } });
    } else if (proposal.tool === 'CREATE_GOAL') {
      const input = z.object({ name: z.string().min(1).max(120), targetAmount: money, currentAmount: z.coerce.number().min(0).default(0), targetDate: isoDate.optional() }).parse(a);
      if (input.currentAmount > input.targetAmount) throw new AppError(422, 'INVALID_GOAL_AMOUNT', 'Số tiền hiện có không thể lớn hơn mục tiêu.');
      prepared.push({ type: proposal.tool, payload: input, preview: { title: 'Tạo mục tiêu', ...input, currency: user.currency } });
    } else if (proposal.tool === 'UPDATE_GOAL') {
      const input = z.object({ goalId: uuid, name: z.string().min(1).max(120).optional(), targetAmount: money.optional(), targetDate: isoDate.nullable().optional(), status: z.nativeEnum(GoalStatus).optional() }).parse(a);
      const before = await owned('Mục tiêu', prisma.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } })); const { goalId, ...changes } = input;
      prepared.push({ type: proposal.tool, payload: { goalId, changes, before: jsonSnapshot(before) }, preview: { title: 'Cập nhật mục tiêu', goal: before.name, changes } });
    } else if (proposal.tool === 'CONTRIBUTE_GOAL') {
      const input = z.object({ goalId: uuid, amount: money, note: z.string().max(255).optional() }).parse(a); const goal = await owned('Mục tiêu', prisma.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
      prepared.push({ type: proposal.tool, payload: input, preview: { title: 'Đóng góp mục tiêu', goal: goal.name, amount: input.amount, currentAmount: Number(goal.currentAmount), currency: user.currency } });
    } else if (proposal.tool === 'PAUSE_GOAL') {
      const input = z.object({ goalId: uuid, paused: z.boolean().default(true) }).parse(a); const goal = await owned('Mục tiêu', prisma.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
      prepared.push({ type: proposal.tool, payload: input, preview: { title: input.paused ? 'Tạm dừng mục tiêu' : 'Tiếp tục mục tiêu', goal: goal.name } });
    } else if (proposal.tool === 'DELETE_GOAL') {
      const input = z.object({ goalId: uuid }).parse(a); const goal = await owned('Mục tiêu', prisma.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
      prepared.push({ type: proposal.tool, risk: 'HIGH', payload: input, preview: { title: 'Xóa mục tiêu', goal: goal.name } });
    } else if (proposal.tool === 'CREATE_BILL') {
      const input = z.object({ name: z.string().min(1).max(120), amount: money, dueAt: isoDate, walletId: uuid.optional(), walletName: z.string().max(100).optional(), recurrence: recurrence.optional() }).parse(a);
      const wallet = await resolveWallet(userId, input.walletId, input.walletName, true); const payload = { ...input, walletId: wallet?.id ?? null };
      prepared.push({ type: proposal.tool, payload, preview: { title: 'Tạo hóa đơn', name: input.name, amount: input.amount, dueAt: input.dueAt, wallet: wallet?.name ?? 'Chưa chọn' } });
    } else if (proposal.tool === 'PAY_BILL') {
      const input = z.object({ billId: uuid, walletId: uuid.optional(), walletName: z.string().max(100).optional(), occurredAt: isoDate.optional() }).parse(a); const bill = await owned('Hóa đơn', prisma.bill.findFirst({ where: { id: input.billId, userId } }));
      const wallet = await resolveWallet(userId, input.walletId ?? bill.walletId ?? undefined, input.walletName);
      prepared.push({ type: proposal.tool, payload: { ...input, walletId: wallet!.id }, preview: { title: 'Thanh toán hóa đơn', bill: bill.name, amount: Number(bill.amount), wallet: wallet!.name } });
    } else if (proposal.tool === 'CREATE_RECURRING') {
      const input = z.object({ name: z.string().min(1).max(120), type: z.enum(['INCOME', 'EXPENSE']), amount: money, walletId: uuid.optional(), walletName: z.string().max(100).optional(), categoryId: uuid.optional(), categoryName: z.string().max(100).optional(), frequency: recurrence, nextRunAt: isoDate, autoPost: z.boolean().default(false) }).parse(a);
      const wallet = await resolveWallet(userId, input.walletId, input.walletName); const category = await resolveCategory(userId, input.type, input.categoryId, input.categoryName);
      const payload = { ...input, walletId: wallet!.id, categoryId: category?.id ?? null };
      prepared.push({ type: proposal.tool, payload, preview: { title: 'Tạo giao dịch định kỳ', name: input.name, amount: input.amount, wallet: wallet!.name, frequency: input.frequency, nextRunAt: input.nextRunAt, autoPost: input.autoPost } });
    } else if (proposal.tool === 'CREATE_AUTOMATION_RULE') {
      const input = z.object({ name: z.string().min(1).max(120), field: z.enum(['note', 'payee', 'reference', 'amount']), operator: z.enum(['contains', 'equals', 'startsWith', 'gte', 'lte']), value: z.string().min(1).max(255), categoryId: uuid.optional(), categoryName: z.string().max(100).optional(), tagName: z.string().max(50).optional(), priority: z.coerce.number().int().min(0).max(1000).default(0) }).parse(a);
      const category = await resolveCategory(userId, undefined, input.categoryId, input.categoryName); const payload = { ...input, categoryId: category?.id ?? null };
      prepared.push({ type: proposal.tool, payload, preview: { title: 'Tạo quy tắc tự động', ...payload, category: category?.name ?? null } });
    } else if (proposal.tool === 'RECONCILE_WALLET') {
      const input = z.object({ walletId: uuid.optional(), walletName: z.string().max(100).optional(), actualBalance: z.coerce.number(), occurredAt: isoDate.optional(), note: z.string().max(500).optional() }).parse(a); const wallet = await resolveWallet(userId, input.walletId, input.walletName);
      const rows = await prisma.transaction.findMany({ where: { userId, deletedAt: null, status: { not: 'CANCELLED' }, OR: [{ walletId: wallet!.id }, { destinationWalletId: wallet!.id }] } });
      let current = Number(wallet!.openingBalance); for (const row of rows) current += row.type === 'INCOME' || (row.type === 'TRANSFER' && row.destinationWalletId === wallet!.id) ? Number(row.amount) : -Number(row.amount);
      const difference = input.actualBalance - current; if (Math.abs(difference) < 0.0001) throw new AppError(422, 'ALREADY_RECONCILED', 'Số dư ví đã khớp, không cần điều chỉnh.');
      prepared.push({ type: proposal.tool, payload: { walletId: wallet!.id, type: difference > 0 ? 'INCOME' : 'EXPENSE', amount: Math.abs(difference), occurredAt: date(input.occurredAt).toISOString(), note: input.note ?? 'Điều chỉnh đối soát' }, preview: { title: 'Đối soát ví', wallet: wallet!.name, currentBalance: current, actualBalance: input.actualBalance, adjustment: difference, currency: wallet!.currency } });
    }
  }
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return prisma.$transaction(prepared.map((item) => prisma.agentAction.create({ data: { userId, conversationId, type: item.type, risk: item.risk ?? 'NORMAL', payload: item.payload as Prisma.InputJsonValue, preview: item.preview as Prisma.InputJsonValue, expiresAt } })));
}

export async function executeReadAgentTools(userId: string, proposals: AgentProposal[]) {
  const results: Array<{ tool: AgentToolName; summary: string; data?: unknown; attachment?: { label: string; url: string } }> = [];
  for (const proposal of proposals.filter((item) => READ_AGENT_TOOLS.has(item.tool))) {
    const a = proposal.arguments;
    if (proposal.tool === 'SEARCH_TRANSACTIONS') {
      const input = z.object({ query: z.string().max(200).optional(), type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(), walletName: z.string().max(100).optional(), categoryName: z.string().max(100).optional(), from: isoDate.optional(), to: isoDate.optional(), minAmount: z.coerce.number().optional(), maxAmount: z.coerce.number().optional(), limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(a);
      const wallet = input.walletName ? await resolveWallet(userId, undefined, input.walletName, true) : null; const category = input.categoryName ? await resolveCategory(userId, input.type as TransactionType | undefined, undefined, input.categoryName) : null;
      const rows = await prisma.transaction.findMany({ where: { userId, deletedAt: null, ...(input.type ? { type: input.type } : {}), ...(wallet ? { OR: [{ walletId: wallet.id }, { destinationWalletId: wallet.id }] } : {}), ...(category ? { categoryId: category.id } : {}), ...(input.from || input.to ? { occurredAt: { ...(input.from ? { gte: new Date(input.from) } : {}), ...(input.to ? { lte: new Date(input.to) } : {}) } } : {}), ...(input.minAmount !== undefined || input.maxAmount !== undefined ? { amount: { ...(input.minAmount !== undefined ? { gte: input.minAmount } : {}), ...(input.maxAmount !== undefined ? { lte: input.maxAmount } : {}) } } : {}), ...(input.query ? { OR: [{ note: { contains: input.query, mode: 'insensitive' } }, { payee: { contains: input.query, mode: 'insensitive' } }] } : {}) }, include: { wallet: { select: { name: true, currency: true } }, category: { select: { name: true } } }, orderBy: { occurredAt: 'desc' }, take: input.limit });
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
      if (wallet) params.set('walletId', wallet.id); if (category) params.set('categoryId', category.id); const url = `/api/v1/transactions/export.csv${params.size ? `?${params}` : ''}`;
      results.push({ tool: proposal.tool, summary: 'Tôi đã chuẩn bị đường dẫn tải báo cáo CSV.', attachment: { label: 'Tải CSV giao dịch', url } });
    } else if (proposal.tool === 'LIST_UPCOMING_BILLS') {
      const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(a); const until = new Date(Date.now() + days * 86_400_000);
      const rows = await prisma.bill.findMany({ where: { userId, status: { in: ['UPCOMING', 'OVERDUE'] }, dueAt: { lte: until } }, orderBy: { dueAt: 'asc' }, take: 50 }); const data = rows.map((row) => ({ id: row.id, name: row.name, amount: Number(row.amount), dueAt: row.dueAt, status: row.status }));
      const lines = data.slice(0, 10).map((item, index) => `${index + 1}. ${item.name}: ${item.amount.toLocaleString('vi-VN')} · hạn ${new Date(item.dueAt).toLocaleDateString('vi-VN')} · ${item.status}`).join('\n');
      results.push({ tool: proposal.tool, summary: data.length ? `Có ${data.length} hóa đơn đến hạn trong ${days} ngày tới:\n${lines}` : `Không có hóa đơn đến hạn trong ${days} ngày tới.`, data });
    }
  }
  return results;
}

export async function executeAgentAction(userId: string, actionId: string) {
  return prisma.$transaction(async (tx) => {
    const action = await tx.agentAction.findFirst({ where: { id: actionId, userId } }); if (!action) throw notFound('Hành động');
    if (action.status !== 'PENDING') throw new AppError(409, 'ACTION_NOT_PENDING', 'Hành động này không còn chờ xác nhận.');
    if (action.expiresAt < new Date()) { await tx.agentAction.update({ where: { id: action.id }, data: { status: 'EXPIRED' } }); throw new AppError(410, 'ACTION_EXPIRED', 'Bản xem trước đã hết hạn.'); }
    const p = action.payload as Record<string, any>; let entity: { id: string }; let undo: Record<string, unknown>;
    const created = (entityType: string, id: string) => ({ mode: 'deleteCreated', entityType, entityId: id });
    if (action.type === 'CREATE_TRANSACTION' || action.type === 'RECONCILE_WALLET') entity = await tx.transaction.create({ data: { userId, walletId: p.walletId, categoryId: p.categoryId ?? null, type: p.type as TransactionType, amount: p.amount, occurredAt: new Date(p.occurredAt), note: p.note ?? null, payee: p.payee ?? null, status: action.type === 'RECONCILE_WALLET' ? 'RECONCILED' : 'CLEARED', idempotencyKey: `agent:${action.id}` } }), undo = created('transaction', entity.id);
    else if (action.type === 'CREATE_TRANSFER') entity = await tx.transaction.create({ data: { userId, walletId: p.sourceWalletId, destinationWalletId: p.destinationWalletId, type: 'TRANSFER', amount: p.amount, occurredAt: new Date(p.occurredAt), note: p.note, status: 'CLEARED', idempotencyKey: `agent:${action.id}` } }), undo = created('transaction', entity.id);
    else if (action.type === 'UPDATE_TRANSACTION') entity = await tx.transaction.update({ where: { id: p.transactionId }, data: { ...p.changes, ...(p.changes.occurredAt ? { occurredAt: new Date(p.changes.occurredAt) } : {}) } }), undo = { mode: 'restore', entityType: 'transaction', entityId: entity.id, data: p.before };
    else if (action.type === 'DELETE_TRANSACTION') entity = await tx.transaction.update({ where: { id: p.transactionId }, data: { deletedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'transaction', entityId: entity.id };
    else if (action.type === 'BULK_CATEGORIZE') { await tx.transaction.updateMany({ where: { id: { in: p.ids }, userId }, data: { categoryId: p.categoryId } }); entity = { id: action.id }; undo = { mode: 'bulkCategories', data: p.before }; }
    else if (action.type === 'CREATE_WALLET') entity = await tx.wallet.create({ data: { userId, name: p.name, type: p.type as WalletType, currency: p.currency, openingBalance: p.openingBalance } }), undo = created('wallet', entity.id);
    else if (action.type === 'UPDATE_WALLET') entity = await tx.wallet.update({ where: { id: p.walletId }, data: p.changes }), undo = { mode: 'restore', entityType: 'wallet', entityId: entity.id, data: p.before };
    else if (action.type === 'ARCHIVE_WALLET') entity = await tx.wallet.update({ where: { id: p.walletId }, data: { archivedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'wallet', entityId: entity.id };
    else if (action.type === 'CREATE_CATEGORY') entity = await tx.category.create({ data: { userId, name: p.name, type: p.type as TransactionType, parentId: p.parentId ?? null, color: p.color } }), undo = created('category', entity.id);
    else if (action.type === 'UPDATE_CATEGORY') entity = await tx.category.update({ where: { id: p.categoryId }, data: p.changes }), undo = { mode: 'restore', entityType: 'category', entityId: entity.id, data: p.before };
    else if (action.type === 'ARCHIVE_CATEGORY') entity = await tx.category.update({ where: { id: p.categoryId }, data: { archivedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'category', entityId: entity.id };
    else if (action.type === 'CREATE_BUDGET') entity = await tx.budget.create({ data: { userId, name: p.name, amount: p.amount, categoryId: p.categoryId, startDate: new Date(p.startDate), endDate: new Date(p.endDate), rollover: p.rollover } }), undo = created('budget', entity.id);
    else if (action.type === 'UPDATE_BUDGET') entity = await tx.budget.update({ where: { id: p.budgetId }, data: { ...p.changes, ...(p.changes.startDate ? { startDate: new Date(p.changes.startDate) } : {}), ...(p.changes.endDate ? { endDate: new Date(p.changes.endDate) } : {}) } }), undo = { mode: 'restore', entityType: 'budget', entityId: entity.id, data: p.before };
    else if (action.type === 'DELETE_BUDGET') entity = await tx.budget.update({ where: { id: p.budgetId }, data: { deletedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'budget', entityId: entity.id };
    else if (action.type === 'CREATE_GOAL') entity = await tx.goal.create({ data: { userId, name: p.name, targetAmount: p.targetAmount, currentAmount: p.currentAmount, targetDate: p.targetDate ? new Date(p.targetDate) : null } }), undo = created('goal', entity.id);
    else if (action.type === 'UPDATE_GOAL') entity = await tx.goal.update({ where: { id: p.goalId }, data: { ...p.changes, ...(p.changes.targetDate ? { targetDate: new Date(p.changes.targetDate) } : {}) } }), undo = { mode: 'restore', entityType: 'goal', entityId: entity.id, data: p.before };
    else if (action.type === 'CONTRIBUTE_GOAL') { const goal = await tx.goal.findUniqueOrThrow({ where: { id: p.goalId } }); const contribution = await tx.goalContribution.create({ data: { goalId: p.goalId, amount: p.amount, note: p.note } }); entity = await tx.goal.update({ where: { id: p.goalId }, data: { currentAmount: { increment: p.amount }, ...(Number(goal.currentAmount) + Number(p.amount) >= Number(goal.targetAmount) ? { status: 'COMPLETED' } : {}) } }); undo = { mode: 'goalContribution', entityId: entity.id, contributionId: contribution.id, previousAmount: Number(goal.currentAmount), previousStatus: goal.status }; }
    else if (action.type === 'PAUSE_GOAL') { const goal = await tx.goal.findUniqueOrThrow({ where: { id: p.goalId } }); entity = await tx.goal.update({ where: { id: p.goalId }, data: { pausedAt: p.paused ? new Date() : null } }); undo = { mode: 'restore', entityType: 'goal', entityId: entity.id, data: jsonSnapshot(goal) }; }
    else if (action.type === 'DELETE_GOAL') entity = await tx.goal.update({ where: { id: p.goalId }, data: { deletedAt: new Date() } }), undo = { mode: 'restoreDelete', entityType: 'goal', entityId: entity.id };
    else if (action.type === 'CREATE_BILL') entity = await tx.bill.create({ data: { userId, name: p.name, amount: p.amount, dueAt: new Date(p.dueAt), walletId: p.walletId, recurrence: p.recurrence as RecurrenceFrequency | undefined } }), undo = created('bill', entity.id);
    else if (action.type === 'PAY_BILL') { const bill = await tx.bill.findUniqueOrThrow({ where: { id: p.billId } }); const transaction = await tx.transaction.create({ data: { userId, walletId: p.walletId, type: 'EXPENSE', amount: bill.amount, occurredAt: date(p.occurredAt), note: `Thanh toán: ${bill.name}`, idempotencyKey: `agent:${action.id}` } }); entity = await tx.bill.update({ where: { id: bill.id }, data: bill.recurrence ? { dueAt: nextOccurrence(bill.dueAt, bill.recurrence), status: 'UPCOMING' } : { status: 'PAID' } }); undo = { mode: 'payBill', entityId: bill.id, transactionId: transaction.id, data: jsonSnapshot(bill) }; }
    else if (action.type === 'CREATE_RECURRING') entity = await tx.recurringRule.create({ data: { userId, name: p.name, type: p.type as TransactionType, amount: p.amount, walletId: p.walletId, categoryId: p.categoryId, frequency: p.frequency as RecurrenceFrequency, nextRunAt: new Date(p.nextRunAt), autoPost: p.autoPost } }), undo = created('recurring', entity.id);
    else if (action.type === 'CREATE_AUTOMATION_RULE') entity = await tx.automationRule.create({ data: { userId, name: p.name, field: p.field, operator: p.operator, value: p.value, categoryId: p.categoryId, tagName: p.tagName, priority: p.priority } }), undo = created('automation', entity.id);
    else throw new AppError(422, 'UNSUPPORTED_AGENT_ACTION', 'Agent chưa hỗ trợ hành động này.');
    const result = { entityId: entity.id, entityType: action.type.toLowerCase() };
    return tx.agentAction.update({ where: { id: action.id }, data: { status: 'EXECUTED', executedAt: new Date(), result, undoData: undo as Prisma.InputJsonValue } });
  });
}

export async function cancelAgentAction(userId: string, actionId: string) {
  const result = await prisma.agentAction.updateMany({ where: { id: actionId, userId, status: 'PENDING' }, data: { status: 'CANCELLED' } }); if (!result.count) throw new AppError(409, 'ACTION_NOT_PENDING', 'Hành động này không còn chờ xác nhận.');
}

export async function undoAgentAction(userId: string, actionId: string) {
  return prisma.$transaction(async (tx) => {
    const action = await tx.agentAction.findFirst({ where: { id: actionId, userId } }); if (!action) throw notFound('Hành động');
    if (action.status !== 'EXECUTED' || !action.undoData) throw new AppError(409, 'ACTION_NOT_UNDOABLE', 'Hành động này không thể hoàn tác.');
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
    else if (u.mode === 'goalContribution') { await tx.goalContribution.delete({ where: { id: u.contributionId } }); await tx.goal.update({ where: { id: u.entityId }, data: { currentAmount: u.previousAmount, status: u.previousStatus } }); }
    else if (u.mode === 'payBill') { await tx.transaction.update({ where: { id: u.transactionId }, data: { deletedAt: new Date() } }); await tx.bill.update({ where: { id: u.entityId }, data: { dueAt: new Date(u.data.dueAt), status: u.data.status } }); }
    else if (u.mode === 'restore') {
      const d = u.data; delete d.id; delete d.userId; delete d.createdAt; delete d.updatedAt;
      for (const key of ['occurredAt', 'startDate', 'endDate', 'targetDate', 'pausedAt', 'archivedAt', 'deletedAt']) if (d[key]) d[key] = new Date(d[key]);
      if (type === 'transaction') await tx.transaction.update({ where: { id: u.entityId }, data: d });
      else if (type === 'wallet') await tx.wallet.update({ where: { id: u.entityId }, data: d });
      else if (type === 'category') await tx.category.update({ where: { id: u.entityId }, data: d });
      else if (type === 'budget') await tx.budget.update({ where: { id: u.entityId }, data: d });
      else if (type === 'goal') await tx.goal.update({ where: { id: u.entityId }, data: d });
    }
    return tx.agentAction.update({ where: { id: action.id }, data: { status: 'UNDONE' } });
  });
}

export function publicAgentAction(action: AgentAction) { return { id: action.id, type: action.type, risk: action.risk, status: action.status, preview: action.preview, result: action.result, expiresAt: action.expiresAt, executedAt: action.executedAt, createdAt: action.createdAt }; }
