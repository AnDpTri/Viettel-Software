import { z } from '../../core/http/zod';
import { money, uuid } from '../../core/http/validation';
import { named } from '../../docs/route-docs';

export const budgetFields = z.object({
  name: z.string().trim().min(1).max(100),
  categoryId: uuid.nullable().optional(),
  amount: money,
  startDate: z
    .string()
    .date()
    .transform((value) => new Date(`${value}T00:00:00.000Z`)),
  endDate: z
    .string()
    .date()
    .transform((value) => new Date(`${value}T23:59:59.999Z`)),
  recurrence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).nullable().optional(),
  rollover: z.boolean().default(false),
  alertThresholds: z.array(z.number().int().min(1).max(200)).max(10).default([50, 80, 100])
});

export const budgetInput = named(
  'BudgetInput',
  budgetFields.refine((value) => value.endDate >= value.startDate, {
    path: ['endDate'],
    message: 'Ngày kết thúc phải sau ngày bắt đầu.'
  })
);

export type BudgetInput = z.infer<typeof budgetFields>;
