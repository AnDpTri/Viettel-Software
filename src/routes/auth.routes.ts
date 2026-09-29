import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { isVipAccount } from '../lib/account-tier';
import { asyncHandler } from '../lib/async-handler';
import { audit } from '../lib/audit';
import { assertNotProtectedDemo } from '../lib/demo-account';
import {
  clearOAuthStateCookie,
  clearRefreshCookie,
  readCookie,
  setOAuthStateCookie,
  setRefreshCookie
} from '../lib/cookies';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import {
  hashToken,
  randomToken,
  signAccessToken,
  signRefreshToken,
  tokenExpiry,
  verifyRefreshToken
} from '../lib/security';
import { documentRoutes, named } from '../docs/route-docs';
import { authenticate } from '../middleware/auth';
import { logMailFailure, sendPasswordReset, sendVerificationEmail } from '../services/mail.service';

export const authRouter = Router();
/** Ô để trống trên biểu mẫu gửi chuỗi rỗng; coi như không nhập để trường tùy chọn không bị báo sai định dạng. */
const optionalText = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && !value.trim() ? undefined : value), schema.optional());
const blockedPasswords = new Set([
  'password',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'letmein',
  'demo@123'
]);
const passwordSchema = z
  .string()
  .min(10, 'Mật khẩu cần ít nhất 10 ký tự.')
  .max(72)
  .refine((value) => !blockedPasswords.has(value.toLowerCase()), 'Mật khẩu quá phổ biến hoặc đã bị lộ.');
const publicUserSelect = {
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
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  createdAt: true
} as const;

function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    timezone: user.timezone,
    currency: user.currency,
    locale: user.locale,
    theme: user.theme,
    accountTier: user.accountTier,
    vipExpiresAt: user.vipExpiresAt,
    isVip: isVipAccount(user),
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt
  };
}

function refreshFrom(req: Request) {
  const bodyToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  return bodyToken ?? readCookie(req, config.COOKIE_NAME);
}

async function issueTokens(
  user: { id: string; username: string },
  req: Request,
  familyId = randomUUID(),
  remember = true
) {
  const tokenId = randomUUID();
  const refreshToken = signRefreshToken(user.id, tokenId);
  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      familyId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: tokenExpiry(refreshToken),
      deviceName: String(req.body?.deviceName || req.get('user-agent') || 'Thiết bị không xác định').slice(0, 120),
      userAgent: req.get('user-agent')?.slice(0, 500),
      ipAddress: req.ip?.slice(0, 64),
      remember
    }
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

async function rotateRefresh(req: Request) {
  const refreshToken = refreshFrom(req);
  if (!refreshToken) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Không tìm thấy phiên đăng nhập.');
  try {
    const payload = verifyRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti }, include: { user: true } });
    if (
      !stored ||
      stored.expiresAt <= new Date() ||
      stored.tokenHash !== hashToken(refreshToken) ||
      stored.user.deletedAt
    )
      throw new Error('Phiên không hợp lệ');
    if (stored.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      throw new Error('Phát hiện token bị tái sử dụng');
    }
    const tokenId = randomUUID();
    const nextRefresh = signRefreshToken(stored.userId, tokenId);
    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } }),
      prisma.refreshToken.create({
        data: {
          id: tokenId,
          familyId: stored.familyId,
          userId: stored.userId,
          tokenHash: hashToken(nextRefresh),
          expiresAt: tokenExpiry(nextRefresh),
          deviceName: stored.deviceName,
          userAgent: req.get('user-agent')?.slice(0, 500) ?? stored.userAgent,
          ipAddress: req.ip?.slice(0, 64) ?? stored.ipAddress,
          remember: stored.remember
        }
      })
    ]);
    return {
      user: stored.user,
      accessToken: signAccessToken(stored.user),
      refreshToken: nextRefresh,
      remember: stored.remember
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }
}

