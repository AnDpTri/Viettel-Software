import { Prisma } from '@prisma/client';
import { prisma } from '../core/database/prisma';

/** Mô tả ngắn một thay đổi cho ngữ cảnh mô hình, ví dụ "Ghi khoản chi · 500000 · Mua Claude". */
function describeAction(preview: Prisma.JsonValue, type: string) {
  const value =
    preview && typeof preview === 'object' && !Array.isArray(preview) ? (preview as Record<string, unknown>) : {};
  const parts = [value.title ?? type, value.name, value.amount, value.note, value.category, value.wallet].filter(
    (item) => item !== undefined && item !== null && item !== ''
  );
  return parts.map(String).join(' · ').slice(0, 160);
}

export async function getAgentMemoryContext(userId: string, conversationId: string) {
  const [conversation, messages, memories, actions] = await Promise.all([
    prisma.assistantConversation.findFirstOrThrow({ where: { id: conversationId, userId }, select: { summary: true } }),
    prisma.assistantMessage.findMany({
      where: { conversationId, status: { not: 'FAILED' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20
    }),
    prisma.assistantMemory.findMany({
      where: { userId, confirmed: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { updatedAt: 'desc' },
      take: 20
    }),
    // Trạng thái các thay đổi Agent đã đề xuất: thay cho tin nhắn "Đã thực hiện hành động thành công" trước đây,
    // để mô hình biết người dùng đã xác nhận, hủy hay hoàn tác gì mà không chèn tin nhắn giả vào hội thoại.
    prisma.agentAction.findMany({
      where: { conversationId, userId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { preview: true, type: true, status: true, createdAt: true }
    })
  ]);
  return {
    summary: conversation.summary,
    history: messages.reverse().map((item) => ({
      role: item.role === 'USER' ? ('user' as const) : ('assistant' as const),
      content: item.content
    })),
    memories: memories.map((item) => ({
      id: item.id,
      kind: item.kind,
      content: item.content,
      confidence: item.confidence
    })),
    recentActions: actions.reverse().map((item) => ({
      title: describeAction(item.preview, item.type),
      status: item.status,
      createdAt: item.createdAt.toISOString()
    }))
  };
}

export async function refreshConversationSummary(conversationId: string) {
  const count = await prisma.assistantMessage.count({ where: { conversationId, status: { not: 'FAILED' } } });
  if (count < 20 || count % 10 !== 0) return;
  const messages = await prisma.assistantMessage.findMany({
    where: { conversationId, status: { not: 'FAILED' } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 30
  });
  const userTopics = messages
    .filter((item) => item.role === 'USER')
    .slice(0, 12)
    .map((item) => item.content.replace(/\s+/g, ' ').slice(0, 140));
  const summary = `Các chủ đề/yêu cầu gần đây của người dùng: ${userTopics.reverse().join(' | ')}`.slice(0, 1800);
  await prisma.assistantConversation.update({
    where: { id: conversationId },
    data: { summary, summaryUpdatedAt: new Date() }
  });
}
