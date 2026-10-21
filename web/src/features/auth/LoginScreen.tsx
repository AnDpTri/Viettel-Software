import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { AuthPayload } from '../../api/types';
import { useAuth } from '../../app/auth';
import { moneyCurrency } from '../../lib/format';
import { BrandMark } from '../../ui/Icon';
import { errorMessage, useToast } from '../../ui/Toast';
import { ForgotPasswordModal, RegisterModal, ResetPasswordModal } from './AuthModals';

type Providers = { google: boolean; github: boolean; demoEnabled: boolean };

type AuthModal = 'register' | 'forgot' | 'reset' | null;

/** Trang sổ minh họa bên cạnh biểu mẫu: dữ liệu mẫu, số còn lại luôn tính từ các dòng. */
const SAMPLE_ROWS = [
  { note: 'Lương tháng 10', category: 'Thu nhập', amount: 18_000_000 },
  { note: 'Tiền nhà', category: 'Nhà ở', amount: -5_500_000 },
  { note: 'Ăn uống', category: 'Ăn uống', amount: -2_140_000 },
  { note: 'Đi lại', category: 'Di chuyển', amount: -620_000 }
];

function LedgerSample() {
  const left = SAMPLE_ROWS.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="ledger-sample" data-ui aria-hidden="true">
      <div className="ledger-sample-head">
        <b>Sổ tháng này</b>
        <span>Dữ liệu minh họa</span>
      </div>
      {SAMPLE_ROWS.map((row) => (
        <div key={row.note} className="ledger-sample-row">
          <div>
            <b>{row.note}</b>
            <small>{row.category}</small>
          </div>
          <span className={row.amount > 0 ? 'in' : undefined}>
            {row.amount > 0 ? '+' : '−'}
            {moneyCurrency(Math.abs(row.amount))}
          </span>
        </div>
      ))}
      <div className="ledger-sample-total">
        <span>Còn lại sau chi tiêu</span>
        <b>{moneyCurrency(left)}</b>
      </div>
    </div>
  );
}

/** Trang đăng nhập bằng tên đăng nhập, email hoặc số điện thoại; kèm đăng ký, quên và đặt lại mật khẩu. */
export function LoginScreen() {
  const { enter } = useAuth();
  const toast = useToast();
  const [identifier, setIdentifier] = useState('demo');
  const [password, setPassword] = useState('Demo@123');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<AuthModal>(() =>
    location.pathname === '/reset-password' && new URLSearchParams(location.search).get('token') ? 'reset' : null
  );
  const providers = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: () => api<Providers>('/auth/oauth/providers', { skipRefresh: true }),
    retry: false
  });
  const oauth = providers.data;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api<AuthPayload>('/auth/login', {
        method: 'POST',
        body: { identifier, password, remember, deviceName: navigator.userAgent.slice(0, 120) },
        skipRefresh: true
      });
      if (!(await enter(data))) toast('Đăng nhập thành công. Chào mừng bạn!');
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  // Quên mật khẩu nhận email của tài khoản; ô đăng nhập đang chứa email thì điền sẵn.
  const typedEmail = identifier.includes('@') ? identifier.trim() : '';

  return (
    <>
      <main id="login-screen" className="login-screen">
        <div className="login-brand">
          <BrandMark />
          <span className="brand-title">Wallet May Cry</span>
        </div>
        <div className="login-copy">
          <div className="login-app-lead">Wallet May Cry</div>
          <h1 className="login-headline">Ví có thể khóc… trừ khi bạn ghi lại.</h1>
          <p className="login-subcopy">Ghi gọn, tiêu khôn. Biết hôm nay còn tiêu được bao nhiêu.</p>
          <LedgerSample />
        </div>
        <form id="login-form" className="login-card" onSubmit={submit}>
          <div className="login-card-head">
            <h2>Đăng nhập</h2>
            <p id="login-description">
              {oauth?.demoEnabled
                ? 'Dùng tài khoản demo hoặc đăng nhập bằng tài khoản của bạn.'
                : 'Đăng nhập để tiếp tục quản lý tài chính cá nhân.'}
            </p>
          </div>
          <label>
            Tên đăng nhập hoặc email
            <input
              id="identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              placeholder="ví dụ: minhanh hoặc minhanh@gmail.com"
              required
            />
          </label>
          <label>
            Mật khẩu
            <span className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                id="toggle-login-password"
                className="password-toggle"
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </span>
          </label>
          <label className="check-row">
            <input
              id="remember-login"
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Ghi nhớ đăng nhập trên thiết bị này
          </label>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            <span>{busy ? 'Đang mở sổ...' : 'Vào sổ của tôi'}</span>
          </button>
          {(oauth?.google || oauth?.github) && (
            <>
              <div className="divider-text">
                <span>hoặc tiếp tục với</span>
              </div>
              <div id="oauth-providers" className="oauth-grid">
                {oauth.google && (
                  <a id="oauth-google" className="btn btn-outline" href="/api/v1/auth/oauth/google/start">
                    Google
                  </a>
                )}
                {oauth.github && (
                  <a id="oauth-github" className="btn btn-outline" href="/api/v1/auth/oauth/github/start">
                    GitHub
                  </a>
                )}
              </div>
            </>
          )}
          <div className="auth-actions">
            <button id="open-register" className="link-btn" type="button" onClick={() => setModal('register')}>
              Tạo tài khoản
            </button>
            <span aria-hidden="true">·</span>
            <button id="open-forgot-password" className="link-btn" type="button" onClick={() => setModal('forgot')}>
              Quên mật khẩu?
            </button>
          </div>
          {oauth?.demoEnabled && (
            <p id="demo-note" className="demo-note">
              Tài khoản mẫu: <b>demo</b> · Mật khẩu: <b>Demo@123</b>
            </p>
          )}
          <a className="api-link" href="/api-docs/" target="_blank" rel="noreferrer">
            Xem tài liệu API ↗
          </a>
        </form>
      </main>
      <RegisterModal open={modal === 'register'} onClose={() => setModal(null)} />
      <ForgotPasswordModal open={modal === 'forgot'} initialEmail={typedEmail} onClose={() => setModal(null)} />
      <ResetPasswordModal
        open={modal === 'reset'}
        onClose={() => setModal(null)}
        onDone={() => {
          setPassword('');
          document.getElementById('identifier')?.focus();
        }}
      />
    </>
  );
}
