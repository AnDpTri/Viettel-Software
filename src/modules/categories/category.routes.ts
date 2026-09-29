import { Router } from 'express';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { CategoryController } from './category.controller';
import { categoryInput, categoryListQuery, mergeInput } from './category.schemas';

export function createCategoryRouter(controller: CategoryController) {
  const router = Router();
  router.use(authenticate);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.archive);
  router.post('/:id/restore', controller.restore);
  router.post('/:id/merge', controller.merge);

  documentRoutes(router, {
    'GET /': { summary: 'Danh mục thu chi dạng cây hoặc phẳng', query: categoryListQuery },
    'POST /': {
      summary: 'Tạo danh mục (có parentId để làm danh mục con)',
      body: categoryInput,
      status: 201,
      errors: { 409: 'DUPLICATE_RESOURCE – trùng tên danh mục.' }
    },
    'GET /:id': { summary: 'Chi tiết danh mục kèm danh mục con' },
    'PATCH /:id': {
      summary: 'Sửa danh mục',
      body: categoryInput.partial(),
      errors: { 409: 'CATEGORY_IN_USE – không đổi loại khi đã có danh mục con hoặc giao dịch.' }
    },
    'DELETE /:id': { summary: 'Lưu trữ danh mục' },
    'POST /:id/restore': { summary: 'Khôi phục danh mục đã lưu trữ' },
    'POST /:id/merge': { summary: 'Gộp danh mục vào một danh mục khác cùng loại', body: mergeInput }
  });
  return router;
}
