import type { AppConfig } from '../../core/config/env';
import { AppError } from '../../core/errors/app-error';
import { hashPassword } from '../../core/security/password';
import { randomToken } from '../../core/security/tokens';
import type { AuthRepository, ClientInfo } from './auth.repository';
import type { OAuthProvider } from './auth.schemas';
import type { SessionService } from './session.service';

type OAuthProfile = { id: string; email: string | null; name: string | null; emailVerified: boolean };
type ProviderSettings = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  callback: string;
  scope: string;
};

/** Đăng nhập liên kết Google/GitHub theo OAuth 2.0 Authorization Code. `state` ngẫu nhiên do controller lưu trong
 * cookie để chống CSRF. Email đã được nền tảng xác minh thì liên kết vào tài khoản có sẵn cùng email. */
export class OAuthService {
  constructor(
    private readonly auth: AuthRepository,
    private readonly sessions: SessionService,
    private readonly config: AppConfig
  ) {}

  availability() {
    return {
      google: Boolean(this.config.GOOGLE_CLIENT_ID && this.config.GOOGLE_CLIENT_SECRET),
      github: Boolean(this.config.GITHUB_CLIENT_ID && this.config.GITHUB_CLIENT_SECRET)
    };
  }

  authorizationUrl(provider: OAuthProvider, state: string) {
    const settings = this.settings(provider);
    const params = new URLSearchParams({
      client_id: settings.clientId,
      redirect_uri: settings.callback,
      response_type: 'code',
      scope: settings.scope,
      state
    });
    if (provider === 'google') params.set('access_type', 'offline');
    return `${settings.authorizeUrl}?${params}`;
  }

  /** Đổi mã ủy quyền lấy hồ sơ, tìm hoặc tạo tài khoản liên kết, rồi mở phiên đăng nhập. */
  async login(provider: OAuthProvider, code: string, client: ClientInfo) {
    const profile = await this.fetchProfile(provider, code);
    let account = await this.auth.findOAuthAccount(provider, profile.id);
    if (!account) {
      const existing =
        profile.email && profile.emailVerified ? await this.auth.findUserByExactEmail(profile.email) : null;
      // Chỉ liên kết khi chính tài khoản có sẵn cũng đã xác minh email: nếu không, ai đó có thể đăng ký trước bằng email
      // của nạn nhân (không cần xác minh) rồi chờ nạn nhân đăng nhập Google/GitHub vào đúng tài khoản mình giữ mật khẩu.
      if (existing && !existing.emailVerifiedAt) {
        throw new AppError(
          409,
          'OAUTH_EMAIL_UNVERIFIED',
          'Email này đã gắn với một tài khoản chưa xác minh email. Hãy đăng nhập bằng mật khẩu và xác minh email trước khi dùng đăng nhập liên kết.'
        );
      }
      const user =
        existing ??
        (await this.auth.createUser({
          username: `${provider}_${profile.id}`.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 50),
          email: profile.email,
          emailVerifiedAt: profile.emailVerified ? new Date() : null,
          fullName: profile.name,
          passwordHash: await hashPassword(randomToken())
        }));
      account = await this.auth.createOAuthAccount({
        userId: user.id,
        provider,
        providerUserId: profile.id,
        providerEmail: profile.email
      });
    }
    return this.sessions.issue(account.user, client, true);
  }

  private settings(provider: OAuthProvider): ProviderSettings {
    const base = this.config.OAUTH_CALLBACK_BASE_URL ?? this.config.APP_URL;
    if (provider === 'google' && this.config.GOOGLE_CLIENT_ID && this.config.GOOGLE_CLIENT_SECRET) {
      return {
        clientId: this.config.GOOGLE_CLIENT_ID,
        clientSecret: this.config.GOOGLE_CLIENT_SECRET,
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        callback: `${base}/api/v1/auth/oauth/google/callback`,
        scope: 'openid email profile'
      };
    }
    if (provider === 'github' && this.config.GITHUB_CLIENT_ID && this.config.GITHUB_CLIENT_SECRET) {
      return {
        clientId: this.config.GITHUB_CLIENT_ID,
        clientSecret: this.config.GITHUB_CLIENT_SECRET,
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        callback: `${base}/api/v1/auth/oauth/github/callback`,
        scope: 'read:user user:email'
      };
    }
    throw new AppError(503, 'OAUTH_NOT_CONFIGURED', `Đăng nhập ${provider} chưa được cấu hình trên máy chủ.`);
  }

  private async fetchProfile(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
    const settings = this.settings(provider);
    const tokenResponse = await fetch(settings.tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        code,
        redirect_uri: settings.callback
      })
    });
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new AppError(401, 'OAUTH_EXCHANGE_FAILED', 'Không thể xác thực với nền tảng liên kết.');
    }
    if (provider === 'google') {
      const data = (await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` }
      }).then((response) => response.json())) as {
        sub: string;
        email?: string;
        name?: string;
        email_verified?: boolean;
      };
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
    const [user, emails] = await Promise.all([
      fetch('https://api.github.com/user', { headers }).then((response) => response.json()) as Promise<{
        id: number;
        login: string;
        name?: string;
        email?: string;
      }>,
      fetch('https://api.github.com/user/emails', { headers }).then((response) => response.json()) as Promise<
        Array<{ email: string; primary: boolean; verified: boolean }>
      >
    ]);
    const primary = Array.isArray(emails) ? emails.find((item) => item.primary && item.verified) : undefined;
    return {
      id: String(user.id),
      email: primary?.email ?? user.email ?? null,
      name: user.name ?? user.login,
      emailVerified: Boolean(primary)
    };
  }
}
