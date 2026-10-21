/** Tháng làm việc dạng `YYYY-MM` (giờ máy), dùng chung cho Tổng quan và Phân tích. */

const pad = (value: number) => String(value).padStart(2, '0');

export const monthKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

export function parseMonth(key: string) {
  const [year, month] = key.split('-').map(Number) as [number, number];
  return { year, month };
}

export function shiftMonth(key: string, delta: number) {
  const { year, month } = parseMonth(key);
  return monthKey(new Date(year, month - 1 + delta, 1));
}

/** Ngày đầu và cuối tháng dạng YYYY-MM-DD cho bộ lọc API. */
export function monthBounds(key: string) {
  const { year, month } = parseMonth(key);
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}`, days: last };
}

export function monthLabel(key: string) {
  const { year, month } = parseMonth(key);
  return `Tháng ${month} ${year}`;
}

export const isCurrentMonth = (key: string, today = new Date()) => key === monthKey(today);
export const isFutureMonth = (key: string, today = new Date()) => key > monthKey(today);
