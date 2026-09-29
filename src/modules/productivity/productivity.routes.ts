import { Router } from 'express';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { AccountController } from '../account/account.controller';
import { deleteAccountInput } from '../account/account.schemas';
import type { CatalogController } from '../catalog/catalog.controller';
import { automationRuleInput, exchangeRateInput, merchantInput, tagInput } from '../catalog/catalog.schemas';
import type { HouseholdController } from '../households/household.controller';
import { householdInput, joinInput } from '../households/household.schemas';
import type { NotificationController } from '../notifications/notification.controller';
import { notificationQuery } from '../notifications/notification.schemas';
import type { SchedulingController } from '../scheduling/scheduling.controller';
import {
  billInput,
  billPatchInput,
  billPayInput,
  recurringInput,
  templateInput,
  templateUseInput
} from '../scheduling/scheduling.schemas';

export type ProductivityControllers = {
  catalog: CatalogController;
  scheduling: SchedulingController;
  notifications: NotificationController;
  households: HouseholdController;
  account: AccountController;
};

/** Các tiện ích dưới /productivity. Mỗi nhóm tính năng là một module riêng; router phẳng để tài liệu OpenAPI đọc được
 * mọi đường dẫn. */
export function createProductivityRouter(c: ProductivityControllers) {
  const router = Router();
  router.use(authenticate);

  router.get('/merchants', c.catalog.listMerchants);
  router.post('/merchants', c.catalog.createMerchant);
  router.patch('/merchants/:id', c.catalog.updateMerchant);
  router.delete('/merchants/:id', c.catalog.deleteMerchant);
  router.get('/tags', c.catalog.listTags);
  router.post('/tags', c.catalog.createTag);
  router.patch('/tags/:id', c.catalog.updateTag);
  router.delete('/tags/:id', c.catalog.deleteTag);

  router.get('/recurring', c.scheduling.listRecurring);
  router.post('/recurring', c.scheduling.createRecurring);
  router.patch('/recurring/:id', c.scheduling.updateRecurring);
  router.delete('/recurring/:id', c.scheduling.deleteRecurring);
  router.post('/recurring/run-due', c.scheduling.runDue);
  router.get('/bills', c.scheduling.listBills);
  router.post('/bills', c.scheduling.createBill);
  router.patch('/bills/:id', c.scheduling.updateBill);
  router.post('/bills/:id/pay', c.scheduling.payBill);
  router.delete('/bills/:id', c.scheduling.deleteBill);
  router.get('/templates', c.scheduling.listTemplates);
  router.post('/templates', c.scheduling.createTemplate);
  router.post('/templates/:id/use', c.scheduling.useTemplate);
  router.delete('/templates/:id', c.scheduling.deleteTemplate);

  router.get('/automation-rules', c.catalog.listRules);
  router.post('/automation-rules', c.catalog.createRule);
  router.patch('/automation-rules/:id', c.catalog.updateRule);
  router.delete('/automation-rules/:id', c.catalog.deleteRule);

  router.get('/notifications', c.notifications.list);
  router.post('/notifications/generate', c.notifications.generate);
  router.post('/notifications/read-all', c.notifications.markAllRead);
  router.patch('/notifications/:id/read', c.notifications.markRead);

  router.get('/audit-logs', c.account.auditLogs);
  router.get('/exchange-rates', c.catalog.listRates);
  router.post('/exchange-rates', c.catalog.createRate);

  router.get('/households', c.households.list);
  router.post('/households', c.households.create);
  router.post('/households/join', c.households.join);

  router.get('/data-export', c.account.exportData);
  router.delete('/account', c.account.deleteAccount);

  documentRoutes(router, {
    'GET /merchants': { summary: 'Danh sách đơn vị giao dịch (cửa hàng, người nhận)' },
    'POST /merchants': { summary: 'Tạo đơn vị giao dịch', body: merchantInput, status: 201 },
    'PATCH /merchants/:id': { summary: 'Sửa đơn vị giao dịch', body: merchantInput.partial() },
    'DELETE /merchants/:id': { summary: 'Xóa đơn vị giao dịch' },
    'GET /tags': { summary: 'Danh sách nhãn' },
    'POST /tags': { summary: 'Tạo nhãn', body: tagInput, status: 201 },
    'PATCH /tags/:id': { summary: 'Sửa nhãn', body: tagInput.partial() },
    'DELETE /tags/:id': { summary: 'Xóa nhãn' },
    'GET /recurring': { summary: 'Danh sách khoản thu chi định kỳ' },
    'POST /recurring': {
      summary: 'Tạo khoản thu chi định kỳ',
      description: 'autoPost=true: tự ghi giao dịch khi đến hạn; false: chỉ nhắc.',
      body: recurringInput,
      status: 201
    },
    'PATCH /recurring/:id': { summary: 'Sửa khoản định kỳ', body: recurringInput.partial() },
    'DELETE /recurring/:id': { summary: 'Xóa khoản định kỳ' },
    'POST /recurring/run-due': { summary: 'Ghi các khoản định kỳ tự động đã đến hạn' },
    'GET /bills': { summary: 'Danh sách hóa đơn nhắc việc (tự chuyển trạng thái quá hạn)' },
    'POST /bills': { summary: 'Tạo hóa đơn nhắc việc', body: billInput, status: 201 },
    'PATCH /bills/:id': { summary: 'Sửa hóa đơn hoặc đổi trạng thái', body: billPatchInput },
    'POST /bills/:id/pay': {
      summary: 'Thanh toán hóa đơn: ghi khoản chi và dời hạn kỳ sau',
      body: billPayInput,
      errors: { 422: 'WALLET_REQUIRED – cần chọn ví thanh toán.' }
    },
    'DELETE /bills/:id': { summary: 'Xóa hóa đơn nhắc việc' },
    'GET /templates': { summary: 'Danh sách mẫu giao dịch' },
    'POST /templates': { summary: 'Tạo mẫu giao dịch', body: templateInput, status: 201 },
    'POST /templates/:id/use': { summary: 'Ghi giao dịch từ mẫu', body: templateUseInput, status: 201 },
    'DELETE /templates/:id': { summary: 'Xóa mẫu giao dịch' },
    'GET /automation-rules': { summary: 'Danh sách quy tắc tự phân loại giao dịch' },
    'POST /automation-rules': { summary: 'Tạo quy tắc tự phân loại', body: automationRuleInput, status: 201 },
    'PATCH /automation-rules/:id': { summary: 'Sửa quy tắc tự phân loại', body: automationRuleInput.partial() },
    'DELETE /automation-rules/:id': { summary: 'Xóa quy tắc tự phân loại' },
    'GET /notifications': { summary: 'Danh sách thông báo', query: notificationQuery },
    'POST /notifications/generate': { summary: 'Sinh cảnh báo hóa đơn sắp đến hạn và ngân sách sắp vượt' },
    'POST /notifications/read-all': { summary: 'Đánh dấu đã đọc mọi thông báo' },
    'PATCH /notifications/:id/read': { summary: 'Đánh dấu đã đọc một thông báo' },
    'GET /audit-logs': { summary: 'Nhật ký hoạt động của tài khoản (200 bản ghi gần nhất)' },
    'GET /exchange-rates': { summary: 'Danh sách tỷ giá đã lưu' },
    'POST /exchange-rates': { summary: 'Lưu tỷ giá', body: exchangeRateInput, status: 201 },
    'GET /households': { tag: 'Collaboration', summary: 'Danh sách nhóm gia đình của tôi' },
    'POST /households': { tag: 'Collaboration', summary: 'Tạo nhóm gia đình', body: householdInput, status: 201 },
    'POST /households/join': { tag: 'Collaboration', summary: 'Tham gia nhóm gia đình bằng mã mời', body: joinInput },
    'GET /data-export': { tag: 'Profile', summary: 'Xuất toàn bộ dữ liệu cá nhân (JSON)' },
    'DELETE /account': {
      tag: 'Profile',
      summary: 'Xóa tài khoản: vô hiệu hóa, ẩn danh và đăng xuất mọi thiết bị',
      body: deleteAccountInput,
      errors: { 403: 'DEMO_ACCOUNT_PROTECTED – không xóa được tài khoản demo dùng chung.' }
    }
  });
  return router;
}
