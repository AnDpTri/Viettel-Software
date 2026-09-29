/* eslint-disable @typescript-eslint/no-explicit-any -- payload là JSON đã được kiểm tra khi tạo bản xem trước. */
import type { AgentAction, Prisma, RecurrenceFrequency, TransactionType, WalletType } from '@prisma/client';
import { AppError } from '../../../core/errors/app-error';
import { nextOccurrence } from '../../../shared/recurrence';
import type { AgentToolName } from '../agent.types';
import { date, jsonSnapshot } from './tool-support';

/** ID thật của các ví/danh mục đã tạo trong nhóm, theo `ref` (ID action tạo ra nó). */
export type Refs = Map<string, string>;
export type Applied = { entity: { id: string }; undo: Record<string, unknown>; created?: Array<[string, string]> };

type ApplyContext = {
  tx: Prisma.TransactionClient;
  userId: string;
  action: AgentAction;
  p: Record<string, any>;
  /** ID thật cho một tham chiếu: `ref` trỏ tới ví/danh mục được tạo bởi action đứng trước trong cùng nhóm. */
  ref: (id: unknown, ref: unknown) => string | null;
};
type ApplyHandler = (context: ApplyContext) => Promise<Applied>;

const deleteCreated = (entityType: string, id: string) => ({ mode: 'deleteCreated', entityType, entityId: id });
const restore = (entityType: string, id: string, data: unknown) => ({
  mode: 'restore',
  entityType,
  entityId: id,
  data
});
const restoreDelete = (entityType: string, id: string) => ({ mode: 'restoreDelete', entityType, entityId: id });

async function createTransaction({ tx, userId, action, p, ref }: ApplyContext): Promise<Applied> {
  const entity = await tx.transaction.create({
    data: {
      userId,
      walletId: ref(p.walletId, p.walletRef)!,
      categoryId: ref(p.categoryId, p.categoryRef),
      type: p.type as TransactionType,
      amount: p.amount,
      occurredAt: new Date(p.occurredAt),
      note: p.note ?? null,
      payee: p.payee ?? null,
      status: action.type === 'RECONCILE_WALLET' ? 'RECONCILED' : 'CLEARED',
      idempotencyKey: `agent:${action.id}`
    }
  });
  return { entity, undo: deleteCreated('transaction', entity.id) };
}

