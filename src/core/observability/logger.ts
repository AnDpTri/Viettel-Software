import pino from 'pino';
import { config } from '../config/env';

/** Logger có cấu trúc (JSON một dòng) dùng chung toàn hệ thống. Mỗi bản ghi có `event` để lọc, và không bao giờ
 * chứa mật khẩu, token hay khóa: các trường nhạy cảm bị che trước khi ghi. Tắt khi chạy test để đầu ra gọn. */
export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
  base: { service: 'so-moc-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      'password',
      'newPassword',
      'currentPassword',
      'token',
      'refreshToken',
      'accessToken',
      '*.password',
      '*.token'
    ],
    censor: '[đã ẩn]'
  }
});
