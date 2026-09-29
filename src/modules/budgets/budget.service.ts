import { AppError, notFound } from '../../core/errors/app-error';
import { nextOccurrence } from '../../shared/recurrence';
import type { UserRepository } from '../profile/user.repository';
import type { BudgetPeriod, BudgetRepository } from './budget.repository';
import type { BudgetInput } from './budget.schemas';

type BudgetRecord = BudgetPeriod & { id: string; amount: unknown };

/** Nghiệp vụ ngân sách: tiến độ tính trực tiếp từ giao dịch chi trong kỳ, cùng tiền tệ với người dùng. */
export class BudgetService {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly users: UserRepository
  ) {}

  async list(userId: string) {
    const [budgets, currency] = await Promise.all([this.budgets.listActive(userId), this.users.currency(userId)]);
    return Promise.all(budgets.map((budget) => this.withProgress(userId, budget, currency)));
  }

  async get(userId: string, id: string) {
    const budget = await this.budgets.findOwnedWithCategory(userId, id);
    if (!budget) throw notFound('Ngân sách');
    return this.withProgress(userId, budget, await this.users.currency(userId));
  }

  async create(userId: string, input: BudgetInput) {
    await this.assertExpenseCategory(userId, input.categoryId);
    const budget = await this.budgets.create(userId, input);
    return this.withProgress(userId, budget, await this.users.currency(userId));
  }

  async update(userId: string, id: string, input: Partial<BudgetInput>) {
    const existing = await this.budgets.findOwned(userId, id);
    if (!existing) throw notFound('Ngân sách');
    const merged = { ...existing, ...input };
    if (merged.endDate < merged.startDate) {
      throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày kết thúc phải sau ngày bắt đầu.');
    }
    await this.assertExpenseCategory(userId, merged.categoryId);
    const budget = await this.budgets.update(id, input);
    return this.withProgress(userId, budget, await this.users.currency(userId));
  }

  async remove(userId: string, id: string) {
    if (!(await this.budgets.findOwned(userId, id))) throw notFound('Ngân sách');
    await this.budgets.softDelete(id);
  }

  /** Tạo kỳ kế tiếp cho các ngân sách lặp đã hết hạn; bật rollover thì cộng phần chưa tiêu vào kỳ sau.
   * Mỗi lần chạy tiến thêm một kỳ và bỏ qua kỳ đã tồn tại, nên gọi lại nhiều lần vẫn an toàn. */
  async rollover(userId: string, now = new Date()) {
    let created = 0;
    for (const budget of await this.budgets.expiredRecurring(userId, now)) {
      const startDate = nextOccurrence(budget.startDate, budget.recurrence!);
      const endDate = nextOccurrence(budget.endDate, budget.recurrence!);
      if (await this.budgets.findPeriod(userId, budget.name, startDate, endDate)) continue;
      const remainder = Number(budget.amount) - (await this.budgets.spent(userId, budget));
      await this.budgets.create(userId, {
        name: budget.name,
        categoryId: budget.categoryId,
        amount: Number(budget.amount) + (budget.rollover ? remainder : 0),
        startDate,
        endDate,
        recurrence: budget.recurrence,
        rollover: budget.rollover,
        alertThresholds: budget.alertThresholds ?? undefined
      });
      created += 1;
    }
    return { created };
  }

  private async withProgress<T extends BudgetRecord>(userId: string, budget: T, currency: string) {
    const spent = await this.budgets.spent(userId, budget, currency);
    const amount = Number(budget.amount);
    return {
      ...budget,
      currency,
      spent,
      remaining: amount - spent,
      percentUsed: amount ? Math.round((spent / amount) * 10_000) / 100 : 0
    };
  }

  private async assertExpenseCategory(userId: string, categoryId?: string | null) {
    if (!categoryId) return;
    const category = await this.budgets.findExpenseCategory(userId, categoryId);
    if (!category) throw notFound('Danh mục');
    if (category.type !== 'EXPENSE') {
      throw new AppError(422, 'INVALID_BUDGET_CATEGORY', 'Ngân sách chỉ áp dụng cho danh mục chi.');
    }
  }
}
