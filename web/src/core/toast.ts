import { $ } from './dom';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Thông báo ngắn ở góc màn hình, tự ẩn sau 3,2 giây. */
export function toast(message: string, error = false) {
  const element = $('#toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.className = `toast show${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => (element.className = 'toast'), 3200);
}
