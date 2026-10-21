import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, saveBlob, authorizedFetch, apiErrorMessage } from '../../api/client';
import { queryKeys } from '../../api/queries';
import type { OnboardingStatus, SessionInfo, ThemePreference, User } from '../../api/types';
import { useAuth } from '../../app/auth';
import { useModal, useUi } from '../../app/ui-state';
import { Empty, useViewState, ViewSection } from '../../app/view';
import { shortDate } from '../../lib/format';
import { storageSet } from '../../lib/storage';
import { Modal, ModalClose } from '../../ui/Modal';
import { applyTheme } from '../../ui/theme';
import { errorMessage, useToast } from '../../ui/Toast';
import { tourStorageKey } from '../tour/tours';

/** Tên thiết bị dễ đọc từ user agent, ví dụ "Chrome trên Windows". */
export function friendlyDevice(session: Pick<SessionInfo, 'deviceName' | 'userAgent'>) {
  const source = `${session.deviceName ?? ''} ${session.userAgent ?? ''}`;
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

type ProfileForm = {
  fullName: string;
  email: string;
  phone: string;
  timezone: string;
  currency: string;
  locale: string;
  theme: ThemePreference;
};

const profileForm = (user: User): ProfileForm => ({
  fullName: user.fullName ?? '',
  email: user.email ?? '',
  phone: user.phone ?? '',
  timezone: user.timezone ?? '',
  currency: user.currency ?? 'VND',
  locale: user.locale ?? 'vi-VN',
  theme: user.theme ?? 'SYSTEM'
});

/**
 * Dữ liệu và thao tác của hồ sơ, dùng chung cho hộp thoại (mở từ ảnh đại diện) và màn Hồ sơ trong Thiết lập.
 * `active` là lúc cần tải dữ liệu; `close` chạy sau các thao tác kết thúc phiên (ở màn thì không làm gì).
 */
function useProfile(active: boolean, seq: number, close: () => void) {
  const open = active;
  const { user, setUser, leave } = useAuth();
  const { openModal } = useUi();
  const client = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [passwords, setPasswords] = useState({ current: '', next: '' });

  const profile = useQuery({ queryKey: ['profile', seq], queryFn: () => api<User>('/profile'), enabled: open });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<SessionInfo[]>('/auth/sessions'),
    enabled: open
  });

  useEffect(() => {
    if (!open || !profile.data) return;
    setUser(profile.data);
    setForm(profileForm(profile.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nạp form khi hồ sơ mới tải xong
  }, [open, profile.data]);
  useEffect(() => {
    if (open) setPasswords({ current: '', next: '' });
  }, [open, seq]);
  useEffect(() => {
    if (!open || !(profile.isError || sessions.isError)) return;
    toast(errorMessage(profile.error ?? sessions.error), true);
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng khi tải hồ sơ lỗi
  }, [open, profile.isError, sessions.isError]);

  const current = profile.data ?? user;
  const bind = (name: keyof ProfileForm) => ({
    value: form?.[name] ?? '',
    onChange: (event: { target: { value: string } }) => form && setForm({ ...form, [name]: event.target.value })
  });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      const updated = await api<User>('/profile', {
        method: 'PATCH',
        body: {
          fullName: form.fullName || null,
          email: form.email || null,
          phone: form.phone || null,
          timezone: form.timezone,
          currency: form.currency.toUpperCase(),
          locale: form.locale,
          theme: form.theme
        }
      });
      setUser(updated);
      applyTheme(updated.theme);
      await client.invalidateQueries({ queryKey: queryKeys.onboarding });
      toast('Đã cập nhật hồ sơ.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  async function action(operation: () => Promise<unknown>, success?: string) {
    try {
      await operation();
      if (success) toast(success);
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  async function exportData() {
    const response = await authorizedFetch('/api/v1/productivity/data-export');
    const body = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(body));
    saveBlob(new Blob([JSON.stringify(body.data, null, 2)], { type: 'application/json' }), 'wallet-may-cry-data.json');
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: passwords.current, newPassword: passwords.next }
      });
      close();
      leave();
      toast('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  // Chỉ hiện khi hồ sơ và danh sách phiên đã tải xong, tránh nháy form trống.
  const ready = open && profile.isSuccess && sessions.isSuccess;

  return {
    ready,
    current,
    form,
    bind,
    save,
    sessions,
    passwords,
    setPasswords,
    action,
    exportData,
    changePassword,
    client,
    close,
    openModal,
    leave
  };
}

type ProfileState = ReturnType<typeof useProfile>;

/** Phần thân hồ sơ: gói VIP/FREE, form hồ sơ, phiên đăng nhập, công cụ tài khoản, đổi mật khẩu. */
function ProfileBody({ state, headingId }: { state: ProfileState; headingId: string }) {
  const { current, form, bind, save, sessions, passwords, setPasswords, action, exportData, changePassword } = state;
  const { client, close, openModal, leave } = state;
  return (
    <>
      <h2 id={headingId}>Hồ sơ cá nhân</h2>
      <div id="account-plan" className={`account-plan${current?.isVip ? ' vip' : ''}`}>
        {current?.isVip ? (
          <>
            <strong>VIP</strong>
            <span>
              Không giới hạn lượt hỏi AI
              {current.vipExpiresAt ? ` · đến ${shortDate(current.vipExpiresAt)}` : ' · vĩnh viễn'}
            </span>
          </>
        ) : (
          <>
            <strong>FREE</strong>
            <span>Giới hạn lượt hỏi AI theo ngày</span>
          </>
        )}
      </div>
      <form id="profile-form" onSubmit={save}>
        <label>
          Họ tên
          <input id="profile-full-name" maxLength={120} {...bind('fullName')} />
        </label>
        <div className="form-row">
          <label>
            Email
            <input id="profile-email" type="email" {...bind('email')} />
          </label>
          <label>
            Số điện thoại
            <input id="profile-phone" {...bind('phone')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Múi giờ
            <input id="profile-timezone" {...bind('timezone')} />
          </label>
          <label>
            Tiền tệ
            <input id="profile-currency" maxLength={3} {...bind('currency')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Ngôn ngữ
            <select id="profile-locale" {...bind('locale')}>
              <option value="vi-VN">Tiếng Việt</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <label>
            Giao diện
            <select id="profile-theme" {...bind('theme')}>
              <option value="SYSTEM">Theo hệ thống</option>
              <option value="LIGHT">Sáng</option>
              <option value="DARK">Tối</option>
            </select>
          </label>
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={!form}>
          Cập nhật hồ sơ <span aria-hidden="true">→</span>
        </button>
      </form>

      <div className="separator" />
      <section aria-labelledby="sessions-title">
        <h3 className="subhead" id="sessions-title">
          Phiên đăng nhập
        </h3>
        <div id="session-list" className="feature-list compact">
          {sessions.data?.length ? (
            sessions.data.map((item) => {
              const isCurrent =
                item.userAgent === navigator.userAgent || item.deviceName === navigator.userAgent.slice(0, 120);
              return (
                <article key={item.familyId} className="feature-row">
                  <div>
                    <strong>
                      {friendlyDevice(item)}
                      {isCurrent && ' · Thiết bị này'}
                    </strong>
                    <small>
                      Hoạt động {shortDate(item.lastUsedAt)}
                      {item.ipAddress && ` · ${item.ipAddress.replace(/\d+$/, '•••')}`}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm danger"
                    title={isCurrent ? 'Thu hồi sẽ đăng xuất thiết bị này' : undefined}
                    onClick={() =>
                      action(async () => {
                        await api(`/auth/sessions/${item.familyId}`, { method: 'DELETE' });
                        await sessions.refetch();
                      }, 'Đã thu hồi phiên.')
                    }
                  >
                    Thu hồi
                  </button>
                </article>
              );
            })
          ) : (
            <Empty text={sessions.isLoading ? 'Đang tải...' : 'Không có phiên hoạt động.'} />
          )}
        </div>
        <div className="profile-tools">
          <button
            id="restart-welcome"
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() =>
              action(async () => {
                const status = await api<OnboardingStatus>('/profile/onboarding', {
                  method: 'PATCH',
                  body: { restart: true }
                });
                client.setQueryData(queryKeys.onboarding, status);
                if (current) storageSet(tourStorageKey(current.id), '[]');
                close();
                openModal('welcome', undefined);
              })
            }
          >
            Làm lại thiết lập ban đầu
          </button>
          <button
            id="verify-email"
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() =>
              action(() => api('/auth/verification/email/send', { method: 'POST' }), 'Đã gửi email xác minh.')
            }
          >
            Xác minh email
          </button>
          <button id="export-data" className="btn btn-outline btn-sm" type="button" onClick={() => action(exportData)}>
            Xuất toàn bộ dữ liệu
          </button>
          <button
            id="logout-all"
            className="btn btn-outline btn-sm danger"
            type="button"
            onClick={() => {
              if (!confirm('Đăng xuất khỏi tất cả thiết bị?')) return;
              void action(async () => {
                await api('/auth/logout-all', { method: 'POST' });
                close();
                leave();
              }, 'Đã đăng xuất mọi thiết bị.');
            }}
          >
            Đăng xuất mọi thiết bị
          </button>
          <button
            id="delete-account"
            className="btn btn-outline btn-sm danger"
            type="button"
            onClick={() => {
              const confirmation = prompt(
                'Thao tác này sẽ vô hiệu hóa tài khoản. Nhập chính xác “XOA TAI KHOAN” để tiếp tục:'
              );
              if (confirmation !== 'XOA TAI KHOAN') return;
              void action(async () => {
                await api('/productivity/account', { method: 'DELETE', body: { confirmation } });
                close();
                leave();
              }, 'Tài khoản đã được vô hiệu hóa.');
            }}
          >
            Xóa tài khoản
          </button>
        </div>
      </section>

      <div className="separator" />
      <form id="password-form" onSubmit={changePassword}>
        <div className="form-row">
          <label>
            Mật khẩu hiện tại
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={passwords.current}
              onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
            />
          </label>
          <label>
            Mật khẩu mới
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={72}
              required
              value={passwords.next}
              onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
            />
          </label>
        </div>
        <button className="btn btn-outline" type="submit">
          Đổi mật khẩu
        </button>
      </form>
    </>
  );
}

/** Hộp thoại hồ sơ mở từ ảnh đại diện. Nội dung chỉ dựng khi đang mở để id không trùng với màn Hồ sơ. */
export function ProfileModal() {
  const { open, seq, close } = useModal('profile');
  const state = useProfile(open, seq, close);
  return (
    <Modal id="profile-modal" open={state.ready} onClose={close} labelledBy="profile-modal-title">
      <div className="modal-card modal-card-wide">
        <ModalClose modalId="profile-modal" label="Đóng hồ sơ cá nhân" onClose={close} />
        {open && <ProfileBody state={state} headingId="profile-modal-title" />}
      </div>
    </Modal>
  );
}

/** Màn Hồ sơ trong Thiết lập. Khi hộp thoại hồ sơ đang mở thì nhường (không dựng hai bản cùng id). */
export function ProfileScreen() {
  const { active } = useViewState('profile');
  const modal = useModal('profile');
  const state = useProfile(active && !modal.open, modal.seq, () => undefined);
  return (
    <ViewSection view="profile">
      <section className="panel profile-screen">
        {active && !modal.open && state.ready ? (
          <ProfileBody state={state} headingId="profile-screen-title" />
        ) : (
          <Empty text="Đang tải hồ sơ..." />
        )}
      </section>
    </ViewSection>
  );
}
