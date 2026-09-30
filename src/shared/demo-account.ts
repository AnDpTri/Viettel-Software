import { config } from '../core/config/env';
import { AppError } from '../core/errors/app-error';

export const DEMO_USERNAME = 'demo';

/** Tài khoản demo dùng chung cho người đánh giá: mật khẩu công khai, nên không ai được đổi mật khẩu, đổi thông tin
 * khôi phục hay xóa nó (nếu không, một người có thể chiếm hoặc xóa tài khoản và mọi người khác mất quyền dùng thử). */
export function isProtectedDemo(username: string | undefined) {
  return config.SEED_DEMO && username === DEMO_USERNAME;
}

export function assertNotProtectedDemo(username: string | undefined, action: string) {
  if (isProtectedDemo(username)) {
    throw new AppError(
      403,
      'DEMO_ACCOUNT_PROTECTED',
      `Tài khoản demo dùng chung nên không thể ${action}. Hãy tạo tài khoản riêng để thử chức năng này.`
    );
  }
}
