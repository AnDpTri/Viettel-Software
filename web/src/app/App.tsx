import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AuthPayload } from '../api/types';
import { LoginScreen } from '../features/auth/LoginScreen';
import { applyTheme } from '../ui/theme';
import { errorMessage, useToast } from '../ui/Toast';
import { AppShell } from './AppShell';
import { useAuth } from './auth';

/** Khởi động: xác minh email từ liên kết trong thư, khôi phục phiên "ghi nhớ đăng nhập" bằng cookie, rồi hiện ứng dụng
 * hoặc màn đăng nhập. */
export function App() {
  const { user, enter } = useAuth();
  const toast = useToast();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(location.search);
      const verifyToken = params.get('verify');
      if (verifyToken) {
        try {
          await api('/auth/verification/email/confirm', {
            method: 'POST',
            body: { token: verifyToken },
            skipRefresh: true
          });
          history.replaceState({}, '', '/');
          toast('Email đã được xác minh.');
        } catch (error) {
          toast(errorMessage(error), true);
        }
      }
      if (params.get('oauth_error') === 'OAUTH_EMAIL_UNVERIFIED') {
        history.replaceState({}, '', '/');
        toast(
          'Email này đã thuộc một tài khoản chưa xác minh. Hãy đăng nhập bằng mật khẩu và xác minh email trước khi dùng đăng nhập liên kết.',
          true
        );
      }
      if (location.pathname === '/reset-password') {
        if (!params.get('token')) toast('Liên kết đặt lại mật khẩu không hợp lệ.', true);
        return;
      }
      try {
        const status = await api<{ authenticated: boolean }>('/auth/session-status', { skipRefresh: true });
        if (status.authenticated && !cancelled) {
          const data = await api<AuthPayload>('/auth/session', { method: 'POST', body: {}, skipRefresh: true });
          await enter(data);
          applyTheme(data.user.theme || 'SYSTEM');
          if (params.get('oauth')) {
            history.replaceState({}, '', '/');
            toast('Đăng nhập liên kết thành công.');
          }
        }
      } catch {
        /* không khôi phục được phiên: ở lại màn đăng nhập */
      }
    })().finally(() => {
      if (!cancelled) setReady(true);
    });
    // Đăng ký service worker sau khi trang tải xong, không tranh băng thông và request với lần tải đầu.
    const registerWorker = () => navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    if ('serviceWorker' in navigator) {
      if (document.readyState === 'complete') void registerWorker();
      else window.addEventListener('load', registerWorker, { once: true });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy một lần khi tải trang
  }, []);

  if (!ready) return <div className="boot" aria-busy="true" />;
  return user ? <AppShell /> : <LoginScreen />;
}
