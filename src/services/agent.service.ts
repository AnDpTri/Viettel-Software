import { AgentAction, Prisma, TransactionType, WalletType } from '@prisma/client';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type { AgentToolName } from './ai.service';

type Proposal = { tool: AgentToolName; arguments: Record<string, unknown> };
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Ngày không hợp lệ');
const money = z.coerce.number().positive().max(999_999_999_999);

const transactionInput = z.object({
  type: z.enum(['INCOME', 'EXPENSE']), amount: money,
  walletId: z.string().uuid().optional(), walletName: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(), categoryName: z.string().trim().max(100).optional(),
  occurredAt: isoDate.default(() => new Date().toISOString()), note: z.string().trim().max(500).optional(),
  payee: z.string().trim().max(160).optional()
});
const budgetInput = z.object({
  name: z.string().trim().min(1).max(100), amount: money,
  categoryId: z.string().uuid().optional(), categoryName: z.string().trim().max(100).optional(),
  startDate: isoDate, endDate: isoDate
});
const goalInput = z.object({
  name: z.string().trim().min(1).max(120), targetAmount: money,
  currentAmount: z.coerce.number().min(0).default(0), targetDate: isoDate.optional()
});
const walletInput = z.object({
  name: z.string().trim().min(1).max(100), type: z.nativeEnum(WalletType).default('CASH'),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  openingBalance: z.coerce.number().min(-999_999_999_999).max(999_999_999_999).default(0)
});
const categoryInput = z.object({
  name: z.string().trim().min(1).max(100), type: z.enum(['INCOME', 'EXPENSE']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#4F7668')
});

function sameName(a: string, b: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const left = normalize(a); const right = normalize(b);
  return left === right || (left.length >= 3 && right.includes(left)) || (right.length >= 3 && left.includes(right));
}

async function resolveWallet(userId: string, walletId?: string, walletName?: string) {
  const wallets = await prisma.wallet.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } });
  const wallet = walletId ? wallets.find((item) => item.id === walletId) : walletName ? wallets.find((item) => sameName(item.name, walletName)) : wallets.length === 1 ? wallets[0] : undefined;
  if (!wallet) throw new AppError(422, 'AGENT_NEEDS_WALLET', 'Tôi chưa xác định được ví. Bạn hãy nói rõ tên ví muốn sử dụng.');
  return wallet;
}

async function resolveCategory(userId: string, type: TransactionType, categoryId?: string, categoryName?: string) {
  if (!categoryId && !categoryName) return null;
  const categories = await prisma.category.findMany({ where: { userId, archivedAt: null, type } });
  const category = categoryId ? categories.find((item) => item.id === categoryId) : categories.find((item) => sameName(item.name, categoryName!));
  if (!category) throw new AppError(422, 'AGENT_NEEDS_CATEGORY', `Không tìm thấy danh mục “${categoryName ?? categoryId}” phù hợp.`);
  return category;
}

