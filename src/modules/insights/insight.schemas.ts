import { z } from '../../core/http/zod';

export const parseTextInput = z.object({
  text: z.string().trim().min(3).max(500).openapi({ example: 'Ăn trưa 75k hôm qua' })
});
export const receiptTextInput = z.object({ text: z.string().min(3).max(20_000) });
