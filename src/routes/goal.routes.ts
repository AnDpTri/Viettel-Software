import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { money, uuid } from '../lib/validation';
import { documentRoutes, named } from '../docs/route-docs';
import { authenticate } from '../middleware/auth';
import { nextOccurrence } from '../lib/recurrence';

export const goalRouter = Router();
goalRouter.use(authenticate);

const inputSchema = named('GoalInput', z.object({
  name: z.string().trim().min(1).max(120),
  targetAmount: money,
  walletId: uuid.nullable().optional(),
  targetDate: z.string().date().transform((value) => new Date(`${value}T00:00:00.000Z`)).nullable().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  recurringAmount: money.nullable().optional(),
  recurringFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional()
}));
const goalListQuery = z.object({ status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional() });
const contributionInput = named('GoalContributionInput', z.object({ amount: z.coerce.number().min(-999_999_999_999).max(999_999_999_999).refine((value) => value !== 0, 'Số tiền phải khác 0.').openapi({ description: 'Số dương: góp thêm; số âm: rút bớt', example: 1000000 }), note: z.string().trim().max(255).optional(), transactionId: uuid.nullable().optional(), fromWalletId: uuid.nullable().optional().openapi({ description: 'Ví nguồn: hệ thống tạo giao dịch chuyển khoản thật sang ví của mục tiêu' }) }));

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
  const { status } = goalListQuery.parse(req.query);
  const goals = await prisma.goal.findMany({ where: { userId: req.user!.id, deletedAt: null, ...(status ? { status } : {}) }, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], include: { wallet: { select: { id: true, name: true, currency: true } } } });
  return success(res, goals.map(decorate));
}));

goalRouter.post('/', asyncHandler(async (req, res) => {
  const input = inputSchema.parse(req.body);
  await validateWallet(req.user!.id, input.walletId);
  const goal = await prisma.goal.create({ data: { ...input, userId: req.user!.id }, include: { wallet: true } });
  return success(res, decorate(goal), 'Tạo mục tiêu thành công.', 201);
}));

goalRouter.post('/run-recurring', asyncHandler(async (req, res) => {
  const now = new Date();
  const goals = await prisma.goal.findMany({ where: { userId: req.user!.id, deletedAt: null, pausedAt: null, status: 'ACTIVE', recurringAmount: { not: null }, recurringFrequency: { not: null } }, include: { contributions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  let processed = 0;
  for (const goal of goals) {
    const last = goal.contributions[0]?.createdAt ?? goal.createdAt;
    if (nextOccurrence(last, goal.recurringFrequency!) > now) continue;
    const amount = Number(goal.recurringAmount);
    const currentAmount = Number(goal.currentAmount) + amount;
    await prisma.$transaction([prisma.goalContribution.create({ data: { goalId: goal.id, amount, note: 'Đóng góp định kỳ tự động' } }), prisma.goal.update({ where: { id: goal.id }, data: { currentAmount: { increment: amount }, status: currentAmount >= Number(goal.targetAmount) ? 'COMPLETED' : 'ACTIVE' } })]);
    processed += 1;
  }
  return success(res, { processed }, 'Đã xử lý đóng góp mục tiêu định kỳ.');
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
  const input = contributionInput.parse(req.body);
  const { fromWalletId, ...contribution } = input;
  const existing = await prisma.goal.findFirst({ where: { id, userId: req.user!.id } });
  if (!existing) throw notFound('Mục tiêu');
  if (existing.status === 'CANCELLED') throw new AppError(409, 'GOAL_CANCELLED', 'Không thể đóng góp vào mục tiêu đã hủy.');
  const currentAmount = Number(existing.currentAmount) + input.amount;
  if (currentAmount < 0) throw new AppError(422, 'NEGATIVE_GOAL_BALANCE', 'Số tiền mục tiêu không thể âm.');
  // Góp từ một ví: chuyển tiền thật sang ví của mục tiêu để tiến độ khớp với số dư, không chỉ là con số ghi tay.
  let transfer: { walletId: string; destinationWalletId: string } | null = null;
  if (fromWalletId) {
    if (!existing.walletId) throw new AppError(422, 'GOAL_WALLET_REQUIRED', 'Mục tiêu chưa liên kết ví tiết kiệm nên không thể chuyển tiền vào.');
    if (fromWalletId === existing.walletId) throw new AppError(422, 'INVALID_TRANSFER', 'Ví nguồn phải khác ví của mục tiêu.');
    const [source, target] = await Promise.all([fromWalletId, existing.walletId].map((walletId) => prisma.wallet.findFirst({ where: { id: walletId, userId: req.user!.id, archivedAt: null } })));
    if (!source) throw notFound('Ví nguồn');
    if (!target) throw notFound('Ví của mục tiêu');
    if (source.currency !== target.currency) throw new AppError(422, 'CURRENCY_MISMATCH', 'Hai ví chuyển khoản phải cùng đơn vị tiền tệ.');
    transfer = input.amount > 0 ? { walletId: source.id, destinationWalletId: target.id } : { walletId: target.id, destinationWalletId: source.id };
  }
  const goal = await prisma.$transaction(async (tx) => {
    const transaction = transfer ? await tx.transaction.create({ data: { userId: req.user!.id, ...transfer, type: 'TRANSFER', amount: Math.abs(input.amount), occurredAt: new Date(), note: `${input.amount > 0 ? 'Góp vào' : 'Rút từ'} mục tiêu: ${existing.name}`, status: 'CLEARED' } }) : null;
    await tx.goalContribution.create({ data: { goalId: id, ...contribution, transactionId: transaction?.id ?? contribution.transactionId } });
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

documentRoutes(goalRouter, {
  'GET /': { summary: 'Danh sách mục tiêu kèm phần trăm hoàn thành', query: goalListQuery },
  'POST /': { summary: 'Tạo mục tiêu tiết kiệm', body: inputSchema, status: 201 },
  'POST /run-recurring': { summary: 'Ghi các khoản góp định kỳ đến hạn của mục tiêu' },
  'GET /:id': { summary: 'Chi tiết mục tiêu và lịch sử góp' },
  'PATCH /:id': { summary: 'Sửa mục tiêu', body: inputSchema.partial() },
  'POST /:id/contributions': { summary: 'Góp thêm hoặc rút bớt tiền của mục tiêu', description: 'Có fromWalletId thì tạo giao dịch chuyển khoản thật giữa ví nguồn và ví liên kết của mục tiêu (số âm thì chuyển ngược lại), để số dư ví và tiến độ luôn khớp.', body: contributionInput, status: 201, errors: { 409: 'GOAL_CANCELLED – mục tiêu đã hủy.', 422: 'GOAL_WALLET_REQUIRED / INVALID_TRANSFER / CURRENCY_MISMATCH / NEGATIVE_GOAL_BALANCE.' } },
  'DELETE /:id': { summary: 'Xóa mục tiêu (xóa mềm)' },
  'POST /:id/pause': { summary: 'Tạm dừng mục tiêu' },
  'POST /:id/resume': { summary: 'Tiếp tục mục tiêu đã tạm dừng' }
});
