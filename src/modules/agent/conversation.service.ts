import { notFound } from '../../core/errors/app-error';
import { publicAgentAction } from './agent-action.service';
import type { AssistantRepository } from './assistant.repository';

/** Hội thoại với trợ lý và các ghi nhớ dài hạn người dùng có thể xem, xóa. */
export class ConversationService {
  constructor(private readonly assistant: AssistantRepository) {}

  async list(userId: string) {
    const rows = await this.assistant.listConversations(userId);
    return rows.map((item) => ({
      id: item.id,
      title: item.title,
      messageCount: item._count.messages,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));
  }

  create(userId: string, title: string) {
    return this.assistant.createConversation(userId, title);
  }

  async messages(userId: string, id: string) {
    const conversation = await this.assistant.conversationWithMessages(userId, id);
    if (!conversation) throw notFound('Cuộc trò chuyện');
    return {
      conversation: { id: conversation.id, title: conversation.title },
      messages: conversation.messages.map((item) => ({
        id: item.id,
        role: item.role.toLowerCase(),
        content: item.content,
        provider: item.provider,
        model: item.model,
        status: item.status.toLowerCase(),
        errorCode: item.errorCode,
        finishReason: item.finishReason,
        attemptCount: item.attemptCount,
        createdAt: item.createdAt
      })),
      actions: conversation.actions.map(publicAgentAction)
    };
  }

  async remove(userId: string, id: string) {
    const deleted = await this.assistant.deleteConversation(userId, id);
    if (!deleted.count) throw notFound('Cuộc trò chuyện');
  }

  async memories(userId: string) {
    const rows = await this.assistant.listMemories(userId);
    return rows.map((item) => ({
      id: item.id,
      kind: item.kind,
      content: item.content,
      confidence: item.confidence,
      confirmed: item.confirmed,
      expiresAt: item.expiresAt,
      updatedAt: item.updatedAt
    }));
  }

  async removeMemory(userId: string, id: string) {
    const result = await this.assistant.deleteMemory(userId, id);
    if (!result.count) throw notFound('Ghi nhớ');
  }
}
