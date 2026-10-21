import { describe, expect, it } from 'vitest';
import { budgetsInMonth, daysLeftInMonth, safeToSpendToday, type BudgetLite } from './safe-to-spend';

const octoberBudget = (amount: number, spent: number): BudgetLite => ({
  amount,
  spent,
  startDate: '2026-10-01T00:00:00.000Z',
  endDate: '2026-10-31T00:00:00.000Z'
});

describe('daysLeftInMonth', () => {
  it('tính cả hôm nay', () => {
    expect(daysLeftInMonth(new Date(2026, 9, 22))).toBe(10);
    expect(daysLeftInMonth(new Date(2026, 9, 31))).toBe(1);
    expect(daysLeftInMonth(new Date(2026, 9, 1))).toBe(31);
  });
  it('tháng 2 nhuận và không nhuận', () => {
    expect(daysLeftInMonth(new Date(2028, 1, 1))).toBe(29);
    expect(daysLeftInMonth(new Date(2027, 1, 1))).toBe(28);
  });
});

describe('safeToSpendToday', () => {
  const today = new Date(2026, 9, 22); // còn 10 ngày

  it('không có ngân sách thì không tính', () => {
    expect(safeToSpendToday({ budgets: [], upcoming: 0, today })).toEqual({ kind: 'no-budget' });
  });

  it('chia phần còn lại trừ hóa đơn cho số ngày, làm tròn xuống nghìn', () => {
    // (5.000.000 - 1.937.000 - 500.000) / 10 = 256.300 -> 256.000
    const result = safeToSpendToday({ budgets: [octoberBudget(5_000_000, 1_937_000)], upcoming: 500_000, today });
    expect(result).toEqual({ kind: 'amount', perDay: 256_000, remaining: 3_063_000, upcoming: 500_000, days: 10 });
  });

  it('cộng phần còn dương của nhiều ngân sách, bỏ phần vượt của ngân sách khác', () => {
    const result = safeToSpendToday({
      budgets: [octoberBudget(2_000_000, 500_000), octoberBudget(1_000_000, 1_400_000)],
      upcoming: 0,
      today
    });
    expect(result).toMatchObject({ kind: 'amount', remaining: 1_500_000, perDay: 150_000 });
  });

  it('hóa đơn lớn hơn phần còn lại thì về 0, không âm', () => {
    const result = safeToSpendToday({ budgets: [octoberBudget(1_000_000, 900_000)], upcoming: 600_000, today });
    expect(result).toMatchObject({ kind: 'amount', perDay: 0 });
  });

  it('ngân sách đã vượt thì báo số vượt', () => {
    expect(safeToSpendToday({ budgets: [octoberBudget(1_000_000, 1_250_000)], upcoming: 0, today })).toEqual({
      kind: 'over',
      over: 250_000
    });
  });

  it('ngân sách vừa hết đúng hạn mức là 0 thật, không phải vượt', () => {
    expect(safeToSpendToday({ budgets: [octoberBudget(1_000_000, 1_000_000)], upcoming: 0, today })).toMatchObject({
      kind: 'amount',
      perDay: 0
    });
  });

  it('ngày cuối tháng chia cho 1', () => {
    const result = safeToSpendToday({
      budgets: [octoberBudget(1_000_000, 0)],
      upcoming: 0,
      today: new Date(2026, 9, 31)
    });
    expect(result).toMatchObject({ days: 1, perDay: 1_000_000 });
  });

  it('tiền tệ khác VND làm tròn xuống đơn vị', () => {
    const result = safeToSpendToday({
      budgets: [octoberBudget(100, 0)],
      upcoming: 0,
      today: new Date(2026, 9, 29),
      currency: 'USD'
    });
    expect(result).toMatchObject({ days: 3, perDay: 33 });
  });
});

describe('budgetsInMonth', () => {
  it('giữ ngân sách giao với tháng, bỏ ngân sách ngoài tháng', () => {
    const list = [
      octoberBudget(1, 0),
      { amount: 1, spent: 0, startDate: '2026-09-01', endDate: '2026-09-30' },
      { amount: 1, spent: 0, startDate: '2026-09-15', endDate: '2026-10-05' },
      { amount: 1, spent: 0, startDate: '2026-11-01', endDate: '2026-11-30' }
    ];
    expect(budgetsInMonth(list, '2026-10')).toHaveLength(2);
    expect(budgetsInMonth(list, '2026-11')).toHaveLength(1);
  });
});
