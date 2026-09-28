import { prisma } from '../lib/prisma';

export async function getAgentMemoryContext(userId: string, conversationId: string) {
  const [conversation, messages, memories] = await Promise.all([
    prisma.assistantConversation.findFirstOrThrow({ where: { id: conversationId, userId }, select: { summary: true } }),
    prisma.assistantMessage.findMany({ where: { conversationId, status: { not: 'FAILED' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 }),
    prisma.assistantMemory.findMany({ where: { userId, confirmed: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { updatedAt: 'desc' }, take: 20 })
  ]);
  return {
    summary: conversation.summary,
    history: messages.reverse().map((item) => ({ role: item.role === 'USER' ? 'user' as const : 'assistant' as const, content: item.content })),
    memories: memories.map((item) => ({ id: item.id, kind: item.kind, content: item.content, confidence: item.confidence }))
  };
}

export async function refreshConversationSummary(conversationId: string) {
  const count = await prisma.assistantMessage.count({ where: { conversationId, status: { not: 'FAILED' } } });
  if (count < 20 || count % 10 !== 0) return;
  const messages = await prisma.assistantMessage.findMany({ where: { conversationId, status: { not: 'FAILED' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30 });
  const userTopics = messages.filter((item) => item.role === 'USER').slice(0, 12).map((item) => item.content.replace(/\s+/g, ' ').slice(0, 140));
  const summary = `Các chủ đề/yêu cầu gần đây của người dùng: ${userTopics.reverse().join(' | ')}`.slice(0, 1800);
  await prisma.assistantConversation.update({ where: { id: conversationId }, data: { summary, summaryUpdatedAt: new Date() } });
}
