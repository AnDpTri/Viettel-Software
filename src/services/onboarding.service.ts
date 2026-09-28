import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const ONBOARDING_STEPS = [
  { id: 'profile', title: 'Hoàn thiện hồ sơ', description: 'Kiểm tra họ tên, tiền tệ và múi giờ.', view: 'profile', actionLabel: 'Mở hồ sơ' },
  { id: 'wallet', title: 'Tạo ví đầu tiên', description: 'Cho Sổ Mộc biết bạn đang quản lý tiền ở đâu.', view: 'wallets', actionLabel: 'Tạo ví' },
  { id: 'categories', title: 'Thiết lập danh mục', description: 'Phân loại khoản thu và chi để báo cáo chính xác.', view: 'categories', actionLabel: 'Chọn danh mục' },
  { id: 'transaction', title: 'Ghi giao dịch đầu tiên', description: 'Ghi một khoản thu hoặc chi để bắt đầu theo dõi.', view: 'transactions', actionLabel: 'Ghi giao dịch' }
] as const;

export type OnboardingStepId = typeof ONBOARDING_STEPS[number]['id'];
type Counts = { walletCount: number; categoryCount: number; transactionCount: number; budgetCount: number; goalCount: number };

export const STARTER_CATEGORIES = [
  { name: 'Lương', type: 'INCOME' as const, icon: '↙', color: '#2f8f68' },
  { name: 'Thu nhập khác', type: 'INCOME' as const, icon: '＋', color: '#589d7d' },
  { name: 'Ăn uống', type: 'EXPENSE' as const, icon: '◉', color: '#db7042' },
  { name: 'Di chuyển', type: 'EXPENSE' as const, icon: '↗', color: '#4d83e6' },
  { name: 'Mua sắm', type: 'EXPENSE' as const, icon: '◇', color: '#a56cc1' },
  { name: 'Hóa đơn', type: 'EXPENSE' as const, icon: '▤', color: '#c28b36' },
  { name: 'Sức khỏe', type: 'EXPENSE' as const, icon: '＋', color: '#d65f6e' },
  { name: 'Giải trí', type: 'EXPENSE' as const, icon: '☆', color: '#577c70' }
];

export function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function buildOnboardingStatus(user: { fullName: string | null; timezone: string; currency: string; preferences: Prisma.JsonValue | null }, counts: Counts) {
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
    progressPercent: Math.round(completedCount / steps.length * 100),
    nextStep,
    steps,
    dismissed: onboarding.dismissed === true,
    welcomeSeen: onboarding.welcomeSeen === true,
    counts,
    optional: {
      budget: { completed: counts.budgetCount > 0, view: 'budgets', title: 'Tạo ngân sách đầu tiên' },
      goal: { completed: counts.goalCount > 0, view: 'goals', title: 'Đặt mục tiêu tài chính' }
    }
  };
}

export async function getOnboardingStatus(userId: string) {
  const [user, walletCount, categoryCount, transactionCount, budgetCount, goalCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true, timezone: true, currency: true, preferences: true } }),
    prisma.wallet.count({ where: { userId, archivedAt: null } }),
    prisma.category.count({ where: { userId, archivedAt: null } }),
    prisma.transaction.count({ where: { userId, deletedAt: null } }),
    prisma.budget.count({ where: { userId, deletedAt: null } }),
    prisma.goal.count({ where: { userId, deletedAt: null } })
  ]);
  return buildOnboardingStatus(user, { walletCount, categoryCount, transactionCount, budgetCount, goalCount });
}

export async function updateOnboardingPreferences(userId: string, patch: { dismissed?: boolean; welcomeSeen?: boolean; restart?: boolean }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } });
  const preferences = jsonObject(user.preferences);
  const current = jsonObject(preferences.onboarding as Prisma.JsonValue | undefined);
  const onboarding = patch.restart
    ? { ...current, dismissed: false, welcomeSeen: false, restartedAt: new Date().toISOString() }
    : { ...current, ...(patch.dismissed !== undefined ? { dismissed: patch.dismissed } : {}), ...(patch.welcomeSeen !== undefined ? { welcomeSeen: patch.welcomeSeen } : {}), updatedAt: new Date().toISOString() };
  await prisma.user.update({ where: { id: userId }, data: { preferences: { ...preferences, onboarding } as Prisma.InputJsonValue } });
  return getOnboardingStatus(userId);
}

export async function createStarterCategories(userId: string) {
  const existing = await prisma.category.findMany({ where: { userId, archivedAt: null }, select: { name: true, type: true } });
  const keys = new Set(existing.map((item) => `${item.type}:${item.name.toLocaleLowerCase('vi-VN')}`));
  const missing = STARTER_CATEGORIES.filter((item) => !keys.has(`${item.type}:${item.name.toLocaleLowerCase('vi-VN')}`));
  if (missing.length) await prisma.category.createMany({ data: missing.map((item, sortOrder) => ({ userId, ...item, sortOrder })) });
  return { created: missing.length, skipped: STARTER_CATEGORIES.length - missing.length, categories: missing.map((item) => item.name) };
}

export const APP_GUIDE = {
  dashboard: { title: 'Tổng quan', description: 'Xem tài sản, thu, chi, dòng tiền và các giao dịch gần nhất.', view: 'dashboard' },
  transactions: { title: 'Giao dịch', description: 'Ghi, lọc, chỉnh sửa và xuất giao dịch CSV.', view: 'transactions' },
  wallets: { title: 'Ví của tôi', description: 'Quản lý tiền mặt, tài khoản ngân hàng, ví điện tử và thẻ.', view: 'wallets' },
  categories: { title: 'Danh mục', description: 'Tổ chức khoản thu chi theo danh sách hoặc dạng cây.', view: 'categories' },
  budgets: { title: 'Ngân sách', description: 'Đặt hạn mức chi tiêu theo thời gian hoặc danh mục.', view: 'budgets' },
  goals: { title: 'Mục tiêu', description: 'Theo dõi tiến độ tiết kiệm cho các kế hoạch tương lai.', view: 'goals' },
  reports: { title: 'Báo cáo', description: 'Xem dòng tiền theo kỳ và đối soát số dư ví.', view: 'reports' },
  planning: { title: 'Tự động hóa', description: 'Quản lý giao dịch định kỳ, hóa đơn, nhãn và nhóm gia đình.', view: 'planning' },
  insights: { title: 'Trợ lý thông minh', description: 'Hỏi về tài chính hoặc nhờ Agent thao tác có xác nhận.', view: 'insights' },
  profile: { title: 'Hồ sơ', description: 'Cập nhật tài khoản, giao diện, phiên đăng nhập và bảo mật.', view: 'profile' }
} as const;