async function createVerification(userId: string, email: string) {
  const token = randomToken();
  await prisma.verificationToken.create({
    data: { userId, type: 'EMAIL', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }
  });
  await sendVerificationEmail(email, token);
}

// Đăng ký chỉ cần định danh + mật khẩu (theo yêu cầu). Email tùy chọn, dùng để khôi phục mật khẩu; số điện thoại tùy chọn.
const registerInput = named(
  'RegisterRequest',
  z.object({
    username: z
      .string()
      .trim()
      .min(3, 'Tên đăng nhập cần ít nhất 3 ký tự.')
      .max(50)
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.')
      .openapi({ example: 'demo' }),
    email: optionalText(
      z
        .string()
        .trim()
        .email('Email không hợp lệ.')
        .transform((value) => value.toLowerCase())
    ),
    phone: optionalText(
      z
        .string()
        .trim()
        .regex(/^\+?[0-9]{9,15}$/, 'Số điện thoại gồm 9–15 chữ số.')
    ),
    password: passwordSchema,
    fullName: optionalText(z.string().trim().min(2, 'Họ tên cần ít nhất 2 ký tự.').max(120)),
    remember: z.boolean().default(true)
  })
);
const loginInput = named(
  'LoginRequest',
  z.object({
    identifier: z.string().trim().min(1, 'Hãy nhập tên đăng nhập hoặc email.').openapi({
      description: 'Tên đăng nhập hoặc email (không phân biệt hoa thường); số điện thoại cũng được chấp nhận',
      example: 'demo'
    }),
    password: z.string().min(1),
    remember: z.boolean().default(true),
    deviceName: z.string().max(120).optional()
  })
);
const refreshInput = z.object({
  refreshToken: z.string().optional().openapi({ description: 'Bỏ trống thì đọc từ cookie HttpOnly' })
});
// Quên mật khẩu nhận đúng email khôi phục của tài khoản, không nhận tên đăng nhập.
const forgotInput = z.object({
  email: z
    .string({ required_error: 'Hãy nhập email của tài khoản.' })
    .trim()
    .email('Email không hợp lệ.')
    .openapi({ description: 'Email của tài khoản: nhận liên kết đặt lại mật khẩu', example: 'demo@example.com' })
});
const resetInput = z.object({
  token: z.string().min(20).openapi({ description: 'Token trong liên kết email' }),
  newPassword: passwordSchema
});
const changePasswordInput = z.object({ currentPassword: z.string(), newPassword: passwordSchema });
const verifyEmailInput = z.object({ token: z.string().min(20) });
const oauthCallbackQuery = z.object({ code: z.string(), state: z.string() });

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = registerInput.parse(req.body);
    const { password, remember, ...userInput } = input;
    const user = await prisma.user.create({ data: { ...userInput, passwordHash: await bcrypt.hash(password, 12) } });
    const tokens = await issueTokens(user, req, randomUUID(), remember);
    setRefreshCookie(res, tokens.refreshToken, remember);
    if (user.email)
      await createVerification(user.id, user.email).catch((error) => logMailFailure('email_verification', error));
    await audit(
      Object.assign(req, { user: { id: user.id, username: user.username } }),
      'AUTH_REGISTER',
      'User',
      user.id
    );
    return success(
      res,
      { user: toPublicUser(user), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      'Đăng ký thành công.',
      201
    );
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = loginInput.parse(req.body);
    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { username: input.identifier },
          { email: { equals: input.identifier, mode: 'insensitive' } },
          { phone: { in: phoneVariants(input.identifier) } }
        ]
      }
    });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      await audit(req, 'AUTH_LOGIN_FAILED', undefined, undefined, { identifier: input.identifier.slice(0, 100) });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Thông tin đăng nhập không đúng.');
    }
    const tokens = await issueTokens(user, req, randomUUID(), input.remember);
    setRefreshCookie(res, tokens.refreshToken, input.remember);
    await audit(Object.assign(req, { user: { id: user.id, username: user.username } }), 'AUTH_LOGIN', 'User', user.id);
    return success(
      res,
      { user: toPublicUser(user), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      'Đăng nhập thành công.'
    );
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const tokens = await rotateRefresh(req);
    setRefreshCookie(res, tokens.refreshToken, tokens.remember);
    return success(
      res,
      { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      'Làm mới phiên thành công.'
    );
  })
);

