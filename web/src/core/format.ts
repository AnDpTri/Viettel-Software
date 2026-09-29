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

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };

/** Thoát ký tự HTML trước khi chèn dữ liệu người dùng vào chuỗi HTML. */
export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => HTML_ESCAPES[char] ?? char);
}
