import type { Request } from 'express';
import type { AppConfig } from '../../core/config/env';
import { audit } from '../../core/audit/audit';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, uuidParam } from '../../core/http/request';
import { success } from '../../core/http/response';
import {
  clearOAuthStateCookie,
  clearRefreshCookie,
  readCookie,
  setOAuthStateCookie,
  setRefreshCookie
} from '../../core/security/cookies';
import { AppError } from '../../core/errors/app-error';
import { randomToken } from '../../core/security/tokens';
import { assertNotProtectedDemo } from '../../shared/demo-account';
import type { ClientInfo } from './auth.repository';
import {
  changePasswordInput,
  forgotInput,
  loginInput,
  oauthCallbackQuery,
  oauthProvider,
  registerInput,
  resetInput,
  verifyEmailInput
} from './auth.schemas';
import { toPublicUser, type AuthService } from './auth.service';
import type { EmailVerificationService } from './email-verification.service';
import type { OAuthService } from './oauth.service';
import type { PasswordService } from './password.service';
import type { SessionService } from './session.service';

export type AuthServices = {
  auth: AuthService;
  sessions: SessionService;
  passwords: PasswordService;
  verification: EmailVerificationService;
  oauth: OAuthService;
};

/** Thông tin thiết bị lấy từ request để gắn vào phiên đăng nhập. */
function clientInfo(req: Request): ClientInfo {
  return {
    deviceName: String(req.body?.deviceName || req.get('user-agent') || 'Thiết bị không xác định').slice(0, 120),
    userAgent: req.get('user-agent')?.slice(0, 500),
    ipAddress: req.ip?.slice(0, 64)
  };
}

/** HTTP cho xác thực: cookie refresh HttpOnly, ghi nhật ký bảo mật, định dạng phản hồi. Nghiệp vụ nằm ở các service. */
export class AuthController {
  constructor(
    private readonly services: AuthServices,
    private readonly config: AppConfig
  ) {}

  /** Refresh token lấy từ body (ứng dụng khác trình duyệt) hoặc cookie HttpOnly. */
  private refreshTokenFrom(req: Request) {
    const bodyToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
    return bodyToken ?? readCookie(req, this.config.COOKIE_NAME);
  }

  register = asyncHandler(async (req, res) => {
    const { user, tokens, remember } = await this.services.auth.register(
      registerInput.parse(req.body),
      clientInfo(req)
    );
    setRefreshCookie(res, tokens.refreshToken, remember);
    await audit(req, 'AUTH_REGISTER', 'User', user.id, undefined, user);
    return success(res, { user: toPublicUser(user), ...tokens }, 'Đăng ký thành công.', 201);
  });

