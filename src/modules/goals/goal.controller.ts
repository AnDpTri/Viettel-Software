import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, patchSchema, uuidParam } from '../../core/http/request';
import { success } from '../../core/http/response';
import { contributionInput, goalInput, goalListQuery } from './goal.schemas';
import type { GoalService } from './goal.service';

const goalPatch = patchSchema(goalInput);

export class GoalController {
  constructor(private readonly goals: GoalService) {}

  list = asyncHandler(async (req, res) => {
    const { status } = goalListQuery.parse(req.query);
    return success(res, await this.goals.list(currentUserId(req), status));
  });

  create = asyncHandler(async (req, res) => {
    const goal = await this.goals.create(currentUserId(req), goalInput.parse(req.body));
    return success(res, goal, 'Tạo mục tiêu thành công.', 201);
  });

  runRecurring = asyncHandler(async (req, res) =>
    success(res, await this.goals.runRecurring(currentUserId(req)), 'Đã xử lý đóng góp mục tiêu định kỳ.')
  );

  get = asyncHandler(async (req, res) => success(res, await this.goals.get(currentUserId(req), uuidParam(req))));

  update = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    return success(
      res,
      await this.goals.update(userId, id, goalPatch.parse(req.body)),
      'Cập nhật mục tiêu thành công.'
    );
  });

  contribute = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const goal = await this.goals.contribute(userId, id, contributionInput.parse(req.body));
    return success(res, goal, 'Cập nhật tiến độ mục tiêu thành công.', 201);
  });

  remove = asyncHandler(async (req, res) => {
    await this.goals.remove(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã chuyển mục tiêu vào thùng rác.');
  });

  pause = asyncHandler(async (req, res) =>
    success(res, await this.goals.pause(currentUserId(req), uuidParam(req)), 'Đã tạm dừng mục tiêu.')
  );

  resume = asyncHandler(async (req, res) =>
    success(res, await this.goals.resume(currentUserId(req), uuidParam(req)), 'Đã tiếp tục mục tiêu.')
  );
}
