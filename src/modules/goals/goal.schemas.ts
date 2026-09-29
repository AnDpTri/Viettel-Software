import { z } from '../../core/http/zod';
import { money, uuid } from '../../core/http/validation';
import { named } from '../../docs/route-docs';

export const goalInput = named(
  'GoalInput',
  z.object({
    name: z.string().trim().min(1).max(120),
    targetAmount: money,
    walletId: uuid.nullable().optional(),
    targetDate: z
      .string()
      .date()
      .transform((value) => new Date(`${value}T00:00:00.000Z`))
      .nullable()
      .optional(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
    priority: z.coerce.number().int().min(0).max(100).default(0),
    recurringAmount: money.nullable().optional(),
    recurringFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional()
  })
);

export const goalListQuery = z.object({ status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional() });

export const contributionInput = named(
  'GoalContributionInput',
  z.object({
    amount: z.coerce
      .number()
      .min(-999_999_999_999)
      .max(999_999_999_999)
      .refine((value) => value !== 0, 'Số tiền phải khác 0.')
      .openapi({ description: 'Số dương: góp thêm; số âm: rút bớt', example: 1000000 }),
    note: z.string().trim().max(255).optional(),
    transactionId: uuid.nullable().optional(),
    fromWalletId: uuid
      .nullable()
      .optional()
      .openapi({ description: 'Ví nguồn: hệ thống tạo giao dịch chuyển khoản thật sang ví của mục tiêu' })
  })
);

export type GoalInput = z.infer<typeof goalInput>;
export type ContributionInput = z.infer<typeof contributionInput>;
