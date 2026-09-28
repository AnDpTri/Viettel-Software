import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { uuid } from '../lib/validation';
import { calculateWalletBalance } from '../lib/wallet-balance';
import { authenticate } from '../middleware/auth';

export const walletRouter = Router();
walletRouter.use(authenticate);

const walletInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['CASH', 'BANK', 'E_WALLET', 'CREDIT', 'OTHER']).default('CASH'),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).default('VND'),
  openingBalance: z.coerce.number().min(-999_999_999_999).max(999_999_999_999).default(0),
  icon: z.string().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  institutionName: z.string().trim().max(120).nullable().optional(),
  creditLimit: z.coerce.number().positive().nullable().optional(),
  billingDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  includeInNetWorth: z.boolean().default(true),
  householdId: uuid.nullable().optional()
});

async function balanceForWallet(userId: string, wallet: { id: string; openingBalance: unknown }) {
  const transactions = await prisma.transaction.findMany({
    where: { userId, deletedAt: null, status: { not: 'CANCELLED' }, OR: [{ walletId: wallet.id }, { destinationWalletId: wallet.id }] },
    select: { type: true, amount: true, walletId: true, destinationWalletId: true }
  });
  return calculateWalletBalance(wallet.id, Number(wallet.openingBalance), transactions);
}

walletRouter.get('/', asyncHandler(async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const wallets = await prisma.wallet.findMany({ where: { userId: req.user!.id, ...(includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const data = await Promise.all(wallets.map(async (wallet) => ({ ...wallet, balance: await balanceForWallet(req.user!.id, wallet) })));
  return success(res, data);
}));

walletRouter.post('/', asyncHandler(async (req, res) => {
  const input = walletInput.parse(req.body);
  const wallet = await prisma.wallet.create({ data: { ...input, userId: req.user!.id } });
  return success(res, { ...wallet, balance: Number(wallet.openingBalance) }, 'Tạo ví thành công.', 201);
}));

walletRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const wallet = await prisma.wallet.findFirst({ where: { id, userId: req.user!.id } });
  if (!wallet) throw notFound('Ví');
  return success(res, { ...wallet, balance: await balanceForWallet(req.user!.id, wallet) });
}));

walletRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.wallet.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Ví');
  const input = walletInput.partial().refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.').parse(req.body);
  const wallet = await prisma.wallet.update({ where: { id }, data: input });
  return success(res, { ...wallet, balance: await balanceForWallet(req.user!.id, wallet) }, 'Cập nhật ví thành công.');
}));

walletRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.wallet.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Ví');
  await prisma.wallet.update({ where: { id }, data: { archivedAt: new Date() } });
  return success(res, null, 'Đã lưu trữ ví.');
}));

walletRouter.post('/:id/restore', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const existing = await prisma.wallet.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Ví');
  const wallet = await prisma.wallet.update({ where: { id }, data: { archivedAt: null } });
  return success(res, wallet, 'Khôi phục ví thành công.');
}));
