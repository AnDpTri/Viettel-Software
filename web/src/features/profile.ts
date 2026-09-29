import { api, apiErrorMessage, returnToLogin } from '../core/api';
import { $ } from '../core/dom';
import { escapeHtml, shortDate } from '../core/format';
import { closeNamedModal, openNamedModal } from '../core/modal';
import { state } from '../core/state';
import { toast } from '../core/toast';
import { render } from './dashboard';

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'DARK' ? 'dark' : theme === 'LIGHT' ? 'light' : '';
  localStorage.setItem('finance_theme', theme);
}

export function friendlyDevice(session) {
  const source = `${session.deviceName || ''} ${session.userAgent || ''}`;
  const browser = /Edg/i.test(source)
    ? 'Microsoft Edge'
    : /Firefox/i.test(source)
      ? 'Firefox'
      : /Chrome/i.test(source)
        ? 'Chrome'
        : /Safari/i.test(source)
          ? 'Safari'
          : 'Trình duyệt';
  const os = /Windows/i.test(source)
    ? 'Windows'
    : /Android/i.test(source)
      ? 'Android'
      : /iPhone|iPad/i.test(source)
        ? 'iOS/iPadOS'
        : /Mac OS/i.test(source)
          ? 'macOS'
          : /Linux/i.test(source)
            ? 'Linux'
            : 'thiết bị không xác định';
  return `${browser} trên ${os}`;
}

/** Thiết bị đang đăng nhập, tên dễ đọc; thiết bị hiện tại được đánh dấu và IP được che bớt. */
export async function loadSessions() {
  const sessions = await api('/auth/sessions');
  $('#session-list').innerHTML =
    sessions
      .map((item) => {
        const current = item.userAgent === navigator.userAgent || item.deviceName === navigator.userAgent.slice(0, 120);
        return `<article class="feature-row"><div><strong>${escapeHtml(friendlyDevice(item))}${current ? ' · Thiết bị này' : ''}</strong><small>Hoạt động ${shortDate(item.lastUsedAt)}${item.ipAddress ? ' · ' + escapeHtml(item.ipAddress.replace(/\d+$/, '•••')) : ''}</small></div><button data-session-revoke="${item.familyId}" class="danger"${current ? ' title="Thu hồi sẽ đăng xuất thiết bị này"' : ''}>Thu hồi</button></article>`;
      })
      .join('') || '<div class="empty">Không có phiên hoạt động.</div>';
}

/** Đổi giao diện sáng/tối, hồ sơ, phiên đăng nhập, xác minh email, xuất dữ liệu, đổi mật khẩu, xóa tài khoản. */
export function setupProfile() {
  $('#theme-btn').addEventListener('click', async () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'LIGHT' : 'DARK';
    applyTheme(next);
    if (state.user) {
      state.user.theme = next;
      await api('/profile', { method: 'PATCH', body: JSON.stringify({ theme: next }) }).catch(() => undefined);
    }
  });
  $('#open-profile').addEventListener('click', async () => {
    try {
      const profile = await api('/profile');
      state.user = profile;
      $('#profile-full-name').value = profile.fullName || '';
      $('#profile-email').value = profile.email || '';
      $('#profile-phone').value = profile.phone || '';
      $('#profile-timezone').value = profile.timezone || '';
      $('#profile-currency').value = profile.currency || 'VND';
      $('#profile-locale').value = profile.locale || 'vi-VN';
      $('#profile-theme').value = profile.theme || 'SYSTEM';
      $('#account-plan').innerHTML = profile.isVip
        ? `<strong>VIP</strong><span>Không giới hạn lượt hỏi AI${profile.vipExpiresAt ? ` · đến ${shortDate(profile.vipExpiresAt)}` : ' · vĩnh viễn'}</span>`
        : '<strong>FREE</strong><span>Giới hạn lượt hỏi AI theo ngày</span>';
      render();
      await loadSessions();
      openNamedModal('profile-modal');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      state.user = await api('/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: $('#profile-full-name').value || null,
          email: $('#profile-email').value || null,
          phone: $('#profile-phone').value || null,
          timezone: $('#profile-timezone').value,
          currency: $('#profile-currency').value.toUpperCase(),
          locale: $('#profile-locale').value,
          theme: $('#profile-theme').value
        })
      });
      state.onboarding = await api('/profile/onboarding');
      applyTheme(state.user.theme);
      render();
      toast('Đã cập nhật hồ sơ.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#session-list').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-session-revoke]')?.dataset.sessionRevoke;
    if (!id) return;
    try {
      await api(`/auth/sessions/${id}`, { method: 'DELETE' });
      await loadSessions();
      toast('Đã thu hồi phiên.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#verify-email').addEventListener('click', async () => {
    try {
      await api('/auth/verification/email/send', { method: 'POST' });
      toast('Đã gửi email xác minh.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#export-data').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/v1/productivity/data-export', {
        credentials: 'same-origin',
        headers: { Authorization: `Bearer ${state.token}` }
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(body));
      const url = URL.createObjectURL(new Blob([JSON.stringify(body.data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'so-moc-data.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#logout-all').addEventListener('click', async () => {
    if (!confirm('Đăng xuất khỏi tất cả thiết bị?')) return;
    try {
      await api('/auth/logout-all', { method: 'POST' });
      closeNamedModal('profile-modal');
      returnToLogin();
      toast('Đã đăng xuất mọi thiết bị.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#delete-account').addEventListener('click', async () => {
    const confirmation = prompt('Thao tác này sẽ vô hiệu hóa tài khoản. Nhập chính xác “XOA TAI KHOAN” để tiếp tục:');
    if (confirmation !== 'XOA TAI KHOAN') return;
    try {
      await api('/productivity/account', { method: 'DELETE', body: JSON.stringify({ confirmation }) });
      closeNamedModal('profile-modal');
      returnToLogin();
      toast('Tài khoản đã được vô hiệu hóa.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: $('#current-password').value, newPassword: $('#new-password').value })
      });
      state.token = '';
      state.refreshToken = '';
      closeNamedModal('profile-modal');
      $('#app').classList.add('hidden');
      $('#login-screen').classList.remove('hidden');
      event.target.reset();
      toast('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
    } catch (error) {
      toast(error.message, true);
    }
  });
}
