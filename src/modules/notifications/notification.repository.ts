import type { Prisma, PrismaClient } from '@prisma/client';

export class NotificationRepository {
  constructor(private readonly db: PrismaClient) {}

  list(userId: string, unreadOnly: boolean) {
    return this.db.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }

  findOwned(userId: string, id: string) {
    return this.db.notification.findFirst({ where: { id, userId } });
  }

  markRead(id: string) {
    return this.db.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  markAllRead(userId: string) {
    return this.db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  /** Đã có thông báo cùng loại (tùy chọn: tạo sau thời điểm `since`) để không nhắc lặp. */
  exists(userId: string, type: string, since?: Date) {
    return this.db.notification.findFirst({ where: { userId, type, ...(since ? { createdAt: { gte: since } } : {}) } });
  }

  create(data: Prisma.NotificationUncheckedCreateInput) {
    return this.db.notification.create({ data });
  }

  billsDueBefore(userId: string, until: Date) {
    return this.db.bill.findMany({ where: { userId, status: { in: ['UPCOMING', 'OVERDUE'] }, dueAt: { lte: until } } });
  }

  activeBudgets(userId: string, now: Date) {
    return this.db.budget.findMany({
      where: { userId, deletedAt: null, startDate: { lte: now }, endDate: { gte: now } }
    });
  }

  async expenseTotal(userId: string, period: { categoryId: string | null; startDate: Date; endDate: Date }) {
    const result = await this.db.transaction.aggregate({
      where: {
        userId,
        deletedAt: null,
        type: 'EXPENSE',
        occurredAt: { gte: period.startDate, lte: period.endDate },
        ...(period.categoryId ? { categoryId: period.categoryId } : {})
      },
      _sum: { amount: true }
    });
    return Number(result._sum.amount ?? 0);
  }
}
