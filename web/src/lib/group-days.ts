import type { Transaction } from '../api/types';

export interface DayGroup {
  /** Khóa ngày dạng YYYY-MM-DD (giờ địa phương). */
  key: string;
  label: string;
  items: Transaction[];
  /** Tổng chi và tổng thu của chính các dòng trong ngày, theo từng tiền tệ (chuyển khoản không tính). */
  totals: Array<{ currency: string; expense: number; income: number }>;
}

const pad = (value: number) => String(value).padStart(2, '0');
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "Hôm nay", "Hôm qua" hoặc "19 thg 10" (thêm năm khi khác năm hiện tại). */
export function dayLabel(date: Date, today: Date): string {
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000
  );
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  const base = `${date.getDate()} thg ${date.getMonth() + 1}`;
  return date.getFullYear() === today.getFullYear() ? base : `${base}, ${date.getFullYear()}`;
}

/** Gom giao dịch theo ngày (mới nhất trước), giữ thứ tự dòng đã có trong mỗi ngày. */
export function groupByDay(transactions: Transaction[], today = new Date(), fallbackCurrency = 'VND'): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const item of transactions) {
    const date = new Date(item.occurredAt);
    const key = dayKey(date);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: dayLabel(date, today), items: [], totals: [] };
      groups.set(key, group);
    }
    group.items.push(item);
    if (item.type === 'TRANSFER') continue;
    const currency = item.wallet.currency || fallbackCurrency;
    let total = group.totals.find((entry) => entry.currency === currency);
    if (!total) {
      total = { currency, expense: 0, income: 0 };
      group.totals.push(total);
    }
    total[item.type === 'INCOME' ? 'income' : 'expense'] += Number(item.amount);
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}
