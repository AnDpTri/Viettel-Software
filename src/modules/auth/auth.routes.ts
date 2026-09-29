import { Router } from 'express';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { AuthController } from './auth.controller';
import {
  changePasswordInput,
  forgotInput,
  loginInput,
  oauthCallbackQuery,
  refreshInput,
  registerInput,
  resetInput,
  verifyEmailInput
} from './auth.schemas';

export function createAuthRouter(controller: AuthController) {
  const router = Router();
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.get('/session-status', controller.sessionStatus);
  router.post('/session', controller.restoreSession);
  router.post('/logout', authenticate, controller.logout);
  router.post('/logout-all', authenticate, controller.logoutAll);
  router.get('/sessions', authenticate, controller.listSessions);
  router.delete('/sessions/:familyId', authenticate, controller.revokeSession);
  router.post('/forgot-password', controller.forgotPassword);
  router.post('/reset-password', controller.resetPassword);
  router.post('/change-password', authenticate, controller.changePassword);
  router.post('/verification/email/send', authenticate, controller.sendVerification);
  router.post('/verification/email/confirm', controller.confirmVerification);
  router.get('/oauth/:provider/start', controller.oauthStart);
  router.get('/oauth/:provider/callback', controller.oauthCallback);
  router.get('/oauth/providers', controller.oauthProviders);

  documentRoutes(router, {
    'POST /register': {
      summary: 'Đăng ký tài khoản bằng tên đăng nhập và mật khẩu',
      description:
        'Email và số điện thoại là tùy chọn, chỉ dùng để khôi phục mật khẩu; ô để trống được bỏ qua. Trả về user, accessToken, refreshToken và đặt cookie phiên.',
      body: registerInput,
      status: 201,
      errors: { 409: 'DUPLICATE_RESOURCE – tên đăng nhập, email hoặc số điện thoại đã tồn tại (error.details.fields).' }
    },
    'POST /login': {
      summary: 'Đăng nhập bằng tên đăng nhập hoặc email',
      description: 'Email không phân biệt hoa thường. Số điện thoại đã đăng ký cũng được chấp nhận.',
      body: loginInput,
      errors: { 401: 'INVALID_CREDENTIALS – sai thông tin đăng nhập.' }
    },
    'POST /refresh': {
      summary: 'Xoay vòng access/refresh token',
      description: 'Refresh token cũ bị thu hồi; dùng lại token đã thu hồi sẽ khóa cả chuỗi phiên.',
      body: refreshInput,
      errors: { 401: 'INVALID_REFRESH_TOKEN – phiên không hợp lệ hoặc đã hết hạn.' }
    },
    'GET /session-status': { summary: 'Kiểm tra có thể khôi phục phiên bằng cookie hay không' },
    'POST /session': {
      summary: 'Khôi phục và xoay vòng phiên "ghi nhớ đăng nhập" từ cookie',
      errors: { 401: 'INVALID_REFRESH_TOKEN – không có hoặc sai cookie phiên.' }
    },
    'POST /logout': { summary: 'Đăng xuất và thu hồi refresh token hiện tại', body: refreshInput },
    'POST /logout-all': { summary: 'Đăng xuất khỏi mọi thiết bị' },
    'GET /sessions': { summary: 'Danh sách thiết bị và phiên đang hoạt động' },
    'DELETE /sessions/:familyId': { summary: 'Thu hồi phiên trên một thiết bị' },
    'POST /forgot-password': {
      summary: 'Quên mật khẩu: nhập email của tài khoản để nhận liên kết đặt lại',
      description:
        'Không nhận tên đăng nhập. Email không phân biệt hoa thường. Luôn trả cùng một thông báo để không lộ email nào đã đăng ký. Liên kết hết hạn sau RESET_TOKEN_EXPIRES_MINUTES phút và chỉ dùng được một lần.',
      body: forgotInput
    },
    'POST /reset-password': {
      summary: 'Đặt lại mật khẩu bằng token trong liên kết email',
      description: 'Thu hồi mọi phiên đăng nhập sau khi đặt lại.',
      body: resetInput,
      errors: { 400: 'INVALID_RESET_TOKEN – liên kết sai, đã dùng hoặc đã hết hạn.' }
    },
    'POST /change-password': {
      summary: 'Đổi mật khẩu (thu hồi mọi phiên, cần đăng nhập lại)',
      body: changePasswordInput,
      errors: {
        400: 'WRONG_PASSWORD / SAME_PASSWORD – mật khẩu hiện tại sai hoặc mật khẩu mới trùng mật khẩu cũ.',
        403: 'DEMO_ACCOUNT_PROTECTED – tài khoản demo dùng chung không được đổi mật khẩu.'
      }
    },
    'POST /verification/email/send': {
      summary: 'Gửi lại email xác minh',
      errors: {
        422: 'EMAIL_REQUIRED – tài khoản chưa có email.',
        503: 'EMAIL_DELIVERY_FAILED – dịch vụ email chưa cấu hình hoặc gửi thất bại.'
      }
    },
    'POST /verification/email/confirm': {
      summary: 'Xác minh email bằng token trong thư',
      body: verifyEmailInput,
      errors: { 400: 'INVALID_VERIFICATION_TOKEN – liên kết không hợp lệ hoặc đã hết hạn.' }
    },
    'GET /oauth/:provider/start': {
      summary: 'Bắt đầu đăng nhập bằng Google hoặc GitHub',
      produces: 'redirect',
      errors: { 503: 'OAUTH_NOT_CONFIGURED – máy chủ chưa cấu hình nền tảng này.' }
    },
    'GET /oauth/:provider/callback': {
      summary: 'Nền tảng OAuth gọi lại sau khi người dùng đồng ý',
      query: oauthCallbackQuery,
      produces: 'redirect',
      errors: { 400: 'INVALID_OAUTH_STATE – state không khớp.' }
    },
    'GET /oauth/providers': { summary: 'Các nền tảng đăng nhập liên kết đã cấu hình' }
  });
  return router;
}