export async function prepareAgentActions(userId: string, conversationId: string, proposals: Proposal[]) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const prepared: Array<{ type: AgentToolName; payload: Record<string, unknown>; preview: Record<string, unknown> }> = [];
  for (const proposal of proposals) {
    if (proposal.tool === 'CREATE_TRANSACTION') {
      const input = transactionInput.parse(proposal.arguments);
      const wallet = await resolveWallet(userId, input.walletId, input.walletName);
      const category = await resolveCategory(userId, input.type, input.categoryId, input.categoryName);
      const payload = { type: input.type, amount: input.amount, walletId: wallet.id, categoryId: category?.id ?? null, occurredAt: new Date(input.occurredAt).toISOString(), note: input.note ?? null, payee: input.payee ?? null };
      prepared.push({ type: proposal.tool, payload, preview: { title: input.type === 'INCOME' ? 'Ghi khoản thu' : 'Ghi khoản chi', amount: input.amount, currency: wallet.currency, wallet: wallet.name, category: category?.name ?? 'Chưa phân loại', occurredAt: payload.occurredAt, note: input.note ?? null } });
    }
    if (proposal.tool === 'CREATE_BUDGET') {
      const input = budgetInput.parse(proposal.arguments);
      if (new Date(input.endDate) < new Date(input.startDate)) throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày kết thúc ngân sách phải sau ngày bắt đầu.');
      const category = await resolveCategory(userId, 'EXPENSE', input.categoryId, input.categoryName);
      const payload = { name: input.name, amount: input.amount, categoryId: category?.id ?? null, startDate: new Date(input.startDate).toISOString(), endDate: new Date(input.endDate).toISOString() };
      prepared.push({ type: proposal.tool, payload, preview: { title: 'Tạo ngân sách', name: input.name, amount: input.amount, currency: user.currency, category: category?.name ?? 'Tất cả danh mục', startDate: payload.startDate, endDate: payload.endDate } });
    }
    if (proposal.tool === 'CREATE_GOAL') {
      const input = goalInput.parse(proposal.arguments);
      if (input.currentAmount > input.targetAmount) throw new AppError(422, 'INVALID_GOAL_AMOUNT', 'Số tiền hiện có không thể lớn hơn mục tiêu.');
      const payload = { name: input.name, targetAmount: input.targetAmount, currentAmount: input.currentAmount, targetDate: input.targetDate ? new Date(input.targetDate).toISOString() : null };
      prepared.push({ type: proposal.tool, payload, preview: { title: 'Tạo mục tiêu', ...payload, currency: user.currency } });
    }
    if (proposal.tool === 'CREATE_WALLET') {
      const input = walletInput.parse(proposal.arguments);
      const exists = await prisma.wallet.findFirst({ where: { userId, name: { equals: input.name, mode: 'insensitive' } } });
      if (exists) throw new AppError(409, 'WALLET_EXISTS', `Ví “${input.name}” đã tồn tại.`);
      const payload = { ...input, currency: input.currency ?? user.currency };
      prepared.push({ type: proposal.tool, payload, preview: { title: 'Tạo ví', ...payload } });
    }
    if (proposal.tool === 'CREATE_CATEGORY') {
      const input = categoryInput.parse(proposal.arguments);
      const exists = await prisma.category.findFirst({ where: { userId, name: { equals: input.name, mode: 'insensitive' }, type: input.type, parentId: null } });
      if (exists) throw new AppError(409, 'CATEGORY_EXISTS', `Danh mục “${input.name}” đã tồn tại.`);
      prepared.push({ type: proposal.tool, payload: input, preview: { title: 'Tạo danh mục', ...input } });
    }
  }
  return prisma.$transaction(prepared.map((item) => prisma.agentAction.create({ data: {
    userId, conversationId, type: item.type, risk: 'NORMAL', payload: item.payload as Prisma.InputJsonValue,
    preview: item.preview as Prisma.InputJsonValue, expiresAt
  } })));
}

