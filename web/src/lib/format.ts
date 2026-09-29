export const money = (value: unknown) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(
    Number(value || 0)
  );

export const moneyCurrency = (value: unknown, currency = 'VND') =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

export const shortDate = (value: string | number | Date) =>
  new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));

/** Ngày theo giờ máy dạng YYYY-MM-DD cho ô `<input type="date">`. */
export const localDateValue = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const monthStartValue = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

/** Ngày YYYY-MM-DD giữ nguyên giờ trưa địa phương để không lệch sang ngày khác khi đổi múi giờ. */
export const middayIso = (date: string) => new Date(`${date}T12:00:00`).toISOString();

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };

/** Thoát ký tự HTML trước khi ghép vào chuỗi HTML (chỉ dùng trong bộ hiển thị Markdown). */
export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Tên gọi thân mật: chữ cuối của họ tên, chưa có họ tên thì dùng tên đăng nhập. */
export function displayName(user: { fullName?: string | null; username?: string } | null) {
  const full = (user?.fullName ?? '').trim();
  return full ? full.split(/\s+/).slice(-1)[0]! : user?.username || 'bạn';
}

export function greetingText(date = new Date()) {
  const hour = date.getHours();
  return hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
}

export const WALLET_TYPE_LABELS: Record<string, string> = {
  CASH: 'Tiền mặt',
  BANK: 'Ngân hàng',
  E_WALLET: 'Ví điện tử',
  CREDIT: 'Thẻ tín dụng',
  OTHER: 'Khác'
};

export const ENUM_LABELS: Record<string, string> = {
  EXPENSE: 'Chi',
  INCOME: 'Thu',
  TRANSFER: 'Chuyển khoản',
  ...WALLET_TYPE_LABELS,
  DAILY: 'Hằng ngày',
  WEEKLY: 'Hằng tuần',
  MONTHLY: 'Hằng tháng',
  QUARTERLY: 'Hằng quý',
  YEARLY: 'Hằng năm',
  CLEARED: 'Đã ghi sổ',
  PENDING: 'Đang chờ',
  PLANNED: 'Dự kiến',
  RECONCILED: 'Đã đối soát',
  CANCELLED: 'Đã hủy',
  ACTIVE: 'Đang thực hiện',
  PAUSED: 'Tạm dừng',
  COMPLETED: 'Hoàn thành'
};
