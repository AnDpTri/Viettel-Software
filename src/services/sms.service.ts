import { config } from '../config';

/** Kênh SMS đang dùng. Ngoài production mặc định ghi SMS ra log để phát triển và demo được mà không cần nhà mạng. */
export function smsProvider() {
  return config.SMS_PROVIDER ?? (config.NODE_ENV === 'production' ? 'none' : 'console');
}

/** Gửi mã OTP đặt lại mật khẩu. Trả false khi chưa cấu hình kênh SMS, để API vẫn trả thông báo chung (không lộ tài khoản
 * nào tồn tại) nhưng ghi cảnh báo cho quản trị viên. Muốn gửi thật, thêm một nhánh nhà cung cấp SMS tại đây. */
export async function sendPasswordResetSms(phone: string, code: string): Promise<boolean> {
  const text = `Ma dat lai mat khau So Moc: ${code}. Het han sau ${config.RESET_TOKEN_EXPIRES_MINUTES} phut. Khong chia se ma nay.`;
  if (smsProvider() === 'console') {
    console.info(JSON.stringify({ level: 'info', event: 'sms_outbox', to: phone, text }));
    return true;
  }
  console.warn(JSON.stringify({ level: 'warn', event: 'sms_not_configured', reason: 'SMS_PROVIDER=none, không gửi được mã đặt lại mật khẩu' }));
  return false;
}
