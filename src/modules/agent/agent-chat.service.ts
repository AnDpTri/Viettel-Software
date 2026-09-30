import type { AgentAction } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppConfig } from '../../core/config/env';
import { AppError, notFound } from '../../core/errors/app-error';
import { compactOnboarding } from '../onboarding/onboarding.domain';
import type { OnboardingService } from '../onboarding/onboarding.service';
import type { AgentActionService } from './agent-action.service';
import { IMMEDIATE_AGENT_TOOLS, publicAgentAction, READ_AGENT_TOOLS } from './agent-action.service';
import type { AgentMemoryService } from './agent-memory.service';
import {
  buildAgentMessages,
  claimsDownloadLink,
  claimsPendingPreview,
  claimsSavedChange,
  containsStaleOnboardingClaim,
  containsUnexpectedChinese,
  isConfirmationMessage
} from './agent-prompt';
import {
  AGENT_MAX_ROUNDS,
  AGENT_MAX_TOOL_CALLS_PER_TURN,
  type AgentChatMessage,
  type AgentModelTurn,
  type AgentProposal,
  type AgentToolCall,
  type PendingEntity
} from './agent.types';
import type { AiAccessService } from './ai-access.service';
import type { AiProvider } from './ai-provider';
import type { AssistantInput } from './agent.schemas';
import type { AssistantRepository } from './assistant.repository';
import type { ToolResult } from './tools/read-tools';

/** Ghi nhật ký kiểm toán cho một lượt hỏi; controller nối nó với request hiện tại. */
export type AgentAuditor = (
  action: 'AI_AGENT_REQUEST' | 'AI_AGENT_FAILURE',
  conversationId: string,
  metadata: Record<string, unknown>
) => Promise<void>;

/** Trạng thái tích lũy trong một lượt hỏi (nhiều vòng gọi mô hình và công cụ). */
class Turn {
  readonly actions: AgentAction[] = [];
  readonly toolResults: ToolResult[] = [];
  readonly toolCache = new Map<string, unknown>();
  /** Mọi thay đổi đề xuất trong lượt này thành một nhóm xác nhận chung. */
  readonly batchId = randomUUID();
  /** Ví/danh mục đang chờ trong nhóm, để tool ghi sau tham chiếu được (xem PendingEntity). */
  readonly pending: PendingEntity[] = [];
  latencyMs = 0;
  attempts = 0;
  toolCallCount = 0;
  /** Lượt này đã chạy công cụ ghi ngay (lưu/xóa ghi nhớ…): câu "đã lưu" khi đó có thể đúng. */
  immediateToolRan = false;

  record(turn: AgentModelTurn) {
    this.latencyMs += turn.latencyMs;
    this.attempts += turn.attemptCount;
    return turn;
  }

  get hasAttachment() {
    return this.toolResults.some((item) => item.attachment);
  }
}

const REPAIR_PREVIEW_CLAIM =
  'Câu trả lời vừa rồi nói đã có bản xem trước, nhưng bạn chưa gọi công cụ nào nên người dùng không có gì để xác nhận. Hãy gọi ngay các công cụ cần thiết (mỗi khoản một lời gọi riêng) rồi trả lời lại. Nếu còn thiếu thông tin bắt buộc thì hỏi lại, không được nói là đã tạo bản xem trước.';
const REPAIR_DOWNLOAD_CLAIM =
  'Câu trả lời vừa rồi nói đã có liên kết tải, nhưng trong lượt này bạn chưa gọi công cụ nên người dùng không thấy nút tải nào. Hãy gọi ngay công cụ tương ứng (EXPORT_DATA_BACKUP cho bản sao dữ liệu, EXPORT_TRANSACTIONS_CSV cho CSV) rồi trả lời lại. Không được bịa nơi chứa tệp.';
const REPAIR_FALSE_SAVE_PENDING =
  'Câu trả lời vừa rồi nói sai: CHƯA có gì được lưu. Nhóm thay đổi vẫn đang chờ xác nhận (PENDING), và gõ chữ trong khung chat không lưu được. Hãy viết lại: nói rõ là chưa lưu và nhắc người dùng bấm nút "Xác nhận" trên thẻ bản xem trước. Không gọi thêm công cụ.';
