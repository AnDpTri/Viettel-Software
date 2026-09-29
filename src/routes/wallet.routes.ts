import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../core/http/async-handler';
import { notFound } from '../core/errors/app-error';
import { prisma } from '../core/database/prisma';
import { success } from '../core/http/response';
import { uuid } from '../core/http/validation';
import { calculateWalletBalance } from '../shared/wallet-balance';
import { documentRoutes, named } from '../docs/route-docs';
import { authenticate } from '../core/security/authenticate';

export const walletRouter = Router();
walletRouter.use(authenticate);

const walletInput = named(
  'WalletInput',
  z.object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(['CASH', 'BANK', 'E_WALLET', 'CREDIT', 'OTHER']).default('CASH'),
    currency: z
      .string()
      .length(3)
      .transform((value) => value.toUpperCase())
      .default('VND'),
    openingBalance: z.coerce.number().min(-999_999_999_999).max(999_999_999_999).default(0),
    icon: z.string().max(50).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
    sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
    institutionName: z.string().trim().max(120).nullable().optional(),
    creditLimit: z.coerce.number().positive().nullable().optional(),
    billingDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
    dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
    includeInNetWorth: z.boolean().default(true),
    householdId: uuid.nullable().optional()
  })
);
const walletListQuery = z.object({
  includeArchived: z.enum(['true', 'false']).optional().openapi({ description: 'true: gồm cả ví đã lưu trữ' })
});

async function balanceForWallet(userId: string, wallet: { id: string; openingBalance: unknown }) {
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      status: { not: 'CANCELLED' },
      OR: [{ walletId: wallet.id }, { destinationWalletId: wallet.id }]
    },
    select: { type: true, amount: true, walletId: true, destinationWalletId: true }
  });
  return calculateWalletBalance(wallet.id, Number(wallet.openingBalance), transactions);
}

walletRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeArchived = req.query.includeArchived === 'true';
    const wallets = await prisma.wallet.findMany({
      where: { userId: req.user!.id, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    const data = await Promise.all(
      wallets.map(async (wallet) => ({ ...wallet, balance: await balanceForWallet(req.user!.id, wallet) }))
    );
    return success(res, data);
  })
);

walletRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = walletInput.parse(req.body);
    const wallet = await prisma.wallet.create({ data: { ...input, userId: req.user!.id } });
    return success(res, { ...wallet, balance: Number(wallet.openingBalance) }, 'Tạo ví thành công.', 201);
  })
);

walletRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const wallet = await prisma.wallet.findFirst({ where: { id, userId: req.user!.id } });
    if (!wallet) throw notFound('Ví');
    return success(res, { ...wallet, balance: await balanceForWallet(req.user!.id, wallet) });
  })
);

walletRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const existing = await prisma.wallet.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw notFound('Ví');
    const input = walletInput
      .partial()
      .refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.')
      .parse(req.body);
    const wallet = await prisma.wallet.update({ where: { id }, data: input });
    return success(
      res,
      { ...wallet, balance: await balanceForWallet(req.user!.id, wallet) },
      'Cập nhật ví thành công.'
    );
  })
);

walletRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const existing = await prisma.wallet.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw notFound('Ví');
    await prisma.wallet.update({ where: { id }, data: { archivedAt: new Date() } });
    return success(res, null, 'Đã lưu trữ ví.');
  })
);

walletRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const existing = await prisma.wallet.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw notFound('Ví');
    const wallet = await prisma.wallet.update({ where: { id }, data: { archivedAt: null } });
    return success(res, wallet, 'Khôi phục ví thành công.');
  })
);

documentRoutes(walletRouter, {
  'GET /': { summary: 'Danh sách ví kèm số dư tính từ giao dịch', query: walletListQuery },
  'POST /': { summary: 'Tạo ví', body: walletInput, status: 201 },
  'GET /:id': { summary: 'Chi tiết ví và số dư hiện tại' },
  'PATCH /:id': { summary: 'Sửa ví (gửi trường cần đổi)', body: walletInput.partial() },
  'DELETE /:id': { summary: 'Lưu trữ ví (xóa mềm, giữ lịch sử giao dịch)' },
  'POST /:id/restore': { summary: 'Khôi phục ví đã lưu trữ' }
});