authRouter.get(
  '/session-status',
  asyncHandler(async (req, res) => {
    const token = refreshFrom(req);
    if (!token) return success(res, { authenticated: false });
    try {
      const payload = verifyRefreshToken(token);
      const stored = await prisma.refreshToken.findUnique({
        where: { id: payload.jti },
        select: { tokenHash: true, revokedAt: true, expiresAt: true }
      });
      const authenticated = Boolean(
        stored && !stored.revokedAt && stored.expiresAt > new Date() && stored.tokenHash === hashToken(token)
      );
      return success(res, { authenticated });
    } catch {
      clearRefreshCookie(res);
      return success(res, { authenticated: false });
    }
  })
);

authRouter.post(
  '/session',
  asyncHandler(async (req, res) => {
    const tokens = await rotateRefresh(req);
    setRefreshCookie(res, tokens.refreshToken, tokens.remember);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: tokens.user.id }, select: publicUserSelect });
    return success(
      res,
      {
        user: { ...user, isVip: isVipAccount(user) },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      },
      'Khôi phục phiên thành công.'
    );
  })
);

authRouter.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const token = refreshFrom(req);
    if (token)
      await prisma.refreshToken.updateMany({
        where: { userId: req.user!.id, tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    clearRefreshCookie(res);
    await audit(req, 'AUTH_LOGOUT', 'User', req.user!.id);
    return success(res, null, 'Đăng xuất thành công.');
  })
);

authRouter.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.refreshToken.updateMany({
      where: { userId: req.user!.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    clearRefreshCookie(res);
    await audit(req, 'AUTH_LOGOUT_ALL', 'User', req.user!.id);
    return success(res, null, 'Đã đăng xuất khỏi tất cả thiết bị.');
  })
);

authRouter.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        familyId: true,
        deviceName: true,
        userAgent: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true
      },
      orderBy: { lastUsedAt: 'desc' }
    });
    return success(res, sessions);
  })
);

authRouter.delete(
  '/sessions/:familyId',
  authenticate,
  asyncHandler(async (req, res) => {
    const familyId = z.string().uuid().parse(req.params.familyId);
    await prisma.refreshToken.updateMany({
      where: { userId: req.user!.id, familyId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await audit(req, 'AUTH_SESSION_REVOKE', 'RefreshToken', familyId);
    return success(res, null, 'Đã thu hồi phiên đăng nhập.');
  })
);

/** Cùng một số có thể lưu dạng 09… hoặc +849…; tìm theo cả hai để người dùng nhập kiểu nào cũng khớp. */
function phoneVariants(value: string) {
  const phone = value.replace(/[\s.-]/g, '');
  if (phone.startsWith('+84')) return [phone, `0${phone.slice(3)}`];
  if (phone.startsWith('0')) return [phone, `+84${phone.slice(1)}`];
  return [phone];
}

const findByEmail = (email: string) =>
  prisma.user.findFirst({ where: { deletedAt: null, email: { equals: email, mode: 'insensitive' } } });

/** Quên mật khẩu: gửi liên kết chứa token ngẫu nhiên 256 bit tới email của tài khoản. Luôn trả cùng một thông báo để
 * không lộ email nào đã đăng ký; lỗi gửi thư chỉ ghi log vì cùng lý do đó. */
authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = forgotInput.parse(req.body);
    const user = await findByEmail(email);
    if (user?.email) {
      const token = randomToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + config.RESET_TOKEN_EXPIRES_MINUTES * 60_000)
        }
      });
      await sendPasswordReset(user.email, token).catch((error) => logMailFailure('password_reset', error));
      await audit(
        Object.assign(req, { user: { id: user.id, username: user.username } }),
        'AUTH_PASSWORD_RESET_REQUESTED',
        'User',
        user.id
      );
    }
    return success(res, null, 'Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi.');
  })
);

