import { z } from '../../core/http/zod';
import { named } from '../../docs/route-docs';

/** Ô để trống trên biểu mẫu gửi chuỗi rỗng; coi như không nhập để trường tùy chọn không bị báo sai định dạng. */
const optionalText = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && !value.trim() ? undefined : value), schema.optional());

const BLOCKED_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'letmein',
  'demo@123'
]);

/** Mật khẩu 10–72 ký tự (giới hạn của bcrypt), không nằm trong danh sách mật khẩu phổ biến. */
export const passwordSchema = z
  .string()
  .min(10, 'Mật khẩu cần ít nhất 10 ký tự.')
  .max(72)
  .refine((value) => !BLOCKED_PASSWORDS.has(value.toLowerCase()), 'Mật khẩu quá phổ biến hoặc đã bị lộ.');

// Đăng ký chỉ cần định danh + mật khẩu (theo yêu cầu). Email tùy chọn, dùng để khôi phục mật khẩu; số điện thoại tùy chọn.
export const registerInput = named(
  'RegisterRequest',
  z.object({
    username: z
      .string()
      .trim()
      .min(3, 'Tên đăng nhập cần ít nhất 3 ký tự.')
      .max(50)
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.')
      .openapi({ example: 'demo' }),
    email: optionalText(
      z
        .string()
        .trim()
        .email('Email không hợp lệ.')
        .transform((value) => value.toLowerCase())
    ),
    phone: optionalText(
      z
        .string()
        .trim()
        .regex(/^\+?[0-9]{9,15}$/, 'Số điện thoại gồm 9–15 chữ số.')
    ),
    password: passwordSchema,
    fullName: optionalText(z.string().trim().min(2, 'Họ tên cần ít nhất 2 ký tự.').max(120)),
    remember: z.boolean().default(true)
  })
);

export const loginInput = named(
  'LoginRequest',
  z.object({
    identifier: z.string().trim().min(1, 'Hãy nhập tên đăng nhập hoặc email.').openapi({
      description: 'Tên đăng nhập hoặc email (không phân biệt hoa thường); số điện thoại cũng được chấp nhận',
      example: 'demo'
    }),
    password: z.string().min(1),
    remember: z.boolean().default(true),
    deviceName: z.string().max(120).optional()
  })
);

export const refreshInput = z.object({
  refreshToken: z.string().optional().openapi({ description: 'Bỏ trống thì đọc từ cookie HttpOnly' })
});

// Quên mật khẩu nhận đúng email khôi phục của tài khoản, không nhận tên đăng nhập.
export const forgotInput = z.object({
  email: z
    .string({ required_error: 'Hãy nhập email của tài khoản.' })
    .trim()
    .email('Email không hợp lệ.')
    .openapi({ description: 'Email của tài khoản: nhận liên kết đặt lại mật khẩu', example: 'demo@example.com' })
});

export const resetInput = z.object({
  token: z.string().min(20).openapi({ description: 'Token trong liên kết email' }),
  newPassword: passwordSchema
});

export const changePasswordInput = z.object({ currentPassword: z.string(), newPassword: passwordSchema });
export const verifyEmailInput = z.object({ token: z.string().min(20) });
export const oauthProvider = z.enum(['google', 'github']);
export const oauthCallbackQuery = z.object({ code: z.string(), state: z.string() });

export type RegisterInput = z.infer<typeof registerInput>;
export type LoginInput = z.infer<typeof loginInput>;
export type OAuthProvider = z.infer<typeof oauthProvider>;
