import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { buildCategoryTree, wouldCreateCycle } from '../lib/category-tree';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { uuid } from '../lib/validation';
import { documentRoutes, named } from '../docs/route-docs';
import { authenticate } from '../middleware/auth';

export const categoryRouter = Router();
categoryRouter.use(authenticate);

const categoryInput = named('CategoryInput', z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['INCOME', 'EXPENSE']),
  parentId: uuid.nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0)
}));
const categoryListQuery = z.object({ type: z.enum(['INCOME', 'EXPENSE']).optional(), tree: z.enum(['true', 'false']).optional().openapi({ description: 'Mặc định true: trả dạng cây cha-con; false: danh sách phẳng' }), includeArchived: z.enum(['true', 'false']).optional() });
const mergeInput = z.object({ targetId: uuid.openapi({ description: 'Danh mục nhận toàn bộ giao dịch, ngân sách và danh mục con' }) });

async function validateParent(userId: string, parentId: string | null | undefined, type: 'INCOME' | 'EXPENSE') {
  if (!parentId) return;
  const parent = await prisma.category.findFirst({ where: { id: parentId, userId } });
  if (!parent) throw notFound('Danh mục cha');
  if (parent.type !== type) throw new AppError(422, 'CATEGORY_TYPE_MISMATCH', 'Danh mục cha và con phải cùng loại.');
}

categoryRouter.get('/', asyncHandler(async (req, res) => {
  const { type } = categoryListQuery.parse(req.query);
  const includeArchived = req.query.includeArchived === 'true';
  const items = await prisma.category.findMany({ where: { userId: req.user!.id, ...(includeArchived ? {} : { archivedAt: null }), ...(type ? { type } : {}) }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
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
  await prisma.category.update({ where: { id }, data: { archivedAt: new Date() } });
  return success(res, null, 'Đã lưu trữ danh mục.');
}));

categoryRouter.post('/:id/restore', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  if (!await prisma.category.findFirst({ where: { id, userId: req.user!.id } })) throw notFound('Danh mục');
  return success(res, await prisma.category.update({ where: { id }, data: { archivedAt: null } }), 'Đã khôi phục danh mục.');
}));

categoryRouter.post('/:id/merge', asyncHandler(async (req, res) => {
  const sourceId = uuid.parse(req.params.id);
  const { targetId } = mergeInput.parse(req.body);
  const [source, target] = await Promise.all([prisma.category.findFirst({ where: { id: sourceId, userId: req.user!.id } }), prisma.category.findFirst({ where: { id: targetId, userId: req.user!.id } })]);
  if (!source || !target) throw notFound('Danh mục');
  if (source.type !== target.type || source.id === target.id) throw new AppError(422, 'INVALID_CATEGORY_MERGE', 'Hai danh mục phải khác nhau và cùng loại.');
  await prisma.$transaction([prisma.transaction.updateMany({ where: { userId: req.user!.id, categoryId: sourceId }, data: { categoryId: targetId } }), prisma.budget.updateMany({ where: { userId: req.user!.id, categoryId: sourceId }, data: { categoryId: targetId } }), prisma.category.updateMany({ where: { userId: req.user!.id, parentId: sourceId }, data: { parentId: targetId } }), prisma.category.update({ where: { id: sourceId }, data: { archivedAt: new Date() } })]);
  return success(res, target, 'Đã gộp danh mục.');
}));

documentRoutes(categoryRouter, {
  'GET /': { summary: 'Danh mục thu chi dạng cây hoặc phẳng', query: categoryListQuery },
  'POST /': { summary: 'Tạo danh mục (có parentId để làm danh mục con)', body: categoryInput, status: 201, errors: { 409: 'DUPLICATE_RESOURCE – trùng tên danh mục.' } },
  'GET /:id': { summary: 'Chi tiết danh mục kèm danh mục con' },
  'PATCH /:id': { summary: 'Sửa danh mục', body: categoryInput.partial(), errors: { 409: 'CATEGORY_IN_USE – không đổi loại khi đã có danh mục con hoặc giao dịch.' } },
  'DELETE /:id': { summary: 'Lưu trữ danh mục' },
  'POST /:id/restore': { summary: 'Khôi phục danh mục đã lưu trữ' },
  'POST /:id/merge': { summary: 'Gộp danh mục vào một danh mục khác cùng loại', body: mergeInput }
});
