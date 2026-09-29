import { describe, expect, it } from 'vitest';
import { csvEscape, toCsv } from '../src/shared/csv';

describe('CSV', () => {
  it('escape dấu phẩy, quote và xuống dòng', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape('a\nb')).toBe('"a\nb"');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(12)).toBe('12');
  });

  it('xuất UTF-8 BOM và header tiếng Việt', () => {
    const csv = toCsv([{ name: 'Cà phê', amount: 25000 }], { name: 'Tên', amount: 'Số tiền' });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Tên,Số tiền\r\nCà phê,25000');
  });
});
