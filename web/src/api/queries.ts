import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { localDateValue, monthStartValue } from '../lib/format';
import { api } from './client';
import type { Budget, Category, Goal, OnboardingStatus, ReportSummary, Transaction, Wallet } from './types';

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
  monthSummary: ['summary', 'month'] as const,
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

export const useBudgets = () => useQuery({ queryKey: queryKeys.budgets, queryFn: () => api<Budget[]>('/budgets') });

export const useGoals = () => useQuery({ queryKey: queryKeys.goals, queryFn: () => api<Goal[]>('/goals') });

/** Thu chi tháng hiện tại cho Tổng quan. */
export const useMonthSummary = () =>
  useQuery({
    queryKey: queryKeys.monthSummary,
    queryFn: () =>
      api<ReportSummary>(`/reports/summary?${new URLSearchParams({ from: monthStartValue(), to: localDateValue() })}`)
  });

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
