import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  RESET_TOKEN_EXPIRES_MINUTES: z.coerce.number().int().positive().default(15),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('no-reply@finance.local'),
  /** Gửi email qua API HTTPS của Brevo (ưu tiên hơn SMTP; dùng được khi nền tảng chặn cổng SMTP). */
  BREVO_API_KEY: z.string().optional(),
  /** Địa chỉ người gửi; với Brevo phải là email đã xác minh trong tài khoản Brevo. Mặc định dùng SMTP_FROM. */
  MAIL_FROM: z.preprocess((value) => (value === '' ? undefined : value), z.string().email().optional()),
  MAIL_FROM_NAME: z.string().default('Sổ Mộc'),
  COOKIE_NAME: z.string().default('finance_refresh'),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((value) => (value ? value === 'true' : undefined)),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  OAUTH_CALLBACK_BASE_URL: z.string().url().optional(),
  AI_PROVIDER: z.enum(['openai', 'deepseek']).default('deepseek'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(30),
  AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1_000).default(6),
  AI_IMAGE_MAX_MB: z.coerce.number().positive().max(20).default(5),
  LOG_HTTP_DETAILS: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  /** Bật tài khoản dùng thử công khai `demo` (tạo bằng seed khi container khởi động, được bảo vệ khỏi đổi mật khẩu/xóa). */
  SEED_DEMO: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default('deepseek-flash')
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const normalized = { ...source };
  if (!normalized.APP_URL && normalized.RENDER_EXTERNAL_HOSTNAME) {
    normalized.APP_URL = `https://${normalized.RENDER_EXTERNAL_HOSTNAME}`;
  }
  if (!normalized.CORS_ORIGIN && normalized.APP_URL) normalized.CORS_ORIGIN = normalized.APP_URL;
  const result = schema.safeParse(normalized);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Cấu hình môi trường không hợp lệ: ${details}`);
  }
  return result.data;
}

export const config = loadConfig();

/** Trợ lý AI là tính năng tùy chọn: thiếu khóa của nhà cung cấp thì ứng dụng vẫn chạy (đóng gói Docker chạy được ngay
 * trên máy không có khóa), chỉ riêng Agent và đọc ảnh hóa đơn trả lỗi AI_PROVIDER_NOT_CONFIGURED. */
export function isAiConfigured(value: Pick<AppConfig, 'AI_PROVIDER' | 'DEEPSEEK_API_KEY' | 'OPENAI_API_KEY'> = config) {
  return value.AI_PROVIDER === 'deepseek'
    ? Boolean(value.DEEPSEEK_API_KEY?.trim())
    : Boolean(value.OPENAI_API_KEY?.trim());
}
