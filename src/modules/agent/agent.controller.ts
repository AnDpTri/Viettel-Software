import type { AgentAction } from '@prisma/client';
import type { Request } from 'express';
import type { AppConfig } from '../../core/config/env';
import { audit } from '../../core/audit/audit';
import { AppError } from '../../core/errors/app-error';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId } from '../../core/http/request';
import { success } from '../../core/http/response';
import { publicAgentAction, type AgentActionService } from './agent-action.service';
import type { AgentChatService } from './agent-chat.service';
import { assistantInput, consentInput, conversationInput } from './agent.schemas';
import type { AiAccessService } from './ai-access.service';
import type { AiProvider } from './ai-provider';
import type { ConversationService } from './conversation.service';

export type AgentServices = {
  access: AiAccessService;
  conversations: ConversationService;
  chat: AgentChatService;
  actions: AgentActionService;
  ai: AiProvider;
};

/** Xác nhận/hủy/hoàn tác áp dụng cho CẢ NHÓM chứa action được chọn. Response giữ các trường của chính action đó
 * (tương thích client cũ) và thêm `actions` là toàn bộ nhóm. Không ghi tin nhắn hệ thống vào hội thoại: trạng thái đã
 * nằm trên thẻ hành động, và Agent đọc trạng thái nhóm qua ngữ cảnh `recentActions` ở lượt sau. */
function groupResponse(group: AgentAction[], actionId: string) {
  const selected = group.find((item) => item.id === actionId) ?? group[0]!;
  return { ...publicAgentAction(selected), actions: group.map(publicAgentAction) };
}

const idParam = (req: Request) => String(req.params.id);

/** HTTP cho trợ lý AI: quyền riêng tư và lượt dùng, hội thoại, ghi nhớ, hỏi Agent và xử lý nhóm thay đổi. */
export class AgentController {
  constructor(
    private readonly services: AgentServices,
    private readonly config: AppConfig
  ) {}

  settings = asyncHandler(async (req, res) => success(res, await this.services.access.settings(currentUserId(req))));

  updateSettings = asyncHandler(async (req, res) => {
    const { consent } = consentInput.parse(req.body);
    const userId = currentUserId(req);
    await this.services.access.setConsent(userId, consent);
    await audit(req, consent ? 'AI_CONSENT_GRANTED' : 'AI_CONSENT_REVOKED', 'User', userId);
    return success(res, { consent });
  });

  receiptImage = asyncHandler(async (req, res) => {
    this.services.access.assertConfigured();
    if (!req.file) throw new AppError(422, 'IMAGE_REQUIRED', 'Vui lòng chọn ảnh hóa đơn JPG hoặc PNG.');
    await this.services.access.assertReceiptImageAllowed(currentUserId(req));
    const result = await this.services.ai.readReceipt(req.file.buffer, req.file.mimetype as 'image/jpeg' | 'image/png');
    await audit(req, 'AI_AGENT_REQUEST', 'ReceiptImage', undefined, {
      provider: this.config.AI_PROVIDER,
      success: Boolean(result)
    });
    if (!result) throw new AppError(503, 'AI_OCR_UNAVAILABLE', 'Chưa thể đọc ảnh hóa đơn lúc này.');
    return success(res, { ...result, requiresConfirmation: true });
  });

  listConversations = asyncHandler(async (req, res) =>
    success(res, await this.services.conversations.list(currentUserId(req)))
  );

  createConversation = asyncHandler(async (req, res) => {
    const { title } = conversationInput.parse(req.body ?? {});
    const conversation = await this.services.conversations.create(currentUserId(req), title);
    return success(res, conversation, 'Đã tạo cuộc trò chuyện.', 201);
  });

  conversationMessages = asyncHandler(async (req, res) =>
    success(res, await this.services.conversations.messages(currentUserId(req), idParam(req)))
  );

  deleteConversation = asyncHandler(async (req, res) => {
    await this.services.conversations.remove(currentUserId(req), idParam(req));
    return success(res, null, 'Đã xóa cuộc trò chuyện.');
  });

  listMemories = asyncHandler(async (req, res) =>
    success(res, await this.services.conversations.memories(currentUserId(req)))
  );

  deleteMemory = asyncHandler(async (req, res) => {
    await this.services.conversations.removeMemory(currentUserId(req), idParam(req));
    return success(res, null, 'Đã xóa ghi nhớ.');
  });

  ask = asyncHandler(async (req, res) => {
    this.services.access.assertConfigured();
    const input = assistantInput.parse(req.body);
    const result = await this.services.chat.ask(currentUserId(req), input, (action, conversationId, metadata) =>
      audit(req, action, 'AssistantConversation', conversationId, metadata)
    );
    return success(res, result);
  });

  confirmAction = asyncHandler(async (req, res) => {
    const actionId = idParam(req);
    const group = await this.services.actions.execute(currentUserId(req), actionId);
    for (const action of group.filter((item) => item.status === 'EXECUTED'))
      await audit(req, 'AGENT_ACTION_EXECUTED', 'AgentAction', action.id, {
        type: action.type,
        batchId: action.batchId
      });
    return success(
      res,
      groupResponse(group, actionId),
      group.length > 1 ? `Đã thực hiện ${group.length} thay đổi.` : 'Đã thực hiện hành động.'
    );
  });

  cancelAction = asyncHandler(async (req, res) => {
    const actionId = idParam(req);
    const group = await this.services.actions.cancel(currentUserId(req), actionId);
    for (const action of group.filter((item) => item.status === 'CANCELLED'))
      await audit(req, 'AGENT_ACTION_CANCELLED', 'AgentAction', action.id, { batchId: action.batchId });
    return success(res, groupResponse(group, actionId), 'Đã hủy hành động.');
  });

  undoAction = asyncHandler(async (req, res) => {
    const actionId = idParam(req);
    const group = await this.services.actions.undo(currentUserId(req), actionId);
    for (const action of group.filter((item) => item.status === 'UNDONE'))
      await audit(req, 'AGENT_ACTION_UNDONE', 'AgentAction', action.id, { type: action.type, batchId: action.batchId });
    return success(res, groupResponse(group, actionId), 'Đã hoàn tác hành động.');
  });
}
