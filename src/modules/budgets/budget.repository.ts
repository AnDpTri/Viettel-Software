import type { Prisma, PrismaClient } from '@prisma/client';

export type BudgetPeriod = { categoryId: string | null; startDate: Date; endDate: Date };

export class BudgetRepository {
  constructor(private readonly db: PrismaClient) {}

  listActive(userId: string) {
    return this.db.budget.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startDate: 'desc' },
      include: { category: { select: { id: true, name: true } } }
    });
  }

  findOwned(userId: string, id: string) {
    return this.db.budget.findFirst({ where: { id, userId } });
  }

  findOwnedWithCategory(userId: string, id: string) {
    return this.db.budget.findFirst({ where: { id, userId }, include: { category: true } });
  }

  create(userId: string, data: Omit<Prisma.BudgetUncheckedCreateInput, 'userId'>) {
    return this.db.budget.create({ data: { ...data, userId }, include: { category: true } });
  }

  update(id: string, data: Prisma.BudgetUncheckedUpdateInput) {
    return this.db.budget.update({ where: { id }, data, include: { category: true } });
  }

  softDelete(id: string) {
    return this.db.budget.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  expiredRecurring(userId: string, now: Date) {
    return this.db.budget.findMany({
      where: { userId, deletedAt: null, recurrence: { not: null }, endDate: { lt: now } }
    });
  }

  findPeriod(userId: string, name: string, startDate: Date, endDate: Date) {
    return this.db.budget.findFirst({ where: { userId, name, startDate, endDate, deletedAt: null } });
  }

  findExpenseCategory(userId: string, categoryId: string) {
    return this.db.category.findFirst({ where: { id: categoryId, userId } });
  }

  /** Tổng chi trong kỳ ngân sách; `currency` giới hạn ví cùng tiền tệ (bỏ qua giao dịch đã hủy). */
  async spent(userId: string, period: BudgetPeriod, currency?: string) {
    const result = await this.db.transaction.aggregate({
      where: {
        userId,
        deletedAt: null,
        type: 'EXPENSE',
        occurredAt: { gte: period.startDate, lte: period.endDate },
        ...(currency ? { status: { not: 'CANCELLED' }, wallet: { currency } } : {}),
        ...(period.categoryId ? { categoryId: period.categoryId } : {})
      },
      _sum: { amount: true }
    });
    return Number(result._sum.amount ?? 0);
  }
}
