import type { TransactionType } from '@prisma/client';
import { AppError, notFound } from '../../core/errors/app-error';
import { buildCategoryTree, wouldCreateCycle } from '../../shared/category-tree';
import type { CategoryRepository } from './category.repository';
import type { CategoryInput, CategoryListQuery } from './category.schemas';

/** Nghiệp vụ danh mục cây: cha-con cùng loại, không vòng lặp, không đổi loại khi đang được dùng. */
export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}

  async list(userId: string, query: CategoryListQuery) {
    const items = await this.categories.list(userId, {
      type: query.type,
      includeArchived: query.includeArchived === 'true'
    });
    return query.tree === 'false' ? items : buildCategoryTree(items);
  }

  async get(userId: string, id: string) {
    const category = await this.categories.findOwnedWithChildren(userId, id);
    if (!category) throw notFound('Danh mục');
    return category;
  }

  async create(userId: string, input: CategoryInput) {
    await this.assertValidParent(userId, input.parentId, input.type);
    return this.categories.create(userId, input);
  }

  async update(userId: string, id: string, input: Partial<CategoryInput>) {
    const existing = await this.requireOwned(userId, id);
    const nextType = input.type ?? existing.type;
    if (nextType === 'TRANSFER') throw new AppError(422, 'INVALID_CATEGORY_TYPE', 'Danh mục chỉ hỗ trợ thu hoặc chi.');
    await this.assertValidParent(userId, input.parentId, nextType);
    if (input.parentId !== undefined && wouldCreateCycle(await this.categories.hierarchy(userId), id, input.parentId)) {
      throw new AppError(422, 'CATEGORY_CYCLE', 'Cấu trúc danh mục tạo thành vòng lặp.');
    }
    if (input.type && input.type !== existing.type) {
      const usage = await this.categories.usage(id);
      if (usage.children || usage.transactions) {
        throw new AppError(409, 'CATEGORY_IN_USE', 'Không thể đổi loại danh mục đang có danh mục con hoặc giao dịch.');
      }
    }
    return this.categories.update(id, input);
  }

  async archive(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.categories.update(id, { archivedAt: new Date() });
  }

  async restore(userId: string, id: string) {
    await this.requireOwned(userId, id);
    return this.categories.update(id, { archivedAt: null });
  }

  async merge(userId: string, sourceId: string, targetId: string) {
    const [source, target] = await Promise.all([
      this.categories.findOwned(userId, sourceId),
      this.categories.findOwned(userId, targetId)
    ]);
    if (!source || !target) throw notFound('Danh mục');
    if (source.type !== target.type || source.id === target.id) {
      throw new AppError(422, 'INVALID_CATEGORY_MERGE', 'Hai danh mục phải khác nhau và cùng loại.');
    }
    await this.categories.merge(userId, sourceId, targetId);
    return target;
  }

  private async requireOwned(userId: string, id: string) {
    const category = await this.categories.findOwned(userId, id);
    if (!category) throw notFound('Danh mục');
    return category;
  }

  private async assertValidParent(userId: string, parentId: string | null | undefined, type: TransactionType) {
    if (!parentId) return;
    const parent = await this.categories.findOwned(userId, parentId);
    if (!parent) throw notFound('Danh mục cha');
    if (parent.type !== type) throw new AppError(422, 'CATEGORY_TYPE_MISMATCH', 'Danh mục cha và con phải cùng loại.');
  }
}
