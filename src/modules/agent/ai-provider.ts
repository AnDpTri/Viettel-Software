import type { AppConfig } from '../../core/config/env';
import { AppError } from '../../core/errors/app-error';
import { logger } from '../../core/observability/logger';
import { SYSTEM_PROMPT } from './agent-prompt';
import {
  AGENT_MAX_TOOL_CALLS_PER_ROUND,
  AGENT_TOOL_NAMES,
  type AgentChatMessage,
  type AgentModelTurn,
  type AgentToolCall,
  type AgentToolName,
  type AiAnswer,
  type AssistantHistoryItem
} from './agent.types';
import { AGENT_TOOL_DEFINITIONS } from './tools/tool-definitions';

export type ReceiptImageResult = {
  merchant: string | null;
  amount: number | null;
  occurredAt: string | null;
  currency: string | null;
  items: Array<{ name: string; quantity?: number; amount?: number }>;
  confidence: number;
};

type ChatCompletion = {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: unknown;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
    };
  }>;
};

function parseJsonContent(content: string): unknown {
  return JSON.parse(
    content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
  );
}

/** Cổng tới nhà cung cấp mô hình (DeepSeek hoặc OpenAI) theo chuẩn chat completions. Cấu hình được đọc ở mỗi lời gọi
 * nên đổi khóa/nhà cung cấp lúc chạy (ví dụ trong test) có hiệu lực ngay. */
export class AiProvider {
  constructor(private readonly config: AppConfig) {}

  /** Một vòng gọi mô hình: trả lời văn bản và/hoặc danh sách tool muốn gọi. Lỗi mạng được thử lại một lần. */
  async requestTurn(messages: AgentChatMessage[], useTools = true): Promise<AgentModelTurn> {
    const provider = this.settings();
    const startedAt = Date.now();
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const { data, requestId } = await this.requestJson(provider.url, provider.apiKey, {
          model: provider.model,
          messages,
          ...(useTools ? { tools: AGENT_TOOL_DEFINITIONS, tool_choice: 'auto' } : {}),
          ...(this.config.AI_PROVIDER === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
          max_tokens: 2200,
          stream: false
        });
        const choice = data.choices?.[0];
        const message = choice?.message;
        const finishReason = String(choice?.finish_reason ?? 'unknown');
        if (finishReason === 'length')
          throw new AppError(
            502,
            'AI_RESPONSE_TRUNCATED',
            'Phản hồi AI bị cắt ngắn. Vui lòng thử lại với yêu cầu ngắn hơn.'
          );
        const content = typeof message?.content === 'string' ? message.content.trim() : '';
        const toolCalls: AgentToolCall[] = Array.isArray(message?.tool_calls)
          ? message.tool_calls.slice(0, AGENT_MAX_TOOL_CALLS_PER_ROUND).flatMap((call) => {
              const name = call?.function?.name;
              if (!call?.id || !AGENT_TOOL_NAMES.includes(name as AgentToolName)) return [];
              return [
                {
                  id: String(call.id),
                  name: name as AgentToolName,
                  argumentsText: typeof call.function?.arguments === 'string' ? call.function.arguments : '{}'
                }
              ];
            })
          : [];
        if (!content && !toolCalls.length) throw new Error('AI_EMPTY_CONTENT');
        return {
          answer: content,
          provider: this.config.AI_PROVIDER,
          model: data.model ?? provider.model,
          latencyMs: Date.now() - startedAt,
          toolCalls,
          finishReason,
          requestId,
          attemptCount: attempt
        };
      } catch (error) {
        lastError = error;
        if (error instanceof AppError || attempt === 2) break;
      }
    }
    throw this.providerError(lastError);
  }

  /** Hỏi đáp một lượt không dùng tool, kèm ảnh chụp dữ liệu liên quan. */
  async answer(question: string, snapshot: unknown, history: AssistantHistoryItem[]): Promise<AiAnswer> {
    const turn = await this.requestTurn(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.slice(-12),
        { role: 'user', content: `${question}\n\nNgữ cảnh liên quan:\n${JSON.stringify(snapshot)}` }
      ],
      false
    );
    return { answer: turn.answer, provider: turn.provider, model: turn.model, latencyMs: turn.latencyMs };
  }

  /** Đọc ảnh hóa đơn bằng mô hình thị giác (chỉ DeepSeek). Lỗi hoặc chưa cấu hình trả `null` để dùng OCR dự phòng. */
  async readReceipt(buffer: Buffer, mimeType: 'image/jpeg' | 'image/png'): Promise<ReceiptImageResult | null> {
    if (this.config.AI_PROVIDER !== 'deepseek' || !this.config.DEEPSEEK_API_KEY) return null;
    try {
      const { data } = await this.requestJson(
        'https://api.deepseek.com/chat/completions',
        this.config.DEEPSEEK_API_KEY,
        {
          model: this.config.DEEPSEEK_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Đọc hóa đơn này. Chỉ trả JSON hợp lệ gồm merchant, amount là tổng thanh toán, occurredAt dạng ISO 8601, currency, items và confidence từ 0 đến 1. Không đoán dữ liệu không nhìn thấy.'
                },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}`, detail: 'high' }
                }
              ]
            }
          ],
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          max_tokens: 1200,
          stream: false
        }
      );
      const content = data.choices?.[0]?.message?.content;
      return typeof content === 'string' && content ? (parseJsonContent(content) as ReceiptImageResult) : null;
    } catch (error) {
      logger.warn(
        {
          event: 'ai_receipt_error',
          provider: 'deepseek',
          reason: error instanceof Error ? error.message : 'AI_IMAGE_UNKNOWN_ERROR'
        },
        'ai_receipt_error'
      );
      return null;
    }
  }

  private settings() {
    if (this.config.AI_PROVIDER === 'deepseek' && this.config.DEEPSEEK_API_KEY)
      return {
        url: 'https://api.deepseek.com/chat/completions',
        apiKey: this.config.DEEPSEEK_API_KEY,
        model: this.config.DEEPSEEK_MODEL
      };
    if (this.config.AI_PROVIDER === 'openai' && this.config.OPENAI_API_KEY)
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        apiKey: this.config.OPENAI_API_KEY,
        model: this.config.OPENAI_MODEL
      };
    throw new AppError(503, 'AI_PROVIDER_NOT_CONFIGURED', 'Nhà cung cấp AI chưa được cấu hình đúng.');
  }

  private async requestJson(url: string, apiKey: string, body: unknown) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.AI_REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
    return {
      data: (await response.json()) as ChatCompletion,
      requestId: response.headers.get('x-request-id') ?? undefined
    };
  }

  private providerError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    logger.warn(
      {
        event: 'ai_provider_error',
        provider: this.config.AI_PROVIDER,
        reason: error instanceof Error ? error.message : 'AI_UNKNOWN_ERROR'
      },
      'ai_provider_error'
    );
    return new AppError(503, 'AI_PROVIDER_UNAVAILABLE', 'Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại sau.');
  }
}
