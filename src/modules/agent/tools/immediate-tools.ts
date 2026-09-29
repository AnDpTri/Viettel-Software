import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { notFound } from '../../../core/errors/app-error';
import type { AgentToolName } from '../agent.types';
import type { ToolResult } from './read-tools';
import { uuid } from './tool-support';

export type ImmediateToolContext = {
  db: PrismaClient;
  userId: string;
  conversationId: string;
  args: Record<string, unknown>;
  tool: AgentToolName;
};

type ImmediateTool = (context: ImmediateToolContext) => Promise<ToolResult>;

/** Tool CHẠY NGAY không cần xác nhận: bộ nhớ dài hạn, lịch sử hội thoại và các thao tác chỉ xem/chuẩn bị (thống kê
 * trước khi làm lại dữ liệu, liên kết tải bản sao). */
export const IMMEDIATE_TOOLS: Partial<Record<AgentToolName, ImmediateTool>> = {
  SAVE_MEMORY: async ({ db, userId, args, tool }) => {
    const input = z
      .object({
        content: z.string().trim().min(1).max(500),
        kind: z.enum(['PREFERENCE', 'CONTEXT', 'OTHER']).default('PREFERENCE')
      })
      .parse(args);
    const existing = await db.assistantMemory.findFirst({
      where: { userId, content: { equals: input.content, mode: 'insensitive' } }
    });
    const memory = existing
      ? await db.assistantMemory.update({
          where: { id: existing.id },
          data: { kind: input.kind, confirmed: true, expiresAt: null }
        })
      : await db.assistantMemory.create({
          data: { userId, kind: input.kind, content: input.content, confirmed: true }
        });
    return {
      tool,
      summary: `Đã ghi nhớ: “${memory.content}”.`,
      data: { id: memory.id, kind: memory.kind, content: memory.content }
    };
  },
  LIST_MEMORIES: async ({ db, userId, args, tool }) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(args);
    const memories = await db.assistantMemory.findMany({
      where: { userId, confirmed: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });
    const data = memories.map((item) => ({
      id: item.id,
      kind: item.kind,
      content: item.content,
      updatedAt: item.updatedAt
    }));
    return {
      tool,
      summary: data.length ? `Có ${data.length} ghi nhớ dài hạn.` : 'Chưa có ghi nhớ dài hạn nào.',
      data
    };
  },
  DELETE_MEMORY: async ({ db, userId, args, tool }) => {
    const { memoryId } = z.object({ memoryId: uuid }).parse(args);
    const deleted = await db.assistantMemory.deleteMany({ where: { id: memoryId, userId } });
    if (!deleted.count) throw notFound('Ghi nhớ');
    return { tool, summary: 'Đã xóa ghi nhớ theo yêu cầu.', data: { memoryId } };
  },
  GET_CONVERSATION_HISTORY: async ({ db, userId, conversationId, args, tool }) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(30).default(12) }).parse(args);
    const conversation = await db.assistantConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true }
    });
    if (!conversation) throw notFound('Cuộc trò chuyện');
    const rows = await db.assistantMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit
    });
    const data = rows
      .reverse()
      .map((item) => ({ role: item.role.toLowerCase(), content: item.content, createdAt: item.createdAt }));
    return { tool, summary: `Đã đọc ${data.length} tin nhắn gần nhất trong cuộc trò chuyện này.`, data };
  },
  PREVIEW_DATA_RESET: async ({ db, userId, args, tool }) => {
    const { scope } = z.object({ scope: z.enum(['TRANSACTIONS', 'ALL_FINANCIAL_DATA']) }).parse(args);
    const transactionCount = await db.transaction.count({ where: { userId, deletedAt: null } });
    if (scope === 'TRANSACTIONS')
      return {
        tool,
        summary: `Nếu làm lại sổ giao dịch, ${transactionCount} giao dịch hiện tại sẽ bị ảnh hưởng. Chưa có dữ liệu nào bị xóa.`,
        data: { scope, transactionCount, destructive: true, executed: false }
      };
    const [walletCount, categoryCount, budgetCount, goalCount, billCount, recurringCount, automationCount] =
      await Promise.all([
        db.wallet.count({ where: { userId, archivedAt: null } }),
        db.category.count({ where: { userId, archivedAt: null } }),
        db.budget.count({ where: { userId, deletedAt: null } }),
        db.goal.count({ where: { userId, deletedAt: null } }),
        db.bill.count({ where: { userId } }),
        db.recurringRule.count({ where: { userId } }),
        db.automationRule.count({ where: { userId } })
      ]);
    const data = {
      scope,
      transactionCount,
      walletCount,
      categoryCount,
      budgetCount,
      goalCount,
      billCount,
      recurringCount,
      automationCount,
      destructive: true,
      executed: false
    };
    return {
      tool,
      summary: `Bản xem trước làm lại toàn bộ dữ liệu tài chính: ${transactionCount} giao dịch, ${walletCount} ví, ${categoryCount} danh mục, ${budgetCount} ngân sách, ${goalCount} mục tiêu, ${billCount} hóa đơn, ${recurringCount} lịch định kỳ và ${automationCount} quy tắc sẽ bị ảnh hưởng. Chưa có dữ liệu nào bị xóa.`,
      data
    };
  },
  EXPORT_DATA_BACKUP: async ({ args, tool }) => {
    z.object({}).parse(args);
    return {
      tool,
      summary: 'Đã chuẩn bị liên kết tải bản sao dữ liệu cá nhân.',
      attachment: {
        label: 'Tải bản sao dữ liệu JSON',
        url: '/api/v1/productivity/data-export',
        filename: 'so-moc-backup.json'
      }
    };
  }
};