const REPAIR_FALSE_SAVE_NOTHING =
  'Câu trả lời vừa rồi nói sai: CHƯA có gì được lưu và cũng không có bản xem trước nào đang chờ (trước đó chưa gọi công cụ ghi nào). Nếu đã rõ người dùng muốn thay đổi gì thì gọi ngay các công cụ để tạo bản xem trước (mỗi khoản một lời gọi) rồi nhắc họ bấm nút "Xác nhận" trên thẻ; nếu còn thiếu thông tin thì hỏi lại. Không được nói là đã lưu hay đã tạo.';
const SUMMARIZE_PREVIEWS =
  'Bạn đã chuẩn bị xong các bản xem trước ở trên. Không gọi thêm công cụ. Hãy trả lời người dùng ngắn gọn: nhóm gồm những thay đổi nào và nhắc họ bấm xác nhận một lần cho cả nhóm.';
const REWRITE_LANGUAGE =
  'Câu trả lời vừa rồi dùng sai ngôn ngữ. Hãy viết lại toàn bộ bằng tiếng Việt tự nhiên, giữ nguyên dữ kiện và trạng thái thực tế của công cụ. Không gọi thêm công cụ và không thêm tuyên bố chưa được kết quả công cụ xác nhận.';
const REWRITE_STALE_ONBOARDING =
  'Câu trả lời vừa rồi nói sai: người dùng ĐÃ hoàn thành đủ 4 bước thiết lập ban đầu (hồ sơ, ví, danh mục, giao dịch đầu tiên), không còn thiếu bước nào. Hãy viết lại toàn bộ câu trả lời, không nhắc tới việc còn thiếu thiết lập hay cần ghi giao dịch đầu tiên, chỉ trả lời đúng trọng tâm câu hỏi gốc của người dùng.';

/** Vòng lặp Agent cho một câu hỏi: dựng ngữ cảnh, gọi mô hình, chạy công cụ (đọc chạy ngay, ghi tạo bản xem trước),
 * chặn các câu trả lời khẳng định sai (bản xem trước/liên kết tải không tồn tại, sai ngôn ngữ, nhắc thiết lập đã xong)
 * rồi lưu hội thoại. Lỗi ở bất kỳ bước nào đánh dấu câu hỏi FAILED để người dùng gửi lại. */
export class AgentChatService {
  constructor(
    private readonly assistant: AssistantRepository,
    private readonly access: AiAccessService,
    private readonly agentActions: AgentActionService,
    private readonly memory: AgentMemoryService,
    private readonly onboarding: Pick<OnboardingService, 'status'>,
    private readonly ai: AiProvider,
    private readonly config: AppConfig
  ) {}

