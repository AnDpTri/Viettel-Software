import type { GoalStatus } from '@prisma/client';
import { AppError, notFound } from '../../core/errors/app-error';
import { nextOccurrence } from '../../shared/recurrence';
import type { GoalRepository } from './goal.repository';
import type { ContributionInput, GoalInput } from './goal.schemas';

/** Thêm phần trăm hoàn thành và số tiền còn thiếu cho mục tiêu. */
export function withProgress<T extends { targetAmount: unknown; currentAmount: unknown }>(goal: T) {
  const target = Number(goal.targetAmount);
  const current = Number(goal.currentAmount);
  return {
    ...goal,
    percentCompleted: Math.min(100, Math.round((current / target) * 10_000) / 100),
    remainingAmount: Math.max(0, target - current)
  };
}

const statusAfter = (currentAmount: number, targetAmount: unknown): GoalStatus =>
  currentAmount >= Number(targetAmount) ? 'COMPLETED' : 'ACTIVE';

/** Nghiệp vụ mục tiêu tiết kiệm: góp/rút cập nhật tiến độ; góp từ ví tạo giao dịch chuyển khoản thật sang ví
 * liên kết của mục tiêu để số dư ví và tiến độ luôn khớp. */
export class GoalService {
  constructor(private readonly goals: GoalRepository) {}

  async list(userId: string, status?: GoalStatus) {
    return (await this.goals.list(userId, status)).map(withProgress);
  }

  async get(userId: string, id: string) {
    const goal = await this.goals.findOwnedWithHistory(userId, id);
    if (!goal) throw notFound('Mục tiêu');
    return withProgress(goal);
  }

  async create(userId: string, input: GoalInput) {
    await this.assertWallet(userId, input.walletId);
    return withProgress(await this.goals.create(userId, input));
  }

  async update(userId: string, id: string, input: Partial<GoalInput>) {
    await this.requireOwned(userId, id);
    await this.assertWallet(userId, input.walletId);
    return withProgress(await this.goals.update(id, input));
  }

  async contribute(userId: string, id: string, input: ContributionInput) {
    const { fromWalletId, amount, note, transactionId } = input;
    const goal = await this.requireOwned(userId, id);
    if (goal.status === 'CANCELLED')
      throw new AppError(409, 'GOAL_CANCELLED', 'Không thể đóng góp vào mục tiêu đã hủy.');
    const nextAmount = Number(goal.currentAmount) + amount;
    if (nextAmount < 0) throw new AppError(422, 'NEGATIVE_GOAL_BALANCE', 'Số tiền mục tiêu không thể âm.');

    let transfer: { userId: string; walletId: string; destinationWalletId: string; note: string } | null = null;
    if (fromWalletId) {
      if (!goal.walletId) {
        throw new AppError(
          422,
          'GOAL_WALLET_REQUIRED',
          'Mục tiêu chưa liên kết ví tiết kiệm nên không thể chuyển tiền vào.'
        );
      }
      if (fromWalletId === goal.walletId)
        throw new AppError(422, 'INVALID_TRANSFER', 'Ví nguồn phải khác ví của mục tiêu.');
      const [source, target] = await Promise.all([
        this.goals.findActiveWallet(userId, fromWalletId),
        this.goals.findActiveWallet(userId, goal.walletId)
      ]);
      if (!source) throw notFound('Ví nguồn');
      if (!target) throw notFound('Ví của mục tiêu');
      if (source.currency !== target.currency) {
        throw new AppError(422, 'CURRENCY_MISMATCH', 'Hai ví chuyển khoản phải cùng đơn vị tiền tệ.');
      }
      // Góp: tiền đi từ ví nguồn sang ví mục tiêu; rút (số âm): đi ngược lại.
      const [from, to] = amount > 0 ? [source, target] : [target, source];
      transfer = {
        userId,
        walletId: from.id,
        destinationWalletId: to.id,
        note: `${amount > 0 ? 'Góp vào' : 'Rút từ'} mục tiêu: ${goal.name}`
      };
    }
    const updated = await this.goals.contribute({
      goalId: id,
      amount,
      note,
      transactionId,
      status: statusAfter(nextAmount, goal.targetAmount),
      transfer
    });
    return withProgress(updated);
  }

  /** Ghi các khoản góp định kỳ đã đến hạn (tính từ lần góp gần nhất). */
  async runRecurring(userId: string, now = new Date()) {
    let processed = 0;
    for (const goal of await this.goals.dueRecurring(userId)) {
      const last = goal.contributions[0]?.createdAt ?? goal.createdAt;
      if (nextOccurrence(last, goal.recurringFrequency!) > now) continue;
      const amount = Number(goal.recurringAmount);
      await this.goals.contribute({
        goalId: goal.id,
        amount,
        note: 'Đóng góp định kỳ tự động',
        status: statusAfter(Number(goal.currentAmount) + amount, goal.targetAmount)
      });
      processed += 1;
    }
    return { processed };
  }

  async remove(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.goals.update(id, { deletedAt: new Date() });
  }

  async pause(userId: string, id: string) {
    await this.requireOwned(userId, id);
    return this.goals.update(id, { pausedAt: new Date() });
  }

  async resume(userId: string, id: string) {
    await this.requireOwned(userId, id);
    return this.goals.update(id, { pausedAt: null, status: 'ACTIVE' });
  }

  private async requireOwned(userId: string, id: string) {
    const goal = await this.goals.findOwned(userId, id);
    if (!goal) throw notFound('Mục tiêu');
    return goal;
  }

  private async assertWallet(userId: string, walletId?: string | null) {
    if (walletId && !(await this.goals.walletExists(userId, walletId))) throw notFound('Ví');
  }
}
