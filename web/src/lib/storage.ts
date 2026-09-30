/** localStorage an toàn: trình duyệt chặn lưu trữ (chế độ riêng tư, chính sách) thì đọc ra `null` và bỏ qua khi ghi. */
export function storageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua */
  }
}

/** Tài khoản dùng thử công khai (khớp DEMO_USERNAME ở backend) và cờ đã mở bản xem thử hướng dẫn trên trình duyệt này. */
export const DEMO_USERNAME = 'demo';
export const DEMO_WELCOME_KEY = 'somoc_demo_welcome_preview';

/** Ví dùng cho lần ghi giao dịch gần nhất, để chọn sẵn ở lần sau. */
export const LAST_WALLET_KEY = 'somoc_last_wallet';