/** Cách áp dụng từng loại action đã được xác nhận, kèm dữ liệu để hoàn tác (xem undo-action.ts). */
const APPLY_HANDLERS: Partial<Record<AgentToolName, ApplyHandler>> = {
  CREATE_TRANSACTION: createTransaction,
  RECONCILE_WALLET: createTransaction,
  CREATE_TRANSFER: async ({ tx, userId, action, p, ref }) => {
    const entity = await tx.transaction.create({
      data: {
        userId,
        walletId: ref(p.sourceWalletId, p.sourceWalletRef)!,
        destinationWalletId: ref(p.destinationWalletId, p.destinationWalletRef),
        type: 'TRANSFER',
        amount: p.amount,
        occurredAt: new Date(p.occurredAt),
        note: p.note,
        status: 'CLEARED',
        idempotencyKey: `agent:${action.id}`
      }
    });
    return { entity, undo: deleteCreated('transaction', entity.id) };
  },
  UPDATE_TRANSACTION: async ({ tx, p, ref }) => {
    const changes = {
      ...p.changes,
      ...(p.categoryRef ? { categoryId: ref(null, p.categoryRef) } : {}),
      ...(p.changes.occurredAt ? { occurredAt: new Date(p.changes.occurredAt) } : {})
    };
    const entity = await tx.transaction.update({ where: { id: p.transactionId }, data: changes });
    return { entity, undo: restore('transaction', entity.id, p.before) };
  },
  DELETE_TRANSACTION: async ({ tx, p }) => {
    const entity = await tx.transaction.update({ where: { id: p.transactionId }, data: { deletedAt: new Date() } });
    return { entity, undo: restoreDelete('transaction', entity.id) };
  },
  BULK_CATEGORIZE: async ({ tx, userId, action, p, ref }) => {
    await tx.transaction.updateMany({
      where: { id: { in: p.ids }, userId },
      data: { categoryId: ref(p.categoryId, p.categoryRef) }
    });
    return { entity: { id: action.id }, undo: { mode: 'bulkCategories', data: p.before } };
  },
  CREATE_WALLET: async ({ tx, userId, action, p }) => {
    const entity = await tx.wallet.create({
      data: { userId, name: p.name, type: p.type as WalletType, currency: p.currency, openingBalance: p.openingBalance }
    });
    return { entity, undo: deleteCreated('wallet', entity.id), created: [[action.id, entity.id]] };
  },
  UPDATE_WALLET: async ({ tx, p }) => {
    const entity = await tx.wallet.update({ where: { id: p.walletId }, data: p.changes });
    return { entity, undo: restore('wallet', entity.id, p.before) };
  },
  ARCHIVE_WALLET: async ({ tx, p }) => {
    const entity = await tx.wallet.update({ where: { id: p.walletId }, data: { archivedAt: new Date() } });
    return { entity, undo: restoreDelete('wallet', entity.id) };
  },
  CREATE_CATEGORY: async ({ tx, userId, action, p, ref }) => {
    const entity = await tx.category.create({
      data: {
        userId,
        name: p.name,
        type: p.type as TransactionType,
        parentId: ref(p.parentId, p.parentRef),
        color: p.color
      }
    });
    return { entity, undo: deleteCreated('category', entity.id), created: [[action.id, entity.id]] };
  },
  CREATE_STARTER_CATEGORIES: async ({ tx, userId, action, p }) => {
    const ids: string[] = [];
    const created: Array<[string, string]> = [];
    for (const [sortOrder, item] of (p.categories as Array<Record<string, any>>).entries()) {
      const row = await tx.category.create({
        data: {
          userId,
          name: item.name,
          type: item.type as TransactionType,
          icon: item.icon,
          color: item.color,
          sortOrder
        }
      });
      ids.push(row.id);
      created.push([`${action.id}:${item.name}`, row.id]);
    }
    return { entity: { id: action.id }, undo: { mode: 'archiveManyCategories', ids }, created };
  },
  UPDATE_CATEGORY: async ({ tx, p, ref }) => {
    const changes = { ...p.changes, ...(p.parentRef ? { parentId: ref(null, p.parentRef) } : {}) };
    const entity = await tx.category.update({ where: { id: p.categoryId }, data: changes });
    return { entity, undo: restore('category', entity.id, p.before) };
  },
  ARCHIVE_CATEGORY: async ({ tx, p }) => {
    const entity = await tx.category.update({ where: { id: p.categoryId }, data: { archivedAt: new Date() } });
    return { entity, undo: restoreDelete('category', entity.id) };
  },
  CREATE_BUDGET: async ({ tx, userId, p, ref }) => {
    const entity = await tx.budget.create({
      data: {
        userId,
        name: p.name,
        amount: p.amount,
        categoryId: ref(p.categoryId, p.categoryRef),
        startDate: new Date(p.startDate),
        endDate: new Date(p.endDate),
        rollover: p.rollover
      }
    });
    return { entity, undo: deleteCreated('budget', entity.id) };
  },
  UPDATE_BUDGET: async ({ tx, p }) => {
    const entity = await tx.budget.update({
      where: { id: p.budgetId },
      data: {
        ...p.changes,
        ...(p.changes.startDate ? { startDate: new Date(p.changes.startDate) } : {}),
        ...(p.changes.endDate ? { endDate: new Date(p.changes.endDate) } : {})
      }
    });
    return { entity, undo: restore('budget', entity.id, p.before) };
  },
  DELETE_BUDGET: async ({ tx, p }) => {
    const entity = await tx.budget.update({ where: { id: p.budgetId }, data: { deletedAt: new Date() } });
    return { entity, undo: restoreDelete('budget', entity.id) };
  },
  CREATE_GOAL: async ({ tx, userId, p }) => {
    const entity = await tx.goal.create({
      data: {
        userId,
        name: p.name,
        targetAmount: p.targetAmount,
        currentAmount: p.currentAmount,
        targetDate: p.targetDate ? new Date(p.targetDate) : null
      }
    });
    return { entity, undo: deleteCreated('goal', entity.id) };
  },
  UPDATE_GOAL: async ({ tx, p }) => {
    const entity = await tx.goal.update({
      where: { id: p.goalId },
      data: { ...p.changes, ...(p.changes.targetDate ? { targetDate: new Date(p.changes.targetDate) } : {}) }
    });
    return { entity, undo: restore('goal', entity.id, p.before) };
  },
  CONTRIBUTE_GOAL: async ({ tx, p }) => {
    const goal = await tx.goal.findUniqueOrThrow({ where: { id: p.goalId } });
    const contribution = await tx.goalContribution.create({
      data: { goalId: p.goalId, amount: p.amount, note: p.note }
    });
    const entity = await tx.goal.update({
      where: { id: p.goalId },
      data: {
        currentAmount: { increment: p.amount },
        ...(Number(goal.currentAmount) + Number(p.amount) >= Number(goal.targetAmount) ? { status: 'COMPLETED' } : {})
      }
    });
    return {
      entity,
      undo: {
        mode: 'goalContribution',
        entityId: entity.id,
        contributionId: contribution.id,
        previousAmount: Number(goal.currentAmount),
        previousStatus: goal.status
      }
    };
  },
  PAUSE_GOAL: async ({ tx, p }) => {
    const goal = await tx.goal.findUniqueOrThrow({ where: { id: p.goalId } });
    const entity = await tx.goal.update({ where: { id: p.goalId }, data: { pausedAt: p.paused ? new Date() : null } });
    return { entity, undo: restore('goal', entity.id, jsonSnapshot(goal)) };
  },
  DELETE_GOAL: async ({ tx, p }) => {
    const entity = await tx.goal.update({ where: { id: p.goalId }, data: { deletedAt: new Date() } });
    return { entity, undo: restoreDelete('goal', entity.id) };
  },
  CREATE_BILL: async ({ tx, userId, p, ref }) => {
    const entity = await tx.bill.create({
      data: {
        userId,
        name: p.name,
        amount: p.amount,
        dueAt: new Date(p.dueAt),
        walletId: ref(p.walletId, p.walletRef),
        recurrence: (p.recurrence ?? undefined) as RecurrenceFrequency | undefined
      }
    });
    return { entity, undo: deleteCreated('bill', entity.id) };
  },
  PAY_BILL: async ({ tx, userId, action, p, ref }) => {
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: p.billId } });
    const transaction = await tx.transaction.create({
      data: {
        userId,
        walletId: ref(p.walletId, p.walletRef)!,
        type: 'EXPENSE',
        amount: bill.amount,
        occurredAt: date(p.occurredAt ?? undefined),
        note: `Thanh toán: ${bill.name}`,
        idempotencyKey: `agent:${action.id}`
      }
    });
    const entity = await tx.bill.update({
      where: { id: bill.id },
      data: bill.recurrence
        ? { dueAt: nextOccurrence(bill.dueAt, bill.recurrence), status: 'UPCOMING' }
        : { status: 'PAID' }
    });
    return {
      entity,
      undo: { mode: 'payBill', entityId: bill.id, transactionId: transaction.id, data: jsonSnapshot(bill) }
    };
  },
  CREATE_RECURRING: async ({ tx, userId, p, ref }) => {
    const entity = await tx.recurringRule.create({
      data: {
        userId,
        name: p.name,
        type: p.type as TransactionType,
        amount: p.amount,
        walletId: ref(p.walletId, p.walletRef)!,
        categoryId: ref(p.categoryId, p.categoryRef),
        frequency: p.frequency as RecurrenceFrequency,
        nextRunAt: new Date(p.nextRunAt),
        autoPost: p.autoPost
      }
    });
    return { entity, undo: deleteCreated('recurring', entity.id) };
  },
  CREATE_AUTOMATION_RULE: async ({ tx, userId, p, ref }) => {
    const entity = await tx.automationRule.create({
      data: {
        userId,
        name: p.name,
        field: p.field,
        operator: p.operator,
        value: p.value,
        categoryId: ref(p.categoryId, p.categoryRef),
        tagName: p.tagName ?? undefined,
        priority: p.priority
      }
    });
    return { entity, undo: deleteCreated('automation', entity.id) };
  }
};

/** Áp dụng một action đã xác nhận trong transaction `tx`. `refs` chứa ID thật của bản ghi mà action trước trong nhóm
 * vừa tạo. */
export async function applyAgentAction(
  tx: Prisma.TransactionClient,
  userId: string,
  action: AgentAction,
  refs: Refs
): Promise<Applied> {
  const handler = APPLY_HANDLERS[action.type as AgentToolName];
  if (!handler) throw new AppError(422, 'UNSUPPORTED_AGENT_ACTION', 'Agent chưa hỗ trợ hành động này.');
  const ref = (id: unknown, key: unknown) => {
    if (typeof key === 'string' && key) {
      const resolved = refs.get(key);
      if (!resolved)
        throw new AppError(409, 'AGENT_REF_MISSING', 'Một bản ghi mà thay đổi này phụ thuộc chưa được tạo trong nhóm.');
      return resolved;
    }
    return (id as string | null | undefined) ?? null;
  };
  return handler({ tx, userId, action, p: action.payload as Record<string, any>, ref });
}
