import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { dateString } from '../lib/validation';
import { calculateWalletBalance } from '../lib/wallet-balance';
import { authenticate } from '../middleware/auth';

export const reportRouter = Router();
reportRouter.use(authenticate);

function period(query: Record<string, unknown>) {
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const input = z.object({ from: dateString.optional(), to: dateString.optional() }).parse(query);
  return { from: input.from ? new Date(input.from) : defaultFrom, to: input.to ? new Date(input.to) : now };
}

reportRouter.get('/summary', asyncHandler(async (req, res) => {
  const { from, to } = period(req.query);
  const [user, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { currency: true } }),
    prisma.transaction.findMany({
      where: { userId: req.user!.id, occurredAt: { gte: from, lte: to }, type: { in: ['INCOME', 'EXPENSE'] } },
      include: { category: { select: { id: true, name: true } }, wallet: { select: { currency: true } } }, orderBy: { occurredAt: 'asc' }
    })
  ]);
  const currencyMap = new Map<string, { currency: string; income: number; expense: number; net: number }>();
  for (const item of transactions) {
    const current = currencyMap.get(item.wallet.currency) ?? { currency: item.wallet.currency, income: 0, expense: 0, net: 0 };
    current[item.type === 'INCOME' ? 'income' : 'expense'] += Number(item.amount);
    current.net = current.income - current.expense;
    currencyMap.set(item.wallet.currency, current);
  }
  const base = currencyMap.get(user.currency) ?? { currency: user.currency, income: 0, expense: 0, net: 0 };
  const categoryMap = new Map<string, { categoryId: string | null; categoryName: string; currency: string; amount: number }>();
  const monthlyMap = new Map<string, { month: string; income: number; expense: number }>();
  for (const item of transactions) {
    if (item.type === 'EXPENSE') {
      const key = `${item.wallet.currency}:${item.categoryId ?? 'uncategorized'}`;
      const current = categoryMap.get(key) ?? { categoryId: item.categoryId, categoryName: item.category?.name ?? 'Chưa phân loại', currency: item.wallet.currency, amount: 0 };
      current.amount += Number(item.amount);
      categoryMap.set(key, current);
    }
    if (item.wallet.currency !== user.currency) continue;
    const month = item.occurredAt.toISOString().slice(0, 7);
    const monthly = monthlyMap.get(month) ?? { month, income: 0, expense: 0 };
    monthly[item.type === 'INCOME' ? 'income' : 'expense'] += Number(item.amount);
    monthlyMap.set(month, monthly);
  }
  return success(res, {
    period: { from, to }, currency: user.currency, income: base.income, expense: base.expense, net: base.net,
    byCurrency: [...currencyMap.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    expenseByCategory: [...categoryMap.values()].sort((a, b) => b.amount - a.amount), monthly: [...monthlyMap.values()]
  });
}));

reportRouter.get('/reconciliation', asyncHandler(async (req, res) => {
  const wallets = await prisma.wallet.findMany({ where: { userId: req.user!.id }, orderBy: { name: 'asc' } });
  const transactions = await prisma.transaction.findMany({ where: { userId: req.user!.id }, select: { walletId: true, destinationWalletId: true, type: true, amount: true } });
  const rows = wallets.map((wallet) => ({
    walletId: wallet.id,
    walletName: wallet.name,
    currency: wallet.currency,
    openingBalance: Number(wallet.openingBalance),
    calculatedBalance: calculateWalletBalance(wallet.id, Number(wallet.openingBalance), transactions),
    archived: Boolean(wallet.archivedAt)
  }));
  const totals = rows.reduce<Record<string, number>>((result, row) => {
    result[row.currency] = (result[row.currency] ?? 0) + row.calculatedBalance;
    return result;
  }, {});
  return success(res, { generatedAt: new Date(), wallets: rows, totals });
}));
