import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, patchSchema, uuidParam } from '../../core/http/request';
import { success } from '../../core/http/response';
import { categoryInput, categoryListQuery, mergeInput } from './category.schemas';
import type { CategoryService } from './category.service';

const categoryPatch = patchSchema(categoryInput);

export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  list = asyncHandler(async (req, res) =>
    success(res, await this.categories.list(currentUserId(req), categoryListQuery.parse(req.query)))
  );

  create = asyncHandler(async (req, res) => {
    const category = await this.categories.create(currentUserId(req), categoryInput.parse(req.body));
    return success(res, category, 'Tạo danh mục thành công.', 201);
  });

  get = asyncHandler(async (req, res) => success(res, await this.categories.get(currentUserId(req), uuidParam(req))));

  update = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const category = await this.categories.update(userId, id, categoryPatch.parse(req.body));
    return success(res, category, 'Cập nhật danh mục thành công.');
  });

  archive = asyncHandler(async (req, res) => {
    await this.categories.archive(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã lưu trữ danh mục.');
  });

  restore = asyncHandler(async (req, res) =>
    success(res, await this.categories.restore(currentUserId(req), uuidParam(req)), 'Đã khôi phục danh mục.')
  );

  merge = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const sourceId = uuidParam(req);
    const { targetId } = mergeInput.parse(req.body);
    return success(res, await this.categories.merge(userId, sourceId, targetId), 'Đã gộp danh mục.');
  });
}
