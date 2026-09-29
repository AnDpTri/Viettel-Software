import type { FinancialContext } from './insight.repository';

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

/** Ảnh chụp tài chính 6 tháng theo tiền tệ chính của người dùng: dòng tiền theo tháng, danh mục chi lớn nhất, ví,
 * ngân sách, mục tiêu, hóa đơn sắp đến hạn và khoản chi định kỳ. */
export function buildFinancialSnapshot(context: FinancialContext) {
  const eligible = context.transactions.filter(
    (item) => item.wallet.currency === context.user.currency && item.type !== 'TRANSFER'
  );
  const months = new Map<string, { income: number; expense: number }>();
  const categories = new Map<string, number>();
  for (const item of eligible) {
    const current = months.get(monthKey(item.occurredAt)) ?? { income: 0, expense: 0 };
    current[item.type === 'INCOME' ? 'income' : 'expense'] += Number(item.amount);
    months.set(monthKey(item.occurredAt), current);
    if (item.type === 'EXPENSE')
      categories.set(
        item.category?.name ?? 'Chưa phân loại',
        (categories.get(item.category?.name ?? 'Chưa phân loại') ?? 0) + Number(item.amount)
      );
  }
  const totalIncome = eligible
    .filter((item) => item.type === 'INCOME')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpense = eligible
    .filter((item) => item.type === 'EXPENSE')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const openingBalance = context.wallets
    .filter((wallet) => wallet.currency === context.user.currency)
    .reduce((sum, wallet) => sum + Number(wallet.openingBalance), 0);
  return {
    generatedAt: new Date().toISOString(),
    period: '6 tháng gần nhất',
    currency: context.user.currency,
    userName: context.user.fullName,
    overview: {
      transactionCount: eligible.length,
      totalIncome,
      totalExpense,
      netCashFlow: totalIncome - totalExpense,
      estimatedBalance: openingBalance + totalIncome - totalExpense
    },
    monthly: [...months.entries()].map(([month, value]) => ({ month, ...value, net: value.income - value.expense })),
    topExpenseCategories: [...categories.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    recentTransactions: [...context.transactions]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        type: item.type,
        amount: Number(item.amount),
        occurredAt: item.occurredAt.toISOString(),
        walletId: item.walletId,
        wallet: item.wallet.name,
        categoryId: item.categoryId,
        category: item.category?.name ?? null,
        note: item.note,
        payee: item.payee
      })),
    wallets: context.wallets.map((item) => ({
      id: item.id,
      name: item.name,
      currency: item.currency,
      type: item.type
    })),
    categories: context.categories.map((item) => ({ id: item.id, name: item.name, type: item.type })),
    budgets: context.budgets.map((item) => ({
      id: item.id,
      name: item.name,
      amount: Number(item.amount),
      startDate: item.startDate.toISOString().slice(0, 10),
      endDate: item.endDate.toISOString().slice(0, 10)
    })),
    goals: context.goals.map((item) => ({
      id: item.id,
      name: item.name,
      target: Number(item.targetAmount),
      current: Number(item.currentAmount),
      currency: item.wallet?.currency ?? context.user.currency,
      targetDate: item.targetDate?.toISOString().slice(0, 10) ?? null,
      status: item.status
    })),
    upcomingBills: context.bills
      .filter((item) => !item.wallet || item.wallet.currency === context.user.currency)
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: Number(item.amount),
        currency: item.wallet?.currency ?? context.user.currency,
        dueAt: item.dueAt.toISOString(),
        status: item.status
      })),
    recurringExpenses: context.recurring
      .filter((item) => item.type === 'EXPENSE' && item.wallet.currency === context.user.currency)
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: Number(item.amount),
        currency: item.wallet.currency,
        frequency: item.frequency,
        nextRunAt: item.nextRunAt.toISOString()
      }))
  };
}
