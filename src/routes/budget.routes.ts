import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../core/http/async-handler';
import { AppError, notFound } from '../core/errors/app-error';
import { prisma } from '../core/database/prisma';
import { success } from '../core/http/response';
import { money, uuid } from '../core/http/validation';
import { documentRoutes, named } from '../docs/route-docs';
import { authenticate } from '../core/security/authenticate';
import { nextOccurrence } from '../shared/recurrence';

export const budgetRouter = Router();
budgetRouter.use(authenticate);

const budgetFields = z.object({
  name: z.string().trim().min(1).max(100),
  categoryId: uuid.nullable().optional(),
  amount: money,
  startDate: z
    .string()
    .date()
    .transform((value) => new Date(`${value}T00:00:00.000Z`)),
  endDate: z
    .string()
    .date()
    .transform((value) => new Date(`${value}T23:59:59.999Z`)),
  recurrence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional(),
  rollover: z.boolean().default(false),
  alertThresholds: z.array(z.number().int().min(1).max(200)).max(10).default([50, 80, 100])
});
const inputSchema = named(
  'BudgetInput',
  budgetFields.refine((value) => value.endDate >= value.startDate, {
    path: ['endDate'],
    message: 'Ngày kết thúc phải sau ngày bắt đầu.'
  })
);

async function validateCategory(userId: string, categoryId?: string | null) {
  if (!categoryId) return;
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) throw notFound('Danh mục');
  if (category.type !== 'EXPENSE')
    throw new AppError(422, 'INVALID_BUDGET_CATEGORY', 'Ngân sách chỉ áp dụng cho danh mục chi.');
}

async function withProgress(
  userId: string,
  budget: { id: string; categoryId: string | null; amount: unknown; startDate: Date; endDate: Date },
  currency: string
) {
  const result = await prisma.transaction.aggregate({
    where: {
      userId,
      deletedAt: null,
      status: { not: 'CANCELLED' },
      type: 'EXPENSE',
      wallet: { currency },
      occurredAt: { gte: budget.startDate, lte: budget.endDate },
      ...(budget.categoryId ? { categoryId: budget.categoryId } : {})
    },
    _sum: { amount: true }
  });
  const spent = Number(result._sum.amount ?? 0);
  const amount = Number(budget.amount);
  return {
    ...budget,
    currency,
    spent,
    remaining: amount - spent,
    percentUsed: amount ? Math.round((spent / amount) * 10_000) / 100 : 0
  };
}

async function getUserCurrency(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } })).currency;
}

budgetRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [budgets, currency] = await Promise.all([
      prisma.budget.findMany({
        where: { userId: req.user!.id, deletedAt: null },
        orderBy: { startDate: 'desc' },
        include: { category: { select: { id: true, name: true } } }
      }),
      getUserCurrency(req.user!.id)
    ]);
    return success(res, await Promise.all(budgets.map((item) => withProgress(req.user!.id, item, currency))));
  })
);

budgetRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = inputSchema.parse(req.body);
    await validateCategory(req.user!.id, input.categoryId);
    const budget = await prisma.budget.create({
      data: { ...input, userId: req.user!.id },
      include: { category: true }
    });
    return success(
      res,
      await withProgress(req.user!.id, budget, await getUserCurrency(req.user!.id)),
      'Tạo ngân sách thành công.',
      201
    );
  })
);

budgetRouter.post(
  '/rollover',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const expired = await prisma.budget.findMany({
      where: { userId: req.user!.id, deletedAt: null, recurrence: { not: null }, endDate: { lt: now } }
    });
    let created = 0;
    for (const budget of expired) {
      const nextStart = nextOccurrence(budget.startDate, budget.recurrence!);
      const nextEnd = nextOccurrence(budget.endDate, budget.recurrence!);
      const exists = await prisma.budget.findFirst({
        where: { userId: req.user!.id, name: budget.name, startDate: nextStart, endDate: nextEnd, deletedAt: null }
      });
      if (exists) continue;
      const spent = await prisma.transaction.aggregate({
        where: {
          userId: req.user!.id,
          deletedAt: null,
          type: 'EXPENSE',
          occurredAt: { gte: budget.startDate, lte: budget.endDate },
          ...(budget.categoryId ? { categoryId: budget.categoryId } : {})
        },
        _sum: { amount: true }
      });
      const remainder = Number(budget.amount) - Number(spent._sum.amount ?? 0);
      await prisma.budget.create({
        data: {
          userId: req.user!.id,
          name: budget.name,
          categoryId: budget.categoryId,
          amount: Number(budget.amount) + (budget.rollover ? remainder : 0),
          startDate: nextStart,
          endDate: nextEnd,
          recurrence: budget.recurrence,
          rollover: budget.rollover,
          alertThresholds: budget.alertThresholds ?? undefined
        }
      });
      created += 1;
    }
    return success(res, { created }, 'Đã tạo các kỳ ngân sách tiếp theo.');
  })
);

budgetRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const budget = await prisma.budget.findFirst({
      where: { id: uuid.parse(req.params.id), userId: req.user!.id },
      include: { category: true }
    });
    if (!budget) throw notFound('Ngân sách');
    return success(res, await withProgress(req.user!.id, budget, await getUserCurrency(req.user!.id)));
  })
);

budgetRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const existing = await prisma.budget.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw notFound('Ngân sách');
    const input = budgetFields
      .partial()
      .refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.')
      .parse(req.body);
    const merged = { ...existing, ...input };
    if (merged.endDate < merged.startDate)
      throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày kết thúc phải sau ngày bắt đầu.');
    await validateCategory(req.user!.id, merged.categoryId);
    const budget = await prisma.budget.update({ where: { id }, data: input, include: { category: true } });
    return success(
      res,
      await withProgress(req.user!.id, budget, await getUserCurrency(req.user!.id)),
      'Cập nhật ngân sách thành công.'
    );
  })
);

budgetRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const existing = await prisma.budget.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw notFound('Ngân sách');
    await prisma.budget.update({ where: { id }, data: { deletedAt: new Date() } });
    return success(res, null, 'Đã chuyển ngân sách vào thùng rác.');
  })
);

documentRoutes(budgetRouter, {
  'GET /': { summary: 'Danh sách ngân sách kèm đã chi, còn lại và phần trăm sử dụng' },
  'POST /': {
    summary: 'Tạo ngân sách cho toàn bộ chi tiêu hoặc một danh mục chi',
    body: inputSchema,
    status: 201,
    errors: { 422: 'VALIDATION_ERROR / INVALID_BUDGET_CATEGORY – dữ liệu sai hoặc danh mục không phải danh mục chi.' }
  },
  'POST /rollover': { summary: 'Tạo kỳ tiếp theo cho các ngân sách lặp lại đã hết hạn' },
  'GET /:id': { summary: 'Chi tiết ngân sách và tiến độ' },
  'PATCH /:id': { summary: 'Sửa ngân sách', body: budgetFields.partial() },
  'DELETE /:id': { summary: 'Xóa ngân sách (xóa mềm)' }
});
