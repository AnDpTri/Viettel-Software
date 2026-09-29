export type AccountTierFields = { accountTier: 'FREE' | 'VIP'; vipExpiresAt: Date | string | null };

export function isVipAccount(account: AccountTierFields, now = new Date()) {
  if (account.accountTier !== 'VIP') return false;
  if (!account.vipExpiresAt) return true;
  return new Date(account.vipExpiresAt).getTime() > now.getTime();
}
