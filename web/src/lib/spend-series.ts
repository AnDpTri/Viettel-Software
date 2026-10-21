/** Số liệu cho đường chi tiêu lũy kế trong tháng. */

export interface DatedAmount {
  occurredAt: string | Date;
  amount: number | string;
}

/** Chi tiêu lũy kế tới cuối mỗi ngày 1…`throughDay` của tháng `YYYY-MM`. Ngày không có chi giữ nguyên số trước đó. */
export function cumulativeByDay(items: DatedAmount[], month: string, throughDay: number): number[] {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const perDay = new Array<number>(throughDay).fill(0);
  for (const item of items) {
    const date = new Date(item.occurredAt);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== m) continue;
    const day = date.getDate();
    if (day >= 1 && day <= throughDay) perDay[day - 1]! += Number(item.amount);
  }
  let running = 0;
  return perDay.map((value) => (running += value));
}

/** Các mốc trục tung tròn: 0 … mốc cao nhất luôn nằm trên giá trị lớn nhất (đường không chạm mép khung). */
export function niceTicks(max: number, count = 4): { ticks: number[]; top: number } {
  const safe = max > 0 ? max : 1;
  const rough = safe / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough)!;
  let steps = Math.ceil(safe / step - 1e-9);
  if (steps * step <= safe) steps += 1;
  return { ticks: Array.from({ length: steps + 1 }, (_, index) => index * step), top: steps * step };
}

/** Nhãn mốc trục ngắn gọn bằng tiếng Việt: 500k, 1 tr, 2,5 tr, 1,2 tỷ. */
export function compactMoney(value: number) {
  const trim = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  if (value >= 1e9) return `${trim(value / 1e9)} tỷ`;
  if (value >= 1e6) return `${trim(value / 1e6)} tr`;
  if (value >= 1e3) return `${trim(value / 1e3)}k`;
  return String(value);
}
