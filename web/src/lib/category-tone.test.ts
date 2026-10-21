import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORY_TONE_COUNT, categoryTone, hexToHsl, stableHash } from './category-tone';

describe('categoryTone', () => {
  it('ánh xạ màu người dùng về tông có góc màu gần nhất', () => {
    expect(categoryTone('#1d5fbf', 'x')).toBe(1); // xanh dương
    expect(categoryTone('#23654f', 'x')).toBe(3); // xanh lục đậm
    expect(categoryTone('#ff0000', 'x')).toBe(6); // đỏ -> san hô
    expect(categoryTone('#f5a623', 'x')).toBe(5); // cam vàng -> hổ phách
    expect(categoryTone('#a020f0', 'x')).toBe(8); // tím
  });

  it('chấp nhận #rgb và không phân biệt hoa thường', () => {
    expect(categoryTone('#00F', 'x')).toBe(1);
    expect(categoryTone('#1D5FBF', 'x')).toBe(categoryTone('#1d5fbf', 'x'));
  });

  it('không có màu, màu xám hoặc sai định dạng thì chọn theo băm ổn định', () => {
    const a = categoryTone(null, 'cat-123');
    expect(categoryTone(undefined, 'cat-123')).toBe(a);
    expect(categoryTone('#888888', 'cat-123')).toBe(a);
    expect(categoryTone('không phải màu', 'cat-123')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(CATEGORY_TONE_COUNT);
  });

  it('băm phân bố qua đủ 8 tông', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, index) => categoryTone(null, `id-${index}`)));
    expect(seen.size).toBe(CATEGORY_TONE_COUNT);
  });

  it('stableHash luôn cho cùng kết quả', () => {
    expect(stableHash('Ăn uống')).toBe(stableHash('Ăn uống'));
    expect(stableHash('a')).not.toBe(stableHash('b'));
  });

  it('hexToHsl đọc đúng màu cơ bản', () => {
    expect(hexToHsl('#ff0000')).toMatchObject({ h: 0, s: 1 });
    expect(hexToHsl('#0000ff')?.h).toBeCloseTo(240);
    expect(hexToHsl('xyz')).toBeNull();
  });
});

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe('tokens.css: tông danh mục', () => {
  const css = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8');

  it.each(Array.from({ length: CATEGORY_TONE_COUNT }, (_, index) => index + 1))(
    'tông %i đạt tương phản chữ/nền tối thiểu 4,5:1 ở sáng và tối',
    (n) => {
      const read = (name: string) => {
        const match = new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'i').exec(css);
        expect(match, `thiếu --${name}`).not.toBeNull();
        return [match![1]!, match![2]!] as const;
      };
      const [bgLight, bgDark] = read(`cat-${n}`);
      const [inkLight, inkDark] = read(`cat-${n}-ink`);
      expect(contrast(bgLight, inkLight)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(bgDark, inkDark)).toBeGreaterThanOrEqual(4.5);
    }
  );
});
