import { z } from '../../core/http/zod';
import { named } from '../../docs/route-docs';
import { uuid } from '../../core/http/validation';

export const walletInput = named(
  'WalletInput',
  z.object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(['CASH', 'BANK', 'E_WALLET', 'CREDIT', 'OTHER']).default('CASH'),
    currency: z
      .string()
      .length(3)
      .transform((value) => value.toUpperCase())
      .default('VND'),
    openingBalance: z.coerce.number().min(-999_999_999_999).max(999_999_999_999).default(0),
    icon: z.string().max(50).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
    sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
    institutionName: z.string().trim().max(120).nullable().optional(),
    creditLimit: z.coerce.number().positive().nullable().optional(),
    billingDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
    dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
    includeInNetWorth: z.boolean().default(true),
    householdId: uuid.nullable().optional()
  })
);

export const walletListQuery = z.object({
  includeArchived: z.enum(['true', 'false']).optional().openapi({ description: 'true: gồm cả ví đã lưu trữ' })
});

export type WalletInput = z.infer<typeof walletInput>;
