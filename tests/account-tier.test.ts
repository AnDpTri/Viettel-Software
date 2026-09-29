import { describe, expect, it } from 'vitest';
import { isVipAccount } from '../src/shared/account-tier';

describe('VIP entitlement', () => {
  const now = new Date('2026-09-28T00:00:00.000Z');

  it('không cấp quyền VIP cho tài khoản FREE', () => {
    expect(isVipAccount({ accountTier: 'FREE', vipExpiresAt: null }, now)).toBe(false);
  });

  it('cấp VIP vĩnh viễn khi không có ngày hết hạn', () => {
    expect(isVipAccount({ accountTier: 'VIP', vipExpiresAt: null }, now)).toBe(true);
  });

  it('chỉ cấp VIP có thời hạn khi chưa hết hạn', () => {
    expect(isVipAccount({ accountTier: 'VIP', vipExpiresAt: '2026-10-01T00:00:00.000Z' }, now)).toBe(true);
    expect(isVipAccount({ accountTier: 'VIP', vipExpiresAt: '2026-09-01T00:00:00.000Z' }, now)).toBe(false);
  });
});
