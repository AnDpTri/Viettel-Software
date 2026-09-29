import { calculateWalletBalance } from '../../shared/wallet-balance';
import type { UserRepository } from '../profile/user.repository';
import type { ReportRepository } from './report.repository';

type Totals = { currency: string; income: number; expense: number; net: number };
type CategoryTotal = { categoryId: string | null; categoryName: string; currency: string; amount: number };
type MonthTotal = { month: string; income: number; expense: number };

/** Báo cáo tổng hợp và đối soát. Không cộng gộp các tiền tệ khác nhau: mọi tổng đều tách theo mã tiền tệ. */
export class ReportService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly users: UserRepository
  ) {}

  async summary(userId: string, from: Date, to: Date) {
    const [currency, transactions] = await Promise.all([
      this.users.currency(userId),
      this.reports.incomeAndExpenses(userId, from, to)
    ]);
    const byCurrencyMap = new Map<string, Totals>();
    const categoryMap = new Map<string, CategoryTotal>();
    const monthlyMap = new Map<string, MonthTotal>();
    for (const item of transactions) {
      const amount = Number(item.amount);
      const side = item.type === 'INCOME' ? 'income' : 'expense';
      const walletCurrency = item.wallet.currency;

      const totals = byCurrencyMap.get(walletCurrency) ?? { currency: walletCurrency, income: 0, expense: 0, net: 0 };
      totals[side] += amount;
      totals.net = totals.income - totals.expense;
      byCurrencyMap.set(walletCurrency, totals);

      if (item.type === 'EXPENSE') {
        const key = `${walletCurrency}:${item.categoryId ?? 'uncategorized'}`;
        const category = categoryMap.get(key) ?? {
          categoryId: item.categoryId,
          categoryName: item.category?.name ?? 'Chưa phân loại',
          currency: walletCurrency,
          amount: 0
        };
        category.amount += amount;
        categoryMap.set(key, category);
      }

      // Biến động theo tháng chỉ tính tiền tệ chính của người dùng.
      if (walletCurrency !== currency) continue;
      const month = item.occurredAt.toISOString().slice(0, 7);
      const monthly = monthlyMap.get(month) ?? { month, income: 0, expense: 0 };
      monthly[side] += amount;
      monthlyMap.set(month, monthly);
    }
    const base = byCurrencyMap.get(currency) ?? { currency, income: 0, expense: 0, net: 0 };
    return {
      period: { from, to },
      currency,
      income: base.income,
      expense: base.expense,
      net: base.net,
      byCurrency: [...byCurrencyMap.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
      expenseByCategory: [...categoryMap.values()].sort((a, b) => b.amount - a.amount),
      monthly: [...monthlyMap.values()]
    };
  }

  /** Số dư đầu kỳ và số dư tính từ giao dịch của từng ví, cùng tổng theo tiền tệ. */
  async reconciliation(userId: string) {
    const [wallets, movements] = await Promise.all([
      this.reports.wallets(userId),
      this.reports.balanceMovements(userId)
    ]);
    const rows = wallets.map((wallet) => ({
      walletId: wallet.id,
      walletName: wallet.name,
      currency: wallet.currency,
      openingBalance: Number(wallet.openingBalance),
      calculatedBalance: calculateWalletBalance(wallet.id, Number(wallet.openingBalance), movements),
      archived: Boolean(wallet.archivedAt)
    }));
    const totals: Record<string, number> = {};
    for (const row of rows) totals[row.currency] = (totals[row.currency] ?? 0) + row.calculatedBalance;
    return { generatedAt: new Date(), wallets: rows, totals };
  }

  /** Tài sản ròng theo tiền tệ (ví được tính vào tài sản) và biến động thu - chi theo tháng. */
  async netWorth(userId: string) {
    const [wallets, movements] = await Promise.all([
      this.reports.wallets(userId, { netWorthOnly: true }),
      this.reports.balanceMovements(userId)
    ]);
    const byCurrency: Record<string, number> = {};
    for (const wallet of wallets) {
      byCurrency[wallet.currency] =
        (byCurrency[wallet.currency] ?? 0) +
        calculateWalletBalance(wallet.id, Number(wallet.openingBalance), movements);
    }
    const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
    const months = new Map<string, Record<string, number>>();
    for (const item of movements) {
      const wallet = walletById.get(item.walletId);
      if (!wallet || item.type === 'TRANSFER') continue;
      const month = item.occurredAt.toISOString().slice(0, 7);
      const row = months.get(month) ?? {};
      row[wallet.currency] =
        (row[wallet.currency] ?? 0) + (item.type === 'INCOME' ? Number(item.amount) : -Number(item.amount));
      months.set(month, row);
    }
    return {
      generatedAt: new Date(),
      byCurrency,
      monthlyChange: [...months.entries()].map(([month, values]) => ({ month, values }))
    };
  }
}
