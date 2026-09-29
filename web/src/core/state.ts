/* eslint-disable @typescript-eslint/no-explicit-any -- dữ liệu API giữ nguyên dạng JSON; sẽ thay bằng kiểu sinh từ OpenAPI. */

/** Một bản ghi JSON trả về từ API. */
export type Row = Record<string, any>;

export interface AppState {
  token: string;
  refreshToken: string;
  user: any;
  wallets: Row[];
  categories: Row[];
  transactions: Row[];
  budgets: Row[];
  goals: Row[];
  summary: any;
  onboarding: any;
  currentView: string;
  categoryMode: 'tree' | 'flat';
  assistantConversationId: string | null;
  assistantConversations: Row[];
  agentSettings: any;
  planningTab?: string;
}

/** Trạng thái dùng chung của giao diện: phiên đăng nhập, dữ liệu đã tải và màn hình đang mở. */
export const state: AppState = {
  token: '',
  refreshToken: '',
  user: null,
  wallets: [],
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  summary: null,
  onboarding: null,
  currentView: 'dashboard',
  categoryMode: 'tree',
  assistantConversationId: null,
  assistantConversations: [],
  agentSettings: null
};
