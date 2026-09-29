/* eslint-disable @typescript-eslint/no-explicit-any -- undoData là JSON do apply-action.ts tự sinh. */
import type { AgentAction, Prisma } from '@prisma/client';

type UndoContext = { tx: Prisma.TransactionClient; userId: string; u: Record<string, any> };
type EntityHandlers = Record<string, (tx: Prisma.TransactionClient, id: string) => Promise<unknown>>;

/** Xóa bản ghi do action tạo ra: bản ghi có xóa mềm thì đánh dấu xóa/lưu trữ, còn lại xóa hẳn. */
const DELETE_CREATED: EntityHandlers = {
  transaction: (tx, id) => tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } }),
  wallet: (tx, id) => tx.wallet.update({ where: { id }, data: { archivedAt: new Date() } }),
  category: (tx, id) => tx.category.update({ where: { id }, data: { archivedAt: new Date() } }),
  budget: (tx, id) => tx.budget.update({ where: { id }, data: { deletedAt: new Date() } }),
  goal: (tx, id) => tx.goal.update({ where: { id }, data: { deletedAt: new Date() } }),
  bill: (tx, id) => tx.bill.delete({ where: { id } }),
  recurring: (tx, id) => tx.recurringRule.delete({ where: { id } }),
  automation: (tx, id) => tx.automationRule.delete({ where: { id } })
};

/** Khôi phục bản ghi đã bị action xóa mềm/lưu trữ. */
const RESTORE_DELETED: EntityHandlers = {
  transaction: (tx, id) => tx.transaction.update({ where: { id }, data: { deletedAt: null } }),
  wallet: (tx, id) => tx.wallet.update({ where: { id }, data: { archivedAt: null } }),
  category: (tx, id) => tx.category.update({ where: { id }, data: { archivedAt: null } }),
  budget: (tx, id) => tx.budget.update({ where: { id }, data: { deletedAt: null } }),
  goal: (tx, id) => tx.goal.update({ where: { id }, data: { deletedAt: null } })
};

const DATE_FIELDS = ['occurredAt', 'startDate', 'endDate', 'targetDate', 'pausedAt', 'archivedAt', 'deletedAt'];

/** Ghi đè bản ghi bằng ảnh chụp trước khi sửa. */
async function restoreSnapshot({ tx, u }: UndoContext) {
  const data = { ...u.data };
  delete data.id;
  delete data.userId;
  delete data.createdAt;
  delete data.updatedAt;
  for (const key of DATE_FIELDS) if (data[key]) data[key] = new Date(data[key]);
  const where = { where: { id: u.entityId as string }, data };
  if (u.entityType === 'transaction') await tx.transaction.update(where);
  else if (u.entityType === 'wallet') await tx.wallet.update(where);
  else if (u.entityType === 'category') await tx.category.update(where);
  else if (u.entityType === 'budget') await tx.budget.update(where);
  else if (u.entityType === 'goal') await tx.goal.update(where);
}

const UNDO_MODES: Record<string, (context: UndoContext) => Promise<unknown>> = {
  deleteCreated: async ({ tx, u }) => DELETE_CREATED[u.entityType]?.(tx, u.entityId),
  restoreDelete: async ({ tx, u }) => RESTORE_DELETED[u.entityType]?.(tx, u.entityId),
  restore: restoreSnapshot,
  bulkCategories: async ({ tx, u }) => {
    for (const row of u.data)
      await tx.transaction.update({ where: { id: row.id }, data: { categoryId: row.categoryId } });
  },
  archiveManyCategories: ({ tx, userId, u }) =>
    tx.category.updateMany({ where: { id: { in: u.ids }, userId }, data: { archivedAt: new Date() } }),
  goalContribution: async ({ tx, u }) => {
    await tx.goalContribution.delete({ where: { id: u.contributionId } });
    await tx.goal.update({
      where: { id: u.entityId },
      data: { currentAmount: u.previousAmount, status: u.previousStatus }
    });
  },
  payBill: async ({ tx, u }) => {
    await tx.transaction.update({ where: { id: u.transactionId }, data: { deletedAt: new Date() } });
    await tx.bill.update({ where: { id: u.entityId }, data: { dueAt: new Date(u.data.dueAt), status: u.data.status } });
  }
};

/** Hoàn tác một action đã thực thi, dựa trên `undoData` được lưu lúc áp dụng. */
export async function applyAgentUndo(tx: Prisma.TransactionClient, userId: string, action: AgentAction) {
  const u = action.undoData as Record<string, any>;
  await UNDO_MODES[u.mode]?.({ tx, userId, u });
}
