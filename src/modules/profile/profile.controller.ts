import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId } from '../../core/http/request';
import { success } from '../../core/http/response';
import type { OnboardingService } from '../onboarding/onboarding.service';
import { onboardingInput, profileInput, starterCategoriesInput } from './profile.schemas';
import type { ProfileService } from './profile.service';

export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly onboarding: OnboardingService
  ) {}

  get = asyncHandler(async (req, res) => success(res, await this.profiles.get(currentUserId(req))));

  update = asyncHandler(async (req, res) => {
    const user = await this.profiles.update(currentUserId(req), req.user?.username, profileInput.parse(req.body));
    return success(res, user, 'Cập nhật hồ sơ thành công.');
  });

  onboardingStatus = asyncHandler(async (req, res) => success(res, await this.onboarding.status(currentUserId(req))));

  updateOnboarding = asyncHandler(async (req, res) => {
    const status = await this.onboarding.updatePreferences(currentUserId(req), onboardingInput.parse(req.body));
    return success(res, status, 'Đã cập nhật hướng dẫn bắt đầu.');
  });

  createStarterCategories = asyncHandler(async (req, res) => {
    const { names } = starterCategoriesInput.parse(req.body ?? {});
    const result = await this.onboarding.createStarterCategories(currentUserId(req), names);
    const message = result.created ? `Đã tạo ${result.created} danh mục gợi ý.` : 'Các danh mục gợi ý đã có sẵn.';
    return success(res, result, message);
  });
}
