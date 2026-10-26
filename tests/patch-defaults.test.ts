import { describe, expect, it } from 'vitest';
import { patchSchema } from '../src/core/http/request';
import { partialInput } from '../src/core/http/zod';
import { walletInput } from '../src/modules/wallets/wallet.schemas';
import { billPatchInput, recurringInput } from '../src/modules/scheduling/scheduling.schemas';
import { automationRuleInput } from '../src/modules/catalog/catalog.schemas';

describe('PATCH preserves fields omitted by the caller', () => {
  it('does not reset a wallet opening balance, currency or type when renaming it', () => {
    expect(patchSchema(walletInput).parse({ name: 'Tên mới' })).toEqual({ name: 'Tên mới' });
    expect(patchSchema(walletInput).safeParse({}).success).toBe(false);
    expect(patchSchema(walletInput).safeParse({ unknown: 1 }).success).toBe(false);
    expect(patchSchema(walletInput).parse({ openingBalance: 0 })).toEqual({ openingBalance: 0 });
    expect(walletInput.parse({ name: 'Ví mới' })).toMatchObject({ openingBalance: 0, currency: 'VND', type: 'CASH' });
  });

  it('does not re-enable rules, auto-posting or change bill reminders', () => {
    expect(partialInput(recurringInput).parse({ name: 'Đổi tên' })).toEqual({ name: 'Đổi tên' });
    expect(partialInput(automationRuleInput).parse({ active: false })).toEqual({ active: false });
    expect(billPatchInput.parse({ status: 'PAID' })).toEqual({ status: 'PAID' });
  });
});
