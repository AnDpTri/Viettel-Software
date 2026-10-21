import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { monthBounds } from '../lib/month';
import { api, apiPage } from './client';
import type {
  Bill,
  Budget,
  Category,
  Goal,
  OnboardingStatus,
  RecurringRule,
  ReportSummary,
  Transaction,
  Wallet
} from './types';

export type TransactionFilters = {
  type?: string;
  walletId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  keyword?: string;
};

export function transactionQuery(filters: TransactionFilters = {}, includeLimit = true) {
  const params = new URLSearchParams();
  if (includeLimit) params.set('limit', '100');
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

export const queryKeys = {
  wallets: ['wallets'] as const,
  categories: ['categories'] as const,
  transactions: (filters: TransactionFilters = {}) => ['transactions', filters] as const,
  budgets: ['budgets'] as const,
  goals: ['goals'] as const,
  monthSummary: (month: string) => ['summary', 'month', month] as const,
  onboarding: ['onboarding'] as const
};

export const useWallets = () =>
  useQuery({ queryKey: queryKeys.wallets, queryFn: () => api<Wallet[]>('/wallets?includeArchived=true') });

export const useCategories = () =>
  useQuery({ queryKey: queryKeys.categories, queryFn: () => api<Category[]>('/categories?tree=false') });

export const useTransactions = (filters: TransactionFilters = {}) =>
  useQuery({
    queryKey: queryKeys.transactions(filters),
    queryFn: () => api<Transaction[]>(`/transactions?${transactionQuery(filters)}`)
  });

export const TRANSACTION_PAGE_SIZE = 20;

/** Danh sách giao dịch tải dần từng trang 20 dòng; trả kèm tổng số bản ghi khớp bộ lọc. */
export const useTransactionPages = (filters: TransactionFilters = {}) =>
  useInfiniteQuery({
    queryKey: ['transactions', 'pages', filters] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const params = transactionQuery(filters, false);
      params.set('limit', String(TRANSACTION_PAGE_SIZE));
      params.set('page', String(pageParam));
      return apiPage<Transaction>(`/transactions?${params}`);
    },
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined)
  });

export const useBudgets = () => useQuery({ queryKey: queryKeys.budgets, queryFn: () => api<Budget[]>('/budgets') });

export const useGoals = () => useQuery({ queryKey: queryKeys.goals, queryFn: () => api<Goal[]>('/goals') });

export const useGoalDetail = (id: string, enabled = true) =>
  useQuery({
    queryKey: ['goals', id],
    queryFn: () => api<Goal>(`/goals/${id}`),
    enabled: Boolean(id) && enabled
  });

export interface NetWorthData {
  generatedAt: string;
  byCurrency: Record<string, number>;
  monthlyChange: Array<{ month: string; values: Record<string, number> }>;
}

export const useNetWorth = (enabled = true) =>
  useQuery({
    queryKey: ['reports', 'net-worth'],
    queryFn: () => api<NetWorthData>('/reports/net-worth'),
    enabled
  });

/** Báo cáo 12 tháng gần nhất phục vụ vẽ biểu đồ tài sản ròng và thu chi theo tháng. */
export const useReportsPeriodSummary = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => api<ReportSummary>(`/reports/summary?${new URLSearchParams({ from, to })}`),
    enabled
  });

/** Thu chi của một tháng (`YYYY-MM`) cho Tổng quan. */
export const useMonthSummary = (month: string) =>
  useQuery({
    queryKey: queryKeys.monthSummary(month),
    queryFn: () => {
      const { from, to } = monthBounds(month);
      return api<ReportSummary>(`/reports/summary?${new URLSearchParams({ from, to })}`);
    }
  });

/** Giao dịch mới nhất của một tháng (tối đa 100). */
export const useMonthTransactions = (month: string) => {
  const { from, to } = monthBounds(month);
  return useTransactions({ from, to });
};

/** Mọi khoản chi của một tháng, đọc hết các trang (mỗi trang tối đa 100) để vẽ đường lũy kế đúng. */
export const useMonthExpenses = (month: string) =>
  useQuery({
    queryKey: ['transactions', 'month-expenses', month],
    queryFn: async () => {
      const { from, to } = monthBounds(month);
      const all: Transaction[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const params = new URLSearchParams({ from, to, type: 'EXPENSE', limit: '100', page: String(page) });
        const rows = await api<Transaction[]>(`/transactions?${params}`);
        all.push(...rows);
        if (rows.length < 100) break;
      }
      return all;
    }
  });

export const useRecurringRules = (enabled = true) =>
  useQuery({
    queryKey: ['planning', 'recurring'],
    queryFn: () => api<RecurringRule[]>('/productivity/recurring'),
    enabled
  });

export const useBills = (enabled = true) =>
  useQuery({ queryKey: ['planning', 'bills'], queryFn: () => api<Bill[]>('/productivity/bills'), enabled });

export const useOnboarding = () =>
  useQuery({ queryKey: queryKeys.onboarding, queryFn: () => api<OnboardingStatus>('/profile/onboarding') });

/** Làm mới mọi dữ liệu sổ sách sau khi ghi (giao dịch, ví, danh mục…), vì số dư và báo cáo phụ thuộc lẫn nhau. */
export function refreshLedger(client: QueryClient) {
  return Promise.all(
    [
      queryKeys.wallets,
      queryKeys.categories,
      ['transactions'],
      queryKeys.budgets,
      queryKeys.goals,
      ['summary'],
      queryKeys.onboarding,
      ['reports']
    ].map((queryKey) => client.invalidateQueries({ queryKey }))
  );
}

export function useRefreshLedger() {
  const client = useQueryClient();
  return () => refreshLedger(client);
}
