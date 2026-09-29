import { api, returnToLogin } from '../core/api';
import { $ } from '../core/dom';
import { localDateValue, monthStartValue } from '../core/format';
import { closeNamedModal, openNamedModal } from '../core/modal';
import { state } from '../core/state';
import { toast } from '../core/toast';
import { render } from './dashboard';
import { showView } from './navigation';
import { loadNotifications } from './notifications';
import { maybeShowOnboarding } from './onboarding';
import { applyTheme } from './profile';

export async function enterApp(data) {
  state.token = data.accessToken;
  state.refreshToken = data.refreshToken;
  state.user = data.user;
  await loadData();
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  render();
  const initialView = location.hash.replace('#', '');
  const validView = document.getElementById(`view-${initialView}`) ? initialView : 'dashboard';
  showView(validView, { replace: true, fromHistory: validView === initialView });
  return maybeShowOnboarding();
}

export async function loadData() {
  const reportParams = new URLSearchParams({ from: monthStartValue(), to: localDateValue() });
  const [wallets, categories, transactions, budgets, goals, summary, onboarding] = await Promise.all([
    api('/wallets?includeArchived=true'),
    api('/categories?tree=false'),
    api('/transactions?limit=100'),
    api('/budgets'),
    api('/goals'),
    api(`/reports/summary?${reportParams}`),
    api('/profile/onboarding')
  ]);
  Object.assign(state, { wallets, categories, transactions: transactions, budgets, goals, summary, onboarding });
}

/** Form đăng nhập bằng tên đăng nhập, email hoặc số điện thoại. */
export function setupLogin() {
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    button.firstElementChild.textContent = 'Đang mở sổ...';
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: $('#identifier').value,
          password: $('#password').value,
          remember: $('#remember-login').checked,
          deviceName: navigator.userAgent.slice(0, 120)
        }),
        skipRefresh: true
      });
      if (!(await enterApp(data))) toast('Đăng nhập thành công. Chào mừng bạn!');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.firstElementChild.textContent = 'Vào sổ của tôi';
    }
  });
}

/** Hiện/ẩn mật khẩu, đăng ký, quên mật khẩu, đặt lại mật khẩu từ liên kết email và đăng xuất. */
export function setupAuthForms() {
  $('#toggle-login-password').addEventListener('click', (event) => {
    const input = $('#password');
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    event.currentTarget.textContent = visible ? 'Hiện' : 'Ẩn';
    event.currentTarget.setAttribute('aria-label', visible ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
  });
  $('#open-register').addEventListener('click', () => {
    $('#register-form').reset();
    openNamedModal('register-modal', '#register-username');
  });
  $('#register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#register-password').value;
    if (password !== $('#register-confirm-password').value) {
      toast('Mật khẩu nhập lại chưa khớp.', true);
      $('#register-confirm-password').focus();
      return;
    }
    const button = event.submitter;
    button.disabled = true;
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: $('#register-username').value,
          email: $('#register-email').value || undefined,
          phone: $('#register-phone').value || undefined,
          password,
          fullName: $('#register-full-name').value || undefined
        }),
        skipRefresh: true
      });
      closeNamedModal('register-modal');
      if (!(await enterApp(data))) toast('Tài khoản đã được tạo. Chào mừng bạn!');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  // Quên mật khẩu nhận email của tài khoản, không nhận tên đăng nhập. Ô đăng nhập đang chứa email thì điền sẵn.
  $('#open-forgot-password').addEventListener('click', () => {
    const typed = $('#identifier').value.trim();
    $('#forgot-email').value = typed.includes('@') ? typed : '';
    openNamedModal('forgot-password-modal', '#forgot-email');
  });
  $('#forgot-password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: $('#forgot-email').value }),
        skipRefresh: true
      });
      closeNamedModal('forgot-password-modal');
      toast('Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi. Hãy kiểm tra cả thư mục Spam.');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $('#reset-password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#reset-password').value;
    if (password !== $('#reset-confirm-password').value) {
      toast('Mật khẩu nhập lại chưa khớp.', true);
      $('#reset-confirm-password').focus();
      return;
    }
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      toast('Liên kết đặt lại mật khẩu không hợp lệ.', true);
      return;
    }
    const button = event.submitter;
    button.disabled = true;
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
        skipRefresh: true
      });
      history.replaceState({}, '', '/');
      closeNamedModal('reset-password-modal');
      $('#password').value = '';
      $('#identifier').focus();
      toast('Đã đặt lại mật khẩu. Vui lòng đăng nhập.');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  if (location.pathname === '/reset-password') {
    const token = new URLSearchParams(location.search).get('token');
    if (token) openNamedModal('reset-password-modal', '#reset-password');
    else toast('Liên kết đặt lại mật khẩu không hợp lệ.', true);
  }
  $('#logout-btn').addEventListener('click', async () => {
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify(state.refreshToken ? { refreshToken: state.refreshToken } : {})
      });
    } catch (error) {
      console.warn('Không thể thu hồi phiên đăng nhập:', error.message);
    } finally {
      returnToLogin();
      toast('Đã đăng xuất.');
    }
  });
}

export async function initializeApp() {
  applyTheme(localStorage.getItem('finance_theme') || 'SYSTEM');
  $('#recurring-date').value = localDateValue();
  $('#bill-date').value = localDateValue();
  try {
    const providers = await api('/auth/oauth/providers', { skipRefresh: true });
    $('#oauth-google').classList.toggle('hidden', !providers.google);
    $('#oauth-github').classList.toggle('hidden', !providers.github);
    $('#oauth-providers').classList.toggle('hidden', !providers.google && !providers.github);
    $('#demo-note').classList.toggle('hidden', !providers.demoEnabled);
    $('#login-description').textContent = providers.demoEnabled
      ? 'Dùng tài khoản demo hoặc đăng nhập bằng tài khoản của bạn.'
      : 'Đăng nhập để tiếp tục quản lý tài chính cá nhân.';
  } catch {
    $('#oauth-providers').classList.add('hidden');
    $('#demo-note').classList.add('hidden');
  }
  const verifyToken = new URLSearchParams(location.search).get('verify');
  if (verifyToken) {
    try {
      await api('/auth/verification/email/confirm', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken }),
        skipRefresh: true
      });
      history.replaceState({}, '', '/');
      toast('Email đã được xác minh.');
    } catch (error) {
      toast(error.message, true);
    }
  }
  if (location.pathname === '/reset-password') return;
  try {
    const status = await api('/auth/session-status', { skipRefresh: true });
    if (status.authenticated) {
      const data = await api('/auth/session', { method: 'POST', body: '{}', skipRefresh: true });
      await enterApp(data);
      applyTheme(data.user.theme || 'SYSTEM');
      void loadNotifications();
      if (new URLSearchParams(location.search).get('oauth')) {
        history.replaceState({}, '', '/');
        toast('Đăng nhập liên kết thành công.');
      }
    } else {
      returnToLogin();
    }
  } catch {
    returnToLogin();
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
