import type { IconName } from '../ui/Icon';

export const VIEWS = [
  'dashboard',
  'transactions',
  'wallets',
  'categories',
  'budgets',
  'goals',
  'reports',
  'planning',
  'insights'
] as const;

export type View = (typeof VIEWS)[number];
export type PlanningTab = 'recurring' | 'bills' | 'tags' | 'household';

export const isView = (value: string): value is View => (VIEWS as readonly string[]).includes(value);

/** Tiêu đề thanh trên cùng theo màn hình (Tổng quan dùng lời chào). */
export const VIEW_TITLES: Record<View, string> = {
  dashboard: 'Tổng quan',
  transactions: 'Giao dịch',
  wallets: 'Ví của tôi',
  categories: 'Danh mục',
  budgets: 'Kế hoạch',
  goals: 'Kế hoạch',
  reports: 'Báo cáo',
  planning: 'Kế hoạch',
  insights: 'Trợ lý'
};

export const NAV_ITEMS: Array<{ view: View; icon: IconName; label: string; group?: 'setup' }> = [
  { view: 'dashboard', icon: 'home', label: 'Tổng quan' },
  { view: 'transactions', icon: 'swap', label: 'Giao dịch' },
  { view: 'budgets', icon: 'plan', label: 'Kế hoạch' },
  { view: 'insights', icon: 'assistant', label: 'Trợ lý' },
  { view: 'wallets', icon: 'wallet', label: 'Ví của tôi', group: 'setup' },
  { view: 'categories', icon: 'category', label: 'Danh mục', group: 'setup' }
];

export interface HubTab {
  id: string;
  label: string;
  view: View;
  planningTab?: PlanningTab;
}

/** Nhóm màn hình dùng chung một mục menu, chuyển qua lại bằng tab con. */
export const HUBS: Array<{ nav: View; tabs: HubTab[] }> = [
  {
    nav: 'dashboard',
    tabs: [
      { id: 'dashboard', label: 'Tổng quan', view: 'dashboard' },
      { id: 'reports', label: 'Báo cáo', view: 'reports' }
    ]
  },
  {
    nav: 'budgets',
    tabs: [
      { id: 'budgets', label: 'Ngân sách', view: 'budgets' },
      { id: 'goals', label: 'Mục tiêu', view: 'goals' },
      { id: 'recurring', label: 'Định kỳ', view: 'planning', planningTab: 'recurring' },
      { id: 'bills', label: 'Hóa đơn', view: 'planning', planningTab: 'bills' },
      { id: 'tags', label: 'Nhãn', view: 'planning', planningTab: 'tags' },
      { id: 'household', label: 'Gia đình', view: 'planning', planningTab: 'household' }
    ]
  }
];

export const hubOf = (view: View) => HUBS.find((hub) => hub.tabs.some((tab) => tab.view === view));

/** Màn hình ban đầu lấy từ URL hash (ví dụ `/#budgets`); hash không hợp lệ về Tổng quan. */
export function viewFromHash(): View {
  const hash = location.hash.replace('#', '');
  return isView(hash) ? hash : 'dashboard';
}
