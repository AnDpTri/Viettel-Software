import { describe, expect, it } from 'vitest';
import type { Transaction } from '../api/types';
import { dayLabel, groupByDay } from './group-days';

const today = new Date(2026, 9, 21, 15);

const tx = (id: string, type: Transaction['type'], amount: number, date: Date, currency = 'VND'): Transaction =>
  ({
    id,
    type,
    amount: String(amount),
    occurredAt: date.toISOString(),
    wallet: { name: 'Ví', currency }
  }) as Transaction;

describe('dayLabel', () => {
  it('hôm nay, hôm qua, ngày thường, khác năm', () => {
    expect(dayLabel(new Date(2026, 9, 21), today)).toBe('Hôm nay');
    expect(dayLabel(new Date(2026, 9, 20, 23), today)).toBe('Hôm qua');
    expect(dayLabel(new Date(2026, 9, 19), today)).toBe('19 thg 10');
    expect(dayLabel(new Date(2025, 11, 5), today)).toBe('5 thg 12, 2025');
  });
});

describe('groupByDay', () => {
  it('gom theo ngày mới nhất trước, tổng tính từ chính các dòng của ngày', () => {
    const groups = groupByDay(
      [
        tx('a', 'EXPENSE', 45_000, new Date(2026, 9, 21, 9)),
        tx('b', 'EXPENSE', 55_000, new Date(2026, 9, 21, 12)),
        tx('c', 'INCOME', 1_500_000, new Date(2026, 9, 21, 13)),
        tx('d', 'TRANSFER', 999_000, new Date(2026, 9, 21, 14)),
        tx('e', 'EXPENSE', 200_000, new Date(2026, 9, 19, 8))
      ],
      today
    );
    expect(groups.map((group) => group.label)).toEqual(['Hôm nay', '19 thg 10']);
    expect(groups[0]!.items.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(groups[0]!.totals).toEqual([{ currency: 'VND', expense: 100_000, income: 1_500_000 }]);
    expect(groups[1]!.totals).toEqual([{ currency: 'VND', expense: 200_000, income: 0 }]);
  });

  it('tách tổng theo tiền tệ và bỏ qua ngày chỉ có chuyển khoản trong tổng', () => {
    const groups = groupByDay(
      [tx('a', 'EXPENSE', 10, new Date(2026, 9, 21), 'USD'), tx('b', 'EXPENSE', 5000, new Date(2026, 9, 21))],
      today
    );
    expect(groups[0]!.totals).toHaveLength(2);
    const onlyTransfer = groupByDay([tx('t', 'TRANSFER', 1, new Date(2026, 9, 21))], today);
    expect(onlyTransfer[0]!.totals).toEqual([]);
  });

  it('không có giao dịch thì không có nhóm', () => {
    expect(groupByDay([], today)).toEqual([]);
  });
});
