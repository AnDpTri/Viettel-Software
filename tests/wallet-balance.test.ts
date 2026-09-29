import { describe, expect, it } from 'vitest';
import { calculateWalletBalance } from '../src/shared/wallet-balance';

describe('calculateWalletBalance', () => {
  it('tính thu, chi và chuyển khoản hai chiều', () => {
    const transactions = [
      { type: 'INCOME' as const, amount: 1000, walletId: 'a' },
      { type: 'EXPENSE' as const, amount: '200', walletId: 'a' },
      { type: 'TRANSFER' as const, amount: 300, walletId: 'a', destinationWalletId: 'b' },
      { type: 'TRANSFER' as const, amount: 50, walletId: 'b', destinationWalletId: 'a' },
      { type: 'INCOME' as const, amount: 999, walletId: 'b' }
    ];
    expect(calculateWalletBalance('a', 100, transactions)).toBe(650);
    expect(calculateWalletBalance('b', 0, transactions)).toBe(1249);
  });

  it('giữ nguyên số dư khi không có giao dịch', () => {
    expect(calculateWalletBalance('a', -10, [])).toBe(-10);
  });
});
