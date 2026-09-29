import type { PrismaClient, TransactionType } from '@prisma/client';
import { z } from 'zod';
import { calculateWalletBalance } from '../../../shared/wallet-balance';
import { APP_GUIDE } from '../../onboarding/onboarding.constants';
import type { OnboardingService } from '../../onboarding/onboarding.service';
import type { AgentToolName } from '../agent.types';
import { isoDate, resolveCategory, resolveWallet } from './tool-support';

export type ToolResult = {
  tool: AgentToolName;
  summary: string;
  data?: unknown;
  attachment?: { label: string; url: string; filename?: string };
};

export type ReadToolContext = {
  db: PrismaClient;
  onboarding: Pick<OnboardingService, 'status'>;
  userId: string;
  args: Record<string, unknown>;
  tool: AgentToolName;
};

type ReadTool = (context: ReadToolContext) => Promise<ToolResult>;

/** Tool ĐỌC: chạy ngay, không thay đổi dữ liệu. */
export const READ_TOOLS: Partial<Record<AgentToolName, ReadTool>> = {
  SEARCH_TRANSACTIONS: async ({ db, userId, args, tool }) => {
    const input = z
      .object({
        query: z.string().max(200).optional(),
        type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
        walletName: z.string().max(100).optional(),
        categoryName: z.string().max(100).optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        minAmount: z.coerce.number().optional(),
        maxAmount: z.coerce.number().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(10)
      })
      .parse(args);
    const wallet = input.walletName ? await resolveWallet(db, userId, undefined, input.walletName, true) : null;
    const category = input.categoryName
      ? await resolveCategory(db, userId, input.type as TransactionType | undefined, undefined, input.categoryName)
      : null;
    const rows = await db.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(input.type ? { type: input.type } : {}),
        ...(wallet?.id ? { OR: [{ walletId: wallet.id }, { destinationWalletId: wallet.id }] } : {}),
        ...(category?.id ? { categoryId: category.id } : {}),
        ...(input.from || input.to
          ? {
              occurredAt: {
                ...(input.from ? { gte: new Date(input.from) } : {}),
                ...(input.to ? { lte: new Date(input.to) } : {})
              }
            }
          : {}),
        ...(input.minAmount !== undefined || input.maxAmount !== undefined
          ? {
              amount: {
                ...(input.minAmount !== undefined ? { gte: input.minAmount } : {}),
                ...(input.maxAmount !== undefined ? { lte: input.maxAmount } : {})
              }
            }
          : {}),
        ...(input.query
          ? {
              OR: [
                { note: { contains: input.query, mode: 'insensitive' } },
                { payee: { contains: input.query, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      include: { wallet: { select: { name: true, currency: true } }, category: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' },
      take: input.limit
    });
    const data = rows.map((row) => ({
      id: row.id,
      date: row.occurredAt.toISOString(),
      type: row.type,
      amount: Number(row.amount),
      currency: row.wallet.currency,
      wallet: row.wallet.name,
      category: row.category?.name ?? null,
      note: row.note
    }));
    const lines = data
      .slice(0, 8)
      .map(
        (item, index) =>
          `${index + 1}. ${new Date(item.date).toLocaleDateString('vi-VN')} · ${item.type === 'INCOME' ? 'Thu' : item.type === 'EXPENSE' ? 'Chi' : 'Chuyển'} ${item.amount.toLocaleString('vi-VN')} ${item.currency} · ${item.category ?? item.note ?? 'Chưa phân loại'} · ví ${item.wallet}`
      )
      .join('\n');
    return {
      tool,
      summary: data.length
        ? `Tìm thấy ${data.length} giao dịch phù hợp:\n${lines}`
        : 'Không tìm thấy giao dịch phù hợp.',
      data
    };
  },
  FINANCIAL_SUMMARY: async ({ db, userId, args, tool }) => {
    const input = z.object({ from: isoDate.optional(), to: isoDate.optional() }).parse(args);
    const from = input.from ? new Date(input.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = input.to ? new Date(input.to) : new Date();
    const rows = await db.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        occurredAt: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
        type: { in: ['INCOME', 'EXPENSE'] }
      }
    });
    const income = rows.filter((row) => row.type === 'INCOME').reduce((sum, row) => sum + Number(row.amount), 0);
    const expense = rows.filter((row) => row.type === 'EXPENSE').reduce((sum, row) => sum + Number(row.amount), 0);
    return {
      tool,
      summary: `Từ ${from.toLocaleDateString('vi-VN')} đến ${to.toLocaleDateString('vi-VN')}: thu ${income.toLocaleString('vi-VN')}, chi ${expense.toLocaleString('vi-VN')}, ròng ${(income - expense).toLocaleString('vi-VN')}.`,
      data: { from, to, income, expense, net: income - expense, transactionCount: rows.length }
    };
  },
  EXPORT_TRANSACTIONS_CSV: async ({ db, userId, args, tool }) => {
    const input = z
      .object({
        from: isoDate.optional(),
        to: isoDate.optional(),
        type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
        walletName: z.string().optional(),
        categoryName: z.string().optional()
      })
      .parse(args);
    const params = new URLSearchParams();
    if (input.from) params.set('from', input.from);
    if (input.to) params.set('to', input.to);
    if (input.type) params.set('type', input.type);
    const wallet = input.walletName ? await resolveWallet(db, userId, undefined, input.walletName, true) : null;
    const category = input.categoryName
      ? await resolveCategory(db, userId, input.type as TransactionType | undefined, undefined, input.categoryName)
      : null;
    if (wallet?.id) params.set('walletId', wallet.id);
    if (category?.id) params.set('categoryId', category.id);
    const url = `/api/v1/transactions/export.csv${params.size ? `?${params}` : ''}`;
    return {
      tool,
      summary: 'Tôi đã chuẩn bị đường dẫn tải báo cáo CSV.',
      attachment: { label: 'Tải CSV giao dịch', url }
    };
  },
  LIST_UPCOMING_BILLS: async ({ db, userId, args, tool }) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(args);
    const until = new Date(Date.now() + days * 86_400_000);
    const rows = await db.bill.findMany({
      where: { userId, status: { in: ['UPCOMING', 'OVERDUE'] }, dueAt: { lte: until } },
      orderBy: { dueAt: 'asc' },
      take: 50
    });
    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      amount: Number(row.amount),
      dueAt: row.dueAt,
      status: row.status
    }));
    const lines = data
      .slice(0, 10)
      .map(
        (item, index) =>
          `${index + 1}. ${item.name}: ${item.amount.toLocaleString('vi-VN')} · hạn ${new Date(item.dueAt).toLocaleDateString('vi-VN')} · ${item.status}`
      )
      .join('\n');
    return {
      tool,
      summary: data.length
        ? `Có ${data.length} hóa đơn đến hạn trong ${days} ngày tới:\n${lines}`
        : `Không có hóa đơn đến hạn trong ${days} ngày tới.`,
      data
    };
  },
  GET_ONBOARDING_STATUS: async ({ onboarding, userId, args, tool }) => {
    z.object({}).parse(args);
    const status = await onboarding.status(userId);
    const next = status.nextStep;
    return {
      tool,
      summary: status.completed
        ? 'Người dùng đã hoàn thành các bước thiết lập cơ bản.'
        : `Người dùng đã hoàn thành ${status.completedCount}/${status.totalSteps} bước. Bước phù hợp tiếp theo: ${next?.title}.`,
      data: {
        ...status,
        uiActions: next
          ? [{ type: 'OPEN_VIEW', view: next.view, label: next.actionLabel }]
          : [{ type: 'OPEN_VIEW', view: 'dashboard', label: 'Xem tổng quan' }]
      }
    };
  },
  LIST_WALLETS: async ({ db, userId, args, tool }) => {
    z.object({}).parse(args);
    const rows = await db.wallet.findMany({
      where: { userId, archivedAt: null },
      select: { id: true, name: true, type: true, currency: true, openingBalance: true },
      orderBy: { sortOrder: 'asc' }
    });
    // Trả SỐ DƯ HIỆN TẠI (giống màn Ví), không chỉ số dư đầu kỳ: trước đây mô hình lấy openingBalance làm số dư thật và báo sai.
    const transactions = rows.length
      ? await db.transaction.findMany({
          where: {
            userId,
            deletedAt: null,
            status: { not: 'CANCELLED' },
            OR: [
              { walletId: { in: rows.map((row) => row.id) } },
              { destinationWalletId: { in: rows.map((row) => row.id) } }
            ]
          },
          select: { type: true, amount: true, walletId: true, destinationWalletId: true }
        })
      : [];
    const items = rows.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      currency: item.currency,
      currentBalance: calculateWalletBalance(item.id, Number(item.openingBalance), transactions)
    }));
    // Cố ý không trả openingBalance: khi có cả hai con số, mô hình đôi khi chọn nhầm số dư đầu kỳ để trả lời.
    const lines = items
      .map((item) => `${item.name}: số dư hiện tại ${item.currentBalance.toLocaleString('vi-VN')} ${item.currency}`)
      .join('; ');
    return {
      tool,
      summary: items.length
        ? `Có ${items.length} ví đang hoạt động. ${lines}.`
        : 'Chưa có ví nào. Hãy hướng dẫn người dùng tạo ví đầu tiên.',
      data: {
        items,
        uiActions: [{ type: 'OPEN_VIEW', view: 'wallets', label: items.length ? 'Xem các ví' : 'Tạo ví đầu tiên' }]
      }
    };
  },
  LIST_CATEGORIES: async ({ db, userId, args, tool }) => {
    const input = z.object({ type: z.enum(['INCOME', 'EXPENSE']).optional() }).parse(args);
    const rows = await db.category.findMany({
      where: { userId, archivedAt: null, ...(input.type ? { type: input.type } : {}) },
      select: { id: true, name: true, type: true, parentId: true },
      orderBy: { sortOrder: 'asc' }
    });
    return {
      tool,
      summary: rows.length
        ? `Có ${rows.length} danh mục phù hợp: ${rows
            .slice(0, 15)
            .map((item) => item.name)
            .join(', ')}.`
        : 'Chưa có danh mục phù hợp.',
      data: {
        items: rows,
        uiActions: [
          { type: 'OPEN_VIEW', view: 'categories', label: rows.length ? 'Xem danh mục' : 'Thiết lập danh mục' }
        ]
      }
    };
  },
  GET_APP_GUIDE: async ({ args, tool }) => {
    const { topic } = z
      .object({
        topic: z
          .enum([
            'dashboard',
            'transactions',
            'wallets',
            'categories',
            'budgets',
            'goals',
            'reports',
            'planning',
            'insights',
            'profile'
          ])
          .optional()
      })
      .parse(args);
    const entries = topic ? [APP_GUIDE[topic]] : Object.values(APP_GUIDE);
    return {
      tool,
      summary: entries.map((item) => `${item.title}: ${item.description}`).join('\n'),
      data: {
        items: entries,
        uiActions: topic
          ? [{ type: 'OPEN_VIEW', view: APP_GUIDE[topic].view, label: `Mở ${APP_GUIDE[topic].title}` }]
          : []
      }
    };
  }
};
