import { z } from '../../core/http/zod';

export const consentInput = z.object({ consent: z.boolean() });
export const conversationInput = z.object({ title: z.string().trim().min(1).max(120).default('Cuộc trò chuyện mới') });
export const assistantInput = z.object({
  question: z.string().trim().min(1).max(1500),
  conversationId: z.string().uuid().optional(),
  retryMessageId: z
    .string()
    .uuid()
    .optional()
    .openapi({ description: 'Tin nhắn người dùng đang FAILED cần gửi lại trong cùng hội thoại' }),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1500) }))
    .max(8)
    .default([]),
  uiContext: z
    .object({
      currentView: z
        .enum([
          'dashboard',
          'transactions',
          'wallets',
          'categories',
          'budgets',
          'goals',
          'reports',
          'planning',
          'insights'
        ])
        .optional()
    })
    .optional()
    .openapi({ description: 'Màn hình người dùng đang mở, để trợ lý hướng dẫn đúng chỗ' })
});

export type AssistantInput = z.infer<typeof assistantInput>;
