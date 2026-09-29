import type { PrismaClient } from '@prisma/client';
import { receiptPublicSelect } from '../transactions/transaction.repository';

export class AccountRepository {
  constructor(private readonly db: PrismaClient) {}

  /** Toàn bộ dữ liệu cá nhân để người dùng tải về (không gồm mật khẩu băm, token hay nội dung tệp hóa đơn). */
  async exportData(userId: string) {
    const [user, wallets, categories, transactions, budgets, goals, tags, recurringRules, bills] = await Promise.all([
      this.db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          fullName: true,
          timezone: true,
          currency: true,
          locale: true,
          createdAt: true
        }
      }),
      this.db.wallet.findMany({ where: { userId } }),
      this.db.category.findMany({ where: { userId } }),
      this.db.transaction.findMany({
        where: { userId },
        include: { tags: true, receipts: { select: receiptPublicSelect } }
      }),
      this.db.budget.findMany({ where: { userId } }),
      this.db.goal.findMany({ where: { userId }, include: { contributions: true } }),
      this.db.tag.findMany({ where: { userId } }),
      this.db.recurringRule.findMany({ where: { userId } }),
      this.db.bill.findMany({ where: { userId } })
    ]);
    return { user, wallets, categories, transactions, budgets, goals, tags, recurringRules, bills };
  }

  /** Vô hiệu hóa và ẩn danh tài khoản, thu hồi mọi phiên đăng nhập, trong một transaction. */
  async deactivate(userId: string) {
    await this.db.$transaction([
      this.db.refreshToken.updateMany({ where: { userId }, data: { revokedAt: new Date() } }),
      this.db.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), email: null, phone: null, fullName: 'Tài khoản đã xóa' }
      })
    ]);
  }

  auditLogs(userId: string) {
    return this.db.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
