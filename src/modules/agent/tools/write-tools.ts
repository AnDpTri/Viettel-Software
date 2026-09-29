import { GoalStatus, WalletType, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../../core/errors/app-error';
import { STARTER_CATEGORIES } from '../../onboarding/onboarding.constants';
import type { AgentToolName, PendingEntity } from '../agent.types';
import {
  categoryNameOf,
  date,
  describeChanges,
  isoDate,
  jsonSnapshot,
  money,
  owned,
  recurrence,
  resolveCategory,
  resolveWallet,
  uuid
} from './tool-support';

/** Một thay đổi đã chuẩn bị, chờ lưu thành AgentAction PENDING kèm bản xem trước. */
export type PreparedAction = {
  id: string;
  type: AgentToolName;
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
  risk?: string;
};

export type WriteToolContext = {
  db: PrismaClient;
  userId: string;
  args: Record<string, unknown>;
  tool: AgentToolName;
  /** Ví/danh mục đang chờ trong lượt này; tool đọc để tham chiếu và THÊM bản ghi mới mà chính nó đề xuất. */
  pending: PendingEntity[];
  /** Tiền tệ mặc định của người dùng. */
  currency: string;
  /** Thêm một thay đổi vào nhóm, trả về ID của action (dùng làm `ref` cho tool sau). */
  push: (item: Omit<PreparedAction, 'id'>, id?: string) => string;
};

type WriteTool = (context: WriteToolContext) => Promise<void>;

/** Tool GHI: chỉ kiểm tra đầu vào, quyền sở hữu và dựng bản xem trước; thay đổi thật được áp dụng khi người dùng
 * xác nhận (xem apply-action.ts). */
export const WRITE_TOOLS: Partial<Record<AgentToolName, WriteTool>> = {
  CREATE_TRANSACTION: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        type: z.enum(['INCOME', 'EXPENSE']),
        amount: money,
        walletId: uuid.optional(),
        walletName: z.string().max(100).optional(),
        categoryId: uuid.optional(),
        categoryName: z.string().max(100).optional(),
        occurredAt: isoDate.optional(),
        note: z.string().max(500).optional(),
        payee: z.string().max(160).optional()
      })
      .parse(args);
    const wallet = (await resolveWallet(db, userId, input.walletId, input.walletName, false, pending))!;
    const category = await resolveCategory(db, userId, input.type, input.categoryId, input.categoryName, true, pending);
    const payload = {
      type: input.type,
      amount: input.amount,
      walletId: wallet.id,
      walletRef: wallet.ref,
      categoryId: category?.id ?? null,
      categoryRef: category?.ref ?? null,
      occurredAt: date(input.occurredAt).toISOString(),
      note: input.note ?? null,
      payee: input.payee ?? null
    };
    push({
      type: tool,
      payload,
      preview: {
        title: input.type === 'INCOME' ? 'Ghi khoản thu' : 'Ghi khoản chi',
        amount: input.amount,
        currency: wallet.currency,
        wallet: wallet.name,
        category: category?.name ?? 'Chưa phân loại',
        occurredAt: payload.occurredAt,
        note: input.note ?? null
      }
    });
  },
  UPDATE_TRANSACTION: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        transactionId: uuid,
        amount: money.optional(),
        categoryId: uuid.nullable().optional(),
        categoryName: z.string().max(100).optional(),
        occurredAt: isoDate.optional(),
        note: z.string().max(500).nullable().optional(),
        payee: z.string().max(160).nullable().optional(),
        status: z.enum(['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED', 'CANCELLED']).optional()
      })
      .parse(args);
    const before = await owned(
      'Giao dịch',
      db.transaction.findFirst({ where: { id: input.transactionId, userId, deletedAt: null } })
    );
    const changesCategory = input.categoryId !== undefined || Boolean(input.categoryName);
    const category =
      input.categoryId === null
        ? null
        : changesCategory
          ? await resolveCategory(
              db,
              userId,
              before.type,
              input.categoryId ?? undefined,
              input.categoryName,
              false,
              pending
            )
          : null;
    const changes = {
      ...(input.amount ? { amount: input.amount } : {}),
      ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt).toISOString() } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.payee !== undefined ? { payee: input.payee } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(changesCategory ? { categoryId: category?.id ?? null } : {})
    };
    const rows = describeChanges(before as unknown as Record<string, unknown>, changes);
    if (changesCategory)
      rows.unshift({
        label: 'Danh mục',
        from: (await categoryNameOf(db, userId, before.categoryId)) ?? 'Chưa phân loại',
        to: category?.name ?? 'Chưa phân loại'
      });
    push({
      type: tool,
      payload: {
        transactionId: before.id,
        changes,
        categoryRef: category?.ref ?? null,
        before: jsonSnapshot(before)
      },
      preview: { title: 'Cập nhật giao dịch', amount: Number(before.amount), note: before.note, changes: rows }
    });
  },
  DELETE_TRANSACTION: async ({ db, userId, args, tool, push }) => {
    const { transactionId } = z.object({ transactionId: uuid }).parse(args);
    const before = await owned(
      'Giao dịch',
      db.transaction.findFirst({
        where: { id: transactionId, userId, deletedAt: null },
        include: { wallet: true, category: true }
      })
    );
    push({
      type: tool,
      risk: 'HIGH',
      payload: { transactionId },
      preview: {
        title: 'Xóa giao dịch',
        amount: Number(before.amount),
        wallet: before.wallet.name,
        category: before.category?.name ?? 'Chưa phân loại',
        occurredAt: before.occurredAt,
        note: before.note
      }
    });
  },
  CREATE_TRANSFER: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        amount: money,
        sourceWalletId: uuid.optional(),
        sourceWalletName: z.string().max(100).optional(),
        destinationWalletId: uuid.optional(),
        destinationWalletName: z.string().max(100).optional(),
        occurredAt: isoDate.optional(),
        note: z.string().max(500).optional()
      })
      .parse(args);
    const source = (await resolveWallet(db, userId, input.sourceWalletId, input.sourceWalletName, false, pending))!;
    const destination = (await resolveWallet(
      db,
      userId,
      input.destinationWalletId,
      input.destinationWalletName,
      false,
      pending
    ))!;
    if ((source.id ?? source.ref) === (destination.id ?? destination.ref))
      throw new AppError(422, 'INVALID_TRANSFER', 'Ví nguồn và ví đích phải khác nhau.');
    if (source.currency !== destination.currency)
      throw new AppError(422, 'CURRENCY_MISMATCH', 'Hai ví phải cùng loại tiền tệ.');
    push({
      type: tool,
      payload: {
        amount: input.amount,
        sourceWalletId: source.id,
        sourceWalletRef: source.ref,
        destinationWalletId: destination.id,
        destinationWalletRef: destination.ref,
        occurredAt: date(input.occurredAt).toISOString(),
        note: input.note ?? null
      },
      preview: {
        title: 'Chuyển tiền',
        amount: input.amount,
        currency: source.currency,
        from: source.name,
        to: destination.name
      }
    });
  },
  BULK_CATEGORIZE: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        transactionIds: z.array(uuid).min(1).max(500),
        categoryId: uuid.optional(),
        categoryName: z.string().max(100).optional()
      })
      .parse(args);
    const rows = await db.transaction.findMany({
      where: { id: { in: input.transactionIds }, userId, deletedAt: null }
    });
    if (rows.length !== input.transactionIds.length)
      throw new AppError(404, 'TRANSACTIONS_NOT_FOUND', 'Một số giao dịch không tồn tại.');
    const types = new Set(rows.map((row) => row.type));
    if (types.size !== 1 || types.has('TRANSFER'))
      throw new AppError(
        422,
        'MIXED_TRANSACTION_TYPES',
        'Chỉ có thể phân loại hàng loạt các giao dịch cùng loại thu hoặc chi.'
      );
    const category = (await resolveCategory(
      db,
      userId,
      rows[0]!.type,
      input.categoryId,
      input.categoryName,
      false,
      pending
    ))!;
    push({
      type: tool,
      payload: {
        ids: input.transactionIds,
        categoryId: category.id,
        categoryRef: category.ref,
        before: rows.map((row) => ({ id: row.id, categoryId: row.categoryId }))
      },
      preview: { title: 'Phân loại hàng loạt', count: rows.length, category: category.name }
    });
  },
  CREATE_WALLET: async ({ db, userId, args, tool, pending, currency, push }) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        type: z.nativeEnum(WalletType).default('CASH'),
        currency: z
          .string()
          .length(3)
          .transform((v) => v.toUpperCase())
          .optional(),
        openingBalance: z.coerce.number().min(-999_999_999_999).max(999_999_999_999).default(0)
      })
      .parse(args);
    if (
      (await db.wallet.findFirst({ where: { userId, name: { equals: input.name, mode: 'insensitive' } } })) ||
      pending.some((item) => item.kind === 'wallet' && item.name.toLowerCase() === input.name.toLowerCase())
    )
      throw new AppError(409, 'WALLET_EXISTS', `Ví “${input.name}” đã tồn tại.`);
    const payload = { ...input, currency: input.currency ?? currency };
    const id = push({
      type: tool,
      payload,
      preview: {
        title: 'Tạo ví',
        name: payload.name,
        walletType: payload.type,
        currency: payload.currency,
        openingBalance: payload.openingBalance
      }
    });
    pending.push({ ref: id, kind: 'wallet', name: payload.name, currency: payload.currency });
  },
  UPDATE_WALLET: async ({ db, userId, args, tool, push }) => {
    const input = z
      .object({
        walletId: uuid,
        name: z.string().min(1).max(100).optional(),
        type: z.nativeEnum(WalletType).optional(),
        currency: z.string().length(3).optional(),
        openingBalance: z.coerce.number().optional()
      })
      .parse(args);
    const before = await owned('Ví', db.wallet.findFirst({ where: { id: input.walletId, userId, archivedAt: null } }));
    const { walletId, ...changes } = input;
    push({
      type: tool,
      payload: { walletId, changes, before: jsonSnapshot(before) },
      preview: {
        title: 'Cập nhật ví',
        wallet: before.name,
        changes: describeChanges(before as unknown as Record<string, unknown>, changes)
      }
    });
  },
  ARCHIVE_WALLET: async ({ db, userId, args, tool, push }) => {
    const input = z.object({ walletId: uuid }).parse(args);
    const row = await owned('Ví', db.wallet.findFirst({ where: { id: input.walletId, userId, archivedAt: null } }));
    push({ type: tool, risk: 'HIGH', payload: input, preview: { title: 'Lưu trữ ví', wallet: row.name } });
  },
  CREATE_CATEGORY: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        type: z.enum(['INCOME', 'EXPENSE']),
        parentId: uuid.optional(),
        parentName: z.string().max(100).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .default('#4F7668')
      })
      .parse(args);
    const parent =
      input.parentId || input.parentName
        ? (await resolveCategory(db, userId, input.type, input.parentId, input.parentName, false, pending))!
        : null;
    const duplicate = await db.category.findFirst({
      where: {
        userId,
        archivedAt: null,
        type: input.type,
        parentId: parent?.id ?? null,
        name: { equals: input.name, mode: 'insensitive' }
      }
    });
    if (
      duplicate ||
      pending.some(
        (item) =>
          item.kind === 'category' && item.type === input.type && item.name.toLowerCase() === input.name.toLowerCase()
      )
    )
      throw new AppError(409, 'CATEGORY_EXISTS', `Danh mục “${input.name}” đã tồn tại.`);
    const id = push({
      type: tool,
      payload: {
        name: input.name,
        type: input.type,
        parentId: parent?.id ?? null,
        parentRef: parent?.ref ?? null,
        color: input.color
      },
      preview: {
        title: parent ? 'Tạo danh mục con' : 'Tạo danh mục',
        name: input.name,
        type: input.type,
        parent: parent?.name ?? null
      }
    });
    pending.push({ ref: id, kind: 'category', name: input.name, type: input.type });
  },
  CREATE_STARTER_CATEGORIES: async ({ db, userId, args, tool, pending, push }) => {
    z.object({}).parse(args);
    const existing = await db.category.findMany({
      where: { userId, archivedAt: null },
      select: { name: true, type: true }
    });
    const keys = new Set(existing.map((item) => `${item.type}:${item.name.toLocaleLowerCase('vi-VN')}`));
    const categories = STARTER_CATEGORIES.filter(
      (item) => !keys.has(`${item.type}:${item.name.toLocaleLowerCase('vi-VN')}`)
    );
    if (!categories.length)
      throw new AppError(409, 'STARTER_CATEGORIES_EXIST', 'Bộ danh mục gợi ý đã có sẵn trong tài khoản.');
    const id = push({
      type: tool,
      payload: { categories },
      preview: {
        title: 'Tạo bộ danh mục khởi đầu',
        count: categories.length,
        categories: categories.map((item) => item.name).join(', ')
      }
    });
    for (const item of categories)
      pending.push({ ref: `${id}:${item.name}`, kind: 'category', name: item.name, type: item.type });
  },
  UPDATE_CATEGORY: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        categoryId: uuid,
        name: z.string().min(1).max(100).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .optional(),
        parentId: uuid.nullable().optional(),
        parentName: z.string().max(100).optional()
      })
      .parse(args);
    const before = await owned(
      'Danh mục',
      db.category.findFirst({ where: { id: input.categoryId, userId, archivedAt: null } })
    );
    const changesParent = input.parentId !== undefined || Boolean(input.parentName);
    const parent =
      input.parentId === null
        ? null
        : changesParent
          ? (await resolveCategory(
              db,
              userId,
              before.type,
              input.parentId ?? undefined,
              input.parentName,
              false,
              pending
            ))!
          : null;
    if (parent && parent.id === before.id)
      throw new AppError(422, 'INVALID_PARENT', 'Danh mục không thể là cha của chính nó.');
    const changes = {
      ...(input.name ? { name: input.name } : {}),
      ...(input.color ? { color: input.color } : {}),
      ...(changesParent ? { parentId: parent?.id ?? null } : {})
    };
    const rows = describeChanges(before as unknown as Record<string, unknown>, changes);
    if (changesParent)
      rows.push({
        label: 'Danh mục cha',
        from: (await categoryNameOf(db, userId, before.parentId)) ?? 'Không có',
        to: parent?.name ?? 'Không có'
      });
    push({
      type: tool,
      payload: { categoryId: before.id, changes, parentRef: parent?.ref ?? null, before: jsonSnapshot(before) },
      preview: { title: 'Cập nhật danh mục', category: before.name, changes: rows }
    });
  },
  ARCHIVE_CATEGORY: async ({ db, userId, args, tool, push }) => {
    const input = z.object({ categoryId: uuid }).parse(args);
    const row = await owned(
      'Danh mục',
      db.category.findFirst({ where: { id: input.categoryId, userId, archivedAt: null } })
    );
    push({
      type: tool,
      risk: 'HIGH',
      payload: input,
      preview: { title: 'Lưu trữ danh mục', category: row.name }
    });
  },
  CREATE_BUDGET: async ({ db, userId, args, tool, pending, currency, push }) => {
    const input = z
      .object({
        name: z.string().min(1).max(100),
        amount: money,
        categoryId: uuid.optional(),
        categoryName: z.string().max(100).optional(),
        startDate: isoDate,
        endDate: isoDate,
        rollover: z.boolean().default(false)
      })
      .parse(args);
    if (new Date(input.endDate) < new Date(input.startDate))
      throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày kết thúc phải sau ngày bắt đầu.');
    const category = await resolveCategory(db, userId, 'EXPENSE', input.categoryId, input.categoryName, true, pending);
    const payload = {
      name: input.name,
      amount: input.amount,
      categoryId: category?.id ?? null,
      categoryRef: category?.ref ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      rollover: input.rollover
    };
    push({
      type: tool,
      payload,
      preview: {
        title: 'Tạo ngân sách',
        name: input.name,
        amount: input.amount,
        category: category?.name ?? 'Tất cả',
        startDate: input.startDate,
        endDate: input.endDate,
        rollover: input.rollover,
        currency: currency
      }
    });
  },
  UPDATE_BUDGET: async ({ db, userId, args, tool, push }) => {
    const input = z
      .object({
        budgetId: uuid,
        name: z.string().min(1).max(100).optional(),
        amount: money.optional(),
        startDate: isoDate.optional(),
        endDate: isoDate.optional(),
        rollover: z.boolean().optional()
      })
      .parse(args);
    const before = await owned(
      'Ngân sách',
      db.budget.findFirst({ where: { id: input.budgetId, userId, deletedAt: null } })
    );
    const { budgetId, ...changes } = input;
    push({
      type: tool,
      payload: { budgetId, changes, before: jsonSnapshot(before) },
      preview: {
        title: 'Cập nhật ngân sách',
        budget: before.name,
        changes: describeChanges(before as unknown as Record<string, unknown>, changes)
      }
    });
  },
  DELETE_BUDGET: async ({ db, userId, args, tool, push }) => {
    const input = z.object({ budgetId: uuid }).parse(args);
    const row = await owned(
      'Ngân sách',
      db.budget.findFirst({ where: { id: input.budgetId, userId, deletedAt: null } })
    );
    push({
      type: tool,
      risk: 'HIGH',
      payload: input,
      preview: { title: 'Xóa ngân sách', budget: row.name, amount: Number(row.amount) }
    });
  },
  CREATE_GOAL: async ({ args, tool, currency, push }) => {
    const input = z
      .object({
        name: z.string().min(1).max(120),
        targetAmount: money,
        currentAmount: z.coerce.number().min(0).default(0),
        targetDate: isoDate.optional()
      })
      .parse(args);
    if (input.currentAmount > input.targetAmount)
      throw new AppError(422, 'INVALID_GOAL_AMOUNT', 'Số tiền hiện có không thể lớn hơn mục tiêu.');
    push({
      type: tool,
      payload: input,
      preview: { title: 'Tạo mục tiêu', ...input, currency: currency }
    });
  },
  UPDATE_GOAL: async ({ db, userId, args, tool, push }) => {
    const input = z
      .object({
        goalId: uuid,
        name: z.string().min(1).max(120).optional(),
        targetAmount: money.optional(),
        targetDate: isoDate.nullable().optional(),
        status: z.nativeEnum(GoalStatus).optional()
      })
      .parse(args);
    const before = await owned('Mục tiêu', db.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
    const { goalId, ...changes } = input;
    push({
      type: tool,
      payload: { goalId, changes, before: jsonSnapshot(before) },
      preview: {
        title: 'Cập nhật mục tiêu',
        goal: before.name,
        changes: describeChanges(before as unknown as Record<string, unknown>, changes)
      }
    });
  },
  CONTRIBUTE_GOAL: async ({ db, userId, args, tool, currency, push }) => {
    const input = z.object({ goalId: uuid, amount: money, note: z.string().max(255).optional() }).parse(args);
    const goal = await owned('Mục tiêu', db.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
    push({
      type: tool,
      payload: input,
      preview: {
        title: 'Đóng góp mục tiêu',
        goal: goal.name,
        amount: input.amount,
        currentAmount: Number(goal.currentAmount),
        currency: currency
      }
    });
  },
  PAUSE_GOAL: async ({ db, userId, args, tool, push }) => {
    const input = z.object({ goalId: uuid, paused: z.boolean().default(true) }).parse(args);
    const goal = await owned('Mục tiêu', db.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
    push({
      type: tool,
      payload: input,
      preview: { title: input.paused ? 'Tạm dừng mục tiêu' : 'Tiếp tục mục tiêu', goal: goal.name }
    });
  },
  DELETE_GOAL: async ({ db, userId, args, tool, push }) => {
    const input = z.object({ goalId: uuid }).parse(args);
    const goal = await owned('Mục tiêu', db.goal.findFirst({ where: { id: input.goalId, userId, deletedAt: null } }));
    push({ type: tool, risk: 'HIGH', payload: input, preview: { title: 'Xóa mục tiêu', goal: goal.name } });
  },
  CREATE_BILL: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        name: z.string().min(1).max(120),
        amount: money,
        dueAt: isoDate,
        walletId: uuid.optional(),
        walletName: z.string().max(100).optional(),
        recurrence: recurrence.optional()
      })
      .parse(args);
    const wallet = await resolveWallet(db, userId, input.walletId, input.walletName, true, pending);
    const payload = {
      name: input.name,
      amount: input.amount,
      dueAt: input.dueAt,
      recurrence: input.recurrence ?? null,
      walletId: wallet?.id ?? null,
      walletRef: wallet?.ref ?? null
    };
    push({
      type: tool,
      payload,
      preview: {
        title: 'Tạo hóa đơn',
        name: input.name,
        amount: input.amount,
        dueAt: input.dueAt,
        wallet: wallet?.name ?? 'Chưa chọn',
        recurrence: input.recurrence ?? null
      }
    });
  },
  PAY_BILL: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        billId: uuid,
        walletId: uuid.optional(),
        walletName: z.string().max(100).optional(),
        occurredAt: isoDate.optional()
      })
      .parse(args);
    const bill = await owned('Hóa đơn', db.bill.findFirst({ where: { id: input.billId, userId } }));
    const wallet = (await resolveWallet(
      db,
      userId,
      input.walletId ?? bill.walletId ?? undefined,
      input.walletName,
      false,
      pending
    ))!;
    push({
      type: tool,
      payload: {
        billId: input.billId,
        occurredAt: input.occurredAt ?? null,
        walletId: wallet.id,
        walletRef: wallet.ref
      },
      preview: { title: 'Thanh toán hóa đơn', bill: bill.name, amount: Number(bill.amount), wallet: wallet.name }
    });
  },
  CREATE_RECURRING: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        name: z.string().min(1).max(120),
        type: z.enum(['INCOME', 'EXPENSE']),
        amount: money,
        walletId: uuid.optional(),
        walletName: z.string().max(100).optional(),
        categoryId: uuid.optional(),
        categoryName: z.string().max(100).optional(),
        frequency: recurrence,
        nextRunAt: isoDate,
        autoPost: z.boolean().default(false)
      })
      .parse(args);
    const wallet = (await resolveWallet(db, userId, input.walletId, input.walletName, false, pending))!;
    const category = await resolveCategory(db, userId, input.type, input.categoryId, input.categoryName, true, pending);
    const payload = {
      name: input.name,
      type: input.type,
      amount: input.amount,
      frequency: input.frequency,
      nextRunAt: input.nextRunAt,
      autoPost: input.autoPost,
      walletId: wallet.id,
      walletRef: wallet.ref,
      categoryId: category?.id ?? null,
      categoryRef: category?.ref ?? null
    };
    push({
      type: tool,
      payload,
      preview: {
        title: 'Tạo giao dịch định kỳ',
        name: input.name,
        amount: input.amount,
        wallet: wallet.name,
        category: category?.name ?? null,
        frequency: input.frequency,
        nextRunAt: input.nextRunAt,
        autoPost: input.autoPost
      }
    });
  },
  CREATE_AUTOMATION_RULE: async ({ db, userId, args, tool, pending, push }) => {
    const input = z
      .object({
        name: z.string().min(1).max(120),
        field: z.enum(['note', 'payee', 'reference', 'amount']),
        operator: z.enum(['contains', 'equals', 'startsWith', 'gte', 'lte']),
        value: z.string().min(1).max(255),
        categoryId: uuid.optional(),
        categoryName: z.string().max(100).optional(),
        tagName: z.string().max(50).optional(),
        priority: z.coerce.number().int().min(0).max(1000).default(0)
      })
      .parse(args);
    const category = await resolveCategory(db, userId, undefined, input.categoryId, input.categoryName, true, pending);
    const payload = {
      name: input.name,
      field: input.field,
      operator: input.operator,
      value: input.value,
      tagName: input.tagName ?? null,
      priority: input.priority,
      categoryId: category?.id ?? null,
      categoryRef: category?.ref ?? null
    };
    push({
      type: tool,
      payload,
      preview: {
        title: 'Tạo quy tắc tự động',
        name: input.name,
        field: input.field,
        operator: input.operator,
        value: input.value,
        category: category?.name ?? null,
        tagName: input.tagName ?? null,
        priority: input.priority
      }
    });
  },
  RECONCILE_WALLET: async ({ db, userId, args, tool, push }) => {
    const input = z
      .object({
        walletId: uuid.optional(),
        walletName: z.string().max(100).optional(),
        actualBalance: z.coerce.number(),
        occurredAt: isoDate.optional(),
        note: z.string().max(500).optional()
      })
      .parse(args);
    const resolved = (await resolveWallet(db, userId, input.walletId, input.walletName))!;
    const wallet = await owned('Ví', db.wallet.findFirst({ where: { id: resolved.id!, userId } }));
    const rows = await db.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        OR: [{ walletId: wallet.id }, { destinationWalletId: wallet.id }]
      }
    });
    let current = Number(wallet.openingBalance);
    for (const row of rows)
      current +=
        row.type === 'INCOME' || (row.type === 'TRANSFER' && row.destinationWalletId === wallet.id)
          ? Number(row.amount)
          : -Number(row.amount);
    const difference = input.actualBalance - current;
    if (Math.abs(difference) < 0.0001)
      throw new AppError(422, 'ALREADY_RECONCILED', 'Số dư ví đã khớp, không cần điều chỉnh.');
    push({
      type: tool,
      payload: {
        walletId: wallet.id,
        type: difference > 0 ? 'INCOME' : 'EXPENSE',
        amount: Math.abs(difference),
        occurredAt: date(input.occurredAt).toISOString(),
        note: input.note ?? 'Điều chỉnh đối soát'
      },
      preview: {
        title: 'Đối soát ví',
        wallet: wallet.name,
        currentBalance: current,
        actualBalance: input.actualBalance,
        adjustment: difference,
        currency: wallet.currency
      }
    });
  }
};
