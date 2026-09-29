import { Router } from 'express';
import multer from 'multer';
import type { AppConfig } from '../../core/config/env';
import { createRateLimiter } from '../../core/observability/http';
import { authenticate } from '../../core/security/authenticate';
import { documentRoutes } from '../../docs/route-docs';
import type { AgentController } from '../agent/agent.controller';
import { assistantInput, consentInput, conversationInput } from '../agent/agent.schemas';
import type { InsightController } from './insight.controller';
import { parseTextInput, receiptTextInput } from './insight.schemas';

/** Nhóm /insights: phân tích tài chính (không dùng AI) và trợ lý AI. Giữ một router phẳng để tài liệu OpenAPI tự
 * sinh nhìn thấy mọi route. */
export function createInsightRouter(insights: InsightController, agent: AgentController, config: AppConfig) {
  const router = Router();
  router.use(authenticate);
  const aiLimiter = createRateLimiter({
    windowMs: 60_000,
    max: config.AI_RATE_LIMIT_PER_MINUTE,
    keyPrefix: 'ai-agent',
    key: (req) => req.user!.id
  });
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: config.AI_IMAGE_MAX_MB * 1024 * 1024 },
    fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png'].includes(file.mimetype))
  });

  router.get('/settings', agent.settings);
  router.put('/settings', agent.updateSettings);
  router.get('/overview', insights.overview);
  router.post('/parse-transaction', insights.parseTransaction);
  router.post('/extract-receipt', insights.extractReceipt);
  router.post('/extract-receipt-image', aiLimiter, imageUpload.single('receipt'), agent.receiptImage);
  router.get('/conversations', agent.listConversations);
  router.get('/memories', agent.listMemories);
  router.delete('/memories/:id', agent.deleteMemory);
  router.post('/conversations', agent.createConversation);
  router.get('/conversations/:id/messages', agent.conversationMessages);
  router.delete('/conversations/:id', agent.deleteConversation);
  router.post('/assistant', aiLimiter, agent.ask);
  router.post('/actions/:id/confirm', agent.confirmAction);
  router.post('/actions/:id/cancel', agent.cancelAction);
  router.post('/actions/:id/undo', agent.undoAction);

  const aiErrors = {
    428: 'AI_CONSENT_REQUIRED – người dùng chưa đồng ý dùng AI bên ngoài.',
    429: 'AI_DAILY_LIMIT_REACHED / RATE_LIMITED – hết lượt AI trong ngày hoặc gửi quá nhanh.',
    503: 'AI_PROVIDER_NOT_CONFIGURED – máy chủ chưa cấu hình khóa AI.'
  };
  documentRoutes(router, {
    'GET /settings': { summary: 'Quyền riêng tư AI, hạng tài khoản và lượt AI còn lại trong ngày' },
    'PUT /settings': { summary: 'Đồng ý hoặc thu hồi đồng ý dùng AI bên ngoài', body: consentInput },
    'GET /overview': { summary: 'Phân tích chi tiêu, khoản bất thường, thuê bao và dự báo cuối tháng' },
    'POST /parse-transaction': { summary: 'Hiểu câu tiếng Việt thành giao dịch nháp', body: parseTextInput },
    'POST /extract-receipt': {
      summary: 'Trích số tiền, ngày, cửa hàng từ văn bản OCR hóa đơn',
      body: receiptTextInput
    },
    'POST /extract-receipt-image': { summary: 'Đọc ảnh hóa đơn bằng AI (JPG/PNG)', file: 'receipt', errors: aiErrors },
    'GET /conversations': { summary: 'Danh sách hội thoại với trợ lý' },
    'GET /memories': { summary: 'Các ghi nhớ dài hạn trợ lý đã lưu về người dùng' },
    'DELETE /memories/:id': { summary: 'Xóa một ghi nhớ dài hạn' },
    'POST /conversations': { summary: 'Tạo hội thoại mới', body: conversationInput, status: 201 },
    'GET /conversations/:id/messages': { summary: 'Tin nhắn và hành động của một hội thoại' },
    'DELETE /conversations/:id': { summary: 'Xóa hội thoại' },
    'POST /assistant': {
      summary: 'Hỏi trợ lý tài chính (Agent đa lượt dùng công cụ đọc/ghi dữ liệu)',
      description:
        'Thay đổi dữ liệu chỉ được đề xuất dưới dạng hành động chờ xác nhận; người dùng xác nhận, hủy hoặc hoàn tác qua /actions/{id}/*.',
      body: assistantInput,
      errors: aiErrors
    },
    'POST /actions/:id/confirm': { summary: 'Xác nhận và thực hiện nhóm hành động của trợ lý' },
    'POST /actions/:id/cancel': { summary: 'Hủy hành động đang chờ xác nhận' },
    'POST /actions/:id/undo': { summary: 'Hoàn tác hành động đã thực hiện' }
  });
  return router;
}
