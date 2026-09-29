import { Router } from 'express';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { BudgetController } from './budget.controller';
import { budgetFields, budgetInput } from './budget.schemas';

export function createBudgetRouter(controller: BudgetController) {
  const router = Router();
  router.use(authenticate);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.post('/rollover', controller.rollover);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);

  documentRoutes(router, {
    'GET /': { summary: 'Danh sách ngân sách kèm đã chi, còn lại và phần trăm sử dụng' },
    'POST /': {
      summary: 'Tạo ngân sách cho toàn bộ chi tiêu hoặc một danh mục chi',
      body: budgetInput,
      status: 201,
      errors: { 422: 'VALIDATION_ERROR / INVALID_BUDGET_CATEGORY – dữ liệu sai hoặc danh mục không phải danh mục chi.' }
    },
    'POST /rollover': { summary: 'Tạo kỳ tiếp theo cho các ngân sách lặp lại đã hết hạn' },
    'GET /:id': { summary: 'Chi tiết ngân sách và tiến độ' },
    'PATCH /:id': { summary: 'Sửa ngân sách', body: budgetFields.partial() },
    'DELETE /:id': { summary: 'Xóa ngân sách (xóa mềm)' }
  });
  return router;
}
