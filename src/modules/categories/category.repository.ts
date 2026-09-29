import type { Prisma, PrismaClient, TransactionType } from '@prisma/client';

export class CategoryRepository {
  constructor(private readonly db: PrismaClient) {}

  list(userId: string, options: { type?: TransactionType; includeArchived: boolean }) {
    return this.db.category.findMany({
      where: {
        userId,
        ...(options.includeArchived ? {} : { archivedAt: null }),
        ...(options.type ? { type: options.type } : {})
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }]
    });
  }

  findOwned(userId: string, id: string) {
    return this.db.category.findFirst({ where: { id, userId } });
  }

  findOwnedWithChildren(userId: string, id: string) {
    return this.db.category.findFirst({ where: { id, userId }, include: { children: true } });
  }

  /** Quan hệ cha-con của mọi danh mục, để kiểm tra vòng lặp khi đổi danh mục cha. */
  hierarchy(userId: string) {
    return this.db.category.findMany({ where: { userId }, select: { id: true, parentId: true } });
  }

  async usage(id: string) {
    const [children, transactions] = await Promise.all([
      this.db.category.count({ where: { parentId: id } }),
      this.db.transaction.count({ where: { categoryId: id } })
    ]);
    return { children, transactions };
  }

  create(userId: string, data: Omit<Prisma.CategoryUncheckedCreateInput, 'userId'>) {
    return this.db.category.create({ data: { ...data, userId } });
  }

  update(id: string, data: Prisma.CategoryUncheckedUpdateInput) {
    return this.db.category.update({ where: { id }, data });
  }

  /** Chuyển giao dịch, ngân sách và danh mục con từ nguồn sang đích rồi lưu trữ nguồn, trong một transaction. */
  async merge(userId: string, sourceId: string, targetId: string) {
    await this.db.$transaction([
      this.db.transaction.updateMany({ where: { userId, categoryId: sourceId }, data: { categoryId: targetId } }),
      this.db.budget.updateMany({ where: { userId, categoryId: sourceId }, data: { categoryId: targetId } }),
      this.db.category.updateMany({ where: { userId, parentId: sourceId }, data: { parentId: targetId } }),
      this.db.category.update({ where: { id: sourceId }, data: { archivedAt: new Date() } })
    ]);
  }
}
