import { describe, expect, it } from 'vitest';
import { buildOnboardingStatus, compactOnboarding } from '../src/services/onboarding.service';

const emptyCounts = { walletCount: 0, categoryCount: 0, transactionCount: 0, budgetCount: 0, goalCount: 0 };

describe('onboarding status', () => {
  it('derives progress from real user data instead of a manually checked flag', () => {
    const status = buildOnboardingStatus(
      { fullName: 'Nguyễn An', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', preferences: {} },
      { ...emptyCounts, walletCount: 1, categoryCount: 8 }
    );

    expect(status.completedCount).toBe(3);
    expect(status.progressPercent).toBe(75);
    expect(status.nextStep?.id).toBe('transaction');
    expect(status.completed).toBe(false);
  });

  it('keeps dismiss and welcome state without treating them as completion', () => {
    const status = buildOnboardingStatus(
      { fullName: null, timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', preferences: { onboarding: { dismissed: true, welcomeSeen: true } } },
      emptyCounts
    );

    expect(status.dismissed).toBe(true);
    expect(status.welcomeSeen).toBe(true);
    expect(status.completed).toBe(false);
    expect(status.nextStep?.id).toBe('profile');
  });

  it('marks setup complete only when all four core steps have data', () => {
    const status = buildOnboardingStatus(
      { fullName: 'Nguyễn An', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', preferences: null },
      { ...emptyCounts, walletCount: 1, categoryCount: 1, transactionCount: 1 }
    );

    expect(status.completed).toBe(true);
    expect(status.nextStep).toBeNull();
    expect(status.progressPercent).toBe(100);
  });
});

describe('compactOnboarding', () => {
  it('rút gọn trạng thái trước khi gửi cho mô hình, bỏ mô tả các bước và cờ giao diện', () => {
    const status = buildOnboardingStatus(
      { fullName: 'Nguyễn An', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', preferences: { onboarding: { dismissed: true, welcomeSeen: true } } },
      emptyCounts
    );

    const compact = compactOnboarding(status);

    expect(compact).toEqual({
      completed: false,
      completedCount: 1,
      totalSteps: 4,
      nextStep: { id: 'wallet', title: 'Tạo ví đầu tiên' },
      counts: status.counts
    });
    const serialized = JSON.stringify(compact);
    expect(serialized).not.toContain('description');
    expect(serialized).not.toContain('dismissed');
    expect(serialized).not.toContain('actionLabel');
  });

  it('trả về null khi chưa có trạng thái onboarding', () => {
    expect(compactOnboarding(null)).toBeNull();
    expect(compactOnboarding(undefined)).toBeNull();
  });
});
