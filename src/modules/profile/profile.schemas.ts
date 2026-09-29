import { z } from '../../core/http/zod';
import { named } from '../../docs/route-docs';
import { ONBOARDING_INTERESTS, STARTER_CATEGORIES } from '../onboarding/onboarding.constants';

export const onboardingInput = z
  .object({
    dismissed: z.boolean().optional(),
    welcomeSeen: z.boolean().optional(),
    restart: z.boolean().optional(),
    interests: z.array(z.enum(ONBOARDING_INTERESTS)).max(ONBOARDING_INTERESTS.length).optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.');

export const starterCategoriesInput = z.object({
  names: z
    .array(z.enum(STARTER_CATEGORIES.map((item) => item.name) as [string, ...string[]]))
    .max(STARTER_CATEGORIES.length)
    .optional()
    .openapi({ description: 'Chỉ tạo các danh mục được chọn; bỏ trống thì tạo tất cả danh mục gợi ý còn thiếu' })
});

export const profileInput = named(
  'ProfileUpdate',
  z
    .object({
      email: z
        .string()
        .trim()
        .email()
        .transform((value) => value.toLowerCase())
        .nullable()
        .optional(),
      phone: z
        .string()
        .regex(/^\+?[0-9]{9,15}$/)
        .nullable()
        .optional(),
      fullName: z.string().trim().min(2).max(120).nullable().optional(),
      timezone: z.string().min(1).max(50).optional().openapi({ example: 'Asia/Ho_Chi_Minh' }),
      currency: z
        .string()
        .length(3)
        .transform((value) => value.toUpperCase())
        .optional()
        .openapi({ example: 'VND' }),
      locale: z.string().min(2).max(20).optional(),
      theme: z.enum(['SYSTEM', 'LIGHT', 'DARK']).optional(),
      preferences: z.record(z.string(), z.unknown()).optional()
    })
    .refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.')
);

export type ProfileInput = z.infer<typeof profileInput>;
