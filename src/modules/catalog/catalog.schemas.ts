import { z } from '../../core/http/zod';
import { uuid } from '../../core/http/validation';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const currencyCode = z
  .string()
  .length(3)
  .transform((value) => value.toUpperCase());

export const tagInput = z.object({ name: z.string().trim().min(1).max(50), color: hexColor.nullable().optional() });

export const merchantInput = z.object({
  name: z.string().trim().min(1).max(160),
  defaultCategoryId: uuid.nullable().optional()
});

export const automationRuleInput = z.object({
  name: z.string().min(1).max(120),
  field: z.enum(['note', 'payee', 'reference', 'amount']),
  operator: z.enum(['contains', 'equals', 'startsWith', 'gte', 'lte']),
  value: z.string().min(1).max(255),
  categoryId: uuid.nullable().optional(),
  tagName: z.string().max(50).nullable().optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true)
});

export const exchangeRateInput = z.object({
  baseCurrency: currencyCode,
  quoteCurrency: currencyCode,
  rate: z.coerce.number().positive(),
  effectiveAt: z.coerce.date().default(() => new Date()),
  source: z.string().max(30).default('MANUAL')
});

export type TagInput = z.infer<typeof tagInput>;
export type MerchantInput = z.infer<typeof merchantInput>;
export type AutomationRuleInput = z.infer<typeof automationRuleInput>;
export type ExchangeRateInput = z.infer<typeof exchangeRateInput>;
