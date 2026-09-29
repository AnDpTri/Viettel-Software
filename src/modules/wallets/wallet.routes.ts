import { Router } from 'express';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { WalletController } from './wallet.controller';
import { walletInput, walletListQuery } from './wallet.schemas';

export function createWalletRouter(controller: WalletController) {
  const router = Router();
  router.use(authenticate);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.archive);
  router.post('/:id/restore', controller.restore);

  documentRoutes(router, {
    'GET /': { summary: 'Danh sách ví kèm số dư tính từ giao dịch', query: walletListQuery },
    'POST /': { summary: 'Tạo ví', body: walletInput, status: 201 },
    'GET /:id': { summary: 'Chi tiết ví và số dư hiện tại' },
    'PATCH /:id': { summary: 'Sửa ví (gửi trường cần đổi)', body: walletInput.partial() },
    'DELETE /:id': { summary: 'Lưu trữ ví (xóa mềm, giữ lịch sử giao dịch)' },
    'POST /:id/restore': { summary: 'Khôi phục ví đã lưu trữ' }
  });
  return router;
}
