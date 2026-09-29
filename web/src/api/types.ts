/** Kiểu dữ liệu trả về từ REST API (phần `data` của phong bì phản hồi). Số tiền kiểu Decimal được API trả dạng chuỗi. */

export type Money = string | number;
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type WalletType = 'CASH' | 'BANK' | 'E_WALLET' | 'CREDIT' | 'OTHER';
export type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK';

export interface User {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  timezone: string;
  currency: string;
  locale: string;
  theme: ThemePreference;
  isVip?: boolean;
  vipExpiresAt?: string | null;
}

export interface AuthPayload {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Wallet {
  id: string;
  name: string;
  type: WalletType;
  currency: string;
  balance: Money;
  openingBalance: Money;
  institutionName: string | null;
  color: string | null;
  creditLimit: Money | null;
  billingDay: number | null;
  dueDay: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  parentId: string | null;
  icon: string | null;
  color: string | null;
  archivedAt?: string | null;
}

export interface Receipt {
  id: string;
  originalName: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: Money;
  walletId: string;
  destinationWalletId: string | null;
  categoryId: string | null;
  payee: string | null;
  status: string;
  paymentMethod: string | null;
  reference: string | null;
  location: string | null;
  note: string | null;
  occurredAt: string;
  wallet: { name: string; currency: string };
  destinationWallet: { name: string } | null;
  category: { name: string } | null;
  receipts?: Receipt[];
}

export interface Budget {
  id: string;
  name: string;
  amount: Money;
  categoryId: string | null;
  category: { name: string } | null;
  startDate: string;
  endDate: string;
  recurrence: string | null;
  rollover: boolean;
  spent: number;
  remaining: number;
  percentUsed: number;
  currency?: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: Money;
  currentAmount: Money;
  walletId: string | null;
  wallet: { name: string; currency: string } | null;
  targetDate: string | null;
  recurringAmount: Money | null;
  recurringFrequency: string | null;
  priority: number;
  status: string;
  percentCompleted: number;
}

export interface CurrencyTotals {
  currency: string;
  income: number;
  expense: number;
  net: number;
}

export interface ReportSummary extends CurrencyTotals {
  byCurrency?: CurrencyTotals[];
  expenseByCategory?: Array<{ categoryName: string; amount: number; currency?: string }>;
  monthly?: Array<{ month: string; income: number; expense: number }>;
}

export interface Reconciliation {
  wallets: Array<{
    walletName: string;
    archived: boolean;
    currency: string;
    openingBalance: Money;
    calculatedBalance: Money;
  }>;
}

export interface OnboardingStep {
  id: string;
  title: string;
  actionLabel: string;
  completed: boolean;
}

export interface OnboardingStatus {
  completed: boolean;
  dismissed: boolean;
  welcomeSeen: boolean;
  completedCount: number;
  totalSteps: number;
  progressPercent: number;
  steps: OnboardingStep[];
  interests?: string[];
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface SessionInfo {
  familyId: string;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
}

export interface RecurringRule {
  id: string;
  name: string;
  amount: Money;
  frequency: string;
  nextRunAt: string;
  autoPost: boolean;
  wallet: { currency: string };
}

export interface Bill {
  id: string;
  name: string;
  amount: Money;
  dueAt: string;
  status: string;
  wallet: { currency: string } | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  members: unknown[];
}

export type AgentActionStatus = 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'UNDONE' | 'EXPIRED' | 'FAILED';

export interface AgentAction {
  id: string;
  batchId: string | null;
  type: string;
  risk: string;
  status: AgentActionStatus;
  preview: Record<string, unknown> | null;
  createdAt: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: string | null;
  model: string | null;
  status: string;
  errorCode: string | null;
  createdAt: string;
}

export interface AgentConversation {
  id: string;
  title: string;
}

export interface AgentSettings {
  provider: string;
  externalAiEnabled: boolean;
  consent: boolean;
  unlimited: boolean;
  dailyLimit: number | null;
  remainingToday: number | null;
  disclosure: string[];
}

export interface AgentAttachment {
  label: string;
  url: string;
  filename?: string;
}

export interface AgentUiAction {
  type: string;
  view: string;
  label: string;
}

export interface AgentReply {
  conversationId: string;
  answer: string;
  provider: string;
  model: string;
  actions: AgentAction[];
  attachments: AgentAttachment[];
  uiActions: AgentUiAction[];
  onboarding?: OnboardingStatus;
}
