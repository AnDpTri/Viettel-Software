import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, uuidParam } from '../../core/http/request';
import { success } from '../../core/http/response';
import {
  billInput,
  billPatchInput,
  billPayInput,
  recurringInput,
  templateInput,
  templateUseInput
} from './scheduling.schemas';
import type { SchedulingService } from './scheduling.service';

export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  listRecurring = asyncHandler(async (req, res) =>
    success(res, await this.scheduling.listRecurring(currentUserId(req)))
  );
  createRecurring = asyncHandler(async (req, res) => {
    const rule = await this.scheduling.createRecurring(currentUserId(req), recurringInput.parse(req.body));
    return success(res, rule, 'Đã tạo giao dịch định kỳ.', 201);
  });
  updateRecurring = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const rule = await this.scheduling.updateRecurring(userId, id, recurringInput.partial().parse(req.body));
    return success(res, rule, 'Đã cập nhật lịch định kỳ.');
  });
  deleteRecurring = asyncHandler(async (req, res) => {
    await this.scheduling.deleteRecurring(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã xóa lịch định kỳ.');
  });
  runDue = asyncHandler(async (req, res) =>
    success(res, await this.scheduling.runDue(currentUserId(req)), 'Đã xử lý các giao dịch đến hạn.')
  );

  listBills = asyncHandler(async (req, res) => success(res, await this.scheduling.listBills(currentUserId(req))));
  createBill = asyncHandler(async (req, res) =>
    success(
      res,
      await this.scheduling.createBill(currentUserId(req), billInput.parse(req.body)),
      'Đã tạo hóa đơn nhắc việc.',
      201
    )
  );
  updateBill = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    return success(
      res,
      await this.scheduling.updateBill(userId, id, billPatchInput.parse(req.body)),
      'Đã cập nhật hóa đơn.'
    );
  });
  payBill = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    return success(
      res,
      await this.scheduling.payBill(userId, id, billPayInput.parse(req.body)),
      'Đã thanh toán hóa đơn.'
    );
  });
  deleteBill = asyncHandler(async (req, res) => {
    await this.scheduling.deleteBill(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã xóa hóa đơn.');
  });

  listTemplates = asyncHandler(async (req, res) =>
    success(res, await this.scheduling.listTemplates(currentUserId(req)))
  );
  createTemplate = asyncHandler(async (req, res) =>
    success(
      res,
      await this.scheduling.createTemplate(currentUserId(req), templateInput.parse(req.body)),
      'Đã tạo mẫu giao dịch.',
      201
    )
  );
  useTemplate = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const transaction = await this.scheduling.useTemplate(userId, id, () => templateUseInput.parse(req.body));
    return success(res, transaction, 'Đã tạo giao dịch từ mẫu.', 201);
  });
  deleteTemplate = asyncHandler(async (req, res) => {
    await this.scheduling.deleteTemplate(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã xóa mẫu giao dịch.');
  });
}
