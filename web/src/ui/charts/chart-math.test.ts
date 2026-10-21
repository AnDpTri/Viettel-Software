import { describe, expect, it } from 'vitest';
import {
  compactMoneyVi,
  computeNetWorthSeries,
  formatShortVi,
  niceSignedTicks,
  niceTicks,
  proratedBudgetDiff
} from './chart-math';

describe('chart-math', () => {
  describe('niceTicks', () => {
    it('tạo mốc tròn và mốc trên cao hơn giá trị lớn nhất', () => {
      const { ticks, top } = niceTicks(9_750_000);
      expect(ticks[0]).toBe(0);
      expect(top).toBeGreaterThan(9_750_000);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.length).toBeLessThanOrEqual(6);
    });

    it('giá trị 0 vẫn có mốc hợp lệ', () => {
      const { ticks, top } = niceTicks(0);
      expect(ticks[0]).toBe(0);
      expect(top).toBeGreaterThan(0);
    });
  });

  describe('niceSignedTicks', () => {
    it('khoảng cả âm và dương luôn có mốc 0 chính xác', () => {
      const { ticks, top, bottom } = niceSignedTicks(-4_500_000, 8_200_000);
      expect(ticks).toContain(0);
      expect(bottom).toBeLessThanOrEqual(-4_500_000);
      expect(top).toBeGreaterThanOrEqual(8_200_000);
      // Mọi mốc cách đều nhau
      const step = ticks[1]! - ticks[0]!;
      for (let i = 1; i < ticks.length; i += 1) {
        expect(ticks[i]! - ticks[i - 1]!).toBe(step);
      }
    });

    it('khoảng chỉ dương trả về từ 0', () => {
      const res = niceSignedTicks(0, 5_000_000);
      expect(res.bottom).toBe(0);
      expect(res.ticks[0]).toBe(0);
      expect(res.top).toBeGreaterThanOrEqual(5_000_000);
    });

    it('khoảng chỉ âm trả về tới 0', () => {
      const res = niceSignedTicks(-3_000_000, 0);
      expect(res.top).toBe(0);
      expect(res.bottom).toBeLessThanOrEqual(-3_000_000);
      expect(res.ticks[res.ticks.length - 1]).toBe(0);
    });
  });

  describe('compactMoneyVi', () => {
    it('định dạng số tiếng Việt', () => {
      expect(compactMoneyVi(0)).toBe('0');
      expect(compactMoneyVi(500_000)).toBe('500k');
      expect(compactMoneyVi(1_200_000)).toBe('1,2 tr');
      expect(compactMoneyVi(10_000_000)).toBe('10 tr');
      expect(compactMoneyVi(1_500_000_000)).toBe('1,5 tỷ');
      expect(compactMoneyVi(-450_000)).toBe('-450k');
      expect(compactMoneyVi(-2_300_000)).toBe('-2,3 tr');
    });
  });

  describe('formatShortVi', () => {
    it('định dạng rút gọn chữ', () => {
      expect(formatShortVi(300_000)).toBe('300 nghìn');
      expect(formatShortVi(1_200_000)).toBe('1,2 tr');
      expect(formatShortVi(15_000_000)).toBe('15 tr');
      expect(formatShortVi(2_000_000_000)).toBe('2 tỷ');
    });
  });

  describe('proratedBudgetDiff', () => {
    it('dưới mức ngân sách tính tới hôm nay (xanh lục)', () => {
      // Ngân sách 30tr, tháng 30 ngày => 1tr/ngày. Đến ngày 10, ngân sách tích lũy là 10tr.
      // Đã tiêu 8.8tr => Dưới mức 1,2 tr
      const res = proratedBudgetDiff(8_800_000, 30_000_000, 10, 30);
      expect(res).not.toBeNull();
      expect(res?.isOver).toBe(false);
      expect(res?.diff).toBe(1_200_000);
      expect(res?.label).toBe('Dưới mức 1,2 tr');
    });

    it('vượt ngân sách tính tới hôm nay (danger)', () => {
      // Đến ngày 10 ngân sách 10tr. Đã tiêu 10.3tr => Vượt 300 nghìn
      const res = proratedBudgetDiff(10_300_000, 30_000_000, 10, 30);
      expect(res).not.toBeNull();
      expect(res?.isOver).toBe(true);
      expect(res?.diff).toBe(300_000);
      expect(res?.label).toBe('Vượt 300 nghìn');
    });

    it('không có ngân sách trả về null', () => {
      expect(proratedBudgetDiff(500_000, 0, 10, 30)).toBeNull();
    });
  });

  describe('computeNetWorthSeries', () => {
    it('tính lùi chuỗi tài sản ròng chính xác từ số dư hiện tại và dòng tiền', () => {
      const months = ['2026-08', '2026-09', '2026-10'];
      const flows = new Map<string, { income: number; expense: number }>([
        ['2026-10', { income: 5_000_000, expense: 4_000_000 }], // ròng +1M
        ['2026-09', { income: 6_000_000, expense: 3_000_000 }], // ròng +3M
        ['2026-08', { income: 2_000_000, expense: 3_000_000 }] // ròng -1M
      ]);

      // Hiện tại (cuối 2026-10) số dư là 10M
      const series = computeNetWorthSeries(10_000_000, months, flows);
      expect(series).toHaveLength(3);

      // Tháng 10: 10M
      expect(series[2]!.netWorth).toBe(10_000_000);
      expect(series[2]!.netFlow).toBe(1_000_000);

      // Tháng 9: 10M - 1M = 9M
      expect(series[1]!.netWorth).toBe(9_000_000);
      expect(series[1]!.netFlow).toBe(3_000_000);

      // Tháng 8: 9M - 3M = 6M
      expect(series[0]!.netWorth).toBe(6_000_000);
      expect(series[0]!.netFlow).toBe(-1_000_000);
    });
  });
});