export async function executeAgentAction(userId: string, actionId: string) {
  return prisma.$transaction(async (tx) => {
    const action = await tx.agentAction.findFirst({ where: { id: actionId, userId } });
    if (!action) throw notFound('Hành động');
    if (action.status !== 'PENDING') throw new AppError(409, 'ACTION_NOT_PENDING', 'Hành động này không còn chờ xác nhận.');
    if (action.expiresAt < new Date()) {
      await tx.agentAction.update({ where: { id: action.id }, data: { status: 'EXPIRED' } });
      throw new AppError(410, 'ACTION_EXPIRED', 'Bản xem trước đã hết hạn. Hãy yêu cầu agent tạo lại.');
    }
    const payload = action.payload as Record<string, unknown>;
    let created: { id: string };
    if (action.type === 'CREATE_TRANSACTION') created = await tx.transaction.create({ data: { userId, walletId: String(payload.walletId), categoryId: payload.categoryId ? String(payload.categoryId) : null, type: String(payload.type) as TransactionType, amount: Number(payload.amount), occurredAt: new Date(String(payload.occurredAt)), note: payload.note ? String(payload.note) : null, payee: payload.payee ? String(payload.payee) : null, status: 'CLEARED', idempotencyKey: `agent:${action.id}` } });
    else if (action.type === 'CREATE_BUDGET') created = await tx.budget.create({ data: { userId, name: String(payload.name), amount: Number(payload.amount), categoryId: payload.categoryId ? String(payload.categoryId) : null, startDate: new Date(String(payload.startDate)), endDate: new Date(String(payload.endDate)) } });
    else if (action.type === 'CREATE_GOAL') created = await tx.goal.create({ data: { userId, name: String(payload.name), targetAmount: Number(payload.targetAmount), currentAmount: Number(payload.currentAmount ?? 0), targetDate: payload.targetDate ? new Date(String(payload.targetDate)) : null } });
    else if (action.type === 'CREATE_WALLET') created = await tx.wallet.create({ data: { userId, name: String(payload.name), type: String(payload.type) as WalletType, currency: String(payload.currency), openingBalance: Number(payload.openingBalance ?? 0) } });
    else if (action.type === 'CREATE_CATEGORY') created = await tx.category.create({ data: { userId, name: String(payload.name), type: String(payload.type) as TransactionType, color: String(payload.color) } });
    else throw new AppError(422, 'UNSUPPORTED_AGENT_ACTION', 'Agent chưa hỗ trợ hành động này.');
    const result = { entityId: created.id, entityType: action.type.replace('CREATE_', '').toLowerCase() };
    return tx.agentAction.update({ where: { id: action.id }, data: { status: 'EXECUTED', executedAt: new Date(), result, undoData: result } });
  });
}

export async function cancelAgentAction(userId: string, actionId: string) {
  const result = await prisma.agentAction.updateMany({ where: { id: actionId, userId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (!result.count) throw new AppError(409, 'ACTION_NOT_PENDING', 'Hành động này không còn chờ xác nhận.');
}

export async function undoAgentAction(userId: string, actionId: string) {
  return prisma.$transaction(async (tx) => {
    const action = await tx.agentAction.findFirst({ where: { id: actionId, userId } });
    if (!action) throw notFound('Hành động');
    if (action.status !== 'EXECUTED' || !action.undoData) throw new AppError(409, 'ACTION_NOT_UNDOABLE', 'Hành động này không thể hoàn tác.');
    const undo = action.undoData as { entityId: string; entityType: string };
    if (undo.entityType === 'transaction') await tx.transaction.updateMany({ where: { id: undo.entityId, userId, deletedAt: null }, data: { deletedAt: new Date() } });
    else if (undo.entityType === 'budget') await tx.budget.updateMany({ where: { id: undo.entityId, userId, deletedAt: null }, data: { deletedAt: new Date() } });
    else if (undo.entityType === 'goal') await tx.goal.updateMany({ where: { id: undo.entityId, userId, deletedAt: null }, data: { deletedAt: new Date() } });
    else if (undo.entityType === 'wallet') await tx.wallet.updateMany({ where: { id: undo.entityId, userId, archivedAt: null }, data: { archivedAt: new Date() } });
    else if (undo.entityType === 'category') await tx.category.updateMany({ where: { id: undo.entityId, userId, archivedAt: null }, data: { archivedAt: new Date() } });
    else throw new AppError(409, 'ACTION_NOT_UNDOABLE', 'Hành động này không thể hoàn tác.');
    return tx.agentAction.update({ where: { id: action.id }, data: { status: 'UNDONE' } });
  });
}

export function publicAgentAction(action: AgentAction) {
  return { id: action.id, type: action.type, risk: action.risk, status: action.status, preview: action.preview, result: action.result, expiresAt: action.expiresAt, executedAt: action.executedAt, createdAt: action.createdAt };
}
