import type { TransactionType } from '@prisma/client';

export type AssistantHistoryItem = { role: 'user' | 'assistant'; content: string };
export type AiAnswer = { answer: string; provider: 'openai' | 'deepseek'; model: string; latencyMs: number };

export const AGENT_TOOL_NAMES = [
  'SEARCH_TRANSACTIONS',
  'FINANCIAL_SUMMARY',
  'EXPORT_TRANSACTIONS_CSV',
  'LIST_UPCOMING_BILLS',
  'GET_ONBOARDING_STATUS',
  'LIST_WALLETS',
  'LIST_CATEGORIES',
  'GET_APP_GUIDE',
  'CREATE_TRANSACTION',
  'UPDATE_TRANSACTION',
  'DELETE_TRANSACTION',
  'CREATE_TRANSFER',
  'BULK_CATEGORIZE',
  'CREATE_BUDGET',
  'UPDATE_BUDGET',
  'DELETE_BUDGET',
  'CREATE_GOAL',
  'UPDATE_GOAL',
  'CONTRIBUTE_GOAL',
  'PAUSE_GOAL',
  'DELETE_GOAL',
  'CREATE_WALLET',
  'UPDATE_WALLET',
  'ARCHIVE_WALLET',
  'CREATE_CATEGORY',
  'CREATE_STARTER_CATEGORIES',
  'UPDATE_CATEGORY',
  'ARCHIVE_CATEGORY',
  'CREATE_BILL',
  'PAY_BILL',
  'CREATE_RECURRING',
  'CREATE_AUTOMATION_RULE',
  'RECONCILE_WALLET',
  'SAVE_MEMORY',
  'LIST_MEMORIES',
  'DELETE_MEMORY',
  'GET_CONVERSATION_HISTORY',
  'PREVIEW_DATA_RESET',
  'EXPORT_DATA_BACKUP'
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];
/** Một lượt hỏi có thể cần nhiều bản ghi (danh mục + danh mục con + nhiều khoản chi), nên cho phép nhiều lời gọi tool
 * hơn: tối đa 10 lời gọi trong một vòng và 20 trong cả lượt. Vượt giới hạn vòng thì các lời gọi thừa bị bỏ qua. */
export const AGENT_MAX_TOOL_CALLS_PER_ROUND = 10;
export const AGENT_MAX_TOOL_CALLS_PER_TURN = 20;
/** Số vòng gọi mô hình tối đa mỗi lượt. Yêu cầu nhiều bước phụ thuộc nhau thường được mô hình làm tuần tự mỗi vòng một
 * bước (tra danh mục → tạo danh mục cha → danh mục con → khoản chi → trả lời), nên cần hơn 4 vòng. */
export const AGENT_MAX_ROUNDS = 6;
export type AgentProposal = { tool: AgentToolName; arguments: Record<string, unknown> };
export type AgentToolCall = { id: string; name: AgentToolName; argumentsText: string };
export type AgentChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};
export type AgentModelTurn = AiAnswer & {
  toolCalls: AgentToolCall[];
  finishReason: string;
  requestId?: string;
  attemptCount: number;
};

/** Ví/danh mục đang chờ xác nhận trong cùng một lượt chat. Tool ghi đến sau trong lượt đó được tham chiếu nó theo
 * tên (ví dụ tạo danh mục cha, danh mục con và khoản chi trong danh mục con cùng lúc); khi xác nhận cả nhóm, `ref`
 * được thay bằng ID thật theo đúng thứ tự tạo. */
export type PendingEntity = {
  ref: string;
  kind: 'wallet' | 'category';
  name: string;
  type?: TransactionType;
  currency?: string;
};

export type RecentAgentAction = { title: string; status: string; createdAt: string };
