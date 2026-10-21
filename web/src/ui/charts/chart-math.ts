/**
 * Các hàm toán học, tỉ lệ, và định dạng số cho biểu đồ SVG tự vẽ.
 */

export interface NiceTicks {
  ticks: number[];
  top: number;
  bottom: number;
  step: number;
}

/**
 * Tạo các mốc tròn cho trục y, mốc trên cùng luôn cao hơn giá trị lớn nhất.
 * Nếu có giá trị âm, mốc 0 luôn nằm đúng trên một đường lưới.
 */
export function niceTicks(max: number, count = 4): { ticks: number[]; top: number } {
  const safe = max > 0 ? max : 1;
  const rough = safe / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough)!;
  let steps = Math.ceil(safe / step - 1e-9);
  if (steps * step <= safe) steps += 1;
  return { ticks: Array.from({ length: steps + 1 }, (_, index) => index * step), top: steps * step };
}

/**
 * Mốc tròn cho trục y có cả giá trị âm và dương (chung trục 0 có dấu).
 * Đảm bảo 0 luôn là một mốc tròn chính xác.
 */
export function niceSignedTicks(minVal: number, maxVal: number, roughTicks = 4): NiceTicks {
  if (minVal >= 0) {
    const { ticks, top } = niceTicks(maxVal, roughTicks);
    const step = ticks[1] ?? top;
    return { ticks, top, bottom: 0, step };
  }
  if (maxVal <= 0) {
    const { ticks, top } = niceTicks(Math.abs(minVal), roughTicks);
    const step = ticks[1] ?? top;
    const revTicks = ticks.map((t) => (t === 0 ? 0 : -t)).reverse();
    return { ticks: revTicks, top: 0, bottom: -top, step };
  }

  const maxAbs = Math.max(Math.abs(minVal), maxVal);
  const rough = maxAbs / Math.max(2, Math.floor(roughTicks / 2));
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough)!;

  let posSteps = Math.ceil(maxVal / step - 1e-9);
  if (posSteps * step <= maxVal) posSteps += 1;
  let negSteps = Math.ceil(Math.abs(minVal) / step - 1e-9);
  if (negSteps * step <= Math.abs(minVal)) negSteps += 1;

  const ticks: number[] = [];
  for (let i = -negSteps; i <= posSteps; i += 1) {
    ticks.push(i * step);
  }

  return {
    ticks,
    top: posSteps * step,
    bottom: -negSteps * step,
    step
  };
}

/**
 * Nhãn mốc trục rút gọn theo tiếng Việt: 0, 500k, 1,2 tr, 10 tr, 1,5 tỷ (hỗ trợ cả số âm).
 */
export function compactMoneyVi(value: number): string {
  if (value === 0) return '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const trim = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

  if (abs >= 1e9) return `${sign}${trim(abs / 1e9)} tỷ`;
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)} tr`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}k`;
  return `${sign}${abs}`;
}

/**
 * Rút gọn số tiền cho nhãn dạng viên và câu chữ: "300 nghìn", "1,2 tr", "1,5 tỷ".
 */
export function formatShortVi(value: number): string {
  const abs = Math.abs(Math.round(value));
  const trim = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

  if (abs >= 1e9) return `${trim(abs / 1e9)} tỷ`;
  if (abs >= 1e6) return `${trim(abs / 1e6)} tr`;
  if (abs >= 1e3) return `${trim(abs / 1e3)} nghìn`;
  return `${abs} ₫`;
}

export interface ProratedBudgetResult {
  diff: number;
  isOver: boolean;
  label: string;
}

/**
 * Tính chênh lệch so với ngân sách tính tới hôm nay:
 * Ngân sách hôm nay = (tổng ngân sách / tổng số ngày) * ngày hôm nay.
 * Trả về viên "Dưới mức 1,2 tr" (xanh lục) hoặc "Vượt 300 nghìn" (danger).
 */
export function proratedBudgetDiff(
  spentSoFar: number,
  totalBudget: number,
  currentDay: number,
  totalDays: number
): ProratedBudgetResult | null {
  if (totalBudget <= 0 || currentDay <= 0 || totalDays <= 0) return null;
  const proratedBudget = (totalBudget / totalDays) * currentDay;
  const diff = proratedBudget - spentSoFar;

  if (diff >= 0) {
    return {
      diff,
      isOver: false,
      label: `Dưới mức ${formatShortVi(diff)}`
    };
  }
  return {
    diff: Math.abs(diff),
    isOver: true,
    label: `Vượt ${formatShortVi(Math.abs(diff))}`
  };
}

export interface NetWorthPoint {
  month: string;
  label: string;
  netWorth: number;
  netFlow: number;
}

/**
 * Tính chuỗi tài sản ròng theo tháng (tính lùi từ số dư hiện tại trừ dòng tiền từng tháng).
 * @param currentTotalBalance Tổng số dư các ví hiện tại
 * @param months Danh sách 12 tháng (từ cũ nhất đến mới nhất)
 * @param monthlyFlows Bản đồ dòng tiền từng tháng { income, expense }
 */
export function computeNetWorthSeries(
  currentTotalBalance: number,
  months: string[],
  monthlyFlows: Map<string, { income: number; expense: number }>
): NetWorthPoint[] {
  const result: NetWorthPoint[] = new Array(months.length);
  let running = currentTotalBalance;

  // Đi lùi từ tháng mới nhất (cuối mảng) về tháng cũ nhất
  for (let i = months.length - 1; i >= 0; i -= 1) {
    const month = months[i]!;
    const flow = monthlyFlows.get(month);
    const netFlow = flow ? Number(flow.income) - Number(flow.expense) : 0;

    const [, m] = month.split('-');
    const label = `T${Number(m)}`;

    result[i] = {
      month,
      label,
      netWorth: running,
      netFlow
    };

    // Số dư cuối tháng trước = số dư cuối tháng này - dòng tiền ròng của tháng này
    running -= netFlow;
  }

  return result;
}
