import { Router } from 'express';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { ReportController } from './report.controller';
import { formatQuery, periodQuery } from './report.schemas';

export function createReportRouter(controller: ReportController) {
  const router = Router();
  router.use(authenticate);
  router.get('/summary', controller.summary);
  router.get('/reconciliation', controller.reconciliation);
  router.get('/net-worth', controller.netWorth);

  documentRoutes(router, {
    'GET /summary': {
      summary: 'Báo cáo tổng hợp thu, chi, dòng tiền theo tháng và chi theo danh mục',
      description: 'Trả JSON theo envelope chung; ?format=csv trả tệp CSV.',
      query: periodQuery.merge(formatQuery),
      errors: { 422: 'INVALID_DATE_RANGE – ngày bắt đầu sau ngày kết thúc.' }
    },
    'GET /reconciliation': {
      summary: 'Đối soát số dư từng ví (số dư đầu kỳ và số dư tính từ giao dịch) và tổng theo tiền tệ',
      query: formatQuery
    },
    'GET /net-worth': { summary: 'Tài sản ròng theo tiền tệ và biến động theo tháng' }
  });
  return router;
}
