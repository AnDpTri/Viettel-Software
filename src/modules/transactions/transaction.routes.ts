import { Router } from 'express';
import multer from 'multer';
import { config } from '../../core/config/env';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { TransactionController } from './transaction.controller';
import { bulkInput, filterQuery, importInput, pagingQuery, splitsInput, transactionInput } from './transaction.schemas';

/** Nhận hóa đơn trong bộ nhớ: tối đa MAX_UPLOAD_MB, một tệp, MIME JPG/PNG/PDF (chữ ký tệp kiểm tra lại ở service). */
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) =>
    callback(null, ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype))
});

export function createTransactionRouter(controller: TransactionController) {
  const router = Router();
  router.use(authenticate);
  router.get('/export.csv', controller.exportCsv);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/trash/list', controller.trash);
  router.post('/bulk', controller.bulk);
  router.post('/import', controller.importRows);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  router.post('/:id/restore', controller.restore);
  router.put('/:id/splits', controller.split);
  router.post('/:id/receipts', receiptUpload.single('file'), controller.uploadReceipt);
  router.get('/:transactionId/receipts/:receiptId', controller.downloadReceipt);
  router.delete('/:transactionId/receipts/:receiptId', controller.deleteReceipt);

  documentRoutes(router, {
    'GET /export.csv': {
      summary: 'Xuất danh sách giao dịch ra tệp CSV (cùng bộ lọc với danh sách)',
      query: filterQuery,
      produces: 'csv'
    },
    'GET /': {
      summary: 'Danh sách giao dịch có lọc và phân trang',
      query: filterQuery.merge(pagingQuery),
      paginated: true,
      errors: { 422: 'VALIDATION_ERROR / INVALID_DATE_RANGE.' }
    },
    'POST /': {
      summary: 'Ghi giao dịch thu, chi hoặc chuyển khoản giữa hai ví',
      description:
        'Gửi header Idempotency-Key để tránh ghi trùng khi gửi lại. Quy tắc tự động có thể gán danh mục và nhãn.',
      body: transactionInput,
      status: 201,
      errors: { 422: 'INVALID_TRANSFER / CURRENCY_MISMATCH / CATEGORY_TYPE_MISMATCH / INVALID_DESTINATION.' }
    },
    'GET /trash/list': { summary: 'Danh sách giao dịch trong thùng rác' },
    'POST /bulk': { summary: 'Xóa, khôi phục hoặc đánh dấu đối soát nhiều giao dịch', body: bulkInput },
    'POST /import': { summary: 'Nhập tối đa 2.000 giao dịch trong một lần', body: importInput, status: 201 },
    'GET /:id': { summary: 'Chi tiết giao dịch kèm hóa đơn, nhãn và phần chia' },
    'PATCH /:id': { summary: 'Sửa giao dịch', body: transactionInput.partial() },
    'DELETE /:id': { summary: 'Chuyển giao dịch vào thùng rác' },
    'POST /:id/restore': { summary: 'Khôi phục giao dịch từ thùng rác' },
    'PUT /:id/splits': {
      summary: 'Chia một giao dịch thành nhiều phần theo danh mục',
      body: splitsInput,
      errors: { 422: 'SPLIT_TOTAL_MISMATCH – tổng các phần khác số tiền giao dịch.' }
    },
    'POST /:id/receipts': {
      summary: 'Tải lên hóa đơn JPG, PNG hoặc PDF cho giao dịch',
      description: 'Kiểm tra chữ ký tệp thật, tối đa 10 hóa đơn mỗi giao dịch.',
      file: 'file',
      status: 201,
      errors: { 422: 'FILE_REQUIRED / INVALID_FILE_SIGNATURE / RECEIPT_LIMIT_REACHED / UPLOAD_ERROR.' }
    },
    'GET /:transactionId/receipts/:receiptId': {
      summary: 'Tải về hóa đơn (chỉ chủ giao dịch)',
      produces: 'file',
      errors: { 410: 'RECEIPT_CONTENT_UNAVAILABLE – nội dung tệp cũ không còn.' }
    },
    'DELETE /:transactionId/receipts/:receiptId': { summary: 'Xóa một hóa đơn' }
  });
  return router;
}
