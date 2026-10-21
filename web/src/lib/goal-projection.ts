/**
 * Dự kiến thời điểm hoàn thành mục tiêu tiết kiệm dựa trên tốc độ góp 3 tháng qua.
 */

export interface GoalContributionItem {
  amount: number | string;
  createdAt: string | Date;
}

export interface GoalProjectionInput {
  targetAmount: number | string;
  currentAmount: number | string;
  contributions?: GoalContributionItem[];
  now?: Date;
}

/**
 * Dự kiến ngày hoàn thành mục tiêu theo tốc độ đóng góp 3 tháng gần nhất (90 ngày).
 * Nếu chưa đủ dữ liệu hoặc không có đóng góp thì trả về "Chưa đủ dữ liệu để dự kiến".
 */
export function projectGoalCompletion(input: GoalProjectionInput): string {
  const target = Number(input.targetAmount);
  const current = Number(input.currentAmount);
  const now = input.now ?? new Date();

  const remaining = target - current;
  if (remaining <= 0) {
    return 'Đã hoàn thành mục tiêu';
  }

  const contributions = input.contributions ?? [];
  const ninetyDaysMs = 90 * 86_400_000;
  const cutoff = now.getTime() - ninetyDaysMs;

  const recent = contributions.filter((item) => {
    const time = new Date(item.createdAt).getTime();
    return time >= cutoff && time <= now.getTime() && Number(item.amount) > 0;
  });

  const totalRecent = recent.reduce((sum, item) => sum + Number(item.amount), 0);
  // Tốc độ bình quân mỗi tháng trong 3 tháng qua:
  const monthlyRate = totalRecent / 3;

  if (monthlyRate <= 0 || recent.length === 0) {
    return 'Chưa đủ dữ liệu để dự kiến';
  }

  const monthsNeeded = Math.ceil(remaining / monthlyRate);
  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthsNeeded, 1);
  const targetMonth = targetDate.getMonth() + 1;
  const targetYear = targetDate.getFullYear();

  return `Dự kiến đạt vào tháng ${targetMonth}/${targetYear} theo tốc độ góp 3 tháng qua`;
}
