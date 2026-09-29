import { describe, expect, it } from 'vitest';
import { reportPeriod } from '../src/modules/reports/report.schemas';

describe('reportPeriod', () => {
  it('bao gồm trọn ngày hiện tại trong khoảng mặc định', () => {
    const result = reportPeriod({}, new Date('2026-09-28T02:00:00.000Z'));
    expect(result.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(result.to.toISOString()).toBe('2026-09-28T23:59:59.999Z');
  });

  it('coi ngày kết thúc dạng YYYY-MM-DD là hết ngày', () => {
    const result = reportPeriod({ from: '2026-09-28', to: '2026-09-28' });
    expect(result.from.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(result.to.toISOString()).toBe('2026-09-28T23:59:59.999Z');
  });

  it('từ chối khoảng ngày đảo ngược', () => {
    expect(() => reportPeriod({ from: '2026-09-29', to: '2026-09-28' })).toThrow('Ngày bắt đầu');
  });
});
