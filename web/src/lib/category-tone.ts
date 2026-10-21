/** Ánh xạ màu danh mục về một trong 8 tông dịu `--cat-1..8` (khai báo ở styles/tokens.css). */

/** Góc màu HSL (độ) đại diện của từng tông, theo thứ tự `--cat-1` … `--cat-8`: xanh dương, lam lục, xanh lục, vàng chanh, hổ phách, cam san hô, hồng, tím mận. */
export const CATEGORY_TONE_HUES = [220, 185, 145, 75, 38, 12, 340, 285] as const;
export const CATEGORY_TONE_COUNT = CATEGORY_TONE_HUES.length;

/** Dưới ngưỡng này màu gần như xám, không có góc màu đáng tin nên rơi về tông theo băm. */
const MIN_SATURATION = 0.12;

/** Băm chuỗi ổn định (FNV-1a) thành số nguyên không âm. */
export function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** `#rgb` hoặc `#rrggbb` thành HSL (h 0-360, s và l 0-1); chuỗi không hợp lệ trả `null`. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let digits = match[1]!;
  if (digits.length === 3) digits = [...digits].map((digit) => digit + digit).join('');
  const [r, g, b] = [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16) / 255) as [
    number,
    number,
    number
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

/**
 * Chọn tông (1-8) cho một danh mục. Màu người dùng đặt là gốc: lấy tông có góc màu gần nhất.
 * Chưa có màu (hoặc màu xám/không hợp lệ) thì chọn theo băm của `seed` (id hoặc tên) để cùng danh mục luôn cùng tông.
 */
export function categoryTone(color: string | null | undefined, seed: string): number {
  const hsl = color ? hexToHsl(color) : null;
  if (hsl && hsl.s >= MIN_SATURATION) {
    let best = 0;
    let bestDistance = Infinity;
    CATEGORY_TONE_HUES.forEach((hue, index) => {
      const distance = circularDistance(hsl.h, hue);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best + 1;
  }
  return (stableHash(seed) % CATEGORY_TONE_COUNT) + 1;
}
