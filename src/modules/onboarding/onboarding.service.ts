import type { Prisma } from '@prisma/client';
import { jsonObject } from '../../shared/json';
import { STARTER_CATEGORIES } from './onboarding.constants';
import { buildOnboardingStatus } from './onboarding.domain';
import type { OnboardingRepository } from './onboarding.repository';

export type OnboardingPatch = { dismissed?: boolean; welcomeSeen?: boolean; restart?: boolean; interests?: string[] };

const categoryKey = (item: { name: string; type: string }) => `${item.type}:${item.name.toLocaleLowerCase('vi-VN')}`;

/** Hướng dẫn người mới: tiến độ suy ra từ dữ liệu thật; chỉ lưu các cờ giao diện (đã xem, tạm ẩn, mối quan tâm). */
export class OnboardingService {
  constructor(private readonly onboarding: OnboardingRepository) {}

  async status(userId: string) {
    const [profile, counts] = await Promise.all([this.onboarding.profile(userId), this.onboarding.counts(userId)]);
    return buildOnboardingStatus(profile, counts);
  }

  async updatePreferences(userId: string, patch: OnboardingPatch) {
    const preferences = jsonObject(await this.onboarding.preferences(userId));
    const current = jsonObject(preferences.onboarding as Prisma.JsonValue | undefined);
    const onboarding = patch.restart
      ? { ...current, dismissed: false, welcomeSeen: false, restartedAt: new Date().toISOString() }
      : {
          ...current,
          ...(patch.dismissed !== undefined ? { dismissed: patch.dismissed } : {}),
          ...(patch.welcomeSeen !== undefined ? { welcomeSeen: patch.welcomeSeen } : {}),
          ...(patch.interests ? { interests: patch.interests } : {}),
          updatedAt: new Date().toISOString()
        };
    await this.onboarding.savePreferences(userId, { ...preferences, onboarding } as Prisma.InputJsonValue);
    return this.status(userId);
  }

  /** Tạo các danh mục gợi ý còn thiếu; `names` giới hạn trong các danh mục người dùng đã chọn. */
  async createStarterCategories(userId: string, names?: string[]) {
    const existing = new Set((await this.onboarding.activeCategoryKeys(userId)).map(categoryKey));
    const wanted = names?.length ? STARTER_CATEGORIES.filter((item) => names.includes(item.name)) : STARTER_CATEGORIES;
    const missing = wanted.filter((item) => !existing.has(categoryKey(item)));
    if (missing.length) {
      await this.onboarding.createCategories(missing.map((item, sortOrder) => ({ userId, ...item, sortOrder })));
    }
    return {
      created: missing.length,
      skipped: wanted.length - missing.length,
      categories: missing.map((item) => item.name)
    };
  }
}
