import { parseMonth } from './month';

export interface BudgetLite {
  amount: number;
  spent: number;
  startDate: string | Date;
  endDate: string | Date;
}

export type SafeToSpend =
  /** Không có ngân sách đang hiệu lực: không tính. */
  | { kind: 'no-budget' }
  /** Mọi ngân sách đã hết hạn mức và có khoản vượt: hiện số vượt. */
  | { kind: 'over'; over: number }
  | {
      kind: 'amount';
      /** Số có thể tiêu mỗi ngày, đã làm tròn xuống. */
      perDay: number;
      /** Phần còn dương của các ngân sách trong tháng. */
      remaining: number;
      /** Khoản chi đã biết sẽ đến hạn từ hôm nay tới hết tháng. */
      upcoming: number;
      days: number;
    };

/** Ngân sách có thời hạn giao với tháng `YYYY-MM`. */
export function budgetsInMonth<T extends Pick<BudgetLite, 'startDate' | 'endDate'>>(budgets: T[], month: string): T[] {
  const { year, month: m } = parseMonth(month);
  const first = new Date(year, m - 1, 1).getTime();
  const last = new Date(year, m, 1).getTime() - 1;
  return budgets.filter(
    (budget) => new Date(budget.startDate).getTime() <= last && new Date(budget.endDate).getTime() >= first
  );
}

/** Số ngày từ hôm nay tới hết tháng, tính cả hôm nay, tối thiểu 1. */
export function daysLeftInMonth(today: Date) {
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return Math.max(1, last - today.getDate() + 1);
}

/**
 * Còn tiêu được bao nhiêu mỗi ngày: (phần còn lại của ngân sách tháng − khoản đến hạn) chia cho số ngày còn lại,
 * không âm, làm tròn xuống nghìn đồng (tiền tệ khác VND làm tròn xuống đơn vị).
 */
export function safeToSpendToday(input: {
  budgets: BudgetLite[];
  upcoming: number;
  today: Date;
  currency?: string;
}): SafeToSpend {
  const { budgets, upcoming, today, currency = 'VND' } = input;
  if (!budgets.length) return { kind: 'no-budget' };
  const remaining = budgets.reduce((sum, budget) => sum + Math.max(0, budget.amount - budget.spent), 0);
  const over = budgets.reduce((sum, budget) => sum + Math.max(0, budget.spent - budget.amount), 0);
  if (remaining === 0 && over > 0) return { kind: 'over', over };
  const days = daysLeftInMonth(today);
  const raw = Math.max(0, (remaining - upcoming) / days);
  const unit = currency === 'VND' ? 1000 : 1;
  return { kind: 'amount', perDay: Math.floor(raw / unit) * unit, remaining, upcoming, days };
}
