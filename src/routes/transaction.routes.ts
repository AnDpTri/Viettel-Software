import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { Prisma, TransactionType } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config';
import { asyncHandler } from '../lib/async-handler';
import { toCsv } from '../lib/csv';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { pageMeta, success } from '../lib/response';
import { dateString, money, paging, uuid } from '../lib/validation';
import { authenticate } from '../middleware/auth';

export const transactionRouter = Router();
transactionRouter.use(authenticate);

const uploadDirectory = path.resolve(process.cwd(), 'uploads');
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype))
});

const inputSchema = z.object({
  walletId: uuid,
  destinationWalletId: uuid.nullable().optional(),
  categoryId: uuid.nullable().optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  amount: money,
  occurredAt: dateString.transform((value) => new Date(value)),
  note: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED', 'CANCELLED']).default('CLEARED'),
  payee: z.string().trim().max(160).nullable().optional(),
  location: z.string().trim().max(255).nullable().optional(),
  paymentMethod: z.string().trim().max(50).nullable().optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  merchantId: uuid.nullable().optional(),
  tagIds: z.array(uuid).max(20).optional()
});

async function validateReferences(userId: string, input: { walletId: string; destinationWalletId?: string | null; categoryId?: string | null; type: TransactionType }) {
  const wallet = await prisma.wallet.findFirst({ where: { id: input.walletId, userId, archivedAt: null } });
  if (!wallet) throw notFound('Ví nguồn');
  if (input.type === 'TRANSFER') {
    if (!input.destinationWalletId || input.destinationWalletId === input.walletId) throw new AppError(422, 'INVALID_TRANSFER', 'Chuyển khoản cần ví đích khác ví nguồn.');
    const destination = await prisma.wallet.findFirst({ where: { id: input.destinationWalletId, userId, archivedAt: null } });
    if (!destination) throw notFound('Ví đích');
    if (destination.currency !== wallet.currency) throw new AppError(422, 'CURRENCY_MISMATCH', 'Hai ví chuyển khoản phải cùng đơn vị tiền tệ.');
  } else if (input.destinationWalletId) {
    throw new AppError(422, 'INVALID_DESTINATION', 'Ví đích chỉ áp dụng cho giao dịch chuyển khoản.');
  }
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
    if (!category) throw notFound('Danh mục');
    if (input.type === 'TRANSFER' || category.type !== input.type) throw new AppError(422, 'CATEGORY_TYPE_MISMATCH', 'Danh mục không phù hợp loại giao dịch.');
  }
}

function transactionDateBoundary(value: string, endOfDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
}

function transactionWhere(userId: string, query: Record<string, unknown>): Prisma.TransactionWhereInput {
  const filter = z.object({
    walletId: uuid.optional(), categoryId: uuid.optional(), type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
    from: dateString.optional(), to: dateString.optional(), keyword: z.string().max(100).optional()
  }).parse(query);
  const from = filter.from ? transactionDateBoundary(filter.from, false) : undefined;
  const to = filter.to ? transactionDateBoundary(filter.to, true) : undefined;
  if (from && to && from > to) throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  return {
    userId,
    deletedAt: null,
    ...(filter.walletId ? { OR: [{ walletId: filter.walletId }, { destinationWalletId: filter.walletId }] } : {}),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(filter.keyword ? { AND: [{ OR: [
      { note: { contains: filter.keyword, mode: 'insensitive' } },
      { payee: { contains: filter.keyword, mode: 'insensitive' } },
      { reference: { contains: filter.keyword, mode: 'insensitive' } }
    ] }] } : {})
  };
}

