import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, uuidParam } from '../../core/http/request';
import { success } from '../../core/http/response';
import { automationRuleInput, exchangeRateInput, merchantInput, tagInput } from './catalog.schemas';
import type { CatalogService } from './catalog.service';

export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  listTags = asyncHandler(async (req, res) => success(res, await this.catalog.listTags(currentUserId(req))));
  createTag = asyncHandler(async (req, res) =>
    success(res, await this.catalog.createTag(currentUserId(req), tagInput.parse(req.body)), 'Đã tạo nhãn.', 201)
  );
  updateTag = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    return success(
      res,
      await this.catalog.updateTag(userId, id, tagInput.partial().parse(req.body)),
      'Đã cập nhật nhãn.'
    );
  });
  deleteTag = asyncHandler(async (req, res) => {
    await this.catalog.deleteTag(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã xóa nhãn.');
  });

  listMerchants = asyncHandler(async (req, res) => success(res, await this.catalog.listMerchants(currentUserId(req))));
  createMerchant = asyncHandler(async (req, res) => {
    const merchant = await this.catalog.createMerchant(currentUserId(req), merchantInput.parse(req.body));
    return success(res, merchant, 'Đã tạo đơn vị giao dịch.', 201);
  });
  updateMerchant = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const merchant = await this.catalog.updateMerchant(userId, id, merchantInput.partial().parse(req.body));
    return success(res, merchant, 'Đã cập nhật đơn vị giao dịch.');
  });
  deleteMerchant = asyncHandler(async (req, res) => {
    await this.catalog.deleteMerchant(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã xóa đơn vị giao dịch.');
  });

  listRules = asyncHandler(async (req, res) => success(res, await this.catalog.listRules(currentUserId(req))));
  createRule = asyncHandler(async (req, res) => {
    const rule = await this.catalog.createRule(currentUserId(req), automationRuleInput.parse(req.body));
    return success(res, rule, 'Đã tạo quy tắc tự động.', 201);
  });
  updateRule = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const rule = await this.catalog.updateRule(userId, id, automationRuleInput.partial().parse(req.body));
    return success(res, rule, 'Đã cập nhật quy tắc.');
  });
  deleteRule = asyncHandler(async (req, res) => {
    await this.catalog.deleteRule(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã xóa quy tắc.');
  });

  listRates = asyncHandler(async (req, res) => success(res, await this.catalog.listRates(currentUserId(req))));
  createRate = asyncHandler(async (req, res) =>
    success(
      res,
      await this.catalog.createRate(currentUserId(req), exchangeRateInput.parse(req.body)),
      'Đã lưu tỷ giá.',
      201
    )
  );
}
