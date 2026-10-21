import { describe, expect, it } from 'vitest';
import type { Bill, RecurringRule } from '../../api/types';
import { buildObligations } from './PlanningView';

const now = new Date(2026, 9, 21, 9);
const day = (d: number, m = 9) => new Date(2026, m, d, 12).toISOString();

const rule = (id: string, nextRunAt: string, type: 'EXPENSE' | 'INCOME' = 'EXPENSE'): RecurringRule => ({
  id,
  name: `rule-${id}`,
  amount: '100000',
  type,
  frequency: 'MONTHLY',
  nextRunAt,
  autoPost: false,
  wallet: { currency: 'VND' }
});
const bill = (id: string, dueAt: string, status = 'UPCOMING'): Bill => ({
  id,
  name: `bill-${id}`,
  amount: '200000',
  dueAt,
  status,
  recurrence: null,
  wallet: null
});

describe('buildObligations: gộp Định kỳ và Hóa đơn', () => {
  it('đưa khoản hạn gần (<= 7 ngày) và quá hạn lên đầu, rồi theo hạn, hóa đơn đã trả ở cuối', () => {
    const rows = buildObligations(
      [rule('far', day(15, 10)), rule('soon', day(25))],
      [bill('paid', day(22), 'PAID'), bill('late', day(15), 'OVERDUE'), bill('mid', day(2, 10))],
      'VND',
      now
    );
    expect(rows.map((row) => row.name)).toEqual(['bill-late', 'rule-soon', 'bill-mid', 'rule-far', 'bill-paid']);
    expect(rows.find((row) => row.name === 'rule-soon')?.soon).toBe(true);
    expect(rows.find((row) => row.name === 'bill-late')?.overdue).toBe(true);
    expect(rows.find((row) => row.name === 'bill-paid')?.paid).toBe(true);
  });

  it('gắn đúng nhãn loại và dấu thu', () => {
    const rows = buildObligations(
      [rule('in', day(25), 'INCOME'), rule('out', day(26))],
      [bill('b', day(27))],
      'VND',
      now
    );
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['rule-in']).toMatchObject({ kindLabel: 'Thu định kỳ', income: true });
    expect(byName['rule-out']).toMatchObject({ kindLabel: 'Chi định kỳ', income: false });
    expect(byName['bill-b']).toMatchObject({ kindLabel: 'Hóa đơn', income: false });
  });

  it('không có gì thì danh sách rỗng', () => {
    expect(buildObligations([], [], 'VND', now)).toEqual([]);
  });
});
