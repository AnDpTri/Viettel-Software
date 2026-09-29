import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '../core/http/async-handler';
import { isVipAccount } from '../shared/account-tier';
import { assertNotProtectedDemo } from '../shared/demo-account';
import { prisma } from '../core/database/prisma';
import { success } from '../core/http/response';
import { documentRoutes, named } from '../docs/route-docs';
import { authenticate } from '../core/security/authenticate';
import {
  createStarterCategories,
  getOnboardingStatus,
  ONBOARDING_INTERESTS,
  STARTER_CATEGORIES,
  updateOnboardingPreferences
} from '../services/onboarding.service';

export const profileRouter = Router();
profileRouter.use(authenticate);

const select = {
  id: true,
  username: true,
  email: true,
  phone: true,
  fullName: true,
  timezone: true,
  currency: true,
  locale: true,
  theme: true,
  accountTier: true,
  vipExpiresAt: true,
  preferences: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

const onboardingInput = z
  .object({
    dismissed: z.boolean().optional(),
    welcomeSeen: z.boolean().optional(),
    restart: z.boolean().optional(),
    interests: z.array(z.enum(ONBOARDING_INTERESTS)).max(ONBOARDING_INTERESTS.length).optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.');
const starterCategoriesInput = z.object({
  names: z
    .array(z.enum(STARTER_CATEGORIES.map((item) => item.name) as [string, ...string[]]))
    .max(STARTER_CATEGORIES.length)
    .optional()
    .openapi({ description: 'Chỉ tạo các danh mục được chọn; bỏ trống thì tạo tất cả danh mục gợi ý còn thiếu' })
});
const profileInput = named(
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

profileRouter.get(
  '/onboarding',
  asyncHandler(async (req, res) => success(res, await getOnboardingStatus(req.user!.id)))
);

profileRouter.patch(
  '/onboarding',
  asyncHandler(async (req, res) => {
    const input = onboardingInput.parse(req.body);
    return success(res, await updateOnboardingPreferences(req.user!.id, input), 'Đã cập nhật hướng dẫn bắt đầu.');
  })
);

profileRouter.post(
  '/onboarding/starter-categories',
  asyncHandler(async (req, res) => {
    const { names } = starterCategoriesInput.parse(req.body ?? {});
    const result = await createStarterCategories(req.user!.id, names);
    return success(
      res,
      result,
      result.created ? `Đã tạo ${result.created} danh mục gợi ý.` : 'Các danh mục gợi ý đã có sẵn.'
    );
  })
);

profileRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select });
    return success(res, { ...user, isVip: isVipAccount(user) });
  })
);

profileRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    const input = profileInput.parse(req.body);
    if (input.email !== undefined || input.phone !== undefined)
      assertNotProtectedDemo(req.user!.username, 'đổi email hoặc số điện thoại');
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { ...input, preferences: input.preferences as Prisma.InputJsonValue | undefined },
      select
    });
    return success(res, { ...user, isVip: isVipAccount(user) }, 'Cập nhật hồ sơ thành công.');
  })
);

documentRoutes(profileRouter, {
  'GET /onboarding': { summary: 'Tiến độ hướng dẫn người dùng mới, tính từ dữ liệu thực tế' },
  'PATCH /onboarding': {
    summary: 'Ẩn, đánh dấu đã xem, lưu mối quan tâm hoặc làm lại hướng dẫn ban đầu',
    body: onboardingInput
  },
  'POST /onboarding/starter-categories': {
    summary: 'Tạo các danh mục thu chi gợi ý còn thiếu',
    body: starterCategoriesInput
  },
  'GET /': { summary: 'Xem hồ sơ cá nhân và hạng tài khoản FREE/VIP' },
  'PATCH /': {
    summary: 'Cập nhật hồ sơ cá nhân',
    body: profileInput,
    errors: { 409: 'DUPLICATE_RESOURCE – email hoặc số điện thoại đã được tài khoản khác dùng.' }
  }
});
