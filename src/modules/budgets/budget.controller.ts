import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, patchSchema, uuidParam } from '../../core/http/request';
import { success } from '../../core/http/response';
import { budgetFields, budgetInput } from './budget.schemas';
import type { BudgetService } from './budget.service';

const budgetPatch = patchSchema(budgetFields);

export class BudgetController {
  constructor(private readonly budgets: BudgetService) {}

  list = asyncHandler(async (req, res) => success(res, await this.budgets.list(currentUserId(req))));

  create = asyncHandler(async (req, res) => {
    const budget = await this.budgets.create(currentUserId(req), budgetInput.parse(req.body));
    return success(res, budget, 'Tạo ngân sách thành công.', 201);
  });

  rollover = asyncHandler(async (req, res) =>
    success(res, await this.budgets.rollover(currentUserId(req)), 'Đã tạo các kỳ ngân sách tiếp theo.')
  );

  get = asyncHandler(async (req, res) => success(res, await this.budgets.get(currentUserId(req), uuidParam(req))));

  update = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const budget = await this.budgets.update(userId, id, budgetPatch.parse(req.body));
    return success(res, budget, 'Cập nhật ngân sách thành công.');
  });

  remove = asyncHandler(async (req, res) => {
    await this.budgets.remove(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã chuyển ngân sách vào thùng rác.');
  });
}
