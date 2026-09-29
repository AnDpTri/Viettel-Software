import type { Prisma, PrismaClient } from '@prisma/client';

/** Mọi truy vấn cơ sở dữ liệu của ví, luôn giới hạn trong phạm vi người dùng. */
export class WalletRepository {
  constructor(private readonly db: PrismaClient) {}

  list(userId: string, includeArchived: boolean) {
    return this.db.wallet.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
  }

  findOwned(userId: string, id: string) {
    return this.db.wallet.findFirst({ where: { id, userId } });
  }

  create(userId: string, data: Omit<Prisma.WalletUncheckedCreateInput, 'userId'>) {
    return this.db.wallet.create({ data: { ...data, userId } });
  }

  update(id: string, data: Prisma.WalletUncheckedUpdateInput) {
    return this.db.wallet.update({ where: { id }, data });
  }

  /** Giao dịch ảnh hưởng số dư của các ví (là ví nguồn hoặc ví đích), bỏ giao dịch đã xóa hoặc bị hủy. */
  balanceMovements(userId: string, walletIds: string[]) {
    return this.db.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        OR: [{ walletId: { in: walletIds } }, { destinationWalletId: { in: walletIds } }]
      },
      select: { type: true, amount: true, walletId: true, destinationWalletId: true }
    });
  }
}
