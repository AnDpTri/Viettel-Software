import { describe, expect, it } from 'vitest';
import { parseVietnameseTransaction } from '../src/routes/insight.routes';

describe('Vietnamese transaction parser', () => {
  it.each([
    ['Ăn trưa 75k hôm qua', 75_000, 'EXPENSE'],
    ['Mua điện thoại 15 triệu', 15_000_000, 'EXPENSE'],
    ['Thanh toán 120.000đ', 120_000, 'EXPENSE'],
    ['Nhận lương 12,5 triệu', 12_500_000, 'INCOME'],
    ['Thu 2 tỷ', 2_000_000_000, 'INCOME']
  ])('hiểu "%s"', (text, amount, type) => {
    const parsed = parseVietnameseTransaction(text);
    expect(parsed.amount).toBe(amount);
    expect(parsed.type).toBe(type);
    expect(parsed.requiresConfirmation).toBe(true);
  });
});
