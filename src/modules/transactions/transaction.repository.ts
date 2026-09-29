import type { Prisma, PrismaClient } from '@prisma/client';

export const receiptPublicSelect = {
  id: true,
  transactionId: true,
  originalName: true,
  storedName: true,
  mimeType: true,
  size: true,
  createdAt: true
} as const;

const detailInclude = {
  wallet: true,
  destinationWallet: true,
  category: true,
  receipts: { select: receiptPublicSelect },
  tags: true,
  splits: true,
  merchant: true
} as const;

type TransactionData = Omit<Prisma.TransactionUncheckedCreateInput, 'userId' | 'tags'>;
const connectTags = (tagIds?: string[]) => (tagIds?.length ? { connect: tagIds.map((id) => ({ id })) } : undefined);

export class TransactionRepository {
  constructor(private readonly db: PrismaClient) {}

  async page(where: Prisma.TransactionWhereInput, page: number, limit: number) {
    const [items, total] = await this.db.$transaction([
      this.db.transaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          wallet: { select: { id: true, name: true, currency: true } },
          destinationWallet: { select: { id: true, name: true, currency: true } },
          category: { select: { id: true, name: true } },
          receipts: { select: receiptPublicSelect },
          tags: true,
          splits: true,
          merchant: true
        }
      }),
      this.db.transaction.count({ where })
    ]);
    return { items, total };
  }

  forExport(where: Prisma.TransactionWhereInput) {
    return this.db.transaction.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      include: {
        wallet: { select: { name: true } },
        destinationWallet: { select: { name: true } },
        category: { select: { name: true } }
      }
    });
  }

  trash(userId: string) {
    return this.db.transaction.findMany({
      where: { userId, deletedAt: { not: null } },
      include: { wallet: true, category: true, tags: true },
      orderBy: { deletedAt: 'desc' }
    });
  }

  findOwned(userId: string, id: string) {
    return this.db.transaction.findFirst({ where: { id, userId } });
  }

  findOwnedActive(userId: string, id: string) {
    return this.db.transaction.findFirst({ where: { id, userId, deletedAt: null } });
  }

  findOwnedDetail(userId: string, id: string) {
    return this.db.transaction.findFirst({ where: { id, userId }, include: detailInclude });
  }

  findByIdempotencyKey(userId: string, idempotencyKey: string) {
    return this.db.transaction.findFirst({ where: { userId, idempotencyKey } });
  }

  create(userId: string, data: TransactionData, tagIds?: string[]) {
    return this.db.transaction.create({
      data: { ...data, userId, tags: connectTags(tagIds) },
      include: { wallet: true, destinationWallet: true, category: true, tags: true }
    });
  }

  /** Nhập nhiều giao dịch trong một transaction: lỗi một dòng thì không dòng nào được ghi. */
  async createMany(userId: string, rows: Array<TransactionData & { tagIds?: string[] }>) {
    const created = await this.db.$transaction(
      rows.map(({ tagIds, ...data }) =>
        this.db.transaction.create({ data: { ...data, userId, tags: connectTags(tagIds) } })
      )
    );
    return created.length;
  }

  update(id: string, data: Prisma.TransactionUncheckedUpdateInput, tagIds?: string[]) {
    return this.db.transaction.update({
      where: { id },
      data: { ...data, ...(tagIds ? { tags: { set: tagIds.map((tagId) => ({ id: tagId })) } } : {}) },
      include: {
        wallet: true,
        destinationWallet: true,
        category: true,
        receipts: { select: receiptPublicSelect },
        tags: true,
        splits: true
      }
    });
  }

  setDeleted(id: string, deletedAt: Date | null) {
    return this.db.transaction.update({ where: { id }, data: { deletedAt } });
  }

  async updateMany(userId: string, ids: string[], data: Prisma.TransactionUncheckedUpdateManyInput) {
    const result = await this.db.transaction.updateMany({ where: { id: { in: ids }, userId }, data });
    return result.count;
  }

  async replaceSplits(
    transactionId: string,
    splits: Array<{ categoryId?: string | null; amount: number; note?: string | null }>
  ) {
    await this.db.$transaction([
      this.db.transactionSplit.deleteMany({ where: { transactionId } }),
      this.db.transactionSplit.createMany({ data: splits.map((item) => ({ transactionId, ...item })) })
    ]);
    return this.db.transactionSplit.findMany({ where: { transactionId } });
  }

  // ---- Tham chiếu dùng khi kiểm tra dữ liệu giao dịch ----

  findActiveWallet(userId: string, id: string) {
    return this.db.wallet.findFirst({ where: { id, userId, archivedAt: null } });
  }

  findCategory(userId: string, id: string) {
    return this.db.category.findFirst({ where: { id, userId } });
  }

  activeAutomationRules(userId: string) {
    return this.db.automationRule.findMany({ where: { userId, active: true }, orderBy: { priority: 'desc' } });
  }

  async ensureTag(userId: string, name: string) {
    const tag = await this.db.tag.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name },
      update: {}
    });
    return tag.id;
  }
}
