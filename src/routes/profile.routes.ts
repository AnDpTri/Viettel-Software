import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { authenticate } from '../middleware/auth';

export const profileRouter = Router();
profileRouter.use(authenticate);

const select = { id: true, username: true, email: true, phone: true, fullName: true, timezone: true, currency: true, locale: true, theme: true, preferences: true, emailVerifiedAt: true, phoneVerifiedAt: true, createdAt: true, updatedAt: true };

profileRouter.get('/', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select });
  return success(res, user);
}));

profileRouter.patch('/', asyncHandler(async (req, res) => {
  const input = z.object({
    email: z.string().email().nullable().optional(),
    phone: z.string().regex(/^\+?[0-9]{9,15}$/).nullable().optional(),
    fullName: z.string().trim().min(2).max(120).nullable().optional(),
    timezone: z.string().min(1).max(50).optional(),
    currency: z.string().length(3).transform((value) => value.toUpperCase()).optional(),
    locale: z.string().min(2).max(20).optional(),
    theme: z.enum(['SYSTEM', 'LIGHT', 'DARK']).optional(),
    preferences: z.record(z.string(), z.unknown()).optional()
  }).refine((value) => Object.keys(value).length > 0, 'Không có dữ liệu cập nhật.').parse(req.body);
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: { ...input, preferences: input.preferences as Prisma.InputJsonValue | undefined }, select });
  return success(res, user, 'Cập nhật hồ sơ thành công.');
}));
