import type { GoalStatus, Prisma, PrismaClient } from '@prisma/client';

export type ContributionWrite = {
  goalId: string;
  amount: number;
  note?: string;
  transactionId?: string | null;
  status: GoalStatus;
  transfer?: { userId: string; walletId: string; destinationWalletId: string; note: string } | null;
};

export class GoalRepository {
  constructor(private readonly db: PrismaClient) {}

  list(userId: string, status?: GoalStatus) {
    return this.db.goal.findMany({
      where: { userId, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: { wallet: { select: { id: true, name: true, currency: true } } }
    });
  }

  findOwned(userId: string, id: string) {
    return this.db.goal.findFirst({ where: { id, userId } });
  }

  findOwnedWithHistory(userId: string, id: string) {
    return this.db.goal.findFirst({
      where: { id, userId },
      include: { wallet: true, contributions: { orderBy: { createdAt: 'desc' } } }
    });
  }

  create(userId: string, data: Omit<Prisma.GoalUncheckedCreateInput, 'userId'>) {
    return this.db.goal.create({ data: { ...data, userId }, include: { wallet: true } });
  }

  update(id: string, data: Prisma.GoalUncheckedUpdateInput) {
    return this.db.goal.update({ where: { id }, data, include: { wallet: true } });
  }

  findActiveWallet(userId: string, walletId: string) {
    return this.db.wallet.findFirst({ where: { id: walletId, userId, archivedAt: null } });
  }

  walletExists(userId: string, walletId: string) {
    return this.db.wallet.findFirst({ where: { id: walletId, userId }, select: { id: true } });
  }

  dueRecurring(userId: string) {
    return this.db.goal.findMany({
      where: {
        userId,
        deletedAt: null,
        pausedAt: null,
        status: 'ACTIVE',
        recurringAmount: { not: null },
        recurringFrequency: { not: null }
      },
      include: { contributions: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });
  }

  /** Ghi lần góp (kèm giao dịch chuyển khoản thật nếu có) và cập nhật tiến độ trong một transaction Serializable,
   * để hai lần góp đồng thời không làm lệch số tiền hiện có. */
  contribute(write: ContributionWrite) {
    return this.db.$transaction(
      async (tx) => {
        const transaction = write.transfer
          ? await tx.transaction.create({
              data: {
                userId: write.transfer.userId,
                walletId: write.transfer.walletId,
                destinationWalletId: write.transfer.destinationWalletId,
                type: 'TRANSFER',
                amount: Math.abs(write.amount),
                occurredAt: new Date(),
                note: write.transfer.note,
                status: 'CLEARED'
              }
            })
          : null;
        await tx.goalContribution.create({
          data: {
            goalId: write.goalId,
            amount: write.amount,
            note: write.note,
            transactionId: transaction?.id ?? write.transactionId
          }
        });
        return tx.goal.update({
          where: { id: write.goalId },
          data: { currentAmount: { increment: write.amount }, status: write.status },
          include: { contributions: { orderBy: { createdAt: 'desc' } }, wallet: true }
        });
      },
      { isolationLevel: 'Serializable' }
    );
  }
}
