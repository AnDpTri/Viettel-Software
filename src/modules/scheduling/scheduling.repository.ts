import type { Bill, Prisma, PrismaClient, RecurringRule } from '@prisma/client';
import { nextOccurrence } from '../../shared/recurrence';

/** Lịch thu chi định kỳ, hóa đơn nhắc việc và mẫu giao dịch. */
export class SchedulingRepository {
  constructor(private readonly db: PrismaClient) {}

  // Định kỳ
  listRecurring(userId: string) {
    return this.db.recurringRule.findMany({
      where: { userId },
      include: { wallet: true, category: true },
      orderBy: { nextRunAt: 'asc' }
    });
  }
  walletExists(userId: string, walletId: string) {
    return this.db.wallet.findFirst({ where: { id: walletId, userId }, select: { id: true } });
  }
  createRecurring(userId: string, data: Omit<Prisma.RecurringRuleUncheckedCreateInput, 'userId'>) {
    return this.db.recurringRule.create({ data: { ...data, userId }, include: { wallet: true, category: true } });
  }
  findRecurring(userId: string, id: string) {
    return this.db.recurringRule.findFirst({ where: { id, userId } });
  }
  updateRecurring(id: string, data: Prisma.RecurringRuleUncheckedUpdateInput) {
    return this.db.recurringRule.update({ where: { id }, data });
  }
  async deleteRecurring(userId: string, id: string) {
    return (await this.db.recurringRule.deleteMany({ where: { id, userId } })).count;
  }
  dueAutoPostRules(userId: string, now: Date) {
    return this.db.recurringRule.findMany({
      where: {
        userId,
        active: true,
        autoPost: true,
        nextRunAt: { lte: now },
        OR: [{ endAt: null }, { endAt: { gte: now } }]
      }
    });
  }
  /** Ghi giao dịch của một kỳ định kỳ và dời lịch sang kỳ sau trong cùng transaction (không ghi trùng kỳ). */
  postRecurring(rule: RecurringRule) {
    return this.db.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId: rule.userId,
          walletId: rule.walletId,
          categoryId: rule.categoryId,
          type: rule.type,
          amount: rule.amount,
          occurredAt: rule.nextRunAt,
          note: rule.note,
          recurringRuleId: rule.id,
          status: 'CLEARED'
        }
      });
      await tx.recurringRule.update({
        where: { id: rule.id },
        data: { nextRunAt: nextOccurrence(rule.nextRunAt, rule.frequency, rule.interval) }
      });
      return transaction;
    });
  }

  // Hóa đơn
  markOverdueBills(userId: string, now: Date) {
    return this.db.bill.updateMany({
      where: { userId, status: 'UPCOMING', dueAt: { lt: now } },
      data: { status: 'OVERDUE' }
    });
  }
  listBills(userId: string) {
    return this.db.bill.findMany({ where: { userId }, include: { wallet: true }, orderBy: { dueAt: 'asc' } });
  }
  createBill(userId: string, data: Omit<Prisma.BillUncheckedCreateInput, 'userId'>) {
    return this.db.bill.create({ data: { ...data, userId } });
  }
  findBill(userId: string, id: string) {
    return this.db.bill.findFirst({ where: { id, userId } });
  }
  updateBill(id: string, data: Prisma.BillUncheckedUpdateInput) {
    return this.db.bill.update({ where: { id }, data });
  }
  async deleteBill(userId: string, id: string) {
    return (await this.db.bill.deleteMany({ where: { id, userId } })).count;
  }
  /** Thanh toán: ghi khoản chi và dời hạn (hóa đơn lặp) hoặc đánh dấu đã trả, trong cùng transaction. */
  payBill(bill: Bill, payment: { userId: string; walletId: string; categoryId: string | null }) {
    return this.db.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId: payment.userId,
          walletId: payment.walletId,
          categoryId: payment.categoryId,
          type: 'EXPENSE',
          amount: bill.amount,
          occurredAt: new Date(),
          note: `Thanh toán: ${bill.name}`
        }
      });
      const updated = await tx.bill.update({
        where: { id: bill.id },
        data: bill.recurrence
          ? { dueAt: nextOccurrence(bill.dueAt, bill.recurrence), status: 'UPCOMING' }
          : { status: 'PAID' }
      });
      return { bill: updated, transaction };
    });
  }

  // Mẫu giao dịch
  listTemplates(userId: string) {
    return this.db.transactionTemplate.findMany({
      where: { userId },
      include: { wallet: true, category: true },
      orderBy: { name: 'asc' }
    });
  }
  createTemplate(userId: string, data: Omit<Prisma.TransactionTemplateUncheckedCreateInput, 'userId'>) {
    return this.db.transactionTemplate.create({ data: { ...data, userId } });
  }
  findTemplate(userId: string, id: string) {
    return this.db.transactionTemplate.findFirst({ where: { id, userId } });
  }
  async deleteTemplate(userId: string, id: string) {
    return (await this.db.transactionTemplate.deleteMany({ where: { id, userId } })).count;
  }
  createTransaction(data: Prisma.TransactionUncheckedCreateInput) {
    return this.db.transaction.create({ data });
  }
}
