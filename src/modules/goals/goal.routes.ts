import { Router } from 'express';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { GoalController } from './goal.controller';
import { contributionInput, goalInput, goalListQuery } from './goal.schemas';

export function createGoalRouter(controller: GoalController) {
  const router = Router();
  router.use(authenticate);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.post('/run-recurring', controller.runRecurring);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.post('/:id/contributions', controller.contribute);
  router.delete('/:id', controller.remove);
  router.post('/:id/pause', controller.pause);
  router.post('/:id/resume', controller.resume);

  documentRoutes(router, {
    'GET /': { summary: 'Danh sách mục tiêu kèm phần trăm hoàn thành', query: goalListQuery },
    'POST /': { summary: 'Tạo mục tiêu tiết kiệm', body: goalInput, status: 201 },
    'POST /run-recurring': { summary: 'Ghi các khoản góp định kỳ đến hạn của mục tiêu' },
    'GET /:id': { summary: 'Chi tiết mục tiêu và lịch sử góp' },
    'PATCH /:id': { summary: 'Sửa mục tiêu', body: goalInput.partial() },
    'POST /:id/contributions': {
      summary: 'Góp thêm hoặc rút bớt tiền của mục tiêu',
      description:
        'Có fromWalletId thì tạo giao dịch chuyển khoản thật giữa ví nguồn và ví liên kết của mục tiêu (số âm thì chuyển ngược lại), để số dư ví và tiến độ luôn khớp.',
      body: contributionInput,
      status: 201,
      errors: {
        409: 'GOAL_CANCELLED – mục tiêu đã hủy.',
        422: 'GOAL_WALLET_REQUIRED / INVALID_TRANSFER / CURRENCY_MISMATCH / NEGATIVE_GOAL_BALANCE.'
      }
    },
    'DELETE /:id': { summary: 'Xóa mục tiêu (xóa mềm)' },
    'POST /:id/pause': { summary: 'Tạm dừng mục tiêu' },
    'POST /:id/resume': { summary: 'Tiếp tục mục tiêu đã tạm dừng' }
  });
  return router;
}