/** Đặt lại mật khẩu bằng token trong liên kết email; token dùng một lần, đặt lại xong thu hồi mọi phiên. */
authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const input = resetInput.parse(req.body);
    const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
    if (!stored || stored.usedAt || stored.expiresAt <= new Date())
      throw new AppError(
        400,
        'INVALID_RESET_TOKEN',
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.'
      );
    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash: await bcrypt.hash(input.newPassword, 12) }
      }),
      prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);
    clearRefreshCookie(res);
    return success(res, null, 'Đặt lại mật khẩu thành công.');
  })
);

authRouter.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    assertNotProtectedDemo(req.user!.username, 'đổi mật khẩu');
    const input = changePasswordInput.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash)))
      throw new AppError(400, 'WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng.');
    if (await bcrypt.compare(input.newPassword, user.passwordHash))
      throw new AppError(400, 'SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(input.newPassword, 12) } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);
    clearRefreshCookie(res);
    await audit(req, 'AUTH_PASSWORD_CHANGE', 'User', user.id);
    return success(res, null, 'Đổi mật khẩu thành công, vui lòng đăng nhập lại.');
  })
);

authRouter.post(
  '/verification/email/send',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!user.email) throw new AppError(422, 'EMAIL_REQUIRED', 'Tài khoản chưa có email.');
    if (user.emailVerifiedAt) return success(res, null, 'Email đã được xác minh.');
    await createVerification(user.id, user.email);
    return success(res, null, 'Đã gửi email xác minh.');
  })
);

authRouter.post(
  '/verification/email/confirm',
  asyncHandler(async (req, res) => {
    const { token } = verifyEmailInput.parse(req.body);
    const stored = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!stored || stored.usedAt || stored.type !== 'EMAIL' || stored.expiresAt <= new Date())
      throw new AppError(400, 'INVALID_VERIFICATION_TOKEN', 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.');
    await prisma.$transaction([
      prisma.verificationToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: stored.userId }, data: { emailVerifiedAt: new Date() } })
    ]);
    return success(res, null, 'Xác minh email thành công.');
  })
);

type OAuthProfile = { id: string; email: string | null; name: string | null; emailVerified: boolean };
const providerConfig = (provider: string) => {
  const base = config.OAUTH_CALLBACK_BASE_URL ?? config.APP_URL;
  if (provider === 'google' && config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)
    return {
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      callback: `${base}/api/v1/auth/oauth/google/callback`,
      scope: 'openid email profile'
    };
  if (provider === 'github' && config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET)
    return {
      clientId: config.GITHUB_CLIENT_ID,
      clientSecret: config.GITHUB_CLIENT_SECRET,
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      callback: `${base}/api/v1/auth/oauth/github/callback`,
      scope: 'read:user user:email'
    };
  throw new AppError(503, 'OAUTH_NOT_CONFIGURED', `Đăng nhập ${provider} chưa được cấu hình trên máy chủ.`);
};

