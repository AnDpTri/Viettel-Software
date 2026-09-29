import { Router } from 'express';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { ProfileController } from './profile.controller';
import { onboardingInput, profileInput, starterCategoriesInput } from './profile.schemas';

export function createProfileRouter(controller: ProfileController) {
  const router = Router();
  router.use(authenticate);
  router.get('/onboarding', controller.onboardingStatus);
  router.patch('/onboarding', controller.updateOnboarding);
  router.post('/onboarding/starter-categories', controller.createStarterCategories);
  router.get('/', controller.get);
  router.patch('/', controller.update);

  documentRoutes(router, {
    'GET /onboarding': { summary: 'Tiến độ hướng dẫn người dùng mới, tính từ dữ liệu thực tế' },
    'PATCH /onboarding': {
      summary: 'Ẩn, đánh dấu đã xem, lưu mối quan tâm hoặc làm lại hướng dẫn ban đầu',
      body: onboardingInput
    },
    'POST /onboarding/starter-categories': {
      summary: 'Tạo các danh mục thu chi gợi ý còn thiếu',
      body: starterCategoriesInput
    },
    'GET /': { summary: 'Xem hồ sơ cá nhân và hạng tài khoản FREE/VIP' },
    'PATCH /': {
      summary: 'Cập nhật hồ sơ cá nhân',
      body: profileInput,
      errors: {
        403: 'DEMO_ACCOUNT_PROTECTED – tài khoản demo dùng chung không được đổi email/số điện thoại.',
        409: 'DUPLICATE_RESOURCE – email hoặc số điện thoại đã được tài khoản khác dùng.'
      }
    }
  });
  return router;
}
