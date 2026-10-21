import { describe, expect, it } from 'vitest';
import type { Bill, RecurringRule } from '../api/types';
import { monthBounds, monthKey, monthLabel, shiftMonth } from './month';
import { dueItems, dueText, isDueSoon, nextDue, occurrencesBetween } from './obligations';
import { compactMoney, cumulativeByDay, niceTicks } from './spend-series';

describe('month', () => {
  it('khóa, nhãn và biên tháng', () => {
    expect(monthKey(new Date(2026, 9, 21))).toBe('2026-10');
    expect(monthLabel('2026-10')).toBe('Tháng 10 2026');
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28', days: 28 });
    expect(monthBounds('2028-02').days).toBe(29);
  });
  it('chuyển tháng qua năm', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('niceTicks', () => {
  it('mốc tròn, đều, mốc trên cùng cao hơn giá trị lớn nhất', () => {
    const { ticks, top } = niceTicks(9_757_000);
    expect(ticks[0]).toBe(0);
    expect(top).toBeGreaterThan(9_757_000);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(6);
    const step = ticks[1]! - ticks[0]!;
    ticks.forEach((tick, index) => expect(tick).toBe(index * step));
    expect([1, 2, 2.5, 5].some((f) => step % (f * 10 ** Math.floor(Math.log10(step))) === 0)).toBe(true);
  });
  it('giá trị đúng bằng mốc thì thêm một mốc', () => {
    expect(niceTicks(4_000_000, 4).top).toBeGreaterThan(4_000_000);
  });
  it('không có dữ liệu vẫn trả khung hợp lệ', () => {
    const { ticks, top } = niceTicks(0);
    expect(ticks[0]).toBe(0);
    expect(top).toBeGreaterThan(0);
  });
});

describe('compactMoney', () => {
  it('rút gọn kiểu Việt', () => {
    expect(compactMoney(0)).toBe('0');
    expect(compactMoney(500_000)).toBe('500k');
    expect(compactMoney(2_500_000)).toBe('2,5 tr');
    expect(compactMoney(10_000_000)).toBe('10 tr');
    expect(compactMoney(1_200_000_000)).toBe('1,2 tỷ');
  });
});

describe('cumulativeByDay', () => {
  it('cộng dồn theo ngày và bỏ giao dịch ngoài tháng', () => {
    const items = [
      { occurredAt: new Date(2026, 9, 2, 12), amount: '100' },
      { occurredAt: new Date(2026, 9, 2, 20), amount: 50 },
      { occurredAt: new Date(2026, 9, 4, 8), amount: 25 },
      { occurredAt: new Date(2026, 8, 30, 8), amount: 999 },
      { occurredAt: new Date(2026, 9, 9, 8), amount: 7 }
    ];
    expect(cumulativeByDay(items, '2026-10', 5)).toEqual([0, 150, 150, 175, 175]);
  });
  it('không có giao dịch là đường phẳng ở 0', () => {
    expect(cumulativeByDay([], '2026-10', 3)).toEqual([0, 0, 0]);
  });
});

describe('obligations', () => {
  it('nextDue theo tần suất, kẹp ngày cuối tháng', () => {
    expect(nextDue(new Date(2026, 0, 31), 'MONTHLY')).toEqual(new Date(2026, 1, 28));
    expect(nextDue(new Date(2026, 9, 1), 'WEEKLY')).toEqual(new Date(2026, 9, 8));
    expect(nextDue(new Date(2026, 9, 1), null)).toBeNull();
  });

  it('khoản hằng tuần có nhiều lần đến hạn trong khoảng', () => {
    const dates = occurrencesBetween(new Date(2026, 9, 5), 'WEEKLY', 1, new Date(2026, 9, 22), new Date(2026, 9, 31));
    expect(dates.map((d) => d.getDate())).toEqual([26]);
    const all = occurrencesBetween(new Date(2026, 9, 5), 'WEEKLY', 1, new Date(2026, 9, 1), new Date(2026, 9, 31));
    expect(all.map((d) => d.getDate())).toEqual([5, 12, 19, 26]);
  });

  const rule = (over: Partial<RecurringRule>): RecurringRule => ({
    id: 'r1',
    name: 'Tiền nhà',
    amount: '500000',
    type: 'EXPENSE',
    frequency: 'MONTHLY',
    interval: 1,
    nextRunAt: new Date(2026, 9, 25, 12).toISOString(),
    autoPost: false,
    active: true,
    wallet: { currency: 'VND' },
    ...over
  });
  const bill = (over: Partial<Bill>): Bill => ({
    id: 'b1',
    name: 'Điện',
    amount: '300000',
    dueAt: new Date(2026, 9, 24, 12).toISOString(),
    status: 'UPCOMING',
    recurrence: null,
    wallet: null,
    ...over
  });
  const from = new Date(2026, 9, 22);
  const to = new Date(2026, 9, 31, 23, 59);

  it('gộp định kỳ chi và hóa đơn theo ngày, bỏ khoản thu, đã trả, ngừng hoạt động', () => {
    const items = dueItems({
      recurring: [rule({}), rule({ id: 'r2', type: 'INCOME' }), rule({ id: 'r3', active: false })],
      bills: [
        bill({}),
        bill({ id: 'b2', status: 'PAID' }),
        bill({ id: 'b3', dueAt: new Date(2026, 9, 10).toISOString() })
      ],
      from,
      to,
      currency: 'VND'
    });
    expect(items.map((i) => [i.name, i.kind, i.amount])).toEqual([
      ['Điện', 'bill', 300_000],
      ['Tiền nhà', 'recurring', 500_000]
    ]);
  });

  it('bỏ khoản khác tiền tệ', () => {
    const items = dueItems({
      recurring: [rule({ wallet: { currency: 'USD' } })],
      bills: [],
      from,
      to,
      currency: 'VND'
    });
    expect(items).toHaveLength(0);
  });

  it('chữ hạn và hạn gần', () => {
    const today = new Date(2026, 9, 22, 9);
    expect(dueText(new Date(2026, 9, 22, 20), today)).toBe('Hôm nay');
    expect(dueText(new Date(2026, 9, 23), today)).toBe('Ngày mai');
    expect(dueText(new Date(2026, 9, 27), today)).toBe('Còn 5 ngày');
    expect(dueText(new Date(2026, 9, 20), today)).toBe('Quá 2 ngày');
    expect(isDueSoon(new Date(2026, 9, 29), today)).toBe(true);
    expect(isDueSoon(new Date(2026, 9, 30), today)).toBe(false);
  });
});
