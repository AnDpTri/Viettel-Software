import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { hashToken, randomToken, signAccessToken, signRefreshToken, tokenExpiry, verifyRefreshToken } from '../lib/security';
import { authenticate } from '../middleware/auth';
import { sendPasswordReset } from '../services/mail.service';

export const authRouter = Router();

const passwordSchema = z.string().min(8).max(72).regex(/[a-z]/, 'Mật khẩu cần chữ thường.')
  .regex(/[A-Z]/, 'Mật khẩu cần chữ hoa.').regex(/\d/, 'Mật khẩu cần chữ số.');

const publicUser = (user: { id: string; username: string; email: string | null; phone: string | null; fullName: string | null; timezone: string; currency: string; createdAt: Date }) => user;

async function issueTokens(user: { id: string; username: string }) {
  const tokenId = randomUUID();
  const refreshToken = signRefreshToken(user.id, tokenId);
  await prisma.refreshToken.create({ data: { id: tokenId, userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: tokenExpiry(refreshToken) } });
  return { accessToken: signAccessToken(user), refreshToken };
}

authRouter.post('/register', asyncHandler(async (req, res) => {
  const input = z.object({
    username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?[0-9]{9,15}$/).optional(),
    password: passwordSchema,
    fullName: z.string().trim().min(2).max(120).optional()
  }).refine((value) => value.email || value.phone, { message: 'Cần cung cấp email hoặc số điện thoại.' }).parse(req.body);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const { password: _password, ...userInput } = input;
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { ...userInput, passwordHash } });
    await tx.wallet.create({ data: { userId: created.id, name: 'Tiền mặt', type: 'CASH', currency: created.currency } });
    await tx.category.createMany({ data: [
      { userId: created.id, name: 'Lương', type: 'INCOME', color: '#16A34A' },
      { userId: created.id, name: 'Ăn uống', type: 'EXPENSE', color: '#F97316' },
      { userId: created.id, name: 'Di chuyển', type: 'EXPENSE', color: '#3B82F6' }
    ] });
    return created;
  });
  const tokens = await issueTokens(user);
  return success(res, { user: publicUser(user), ...tokens }, 'Đăng ký thành công.', 201);
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const input = z.object({ identifier: z.string().min(1), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findFirst({ where: { OR: [{ username: input.identifier }, { email: input.identifier }, { phone: input.identifier }] } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Thông tin đăng nhập không đúng.');
  return success(res, { user: publicUser(user), ...(await issueTokens(user)) }, 'Đăng nhập thành công.');
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
  try {
    const payload = verifyRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date() || stored.tokenHash !== hashToken(refreshToken)) throw new Error('Token đã thu hồi');
    const tokens = await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
      const tokenId = randomUUID();
      const nextRefresh = signRefreshToken(stored.userId, tokenId);
      await tx.refreshToken.create({ data: { id: tokenId, userId: stored.userId, tokenHash: hashToken(nextRefresh), expiresAt: tokenExpiry(nextRefresh) } });
      return { accessToken: signAccessToken(stored.user), refreshToken: nextRefresh };
    });
    return success(res, tokens, 'Làm mới token thành công.');
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ hoặc đã hết hạn.');
  }
}));

authRouter.post('/logout', authenticate, asyncHandler(async (req, res) => {
  const input = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
  await prisma.refreshToken.updateMany({ where: { userId: req.user!.id, tokenHash: hashToken(input.refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
  return success(res, null, 'Đăng xuất thành công.');
}));

authRouter.post('/forgot-password', asyncHandler(async (req, res) => {
  const { identifier } = z.object({ identifier: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }, { phone: identifier }] } });
  if (user && user.email) {
    const token = randomToken();
    await prisma.passwordResetToken.create({ data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + config.RESET_TOKEN_EXPIRES_MINUTES * 60_000)
    } });
    await sendPasswordReset(user.email, token);
  }
  return success(res, null, 'Nếu tài khoản tồn tại và có email, hướng dẫn đặt lại mật khẩu đã được gửi.');
}));

authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  const input = z.object({ token: z.string().min(20), newPassword: passwordSchema }).parse(req.body);
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!stored || stored.usedAt || stored.expiresAt <= new Date()) throw new AppError(400, 'INVALID_RESET_TOKEN', 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
  await prisma.$transaction([
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash: await bcrypt.hash(input.newPassword, 12) } }),
    prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);
  return success(res, null, 'Đặt lại mật khẩu thành công.');
}));

authRouter.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const input = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) throw new AppError(400, 'WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng.');
  if (await bcrypt.compare(input.newPassword, user.passwordHash)) throw new AppError(400, 'SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(input.newPassword, 12) } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);
  return success(res, null, 'Đổi mật khẩu thành công, vui lòng đăng nhập lại.');
}));
