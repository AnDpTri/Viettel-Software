import { Response, Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { toCsv } from '../lib/csv';
import { success } from '../lib/response';
import { dateString } from '../lib/validation';
import { calculateWalletBalance } from '../lib/wallet-balance';
import { authenticate } from '../middleware/auth';

export const reportRouter = Router();
reportRouter.use(authenticate);

/** Báo cáo trả JSON mặc định; ?format=csv trả tệp CSV UTF-8 (có BOM để Excel đọc đúng tiếng Việt). */
const wantsCsv = (query: Record<string, unknown>) => z.object({ format: z.enum(['json', 'csv']).default('json') }).parse({ format: query.format }).format === 'csv';
function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function periodBoundary(value: string, endOfDay: boolean) {
  if (!dateOnlyPattern.test(value)) return new Date(value);
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
}

export function reportPeriod(query: Record<string, unknown>, now = new Date()) {
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const input = z.object({ from: dateString.optional(), to: dateString.optional() }).parse(query);
  const from = input.from ? periodBoundary(input.from, false) : defaultFrom;
  const to = input.to ? periodBoundary(input.to, true) : defaultTo;
  if (from > to) throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  return { from, to };
}

reportRouter.get('/summary', asyncHandler(async (req, res) => {
  const { from, to } = reportPeriod(req.query);
  const [user, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { currency: true } }),
    prisma.transaction.findMany({
      where: { userId: req.user!.id, deletedAt: null, status: { not: 'CANCELLED' }, occurredAt: { gte: from, lte: to }, type: { in: ['INCOME', 'EXPENSE'] } },
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
  const byCurrency = [...currencyMap.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  const expenseByCategory = [...categoryMap.values()].sort((a, b) => b.amount - a.amount);
  if (wantsCsv(req.query)) {
    const rows = [
      ...byCurrency.map((item) => ({ section: 'Tổng hợp', label: item.currency, currency: item.currency, income: item.income, expense: item.expense, net: item.net })),
      ...[...monthlyMap.values()].map((item) => ({ section: 'Theo tháng', label: item.month, currency: user.currency, income: item.income, expense: item.expense, net: item.income - item.expense })),
      ...expenseByCategory.map((item) => ({ section: 'Chi theo danh mục', label: item.categoryName, currency: item.currency, income: '', expense: item.amount, net: '' }))
    ];
    const period = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
    return sendCsv(res, `bao-cao-tong-hop_${period}.csv`, toCsv(rows, { section: 'Phần', label: 'Mục', currency: 'Tiền tệ', income: 'Thu', expense: 'Chi', net: 'Chênh lệch' }));
  }
  return success(res, {
    period: { from, to }, currency: user.currency, income: base.income, expense: base.expense, net: base.net,
    byCurrency, expenseByCategory, monthly: [...monthlyMap.values()]
  });
}));

reportRouter.get('/reconciliation', asyncHandler(async (req, res) => {
  const wallets = await prisma.wallet.findMany({ where: { userId: req.user!.id }, orderBy: { name: 'asc' } });
  const transactions = await prisma.transaction.findMany({ where: { userId: req.user!.id, deletedAt: null, status: { not: 'CANCELLED' } }, select: { walletId: true, destinationWalletId: true, type: true, amount: true } });
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
  if (wantsCsv(req.query)) return sendCsv(res, `doi-soat-vi_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((row) => ({ ...row, archived: row.archived ? 'Có' : 'Không' })), { walletName: 'Ví', currency: 'Tiền tệ', openingBalance: 'Số dư đầu kỳ', calculatedBalance: 'Số dư tính toán', archived: 'Đã lưu trữ' }));
  return success(res, { generatedAt: new Date(), wallets: rows, totals });
}));

reportRouter.get('/net-worth', asyncHandler(async (req, res) => {
  const wallets = await prisma.wallet.findMany({ where: { userId: req.user!.id, includeInNetWorth: true }, orderBy: { name: 'asc' } });
  const transactions = await prisma.transaction.findMany({ where: { userId: req.user!.id, deletedAt: null, status: { not: 'CANCELLED' } }, select: { walletId: true, destinationWalletId: true, type: true, amount: true, occurredAt: true } });
  const byCurrency = wallets.reduce<Record<string, number>>((totals, wallet) => {
    totals[wallet.currency] = (totals[wallet.currency] ?? 0) + calculateWalletBalance(wallet.id, Number(wallet.openingBalance), transactions);
    return totals;
  }, {});
  const months = new Map<string, Record<string, number>>();
  for (const item of transactions) {
    const month = item.occurredAt.toISOString().slice(0, 7);
    const wallet = wallets.find((candidate) => candidate.id === item.walletId);
    if (!wallet || item.type === 'TRANSFER') continue;
    const row = months.get(month) ?? {};
    row[wallet.currency] = (row[wallet.currency] ?? 0) + (item.type === 'INCOME' ? Number(item.amount) : -Number(item.amount));
    months.set(month, row);
  }
  return success(res, { generatedAt: new Date(), byCurrency, monthlyChange: [...months.entries()].map(([month, values]) => ({ month, values })) });
}));