  async ask(userId: string, input: AssistantInput, audit: AgentAuditor) {
    this.access.assertConfigured();
    const user = await this.assistant.chatProfile(userId);
    if (!this.access.hasConsent(user.preferences))
      throw new AppError(
        428,
        'AI_CONSENT_REQUIRED',
        'Hãy đồng ý sử dụng AI bên ngoài trước khi trò chuyện với trợ lý.'
      );
    await this.access.enforceDailyQuota(userId);
    const conversation = await this.openConversation(userId, input);
    const userMessage = await this.openUserMessage(conversation.id, input);
    const previousAttempts = userMessage.attemptCount;
    const turn = new Turn();
    try {
      const [memoryContext, onboarding] = await Promise.all([
        this.memory.context(userId, conversation.id),
        this.onboarding.status(userId)
      ]);
      const history = memoryContext.history.length
        ? memoryContext.history
        : [...input.history, { role: 'user' as const, content: input.question }];
      const messages = buildAgentMessages(history, {
        now: new Date().toISOString(),
        userName: user.fullName,
        currency: user.currency,
        currentView: input.uiContext?.currentView,
        onboarding: compactOnboarding(onboarding),
        summary: memoryContext.summary,
        memories: memoryContext.memories,
        recentActions: memoryContext.recentActions
      });
      const { actionState } = memoryContext;
      // Câu "đã lưu/đã tạo" chỉ đúng khi có thay đổi được lưu kể từ câu trả lời trước. Khi chưa có, chỉ coi là nói sai
      // chắc chắn nếu còn nhóm đang chờ, người dùng vừa gõ chữ để "xác nhận", hoặc hội thoại chưa từng lưu gì; ngoài ra
      // có thể mô hình đang nhắc lại một việc đã lưu từ trước.
      const saveFacts = {
        noSaveSinceLastReply: actionState.savedSinceLastReply === 0,
        certainFalseSave: actionState.pending > 0 || isConfirmationMessage(input.question) || !actionState.savedEver,
        hasPending: actionState.pending > 0
      };
      const { finalTurn: loopTurn, previewClaimRetried } = await this.runLoop(
        userId,
        conversation.id,
        messages,
        turn,
        saveFacts
      );
      let finalTurn = loopTurn;
      // Hết vòng khi Agent đang làm tuần tự từng bước (tra danh mục, tạo cha, tạo con, ghi khoản chi…) nhưng đã có bản
      // xem trước: xin một câu tóm tắt không kèm công cụ thay vì báo lỗi và bỏ cả nhóm thay đổi đã chuẩn bị.
      if (!finalTurn?.answer && turn.actions.length)
        finalTurn = turn.record(
          await this.ai.requestTurn([...messages, { role: 'system', content: SUMMARIZE_PREVIEWS }], false)
        );
      if (finalTurn?.answer && !turn.actions.length && claimsPendingPreview(finalTurn.answer))
        throw new AppError(
          502,
          'AGENT_PREVIEW_MISSING',
          'Agent chưa tạo được bản xem trước cho yêu cầu này. Vui lòng thử lại.'
        );
      if (
        finalTurn?.answer &&
        !turn.actions.length &&
        !turn.immediateToolRan &&
        saveFacts.noSaveSinceLastReply &&
        saveFacts.certainFalseSave &&
        claimsSavedChange(finalTurn.answer)
      )
        throw new AppError(
          502,
          'AGENT_FALSE_SAVE_CLAIM',
          'Agent trả lời chưa chính xác về việc lưu dữ liệu. Chưa có thay đổi nào được lưu, vui lòng thử lại.'
        );
      if (finalTurn?.answer && !turn.hasAttachment && claimsDownloadLink(finalTurn.answer))
        throw new AppError(502, 'AGENT_ATTACHMENT_MISSING', 'Agent chưa tạo được liên kết tải. Vui lòng thử lại.');
      if (!finalTurn?.answer)
        throw new AppError(502, 'AGENT_LOOP_LIMIT', 'Agent chưa hoàn tất câu trả lời sau nhiều lần dùng công cụ.');

      let languageRewritten = false;
      if (user.locale.toLowerCase().startsWith('vi') && containsUnexpectedChinese(finalTurn.answer)) {
        const rewritten = turn.record(await this.rewrite(messages, finalTurn.answer, REWRITE_LANGUAGE));
        if (!rewritten.answer || containsUnexpectedChinese(rewritten.answer))
          throw new AppError(502, 'AI_LANGUAGE_MISMATCH', 'Agent chưa thể trả lời đúng tiếng Việt. Vui lòng thử lại.');
        finalTurn = rewritten;
        languageRewritten = true;
      }
      let onboardingClaimRewritten = false;
      if (onboarding.completed && containsStaleOnboardingClaim(finalTurn.answer)) {
        const rewritten = turn.record(await this.rewrite(messages, finalTurn.answer, REWRITE_STALE_ONBOARDING));
        if (rewritten.answer && !containsStaleOnboardingClaim(rewritten.answer)) {
          finalTurn = rewritten;
          onboardingClaimRewritten = true;
        }
      }

      await this.assistant.completeTurn(
        conversation.id,
        { id: userMessage.id, attemptCount: previousAttempts + (turn.attempts || 1) },
        {
          content: finalTurn.answer,
          provider: finalTurn.provider,
          model: finalTurn.model,
          finishReason: finalTurn.finishReason,
          providerRequestId: finalTurn.requestId,
          attemptCount: finalTurn.attemptCount
        }
      );
      await audit('AI_AGENT_REQUEST', conversation.id, {
        provider: finalTurn.provider,
        model: finalTurn.model,
        latencyMs: turn.latencyMs,
        actionCount: turn.actions.length,
        toolCount: turn.toolCallCount,
        languageRewritten,
        onboardingClaimRewritten,
        previewClaimRetried,
        success: true
      });
      void this.memory.refreshSummary(conversation.id);
      // Khi lượt này đã tạo nhóm thay đổi, thẻ xác nhận là việc chính; bỏ các nút điều hướng phụ ("Xem các ví") sinh ra
      // từ tool đọc mà Agent gọi để tra tên ví/danh mục, tránh làm rối câu trả lời.
      const uiActions = turn.actions.length
        ? []
        : turn.toolResults.flatMap((item) => {
            const data = item.data as { uiActions?: unknown[] } | undefined;
            return Array.isArray(data?.uiActions) ? data.uiActions : [];
          });
      return {
        conversationId: conversation.id,
        answer: finalTurn.answer,
        provider: finalTurn.provider,
        model: finalTurn.model,
        latencyMs: turn.latencyMs,
        intent: turn.actions.length ? 'ACTION' : turn.toolCallCount ? 'TOOL' : 'GENERAL',
        actions: turn.actions.map(publicAgentAction),
        toolResults: turn.toolResults,
        uiActions,
        onboarding,
        attachments: turn.toolResults.flatMap((item) => (item.attachment ? [item.attachment] : [])),
        consentRequired: false
      };
    } catch (error) {
      const errorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      if (turn.actions.length) await this.assistant.failPendingActions(turn.actions.map((item) => item.id));
      await this.assistant.failTurn(
        conversation.id,
        { id: userMessage.id, attemptCount: previousAttempts + (turn.attempts || 1) },
        errorCode
      );
      try {
        await audit('AI_AGENT_FAILURE', conversation.id, {
          provider: this.config.AI_PROVIDER,
          errorCode,
          toolCount: turn.toolCallCount,
          actionCount: turn.actions.length,
          success: false
        });
      } catch {}
      if (error instanceof AppError)
        throw new AppError(error.statusCode, error.code, error.message, {
          ...(error.details && typeof error.details === 'object' ? (error.details as Record<string, unknown>) : {}),
          conversationId: conversation.id,
          messageId: userMessage.id
        });
      throw error;
    }
  }

