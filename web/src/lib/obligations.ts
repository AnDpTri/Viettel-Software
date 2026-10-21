import type { Bill, RecurringRule } from '../api/types';

/** Một lần đến hạn của khoản chi định kỳ hoặc hóa đơn. */
export interface DueItem {
  key: string;
  name: string;
  amount: number;
  due: Date;
  kind: 'bill' | 'recurring';
  currency: string;
  isPaid?: boolean;
}

const STEP_LIMIT = 400;

function addMonthsClamped(date: Date, months: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1, date.getHours(), date.getMinutes());
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(date.getDate(), lastDay));
  return next;
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());
}

/** Lần đến hạn kế tiếp sau `date` theo tần suất; không có tần suất hợp lệ thì trả `null`. */
export function nextDue(date: Date, frequency: string | null | undefined, interval = 1): Date | null {
  const step = Math.max(1, interval || 1);
  switch (frequency) {
    case 'DAILY':
      return addDays(date, step);
    case 'WEEKLY':
      return addDays(date, 7 * step);
    case 'MONTHLY':
      return addMonthsClamped(date, step);
    case 'QUARTERLY':
      return addMonthsClamped(date, 3 * step);
    case 'YEARLY':
      return addMonthsClamped(date, 12 * step);
    default:
      return null;
  }
}

/** Mọi ngày đến hạn trong [from, to] của một khoản bắt đầu từ `start` và lặp theo tần suất (nếu có). */
export function occurrencesBetween(
  start: Date,
  frequency: string | null | undefined,
  interval: number,
  from: Date,
  to: Date,
  endAt?: Date | null
): Date[] {
  const result: Date[] = [];
  let current: Date | null = start;
  for (let guard = 0; current && current <= to && guard < STEP_LIMIT; guard += 1) {
    if (endAt && current > endAt) break;
    if (current >= from) result.push(current);
    current = nextDue(current, frequency, interval);
  }
  return result;
}

/** Đầu và cuối ngày địa phương của `date`. */
export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

/**
 * Các khoản chi đến hạn trong [from, to]: khoản định kỳ chi còn hoạt động và hóa đơn chưa trả, mỗi lần đến hạn
 * một dòng, sắp theo ngày. Khoản thu định kỳ không tính vào chi.
 */
export function dueItems(input: {
  recurring: RecurringRule[];
  bills: Bill[];
  from: Date;
  to: Date;
  currency: string;
  includePaid?: boolean;
}): DueItem[] {
  const { recurring, bills, from, to, currency, includePaid = false } = input;
  const items: DueItem[] = [];
  for (const rule of recurring) {
    if (rule.type !== 'EXPENSE' || rule.active === false) continue;
    const walletCurrency = rule.wallet?.currency ?? currency;
    if (walletCurrency !== currency) continue;
    const dates = occurrencesBetween(
      new Date(rule.nextRunAt),
      rule.frequency,
      rule.interval ?? 1,
      from,
      to,
      rule.endAt ? new Date(rule.endAt) : null
    );
    dates.forEach((due, index) =>
      items.push({
        key: `r-${rule.id}-${index}`,
        name: rule.name,
        amount: Number(rule.amount),
        due,
        kind: 'recurring',
        currency: walletCurrency,
        isPaid: false
      })
    );
  }
  for (const bill of bills) {
    if (bill.status === 'SKIPPED') continue;
    if (bill.status === 'PAID' && !includePaid) continue;
    const walletCurrency = bill.wallet?.currency ?? currency;
    if (walletCurrency !== currency) continue;
    const dates = occurrencesBetween(new Date(bill.dueAt), bill.recurrence, 1, from, to);
    dates.forEach((due, index) =>
      items.push({
        key: `b-${bill.id}-${index}`,
        name: bill.name,
        amount: Number(bill.amount),
        due,
        kind: 'bill',
        currency: walletCurrency,
        isPaid: bill.status === 'PAID'
      })
    );
  }
  return items.sort((a, b) => a.due.getTime() - b.due.getTime());
}

/** Số ngày từ đầu ngày `today` tới đầu ngày của `due` (0 là hôm nay). */
export function daysUntil(due: Date, today: Date) {
  return Math.round((startOfDay(due).getTime() - startOfDay(today).getTime()) / 86_400_000);
}

/** Hạn gần: trong vòng 7 ngày kể từ hôm nay. */
export const isDueSoon = (due: Date, today: Date) => {
  const days = daysUntil(due, today);
  return days >= 0 && days <= 7;
};

/** "Hôm nay", "Ngày mai", "Còn N ngày" hoặc "Quá N ngày". */
export function dueText(due: Date, today: Date) {
  const days = daysUntil(due, today);
  if (days < 0) return `Quá ${-days} ngày`;
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Ngày mai';
  return `Còn ${days} ngày`;
}
