import type { PrismaClient } from '@prisma/client';

export type FinancialContext = Awaited<ReturnType<InsightRepository['financialContext']>>;

/** Truy vấn dữ liệu tài chính phục vụ phân tích. */
export class InsightRepository {
  constructor(private readonly db: PrismaClient) {}

  /** Dữ liệu 6 tháng gần nhất cần cho phân tích và dự báo. */
  async financialContext(userId: string) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 6);
    const [user, wallets, categories, transactions, budgets, goals, bills, recurring] = await Promise.all([
      this.db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { currency: true, preferences: true, fullName: true }
      }),
      this.db.wallet.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } }),
      this.db.category.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } }),
      this.db.transaction.findMany({
        where: { userId, deletedAt: null, occurredAt: { gte: since }, status: { not: 'CANCELLED' } },
        include: { category: true, wallet: true },
        orderBy: { occurredAt: 'asc' }
      }),
      this.db.budget.findMany({ where: { userId, deletedAt: null } }),
      this.db.goal.findMany({
        where: { userId, deletedAt: null },
        include: { wallet: { select: { currency: true } } }
      }),
      this.db.bill.findMany({
        where: { userId, status: { in: ['UPCOMING', 'OVERDUE'] } },
        include: { wallet: { select: { currency: true } } }
      }),
      this.db.recurringRule.findMany({
        where: { userId, active: true },
        include: { wallet: { select: { currency: true } } }
      })
    ]);
    return { user, wallets, categories, transactions, budgets, goals, bills, recurring };
  }
}
