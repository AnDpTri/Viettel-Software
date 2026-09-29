import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId } from '../../core/http/request';
import { success } from '../../core/http/response';
import { householdInput, joinInput } from './household.schemas';
import type { HouseholdService } from './household.service';

export class HouseholdController {
  constructor(private readonly households: HouseholdService) {}

  list = asyncHandler(async (req, res) => success(res, await this.households.list(currentUserId(req))));

  create = asyncHandler(async (req, res) => {
    const { name } = householdInput.parse(req.body);
    return success(res, await this.households.create(currentUserId(req), name), 'Đã tạo nhóm gia đình.', 201);
  });

  join = asyncHandler(async (req, res) => {
    const { inviteCode } = joinInput.parse(req.body);
    return success(res, await this.households.join(currentUserId(req), inviteCode), 'Đã tham gia nhóm gia đình.');
  });
}
