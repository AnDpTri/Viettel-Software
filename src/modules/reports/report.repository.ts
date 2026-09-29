import type { PrismaClient } from '@prisma/client';

export class ReportRepository {
  constructor(private readonly db: PrismaClient) {}

  /** Giao dịch thu/chi hợp lệ trong kỳ, kèm tên danh mục và tiền tệ của ví. */
  incomeAndExpenses(userId: string, from: Date, to: Date) {
    return this.db.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        occurredAt: { gte: from, lte: to },
        type: { in: ['INCOME', 'EXPENSE'] }
      },
      include: { category: { select: { id: true, name: true } }, wallet: { select: { currency: true } } },
      orderBy: { occurredAt: 'asc' }
    });
  }

  wallets(userId: string, options: { netWorthOnly?: boolean } = {}) {
    return this.db.wallet.findMany({
      where: { userId, ...(options.netWorthOnly ? { includeInNetWorth: true } : {}) },
      orderBy: { name: 'asc' }
    });
  }

  /** Mọi giao dịch ảnh hưởng số dư (bỏ giao dịch đã xóa hoặc bị hủy). */
  balanceMovements(userId: string) {
    return this.db.transaction.findMany({
      where: { userId, deletedAt: null, status: { not: 'CANCELLED' } },
      select: { walletId: true, destinationWalletId: true, type: true, amount: true, occurredAt: true }
    });
  }
}
