import type { Prisma, PrismaClient } from '@prisma/client';
import type { OnboardingCounts } from './onboarding.domain';

export class OnboardingRepository {
  constructor(private readonly db: PrismaClient) {}

  profile(userId: string) {
    return this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { fullName: true, timezone: true, currency: true, preferences: true }
    });
  }

  /** Số bản ghi còn hoạt động của từng loại dữ liệu dùng để suy ra tiến độ. */
  async counts(userId: string): Promise<OnboardingCounts> {
    const [walletCount, categoryCount, transactionCount, budgetCount, goalCount] = await Promise.all([
      this.db.wallet.count({ where: { userId, archivedAt: null } }),
      this.db.category.count({ where: { userId, archivedAt: null } }),
      this.db.transaction.count({ where: { userId, deletedAt: null } }),
      this.db.budget.count({ where: { userId, deletedAt: null } }),
      this.db.goal.count({ where: { userId, deletedAt: null } })
    ]);
    return { walletCount, categoryCount, transactionCount, budgetCount, goalCount };
  }

  async preferences(userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } });
    return user.preferences;
  }

  savePreferences(userId: string, preferences: Prisma.InputJsonValue) {
    return this.db.user.update({ where: { id: userId }, data: { preferences } });
  }

  activeCategoryKeys(userId: string) {
    return this.db.category.findMany({ where: { userId, archivedAt: null }, select: { name: true, type: true } });
  }

  createCategories(data: Prisma.CategoryCreateManyInput[]) {
    return this.db.category.createMany({ data });
  }
}
