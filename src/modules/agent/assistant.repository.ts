import type { Prisma, PrismaClient } from '@prisma/client';

/** Truy vấn phục vụ trợ lý: tùy chọn AI của người dùng, lượt AI đã dùng, hội thoại, tin nhắn và ghi nhớ dài hạn. */
export class AssistantRepository {
  constructor(private readonly db: PrismaClient) {}

  // Người dùng và lượt AI
  preferences(userId: string) {
    return this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } });
  }

  savePreferences(userId: string, preferences: Prisma.InputJsonValue) {
    return this.db.user.update({ where: { id: userId }, data: { preferences } });
  }

  chatProfile(userId: string) {
    return this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true, fullName: true, currency: true, locale: true }
    });
  }

  accountTier(userId: string) {
    return this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { accountTier: true, vipExpiresAt: true } });
  }

  /** Số lượt AI (thành công và thất bại) kể từ `since`, đếm theo nhật ký kiểm toán. */
  countAiRequests(userId: string, since: Date) {
    return this.db.auditLog.count({
      where: { userId, action: { in: ['AI_AGENT_REQUEST', 'AI_AGENT_FAILURE'] }, createdAt: { gte: since } }
    });
  }

  // Hội thoại
  listConversations(userId: string) {
    return this.db.assistantConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: { _count: { select: { messages: true } } }
    });
  }

  findConversation(userId: string, id: string) {
    return this.db.assistantConversation.findFirst({ where: { id, userId } });
  }

  conversationWithMessages(userId: string, id: string) {
    return this.db.assistantConversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 }, actions: { orderBy: { createdAt: 'asc' } } }
    });
  }

  createConversation(userId: string, title: string) {
    return this.db.assistantConversation.create({ data: { userId, title } });
  }

  deleteConversation(userId: string, id: string) {
    return this.db.assistantConversation.deleteMany({ where: { id, userId } });
  }

  // Tin nhắn của một lượt hỏi
  findRetryableMessage(conversationId: string, id: string) {
    return this.db.assistantMessage.findFirst({ where: { id, conversationId, role: 'USER', status: 'FAILED' } });
  }

  reopenMessage(id: string) {
    return this.db.assistantMessage.update({ where: { id }, data: { status: 'PROCESSING', errorCode: null } });
  }

  createUserMessage(conversationId: string, content: string) {
    return this.db.assistantMessage.create({
      data: { conversationId, role: 'USER', content, status: 'PROCESSING', attemptCount: 0 }
    });
  }

  /** Đánh dấu câu hỏi đã xong, lưu câu trả lời và đưa hội thoại lên đầu danh sách, trong một transaction. */
  async completeTurn(
    conversationId: string,
    userMessage: { id: string; attemptCount: number },
    answer: Omit<Prisma.AssistantMessageUncheckedCreateInput, 'conversationId' | 'role' | 'status'>
  ) {
    await this.db.$transaction([
      this.db.assistantMessage.update({
        where: { id: userMessage.id },
        data: { status: 'COMPLETED', attemptCount: userMessage.attemptCount }
      }),
      this.db.assistantMessage.create({ data: { ...answer, conversationId, role: 'ASSISTANT', status: 'COMPLETED' } }),
      this.db.assistantConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
    ]);
  }

  async failTurn(conversationId: string, userMessage: { id: string; attemptCount: number }, errorCode: string) {
    await this.db.$transaction([
      this.db.assistantMessage.update({
        where: { id: userMessage.id },
        data: { status: 'FAILED', errorCode, attemptCount: userMessage.attemptCount }
      }),
      this.db.assistantConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
    ]);
  }

  failPendingActions(ids: string[]) {
    return this.db.agentAction.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'FAILED' }
    });
  }

  // Ghi nhớ dài hạn
  listMemories(userId: string) {
    return this.db.assistantMemory.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 100 });
  }

  deleteMemory(userId: string, id: string) {
    return this.db.assistantMemory.deleteMany({ where: { id, userId } });
  }
}
