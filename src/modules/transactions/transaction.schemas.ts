import { z } from '../../core/http/zod';
import { dateString, money, uuid } from '../../core/http/validation';
import { named } from '../../docs/route-docs';

export const transactionInput = named(
  'TransactionInput',
  z.object({
    walletId: uuid,
    destinationWalletId: uuid.nullable().optional(),
    categoryId: uuid.nullable().optional(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
    amount: money,
    occurredAt: dateString.transform((value) => new Date(value)),
    note: z.string().trim().max(500).nullable().optional(),
    status: z.enum(['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED', 'CANCELLED']).default('CLEARED'),
    payee: z.string().trim().max(160).nullable().optional(),
    location: z.string().trim().max(255).nullable().optional(),
    paymentMethod: z.string().trim().max(50).nullable().optional(),
    reference: z.string().trim().max(120).nullable().optional(),
    merchantId: uuid.nullable().optional(),
    tagIds: z.array(uuid).max(20).optional()
  })
);

export const filterQuery = z.object({
  walletId: uuid.optional(),
  categoryId: uuid.optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  from: dateString.optional().openapi({ example: '2026-09-01' }),
  to: dateString.optional().openapi({ example: '2026-09-30' }),
  keyword: z.string().max(100).optional().openapi({ description: 'Tìm trong ghi chú, người nhận, mã tham chiếu' })
});

export const pagingQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const bulkInput = z.object({
  ids: z.array(uuid).min(1).max(500),
  action: z.enum(['DELETE', 'RESTORE', 'RECONCILE']),
  categoryId: uuid.nullable().optional()
});

export const importInput = z.object({ rows: z.array(transactionInput).min(1).max(2000) });

export const splitsInput = z.object({
  splits: z
    .array(
      z.object({
        categoryId: uuid.nullable().optional(),
        amount: money,
        note: z.string().max(255).nullable().optional()
      })
    )
    .min(2)
    .max(50)
});

export type TransactionInput = z.infer<typeof transactionInput>;
export type TransactionFilter = z.infer<typeof filterQuery>;
export type BulkInput = z.infer<typeof bulkInput>;
export type SplitInput = z.infer<typeof splitsInput>['splits'];
