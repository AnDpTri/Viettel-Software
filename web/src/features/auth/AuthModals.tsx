import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { AuthPayload } from '../../api/types';
import { useAuth } from '../../app/auth';
import { Modal, ModalClose } from '../../ui/Modal';
import { errorMessage, useToast } from '../../ui/Toast';

const PASSWORD_HINT = 'Tối thiểu 10 ký tự và không dùng mật khẩu quá phổ biến.';

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

export function RegisterModal({ open, onClose }: ModalProps) {
  const { enter } = useAuth();
  const toast = useToast();
  const empty = { username: '', fullName: '', email: '', phone: '', password: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ làm trống form mỗi lần mở
  }, [open]);
  const field = (name: keyof typeof empty) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value })
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.password !== form.confirm) {
      toast('Mật khẩu nhập lại chưa khớp.', true);
      document.getElementById('register-confirm-password')?.focus();
      return;
    }
    setBusy(true);
    try {
      const data = await api<AuthPayload>('/auth/register', {
        method: 'POST',
        body: {
          username: form.username,
          email: form.email || undefined,
          phone: form.phone || undefined,
          password: form.password,
          fullName: form.fullName || undefined
        },
        skipRefresh: true
      });
      onClose();
      if (!(await enter(data))) toast('Tài khoản đã được tạo. Chào mừng bạn!');
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      id="register-modal"
      open={open}
      onClose={onClose}
      labelledBy="register-title"
      initialFocus="#register-username"
    >
      <form id="register-form" className="modal-card" onSubmit={submit}>
        <ModalClose modalId="register-modal" label="Đóng cửa sổ đăng ký" onClose={onClose} />
        <span className="eyebrow">BẮT ĐẦU VỚI SỔ MỘC</span>
        <h2 id="register-title">Tạo tài khoản</h2>
        <label>
          Tên đăng nhập
          <input
            id="register-username"
            minLength={3}
            maxLength={50}
            autoComplete="username"
            required
            {...field('username')}
          />
        </label>
        <label>
          Họ tên
          <input id="register-full-name" maxLength={120} autoComplete="name" {...field('fullName')} />
        </label>
        <div className="form-row">
          <label>
            Email <small>(không bắt buộc)</small>
            <input id="register-email" type="email" autoComplete="email" {...field('email')} />
          </label>
          <label>
            Số điện thoại <small>(không bắt buộc)</small>
            <input
              id="register-phone"
              type="tel"
              inputMode="tel"
              pattern="\+?[0-9]{9,15}"
              autoComplete="tel"
              {...field('phone')}
            />
          </label>
        </div>
        <p className="form-help">
          Email dùng để lấy lại mật khẩu khi quên. Không nhập email thì bạn không khôi phục được mật khẩu.
        </p>
        <div className="form-row">
          <label>
            Mật khẩu
            <input
              id="register-password"
              type="password"
              minLength={10}
              maxLength={72}
              autoComplete="new-password"
              required
              {...field('password')}
            />
          </label>
          <label>
            Nhập lại mật khẩu
            <input
              id="register-confirm-password"
              type="password"
              minLength={10}
              maxLength={72}
              autoComplete="new-password"
              required
              {...field('confirm')}
            />
          </label>
        </div>
        <p className="form-help">{PASSWORD_HINT}</p>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          Tạo tài khoản <span aria-hidden="true">→</span>
        </button>
      </form>
    </Modal>
  );
}

export function ForgotPasswordModal({ open, onClose, initialEmail }: ModalProps & { initialEmail: string }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setEmail(initialEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ điền sẵn khi vừa mở
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email }, skipRefresh: true });
      onClose();
      toast('Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi. Hãy kiểm tra cả thư mục Spam.');
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      id="forgot-password-modal"
      open={open}
      onClose={onClose}
      labelledBy="forgot-password-title"
      initialFocus="#forgot-email"
    >
      <form id="forgot-password-form" className="modal-card modal-card-narrow" onSubmit={submit}>
        <ModalClose modalId="forgot-password-modal" label="Đóng cửa sổ quên mật khẩu" onClose={onClose} />
        <span className="eyebrow">KHÔI PHỤC TÀI KHOẢN</span>
        <h2 id="forgot-password-title">Quên mật khẩu</h2>
        <p className="form-help">
          Nhập email bạn đã dùng khi đăng ký. Sổ Mộc sẽ gửi liên kết đặt lại mật khẩu, có hiệu lực trong 15 phút.
        </p>
        <label>
          Email
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="ban@example.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          Gửi liên kết <span aria-hidden="true">→</span>
        </button>
      </form>
    </Modal>
  );
}

export function ResetPasswordModal({ open, onClose, onDone }: ModalProps & { onDone: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast('Mật khẩu nhập lại chưa khớp.', true);
      document.getElementById('reset-confirm-password')?.focus();
      return;
    }
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      toast('Liên kết đặt lại mật khẩu không hợp lệ.', true);
      return;
    }
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: password }, skipRefresh: true });
      history.replaceState({}, '', '/');
      onClose();
      onDone();
      toast('Đã đặt lại mật khẩu. Vui lòng đăng nhập.');
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      id="reset-password-modal"
      open={open}
      onClose={onClose}
      labelledBy="reset-password-title"
      initialFocus="#reset-password"
    >
      <form id="reset-password-form" className="modal-card modal-card-narrow" onSubmit={submit}>
        <ModalClose modalId="reset-password-modal" label="Đóng cửa sổ đặt lại mật khẩu" onClose={onClose} />
        <span className="eyebrow">BẢO MẬT TÀI KHOẢN</span>
        <h2 id="reset-password-title">Đặt lại mật khẩu</h2>
        <label>
          Mật khẩu mới
          <input
            id="reset-password"
            type="password"
            minLength={10}
            maxLength={72}
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Nhập lại mật khẩu
          <input
            id="reset-confirm-password"
            type="password"
            minLength={10}
            maxLength={72}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <p className="form-help">{PASSWORD_HINT}</p>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          Cập nhật mật khẩu <span aria-hidden="true">→</span>
        </button>
      </form>
    </Modal>
  );
}
