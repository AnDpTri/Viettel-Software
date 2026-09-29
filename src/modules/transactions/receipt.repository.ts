import type { PrismaClient } from '@prisma/client';
import { receiptPublicSelect } from './transaction.repository';

export class ReceiptRepository {
  constructor(private readonly db: PrismaClient) {}

  count(transactionId: string) {
    return this.db.receipt.count({ where: { transactionId } });
  }

  create(data: {
    transactionId: string;
    originalName: string;
    storedName: string;
    mimeType: string;
    size: number;
    content: Buffer;
  }) {
    return this.db.receipt.create({ data, select: receiptPublicSelect });
  }

  /** Hóa đơn chỉ đọc được qua giao dịch còn hoạt động của đúng người dùng. */
  findOwned(userId: string, transactionId: string, receiptId: string) {
    return this.db.receipt.findFirst({
      where: { id: receiptId, transactionId, transaction: { userId, deletedAt: null } }
    });
  }

  delete(id: string) {
    return this.db.receipt.delete({ where: { id } });
  }
}