  login = asyncHandler(async (req, res) => {
    const input = loginInput.parse(req.body);
    try {
      const { user, tokens } = await this.services.auth.login(input, clientInfo(req));
      setRefreshCookie(res, tokens.refreshToken, input.remember);
      await audit(req, 'AUTH_LOGIN', 'User', user.id, undefined, user);
      return success(res, { user: toPublicUser(user), ...tokens }, 'Đăng nhập thành công.');
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_CREDENTIALS') {
        await audit(req, 'AUTH_LOGIN_FAILED', undefined, undefined, { identifier: input.identifier.slice(0, 100) });
      }
      throw error;
    }
  });

  refresh = asyncHandler(async (req, res) => {
    const session = await this.services.sessions.rotate(this.refreshTokenFrom(req), clientInfo(req));
    setRefreshCookie(res, session.refreshToken, session.remember);
    return success(
      res,
      { accessToken: session.accessToken, refreshToken: session.refreshToken },
      'Làm mới phiên thành công.'
    );
  });

  sessionStatus = asyncHandler(async (req, res) => {
    const token = this.refreshTokenFrom(req);
    if (!token) return success(res, { authenticated: false });
    const active = await this.services.sessions.isActive(token);
    if (active === null) clearRefreshCookie(res);
    return success(res, { authenticated: Boolean(active) });
  });

  restoreSession = asyncHandler(async (req, res) => {
    const session = await this.services.sessions.rotate(this.refreshTokenFrom(req), clientInfo(req));
    setRefreshCookie(res, session.refreshToken, session.remember);
    const user = await this.services.auth.publicProfile(session.user.id);
    return success(
      res,
      { user, accessToken: session.accessToken, refreshToken: session.refreshToken },
      'Khôi phục phiên thành công.'
    );
  });

  logout = asyncHandler(async (req, res) => {
    await this.services.sessions.revoke(currentUserId(req), this.refreshTokenFrom(req));
    clearRefreshCookie(res);
    await audit(req, 'AUTH_LOGOUT', 'User', currentUserId(req));
    return success(res, null, 'Đăng xuất thành công.');
  });

  logoutAll = asyncHandler(async (req, res) => {
    await this.services.sessions.revokeAll(currentUserId(req));
    clearRefreshCookie(res);
    await audit(req, 'AUTH_LOGOUT_ALL', 'User', currentUserId(req));
    return success(res, null, 'Đã đăng xuất khỏi tất cả thiết bị.');
  });

  listSessions = asyncHandler(async (req, res) => success(res, await this.services.sessions.list(currentUserId(req))));

  revokeSession = asyncHandler(async (req, res) => {
    const familyId = uuidParam(req, 'familyId');
    await this.services.sessions.revokeFamily(currentUserId(req), familyId);
    await audit(req, 'AUTH_SESSION_REVOKE', 'RefreshToken', familyId);
    return success(res, null, 'Đã thu hồi phiên đăng nhập.');
  });

  forgotPassword = asyncHandler(async (req, res) => {
    const { email } = forgotInput.parse(req.body);
    const user = await this.services.passwords.requestReset(email);
    if (user) await audit(req, 'AUTH_PASSWORD_RESET_REQUESTED', 'User', user.id, undefined, user);
    return success(res, null, 'Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi.');
  });

  resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = resetInput.parse(req.body);
    await this.services.passwords.reset(token, newPassword);
    clearRefreshCookie(res);
    return success(res, null, 'Đặt lại mật khẩu thành công.');
  });

  changePassword = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const username = req.user?.username;
    // Kiểm tra tài khoản demo trước khi đọc dữ liệu, để lỗi nói đúng lý do.
    assertNotProtectedDemo(username, 'đổi mật khẩu');
    const { currentPassword, newPassword } = changePasswordInput.parse(req.body);
    await this.services.passwords.change(userId, username, currentPassword, newPassword);
    clearRefreshCookie(res);
    await audit(req, 'AUTH_PASSWORD_CHANGE', 'User', userId);
    return success(res, null, 'Đổi mật khẩu thành công, vui lòng đăng nhập lại.');
  });

  sendVerification = asyncHandler(async (req, res) => {
    const sent = await this.services.verification.resend(currentUserId(req));
    return success(res, null, sent ? 'Đã gửi email xác minh.' : 'Email đã được xác minh.');
  });

  confirmVerification = asyncHandler(async (req, res) => {
    await this.services.verification.confirm(verifyEmailInput.parse(req.body).token);
    return success(res, null, 'Xác minh email thành công.');
  });

  oauthProviders = asyncHandler(async (_req, res) =>
    success(res, {
      ...this.services.oauth.availability(),
      demoEnabled: this.config.NODE_ENV !== 'production' || this.config.SEED_DEMO
    })
  );

  oauthStart = asyncHandler(async (req, res) => {
    const provider = oauthProvider.parse(req.params.provider);
    const state = randomToken();
    // Tạo URL trước (báo 503 nếu nền tảng chưa cấu hình), chỉ đặt cookie state khi chắc chắn chuyển hướng.
    const url = this.services.oauth.authorizationUrl(provider, state);
    setOAuthStateCookie(res, state);
    return res.redirect(url);
  });

  oauthCallback = asyncHandler(async (req, res) => {
    const provider = oauthProvider.parse(req.params.provider);
    const { code, state } = oauthCallbackQuery.parse(req.query);
    if (state !== readCookie(req, 'finance_oauth_state')) {
      throw new AppError(400, 'INVALID_OAUTH_STATE', 'Phiên đăng nhập liên kết không hợp lệ.');
    }
    clearOAuthStateCookie(res);
    let tokens;
    try {
      tokens = await this.services.oauth.login(provider, code, clientInfo(req));
    } catch (error) {
      // Người dùng đang ở trình duyệt: đưa về giao diện kèm mã lỗi để hiện thông báo, thay vì trang JSON.
      if (error instanceof AppError && error.code === 'OAUTH_EMAIL_UNVERIFIED')
        return res.redirect(`/?oauth_error=${error.code}`);
      throw error;
    }
    setRefreshCookie(res, tokens.refreshToken, true);
    return res.redirect('/?oauth=success');
  });
}
