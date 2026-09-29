import type { Prisma, PrismaClient } from '@prisma/client';

/** Truy vấn bảng người dùng dùng chung cho nhiều module (hồ sơ, ngân sách, báo cáo, Agent). */
export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async currency(userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });
    return user.currency;
  }

  findById<T extends Prisma.UserSelect>(userId: string, select: T) {
    return this.db.user.findUniqueOrThrow({ where: { id: userId }, select });
  }

  update<T extends Prisma.UserSelect>(userId: string, data: Prisma.UserUpdateInput, select: T) {
    return this.db.user.update({ where: { id: userId }, data, select });
  }
}
