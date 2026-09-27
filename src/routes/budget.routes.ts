import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { money, uuid } from '../lib/validation';
import { authenticate } from '../middleware/auth';

export const budgetRouter = Router();
budgetRouter.use(authenticate);

const budgetFields = z.object({
  name: z.string().trim().min(1).max(100),
  categoryId: uuid.nullable().optional(),
  amount: money,
  startDate: z.string().date().transform((value) => new Date(`${value}T00:00:00.000Z`)),
  endDate: z.string().date().transform((value) => new Date(`${value}T23:59:59.999Z`))
});
const inputSchema = budgetFields.refine((value) => value.endDate >= value.startDate, { path: ['endDate'], message: 'Ngày kết thúc phải sau ngày bắt đầu.' });

async function validateCategory(userId: string, categoryId?: string | null) {
  if (!categoryId) return;
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) throw notFound('Danh mục');
  if (category.type !== 'EXPENSE') throw new AppError(422, 'INVALID_BUDGET_CATEGORY', 'Ngân sách chỉ áp dụng cho danh mục chi.');
}

async function withProgress(userId: string, budget: { id: string; categoryId: string | null; amount: unknown; startDate: Date; endDate: Date }) {
  const result = await prisma.transaction.aggregate({
    where: { userId, type: 'EXPENSE', occurredAt: { gte: budget.startDate, lte: budget.endDate }, ...(budget.categoryId ? { categoryId: budget.categoryId } : {}) },
    _sum: { amount: true }
  });
  const spent = Number(result._sum.amount ?? 0);
  const amount = Number(budget.amount);
  return { ...budget, spent, remaining: amount - spent, percentUsed: amount ? Math.round((spent / amount) * 10_000) / 100 : 0 };
}

budgetRouter.get('/', asyncHandler(async (req, res) => {
  const budgets = await prisma.budget.findMany({ where: { userId: req.user!.id }, orderBy: { startDate: 'desc' }, include: { category: { select: { id: true, name: true } } } });
  return success(res, await Promise.all(budgets.map((item) => withProgress(req.user!.id, item))));
}));

budgetRouter.post('/', asyncHandler(async (req, res) => {
  const input = inputSchema.parse(req.body);
  await validateCategory(req.user!.id, input.categoryId);
  const budget = await prisma.budget.create({ data: { ...input, userId: req.user!.id }, include: { category: true } });
  return success(res, await withProgress(req.user!.id, budget), 'Tạo ngân sách thành công.', 201);
}));

budgetRouter.get('/:id', asyncHandler(async (req, res) => {
  const budget = await prisma.budget.findFirst({ where: { id: uuid.parse(req.params.id), userId: req.user!.id }, include: { category: true } });
  if (!budget) throw notFound('Ngân sách');
  return success(res, await withProgress(req.user!.id, budget));
}));

budgetRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.budget.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Ngân sách');
  const input = budgetFields.partial().refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.').parse(req.body);
  const merged = { ...existing, ...input };
  if (merged.endDate < merged.startDate) throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày kết thúc phải sau ngày bắt đầu.');
  await validateCategory(req.user!.id, merged.categoryId);
  const budget = await prisma.budget.update({ where: { id }, data: input, include: { category: true } });
  return success(res, await withProgress(req.user!.id, budget), 'Cập nhật ngân sách thành công.');
}));

budgetRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const result = await prisma.budget.deleteMany({ where: { id, userId: req.user!.id } });
  if (!result.count) throw notFound('Ngân sách');
  return success(res, null, 'Xóa ngân sách thành công.');
}));