  private async openConversation(userId: string, input: AssistantInput) {
    if (!input.conversationId) return this.assistant.createConversation(userId, input.question.slice(0, 120));
    const conversation = await this.assistant.findConversation(userId, input.conversationId);
    if (!conversation) throw notFound('Cuộc trò chuyện');
    return conversation;
  }

  /** Gửi lại một câu hỏi FAILED (retryMessageId) hoặc ghi câu hỏi mới. */
  private async openUserMessage(conversationId: string, input: AssistantInput) {
    if (!input.retryMessageId) return this.assistant.createUserMessage(conversationId, input.question);
    const failed = await this.assistant.findRetryableMessage(conversationId, input.retryMessageId);
    if (!failed)
      throw new AppError(409, 'MESSAGE_NOT_RETRYABLE', 'Tin nhắn này không còn ở trạng thái có thể thử lại.');
    return this.assistant.reopenMessage(failed.id);
  }

  /** Gọi mô hình và chạy công cụ tới khi có câu trả lời văn bản. Nếu câu trả lời khẳng định đã có bản xem trước hoặc
   * liên kết tải mà lượt này không tạo ra, nhắc mô hình gọi công cụ thật và cho thêm một đợt (tối đa 2 vòng). */
  private async runLoop(
    userId: string,
    conversationId: string,
    messages: AgentChatMessage[],
    turn: Turn,
    saveFacts: { noSaveSinceLastReply: boolean; hasPending: boolean }
  ) {
    let finalTurn: AgentModelTurn | null = null;
    let previewClaimRetried = false;
    for (let pass = 0; pass < 2; pass += 1) {
      for (let round = 0; round < (pass ? 2 : AGENT_MAX_ROUNDS); round += 1) {
        const modelTurn = turn.record(await this.ai.requestTurn(messages, true));
        if (!modelTurn.toolCalls.length) {
          finalTurn = modelTurn;
          break;
        }
        turn.toolCallCount += modelTurn.toolCalls.length;
        if (turn.toolCallCount > AGENT_MAX_TOOL_CALLS_PER_TURN)
          throw new AppError(502, 'AGENT_TOOL_LIMIT', 'Agent đã gọi quá nhiều công cụ trong một lượt.');
        messages.push({
          role: 'assistant',
          content: modelTurn.answer || null,
          tool_calls: modelTurn.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.argumentsText }
          }))
        });
        for (const call of modelTurn.toolCalls) {
          const result = await this.runToolCall(userId, conversationId, call, turn);
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }
      // Mô hình nói đã tạo bản xem trước nhưng không gọi công cụ ghi nào, nên người dùng không có gì để xác nhận (đã
      // gặp với DeepSeek khi được nhờ ghi nhiều khoản một lúc).
      const repair =
        finalTurn?.answer && !previewClaimRetried
          ? !turn.actions.length && claimsPendingPreview(finalTurn.answer)
            ? REPAIR_PREVIEW_CLAIM
            : // Tương tự với nút tải: mô hình từng chép lại "Bản sao dữ liệu đã sẵn sàng" từ lượt trước mà không gọi
              // công cụ, nên không có nút tải nào và người dùng phải hỏi lại "link đâu".
              !turn.hasAttachment && claimsDownloadLink(finalTurn.answer)
              ? REPAIR_DOWNLOAD_CLAIM
              : // Mô hình nói "đã lưu xong" khi chưa có gì được lưu kể từ câu trả lời trước (đã gặp: người dùng gõ
                // "xác nhận" vào khung chat, lượt trước lại không tạo bản xem trước nào).
                !turn.actions.length &&
                  !turn.immediateToolRan &&
                  saveFacts.noSaveSinceLastReply &&
                  claimsSavedChange(finalTurn.answer)
                ? saveFacts.hasPending
                  ? REPAIR_FALSE_SAVE_PENDING
                  : REPAIR_FALSE_SAVE_NOTHING
                : null
          : null;
      if (!repair || !finalTurn) break;
      previewClaimRetried = true;
      messages.push({ role: 'assistant', content: finalTurn.answer }, { role: 'system', content: repair });
      finalTurn = null;
    }
    return { finalTurn, previewClaimRetried };
  }

  /** Chạy một lời gọi công cụ và trả kết quả cho mô hình. Lỗi được trả về dạng dữ liệu để mô hình tự sửa hoặc hỏi lại.
   * Chỉ cache tool đọc và tool chạy ngay; tool ghi luôn chạy riêng từng lời gọi, để hai khoản chi giống hệt nhau người
   * dùng yêu cầu vẫn thành hai bản ghi. */
  private async runToolCall(userId: string, conversationId: string, call: AgentToolCall, turn: Turn) {
    const cacheable = READ_AGENT_TOOLS.has(call.name) || IMMEDIATE_AGENT_TOOLS.has(call.name);
    const signature = cacheable ? `${call.name}:${call.argumentsText}` : `write:${call.id}`;
    const cached = turn.toolCache.get(signature);
    if (cached) return cached;
    let result: unknown;
    try {
      const parsed = JSON.parse(call.argumentsText || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Arguments must be an object');
      const proposal: AgentProposal = { tool: call.name, arguments: parsed as Record<string, unknown> };
      if (READ_AGENT_TOOLS.has(call.name)) {
        const readResult = (await this.agentActions.runReadTools(userId, [proposal]))[0];
        if (!readResult) throw new AppError(422, 'AGENT_TOOL_EMPTY_RESULT', 'Công cụ không trả kết quả.');
        result = { ok: true, ...readResult };
        turn.toolResults.push(readResult);
      } else if (IMMEDIATE_AGENT_TOOLS.has(call.name)) {
        const immediateResult = await this.agentActions.runImmediateTool(userId, conversationId, proposal);
        result = { ok: true, ...immediateResult };
        turn.toolResults.push(immediateResult);
        turn.immediateToolRan = true;
      } else {
        const [action] = await this.agentActions.prepare(userId, conversationId, [proposal], {
          batchId: turn.batchId,
          pending: turn.pending
        });
        if (!action) throw new AppError(422, 'UNSUPPORTED_AGENT_ACTION', 'Công cụ chưa thể tạo bản xem trước.');
        turn.actions.push(action);
        result = {
          ok: true,
          tool: call.name,
          summary:
            'Đã thêm bản xem trước vào nhóm thay đổi của lượt này. Người dùng sẽ xác nhận cả nhóm bằng một lần bấm; chưa có gì được lưu.',
          data: { actionId: action.id, status: action.status, preview: action.preview }
        };
      }
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? 'Dữ liệu công cụ không hợp lệ.')
          : error instanceof Error
            ? error.message
            : 'Dữ liệu công cụ không hợp lệ.';
      const code =
        error instanceof AppError
          ? error.code
          : error instanceof z.ZodError
            ? 'TOOL_VALIDATION_ERROR'
            : 'TOOL_ARGUMENTS_INVALID';
      result = {
        ok: false,
        error: { code, message },
        instruction:
          'Hãy sửa lời gọi công cụ hoặc hỏi người dùng phần thông tin còn thiếu. Không khẳng định thao tác đã hoàn tất.'
      };
    }
    turn.toolCache.set(signature, result);
    return result;
  }

  private rewrite(messages: AgentChatMessage[], answer: string, instruction: string) {
    return this.ai.requestTurn(
      [...messages, { role: 'assistant', content: answer }, { role: 'system', content: instruction }],
      false
    );
  }
}
