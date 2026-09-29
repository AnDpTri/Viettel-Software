import type { Prisma } from '@prisma/client';
import { jsonObject } from '../../shared/json';
import { ONBOARDING_STEPS } from './onboarding.constants';

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id'];
export type OnboardingCounts = {
  walletCount: number;
  categoryCount: number;
  transactionCount: number;
  budgetCount: number;
  goalCount: number;
};

/** Tính trạng thái onboarding từ hồ sơ và số lượng dữ liệu thật của người dùng (hàm thuần, không truy vấn). */
export function buildOnboardingStatus(
  user: { fullName: string | null; timezone: string; currency: string; preferences: Prisma.JsonValue | null },
  counts: OnboardingCounts
) {
  const preferences = jsonObject(user.preferences);
  const onboarding = jsonObject(preferences.onboarding as Prisma.JsonValue | undefined);
  const completedById: Record<OnboardingStepId, boolean> = {
    profile: Boolean(user.fullName?.trim() && user.timezone && user.currency),
    wallet: counts.walletCount > 0,
    categories: counts.categoryCount > 0,
    transaction: counts.transactionCount > 0
  };
  const steps = ONBOARDING_STEPS.map((step) => ({ ...step, completed: completedById[step.id] }));
  const completedCount = steps.filter((step) => step.completed).length;
  const nextStep = steps.find((step) => !step.completed) ?? null;
  return {
    completed: completedCount === steps.length,
    completedCount,
    totalSteps: steps.length,
    progressPercent: Math.round((completedCount / steps.length) * 100),
    nextStep,
    steps,
    dismissed: onboarding.dismissed === true,
    welcomeSeen: onboarding.welcomeSeen === true,
    interests: Array.isArray(onboarding.interests)
      ? onboarding.interests.filter((item): item is string => typeof item === 'string')
      : [],
    counts,
    optional: {
      budget: { completed: counts.budgetCount > 0, view: 'budgets', title: 'Tạo ngân sách đầu tiên' },
      goal: { completed: counts.goalCount > 0, view: 'goals', title: 'Đặt mục tiêu tài chính' }
    }
  };
}

export type OnboardingStatus = ReturnType<typeof buildOnboardingStatus>;

/** Rút gọn trạng thái onboarding trước khi gửi cho mô hình: chỉ giữ tín hiệu cần để quyết định, bỏ mô tả từng bước và cờ giao diện (dismissed/welcomeSeen/optional) để không loãng ngữ cảnh. */
export function compactOnboarding(status: OnboardingStatus | null | undefined) {
  if (!status) return null;
  return {
    completed: status.completed,
    completedCount: status.completedCount,
    totalSteps: status.totalSteps,
    nextStep: status.nextStep ? { id: status.nextStep.id, title: status.nextStep.title } : null,
    counts: status.counts
  };
}