transactionRouter.get('/export.csv', asyncHandler(async (req, res) => {
  const rows = await prisma.transaction.findMany({
    where: transactionWhere(req.user!.id, req.query), orderBy: { occurredAt: 'desc' },
    include: { wallet: { select: { name: true } }, destinationWallet: { select: { name: true } }, category: { select: { name: true } } }
  });
  const csv = toCsv(rows.map((item) => ({
    occurredAt: item.occurredAt.toISOString(), type: item.type, amount: item.amount.toString(), wallet: item.wallet.name,
    destinationWallet: item.destinationWallet?.name ?? '', category: item.category?.name ?? '', note: item.note ?? ''
  })), { occurredAt: 'Thời gian', type: 'Loại', amount: 'Số tiền', wallet: 'Ví nguồn', destinationWallet: 'Ví đích', category: 'Danh mục', note: 'Ghi chú' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  return res.send(csv);
}));

transactionRouter.get('/', asyncHandler(async (req, res) => {
  const { page, limit } = paging(req.query);
  const where = transactionWhere(req.user!.id, req.query);
  const [items, total] = await prisma.$transaction([
    prisma.transaction.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], include: { wallet: { select: { id: true, name: true, currency: true } }, destinationWallet: { select: { id: true, name: true, currency: true } }, category: { select: { id: true, name: true } }, receipts: true, tags: true, splits: true, merchant: true } }),
    prisma.transaction.count({ where })
  ]);
  return success(res, items, 'Thành công.', 200, pageMeta(page, limit, total));
}));

transactionRouter.post('/', asyncHandler(async (req, res) => {
  const input = inputSchema.parse(req.body);
  await validateReferences(req.user!.id, input);
  const { tagIds, ...data } = input;
  const idempotencyKey = req.get('idempotency-key')?.slice(0, 100);
  if (idempotencyKey) {
    const existing = await prisma.transaction.findFirst({ where: { userId: req.user!.id, idempotencyKey } });
    if (existing) return success(res, existing, 'Yêu cầu đã được xử lý trước đó.');
  }
  const transaction = await prisma.transaction.create({ data: { ...data, userId: req.user!.id, idempotencyKey, tags: tagIds?.length ? { connect: tagIds.map((id) => ({ id })) } : undefined }, include: { wallet: true, destinationWallet: true, category: true, tags: true } });
  return success(res, transaction, 'Ghi giao dịch thành công.', 201);
}));

transactionRouter.get('/trash/list', asyncHandler(async (req, res) => {
  const items = await prisma.transaction.findMany({ where: { userId: req.user!.id, deletedAt: { not: null } }, include: { wallet: true, category: true, tags: true }, orderBy: { deletedAt: 'desc' } });
  return success(res, items);
}));

transactionRouter.post('/bulk', asyncHandler(async (req, res) => {
  const input = z.object({ ids: z.array(uuid).min(1).max(500), action: z.enum(['DELETE', 'RESTORE', 'RECONCILE']), categoryId: uuid.nullable().optional() }).parse(req.body);
  const data = input.action === 'DELETE' ? { deletedAt: new Date() } : input.action === 'RESTORE' ? { deletedAt: null } : { status: 'RECONCILED' as const };
  const result = await prisma.transaction.updateMany({ where: { id: { in: input.ids }, userId: req.user!.id }, data: { ...data, ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}) } });
  return success(res, { updated: result.count }, 'Đã cập nhật hàng loạt.');
}));

transactionRouter.post('/import', asyncHandler(async (req, res) => {
  const rows = z.array(inputSchema).min(1).max(2000).parse(req.body.rows);
  for (const row of rows) await validateReferences(req.user!.id, row);
  const result = await prisma.$transaction(rows.map((row) => {
    const { tagIds, ...data } = row;
    return prisma.transaction.create({ data: { ...data, userId: req.user!.id, tags: tagIds?.length ? { connect: tagIds.map((id) => ({ id })) } : undefined } });
  }));
  return success(res, { imported: result.length }, 'Nhập giao dịch thành công.', 201);
}));

transactionRouter.get('/:id', asyncHandler(async (req, res) => {
  const transaction = await prisma.transaction.findFirst({ where: { id: uuid.parse(req.params.id), userId: req.user!.id }, include: { wallet: true, destinationWallet: true, category: true, receipts: true, tags: true, splits: true, merchant: true } });
  if (!transaction) throw notFound('Giao dịch');
  return success(res, transaction);
}));

transactionRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.transaction.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Giao dịch');
  const input = inputSchema.partial().refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.').parse(req.body);
  const merged = { ...existing, ...input };
  await validateReferences(req.user!.id, merged);
  const { tagIds, ...data } = input;
  const transaction = await prisma.transaction.update({ where: { id }, data: { ...data, ...(tagIds ? { tags: { set: tagIds.map((tagId) => ({ id: tagId })) } } : {}) }, include: { wallet: true, destinationWallet: true, category: true, receipts: true, tags: true, splits: true } });
  return success(res, transaction, 'Cập nhật giao dịch thành công.');
}));

transactionRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.transaction.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Giao dịch');
  await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  return success(res, null, 'Đã chuyển giao dịch vào thùng rác.');
}));

transactionRouter.post('/:id/restore', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.transaction.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Giao dịch');
  return success(res, await prisma.transaction.update({ where: { id }, data: { deletedAt: null } }), 'Đã khôi phục giao dịch.');
}));

transactionRouter.put('/:id/splits', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const transaction = await prisma.transaction.findFirst({ where: { id, userId: req.user!.id, deletedAt: null } });
  if (!transaction) throw notFound('Giao dịch');
  const splits = z.array(z.object({ categoryId: uuid.nullable().optional(), amount: money, note: z.string().max(255).nullable().optional() })).min(2).max(50).parse(req.body.splits);
  const total = splits.reduce((sum, item) => sum + Number(item.amount), 0);
  if (Math.abs(total - Number(transaction.amount)) > 0.0001) throw new AppError(422, 'SPLIT_TOTAL_MISMATCH', 'Tổng các phần phải bằng số tiền giao dịch.');
  await prisma.$transaction([prisma.transactionSplit.deleteMany({ where: { transactionId: id } }), prisma.transactionSplit.createMany({ data: splits.map((item) => ({ transactionId: id, ...item })) })]);
  return success(res, await prisma.transactionSplit.findMany({ where: { transactionId: id } }), 'Đã chia giao dịch.');
}));

transactionRouter.post('/:id/receipts', upload.single('file'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const transaction = await prisma.transaction.findFirst({ where: { id, userId: req.user!.id } });
  if (!transaction) {
    if (req.file) await unlink(req.file.path).catch(() => undefined);
    throw notFound('Giao dịch');
  }
  if (!req.file) throw new AppError(422, 'FILE_REQUIRED', 'Vui lòng chọn tệp JPG, PNG hoặc PDF.');
  const receipt = await prisma.receipt.create({ data: { transactionId: id, originalName: req.file.originalname, storedName: req.file.filename, mimeType: req.file.mimetype, size: req.file.size } });
  return success(res, receipt, 'Tải hóa đơn thành công.', 201);
}));

transactionRouter.get('/:transactionId/receipts/:receiptId', asyncHandler(async (req, res) => {
  const transactionId = uuid.parse(req.params.transactionId);
  const receiptId = uuid.parse(req.params.receiptId);
  const receipt = await prisma.receipt.findFirst({ where: { id: receiptId, transactionId, transaction: { userId: req.user!.id } } });
  if (!receipt) throw notFound('Hóa đơn');
  return res.download(path.join(uploadDirectory, receipt.storedName), receipt.originalName);
}));

transactionRouter.delete('/:transactionId/receipts/:receiptId', asyncHandler(async (req, res) => {
  const transactionId = uuid.parse(req.params.transactionId);
  const receiptId = uuid.parse(req.params.receiptId);
  const receipt = await prisma.receipt.findFirst({ where: { id: receiptId, transactionId, transaction: { userId: req.user!.id } } });
  if (!receipt) throw notFound('Hóa đơn');
  await prisma.receipt.delete({ where: { id: receiptId } });
  await unlink(path.join(uploadDirectory, receipt.storedName)).catch(() => undefined);
  return success(res, null, 'Xóa hóa đơn thành công.');
}));
