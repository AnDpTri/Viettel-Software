import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { buildCategoryTree, wouldCreateCycle } from '../lib/category-tree';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { uuid } from '../lib/validation';
import { authenticate } from '../middleware/auth';

export const categoryRouter = Router();
categoryRouter.use(authenticate);

const categoryInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['INCOME', 'EXPENSE']),
  parentId: uuid.nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional()
});

async function validateParent(userId: string, parentId: string | null | undefined, type: 'INCOME' | 'EXPENSE') {
  if (!parentId) return;
  const parent = await prisma.category.findFirst({ where: { id: parentId, userId } });
  if (!parent) throw notFound('Danh mục cha');
  if (parent.type !== type) throw new AppError(422, 'CATEGORY_TYPE_MISMATCH', 'Danh mục cha và con phải cùng loại.');
}

categoryRouter.get('/', asyncHandler(async (req, res) => {
  const type = z.enum(['INCOME', 'EXPENSE']).optional().parse(req.query.type);
  const items = await prisma.category.findMany({ where: { userId: req.user!.id, ...(type ? { type } : {}) }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
  return success(res, req.query.tree === 'false' ? items : buildCategoryTree(items));
}));

categoryRouter.post('/', asyncHandler(async (req, res) => {
  const input = categoryInput.parse(req.body);
  await validateParent(req.user!.id, input.parentId, input.type);
  const category = await prisma.category.create({ data: { ...input, userId: req.user!.id } });
  return success(res, category, 'Tạo danh mục thành công.', 201);
}));

categoryRouter.get('/:id', asyncHandler(async (req, res) => {
  const category = await prisma.category.findFirst({ where: { id: uuid.parse(req.params.id), userId: req.user!.id }, include: { children: true } });
  if (!category) throw notFound('Danh mục');
  return success(res, category);
}));

categoryRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.category.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Danh mục');
  const input = categoryInput.partial().refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.').parse(req.body);
  const nextType = input.type ?? existing.type;
  if (nextType === 'TRANSFER') throw new AppError(422, 'INVALID_CATEGORY_TYPE', 'Danh mục chỉ hỗ trợ thu hoặc chi.');
  await validateParent(req.user!.id, input.parentId, nextType);
  const all = await prisma.category.findMany({ where: { userId: req.user!.id }, select: { id: true, parentId: true } });
  if (input.parentId !== undefined && wouldCreateCycle(all, id, input.parentId)) throw new AppError(422, 'CATEGORY_CYCLE', 'Cấu trúc danh mục tạo thành vòng lặp.');
  if (input.type && input.type !== existing.type) {
    const [childCount, transactionCount] = await Promise.all([
      prisma.category.count({ where: { parentId: id } }), prisma.transaction.count({ where: { categoryId: id } })
    ]);
    if (childCount || transactionCount) throw new AppError(409, 'CATEGORY_IN_USE', 'Không thể đổi loại danh mục đang có danh mục con hoặc giao dịch.');
  }
  const category = await prisma.category.update({ where: { id }, data: input });
  return success(res, category, 'Cập nhật danh mục thành công.');
}));

categoryRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.category.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Danh mục');
  const [childCount, transactionCount, budgetCount] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.transaction.count({ where: { categoryId: id } }),
    prisma.budget.count({ where: { categoryId: id } })
  ]);
  if (childCount || transactionCount || budgetCount) throw new AppError(409, 'CATEGORY_IN_USE', 'Không thể xóa danh mục đang được sử dụng.');
  await prisma.category.delete({ where: { id } });
  return success(res, null, 'Xóa danh mục thành công.');
}));
