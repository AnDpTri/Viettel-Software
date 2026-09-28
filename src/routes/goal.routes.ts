import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { money, uuid } from '../lib/validation';
import { authenticate } from '../middleware/auth';

export const goalRouter = Router();
goalRouter.use(authenticate);

const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetAmount: money,
  walletId: uuid.nullable().optional(),
  targetDate: z.string().date().transform((value) => new Date(`${value}T00:00:00.000Z`)).nullable().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  recurringAmount: money.nullable().optional(),
  recurringFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional()
});

async function validateWallet(userId: string, walletId?: string | null) {
  if (!walletId) return;
  if (!(await prisma.wallet.findFirst({ where: { id: walletId, userId } }))) throw notFound('Ví');
}

const decorate = <T extends { targetAmount: unknown; currentAmount: unknown }>(goal: T) => ({
  ...goal,
  percentCompleted: Math.min(100, Math.round(Number(goal.currentAmount) / Number(goal.targetAmount) * 10_000) / 100),
  remainingAmount: Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount))
});

goalRouter.get('/', asyncHandler(async (req, res) => {
  const status = z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional().parse(req.query.status);
  const goals = await prisma.goal.findMany({ where: { userId: req.user!.id, deletedAt: null, ...(status ? { status } : {}) }, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], include: { wallet: { select: { id: true, name: true, currency: true } } } });
  return success(res, goals.map(decorate));
}));

goalRouter.post('/', asyncHandler(async (req, res) => {
  const input = inputSchema.parse(req.body);
  await validateWallet(req.user!.id, input.walletId);
  const goal = await prisma.goal.create({ data: { ...input, userId: req.user!.id }, include: { wallet: true } });
  return success(res, decorate(goal), 'Tạo mục tiêu thành công.', 201);
}));

goalRouter.get('/:id', asyncHandler(async (req, res) => {
  const goal = await prisma.goal.findFirst({ where: { id: uuid.parse(req.params.id), userId: req.user!.id }, include: { wallet: true, contributions: { orderBy: { createdAt: 'desc' } } } });
  if (!goal) throw notFound('Mục tiêu');
  return success(res, decorate(goal));
}));

goalRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.goal.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Mục tiêu');
  const input = inputSchema.partial().refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.').parse(req.body);
  await validateWallet(req.user!.id, input.walletId);
  const goal = await prisma.goal.update({ where: { id }, data: input, include: { wallet: true } });
  return success(res, decorate(goal), 'Cập nhật mục tiêu thành công.');
}));

goalRouter.post('/:id/contributions', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const input = z.object({ amount: z.coerce.number().min(-999_999_999_999).max(999_999_999_999).refine((value) => value !== 0, 'Số tiền phải khác 0.'), note: z.string().trim().max(255).optional(), transactionId: uuid.nullable().optional() }).parse(req.body);
  const existing = await prisma.goal.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Mục tiêu');
  if (existing.status === 'CANCELLED') throw new AppError(409, 'GOAL_CANCELLED', 'Không thể đóng góp vào mục tiêu đã hủy.');
  const currentAmount = Number(existing.currentAmount) + input.amount;
  if (currentAmount < 0) throw new AppError(422, 'NEGATIVE_GOAL_BALANCE', 'Số tiền mục tiêu không thể âm.');
  const goal = await prisma.$transaction(async (tx) => {
    await tx.goalContribution.create({ data: { goalId: id, ...input } });
    return tx.goal.update({ where: { id }, data: { currentAmount: { increment: input.amount }, status: currentAmount >= Number(existing.targetAmount) ? 'COMPLETED' : 'ACTIVE' }, include: { contributions: { orderBy: { createdAt: 'desc' } }, wallet: true } });
  }, { isolationLevel: 'Serializable' });
  return success(res, decorate(goal), 'Cập nhật tiến độ mục tiêu thành công.', 201);
}));

goalRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.goal.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Mục tiêu');
  await prisma.goal.update({ where: { id }, data: { deletedAt: new Date() } });
  return success(res, null, 'Đã chuyển mục tiêu vào thùng rác.');
}));

goalRouter.post('/:id/pause', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  if (!await prisma.goal.findFirst({ where: { id, userId: req.user!.id } })) throw notFound('Mục tiêu');
  return success(res, await prisma.goal.update({ where: { id }, data: { pausedAt: new Date() } }), 'Đã tạm dừng mục tiêu.');
}));

goalRouter.post('/:id/resume', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  if (!await prisma.goal.findFirst({ where: { id, userId: req.user!.id } })) throw notFound('Mục tiêu');
  return success(res, await prisma.goal.update({ where: { id }, data: { pausedAt: null, status: 'ACTIVE' } }), 'Đã tiếp tục mục tiêu.');
}));
