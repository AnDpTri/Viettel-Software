import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId } from '../../core/http/request';
import { success } from '../../core/http/response';
import { parseTextInput, receiptTextInput } from './insight.schemas';
import type { InsightService } from './insight.service';
import { extractReceiptText } from './transaction-parser';

export class InsightController {
  constructor(private readonly insights: InsightService) {}

  overview = asyncHandler(async (req, res) => success(res, await this.insights.overview(currentUserId(req))));

  parseTransaction = asyncHandler(async (req, res) => {
    const { text } = parseTextInput.parse(req.body);
    return success(
      res,
      await this.insights.parseTransaction(currentUserId(req), text),
      'Đã phân tích câu nhập. Vui lòng xác nhận trước khi lưu.'
    );
  });

  extractReceipt = asyncHandler(async (req, res) =>
    success(res, extractReceiptText(receiptTextInput.parse(req.body).text))
  );
}