async function oauthProfile(provider: string, code: string): Promise<OAuthProfile> {
  const pc = providerConfig(provider);
  const tokenResponse = await fetch(pc.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: pc.clientId,
      client_secret: pc.clientSecret,
      code,
      redirect_uri: pc.callback
    })
  });
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token)
    throw new AppError(401, 'OAUTH_EXCHANGE_FAILED', 'Không thể xác thực với nền tảng liên kết.');
  if (provider === 'google') {
    const data = (await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` }
    }).then((r) => r.json())) as { sub: string; email?: string; name?: string; email_verified?: boolean };
    return {
      id: data.sub,
      email: data.email ?? null,
      name: data.name ?? null,
      emailVerified: Boolean(data.email_verified)
    };
  }
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'So-Moc'
  };
  const [userData, emails] = await Promise.all([
    fetch('https://api.github.com/user', { headers }).then((r) => r.json()) as Promise<{
      id: number;
      login: string;
      name?: string;
      email?: string;
    }>,
    fetch('https://api.github.com/user/emails', { headers }).then((r) => r.json()) as Promise<
      Array<{ email: string; primary: boolean; verified: boolean }>
    >
  ]);
  const primary = Array.isArray(emails) ? emails.find((item) => item.primary && item.verified) : undefined;
  return {
    id: String(userData.id),
    email: primary?.email ?? userData.email ?? null,
    name: userData.name ?? userData.login,
    emailVerified: Boolean(primary)
  };
}

authRouter.get(
  '/oauth/:provider/start',
  asyncHandler(async (req, res) => {
    const provider = z.enum(['google', 'github']).parse(req.params.provider);
    const pc = providerConfig(provider);
    const state = randomToken();
    setOAuthStateCookie(res, state);
    const params = new URLSearchParams({
      client_id: pc.clientId,
      redirect_uri: pc.callback,
      response_type: 'code',
      scope: pc.scope,
      state
    });
    if (provider === 'google') params.set('access_type', 'offline');
    return res.redirect(`${pc.authorizeUrl}?${params}`);
  })
);

authRouter.get(
  '/oauth/:provider/callback',
  asyncHandler(async (req, res) => {
    const provider = z.enum(['google', 'github']).parse(req.params.provider);
    const { code, state } = oauthCallbackQuery.parse(req.query);
    if (state !== readCookie(req, 'finance_oauth_state'))
      throw new AppError(400, 'INVALID_OAUTH_STATE', 'Phiên đăng nhập liên kết không hợp lệ.');
    clearOAuthStateCookie(res);
    const profile = await oauthProfile(provider, code);
    let account = await prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.id } },
      include: { user: true }
    });
    if (!account) {
      const existing =
        profile.email && profile.emailVerified
          ? await prisma.user.findUnique({ where: { email: profile.email } })
          : null;
      const username = `${provider}_${profile.id}`.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 50);
      const user =
        existing ??
        (await prisma.user.create({
          data: {
            username,
            email: profile.email,
            emailVerifiedAt: profile.emailVerified ? new Date() : null,
            fullName: profile.name,
            passwordHash: await bcrypt.hash(randomToken(), 12)
          }
        }));
      account = await prisma.oAuthAccount.create({
        data: { userId: user.id, provider, providerUserId: profile.id, providerEmail: profile.email },
        include: { user: true }
      });
    }
    const tokens = await issueTokens(account.user, req);
    setRefreshCookie(res, tokens.refreshToken, true);
    return res.redirect('/?oauth=success');
  })
);

authRouter.get('/oauth/providers', (_req: Request, res: Response) =>
  success(res, {
    google: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
    github: Boolean(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET),
    demoEnabled: config.NODE_ENV !== 'production' || config.SEED_DEMO
  })
);

documentRoutes(authRouter, {
  'POST /register': {
    summary: 'Đăng ký tài khoản bằng tên đăng nhập và mật khẩu',
    description:
      'Email và số điện thoại là tùy chọn, chỉ dùng để khôi phục mật khẩu; ô để trống được bỏ qua. Trả về user, accessToken, refreshToken và đặt cookie phiên.',
    body: registerInput,
    status: 201,
    errors: { 409: 'DUPLICATE_RESOURCE – tên đăng nhập, email hoặc số điện thoại đã tồn tại (error.details.fields).' }
  },
  'POST /login': {
    summary: 'Đăng nhập bằng tên đăng nhập hoặc email',
    description: 'Email không phân biệt hoa thường. Số điện thoại đã đăng ký cũng được chấp nhận.',
    body: loginInput,
    errors: { 401: 'INVALID_CREDENTIALS – sai thông tin đăng nhập.' }
  },
  'POST /refresh': {
    summary: 'Xoay vòng access/refresh token',
    description: 'Refresh token cũ bị thu hồi; dùng lại token đã thu hồi sẽ khóa cả chuỗi phiên.',
    body: refreshInput,
    errors: { 401: 'INVALID_REFRESH_TOKEN – phiên không hợp lệ hoặc đã hết hạn.' }
  },
  'GET /session-status': { summary: 'Kiểm tra có thể khôi phục phiên bằng cookie hay không' },
  'POST /session': {
    summary: 'Khôi phục và xoay vòng phiên "ghi nhớ đăng nhập" từ cookie',
    errors: { 401: 'INVALID_REFRESH_TOKEN – không có hoặc sai cookie phiên.' }
  },
  'POST /logout': { summary: 'Đăng xuất và thu hồi refresh token hiện tại', body: refreshInput },
  'POST /logout-all': { summary: 'Đăng xuất khỏi mọi thiết bị' },
  'GET /sessions': { summary: 'Danh sách thiết bị và phiên đang hoạt động' },
  'DELETE /sessions/:familyId': { summary: 'Thu hồi phiên trên một thiết bị' },
  'POST /forgot-password': {
    summary: 'Quên mật khẩu: nhập email của tài khoản để nhận liên kết đặt lại',
    description:
      'Không nhận tên đăng nhập. Email không phân biệt hoa thường. Luôn trả cùng một thông báo để không lộ email nào đã đăng ký. Liên kết hết hạn sau RESET_TOKEN_EXPIRES_MINUTES phút và chỉ dùng được một lần.',
    body: forgotInput
  },
  'POST /reset-password': {
    summary: 'Đặt lại mật khẩu bằng token trong liên kết email',
    description: 'Thu hồi mọi phiên đăng nhập sau khi đặt lại.',
    body: resetInput,
    errors: { 400: 'INVALID_RESET_TOKEN – liên kết sai, đã dùng hoặc đã hết hạn.' }
  },
  'POST /change-password': {
    summary: 'Đổi mật khẩu (thu hồi mọi phiên, cần đăng nhập lại)',
    body: changePasswordInput,
    errors: { 400: 'WRONG_PASSWORD / SAME_PASSWORD – mật khẩu hiện tại sai hoặc mật khẩu mới trùng mật khẩu cũ.' }
  },
  'POST /verification/email/send': {
    summary: 'Gửi lại email xác minh',
    errors: {
      422: 'EMAIL_REQUIRED – tài khoản chưa có email.',
      503: 'EMAIL_DELIVERY_FAILED – dịch vụ email chưa cấu hình hoặc gửi thất bại.'
    }
  },
  'POST /verification/email/confirm': {
    summary: 'Xác minh email bằng token trong thư',
    body: verifyEmailInput,
    errors: { 400: 'INVALID_VERIFICATION_TOKEN – liên kết không hợp lệ hoặc đã hết hạn.' }
  },
  'GET /oauth/:provider/start': {
    summary: 'Bắt đầu đăng nhập bằng Google hoặc GitHub',
    produces: 'redirect',
    errors: { 503: 'OAUTH_NOT_CONFIGURED – máy chủ chưa cấu hình nền tảng này.' }
  },
  'GET /oauth/:provider/callback': {
    summary: 'Nền tảng OAuth gọi lại sau khi người dùng đồng ý',
    query: oauthCallbackQuery,
    produces: 'redirect',
    errors: { 400: 'INVALID_OAUTH_STATE – state không khớp.' }
  },
  'GET /oauth/providers': { summary: 'Các nền tảng đăng nhập liên kết đã cấu hình' }
});
