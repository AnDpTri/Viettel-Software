import { z } from '../../core/http/zod';
import { money, uuid } from '../../core/http/validation';

const recurrence = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);
const transactionType = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);

export const recurringInput = z.object({
  walletId: uuid,
  categoryId: uuid.nullable().optional(),
  name: z.string().trim().min(1).max(120),
  type: transactionType,
  amount: money,
  frequency: recurrence,
  interval: z.coerce.number().int().min(1).max(365).default(1),
  nextRunAt: z.coerce.date(),
  endAt: z.coerce.date().nullable().optional(),
  autoPost: z.boolean().default(false),
  active: z.boolean().default(true),
  note: z.string().max(500).nullable().optional()
});

export const billInput = z.object({
  name: z.string().trim().min(1).max(120),
  amount: money,
  dueAt: z.coerce.date(),
  walletId: uuid.nullable().optional(),
  recurrence: recurrence.nullable().optional(),
  reminderDays: z.array(z.number().int().min(0).max(90)).max(10).default([1, 3, 7])
});

/** Sửa hóa đơn hoặc đổi trạng thái trong cùng một schema (một union trước đây luôn bỏ qua `status`). */
export const billPatchInput = billInput
  .partial()
  .extend({ status: z.enum(['UPCOMING', 'PAID', 'OVERDUE', 'SKIPPED']).optional() });

export const billPayInput = z.object({
  walletId: uuid.optional().openapi({ description: 'Bỏ trống thì dùng ví gắn với hóa đơn' }),
  categoryId: uuid.nullable().optional()
});

export const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  walletId: uuid,
  categoryId: uuid.nullable().optional(),
  type: transactionType,
  amount: money.nullable().optional(),
  note: z.string().max(500).nullable().optional()
});

export const templateUseInput = z.object({
  amount: money.optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
  note: z.string().max(500).optional()
});

export type RecurringInput = z.infer<typeof recurringInput>;
export type BillInput = z.infer<typeof billInput>;
export type BillPatch = z.infer<typeof billPatchInput>;
export type BillPayInput = z.infer<typeof billPayInput>;
export type TemplateInput = z.infer<typeof templateInput>;
export type TemplateUseInput = z.infer<typeof templateUseInput>;
