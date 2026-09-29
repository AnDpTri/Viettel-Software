import { buildFinancialSnapshot } from './financial-snapshot';
import type { InsightRepository } from './insight.repository';
import { normalizedText, parseVietnameseTransaction } from './transaction-parser';

/** Phân tích tài chính theo quy tắc xác định (không dùng AI): xu hướng, khoản bất thường, dự báo và gợi ý. */
export class InsightService {
  constructor(private readonly insights: InsightRepository) {}

  async overview(userId: string) {
    const context = await this.insights.financialContext(userId);
    const snapshot = buildFinancialSnapshot(context);
    const monthly = snapshot.monthly;
    const latest = monthly.at(-1) ?? { income: 0, expense: 0, net: 0 };
    const prior = monthly.slice(0, -1);
    const averageExpense = prior.length
      ? prior.reduce((sum, item) => sum + item.expense, 0) / prior.length
      : latest.expense;
    const baseExpenses = context.transactions.filter(
      (item) => item.wallet.currency === context.user.currency && item.type === 'EXPENSE'
    );
    const anomalies = baseExpenses
      .filter((item) => Number(item.amount) > Math.max(500_000, averageExpense * 0.35))
      .slice(-10)
      .map((item) => ({
        transactionId: item.id,
        amount: Number(item.amount),
        date: item.occurredAt,
        reason: 'Khoản chi lớn hơn đáng kể so với mức chi trung bình.'
      }));
    const upcomingExpense =
      snapshot.upcomingBills.reduce((sum, item) => sum + item.amount, 0) +
      snapshot.recurringExpenses.reduce((sum, item) => sum + item.amount, 0);
    const safeToSpend = Math.max(0, snapshot.overview.estimatedBalance - upcomingExpense - averageExpense);
    const recommendations: Array<{ level: string; title: string; message: string }> = [];
    if (latest.expense > averageExpense * 1.2 && averageExpense > 0)
      recommendations.push({
        level: 'warning',
        title: 'Chi tiêu đang tăng',
        message: `Chi tháng này cao hơn ${Math.round((latest.expense / averageExpense - 1) * 100)}% so với trung bình.`
      });
    if (!context.budgets.length)
      recommendations.push({
        level: 'info',
        title: 'Lập ngân sách đầu tiên',
        message: 'Bạn có thể nhờ agent tạo ngân sách ngay trong khung chat.'
      });
    return {
      monthly,
      expenseByCategory: snapshot.topExpenseCategories,
      anomalies,
      subscriptions: [],
      forecast: {
        currency: context.user.currency,
        currentBalance: snapshot.overview.estimatedBalance,
        upcomingExpense,
        averageMonthlyExpense: averageExpense,
        safeToSpend
      },
      recommendations,
      generatedBy: 'deterministic-finance-engine'
    };
  }

  /** Hiểu câu nhập nhanh và gợi ý ví/danh mục có tên xuất hiện trong câu. */
  async parseTransaction(userId: string, text: string) {
    const context = await this.insights.financialContext(userId);
    const parsed = parseVietnameseTransaction(text);
    const plain = normalizedText(text);
    const wallet =
      context.wallets.find((item) => plain.includes(normalizedText(item.name))) ??
      (context.wallets.length === 1 ? context.wallets[0] : null);
    const category =
      context.categories.find((item) => item.type === parsed.type && plain.includes(normalizedText(item.name))) ?? null;
    return {
      ...parsed,
      suggestedWalletId: wallet?.id ?? null,
      suggestedWalletName: wallet?.name ?? null,
      suggestedCategoryId: category?.id ?? null,
      suggestedCategoryName: category?.name ?? null
    };
  }
}
