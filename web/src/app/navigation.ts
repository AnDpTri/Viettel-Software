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
  'insights',
  /** Hồ sơ cá nhân dạng màn trong Thiết lập. */
  'profile',
  /** Danh sách các mục Thiết lập (điện thoại: màn gốc, chọn mục thì đẩy sang màn con). */
  'settings'
] as const;

export type View = (typeof VIEWS)[number];
export type PlanningTab = 'recurring' | 'bills' | 'tags' | 'household';

export const isView = (value: string): value is View => (VIEWS as readonly string[]).includes(value);

/** Tiêu đề thanh trên cùng theo màn hình (Tổng quan dùng lời chào). Tên theo mục menu chứa màn đó. */
export const VIEW_TITLES: Record<View, string> = {
  dashboard: 'Tổng quan',
  transactions: 'Giao dịch',
  wallets: 'Thiết lập',
  categories: 'Thiết lập',
  budgets: 'Kế hoạch',
  goals: 'Kế hoạch',
  reports: 'Tổng quan',
  planning: 'Kế hoạch',
  insights: 'Trợ lý',
  profile: 'Thiết lập',
  settings: 'Thiết lập'
};

/** Bốn mục điều hướng chính, dùng chung cho thanh bên (máy tính) và thanh tab dưới đáy (điện thoại). */
export const NAV_ITEMS: Array<{ view: View; icon: IconName; label: string }> = [
  { view: 'dashboard', icon: 'home', label: 'Tổng quan' },
  { view: 'transactions', icon: 'swap', label: 'Giao dịch' },
  { view: 'budgets', icon: 'plan', label: 'Kế hoạch' },
  { view: 'wallets', icon: 'wallet', label: 'Thiết lập' }
];

export interface HubTab {
  id: string;
  label: string;
  view: View;
  planningTab?: PlanningTab;
  /** Các tab con của màn `planning` cùng hiển thị dưới tab này (Khoản định kỳ gồm cả hóa đơn). */
  alsoPlanning?: PlanningTab[];
}

/** Nhóm màn hình dùng chung một mục menu, chuyển qua lại bằng tab con. */
export const HUBS: Array<{ nav: View; tabs: HubTab[] }> = [
  {
    nav: 'dashboard',
    tabs: [
      { id: 'dashboard', label: 'Tổng quan', view: 'dashboard' },
      { id: 'reports', label: 'Phân tích', view: 'reports' }
    ]
  },
  {
    nav: 'budgets',
    tabs: [
      { id: 'budgets', label: 'Ngân sách', view: 'budgets' },
      { id: 'goals', label: 'Mục tiêu', view: 'goals' },
      { id: 'recurring', label: 'Khoản định kỳ', view: 'planning', planningTab: 'recurring', alsoPlanning: ['bills'] }
    ]
  },
  {
    nav: 'wallets',
    tabs: [
      { id: 'wallets', label: 'Ví', view: 'wallets' },
      { id: 'categories', label: 'Danh mục', view: 'categories' },
      { id: 'tags', label: 'Nhãn', view: 'planning', planningTab: 'tags' },
      { id: 'household', label: 'Gia đình', view: 'planning', planningTab: 'household' },
      { id: 'profile', label: 'Hồ sơ', view: 'profile' }
    ]
  }
];

/** Mục menu chứa màn hình này; màn `planning` thuộc Kế hoạch hay Thiết lập tùy tab con đang mở. */
export const hubOf = (view: View, planningTab?: PlanningTab) =>
  HUBS.find((hub) =>
    hub.tabs.some(
      (tab) =>
        tab.view === view &&
        (view !== 'planning' ||
          !planningTab ||
          tab.planningTab === planningTab ||
          Boolean(tab.alsoPlanning?.includes(planningTab)))
    )
  );

/** Mã tab con đang mở trong hub (khoản định kỳ và hóa đơn dùng chung một tab). */
export function activeTabId(view: View, planningTab: PlanningTab): string {
  if (view !== 'planning') return view;
  return planningTab === 'bills' ? 'recurring' : planningTab;
}

/** Tên mục menu đang mở (để tô sáng và đặt tiêu đề); `insights` không thuộc mục nào. */
export const navOf = (view: View, planningTab?: PlanningTab): View | undefined =>
  view === 'settings'
    ? 'wallets'
    : (hubOf(view, planningTab)?.nav ?? (NAV_ITEMS.some((item) => item.view === view) ? view : undefined));

/** Màn hình ban đầu lấy từ URL hash (ví dụ `/#budgets`); hash không hợp lệ về Tổng quan. */
export function viewFromHash(): View {
  const hash = location.hash.replace('#', '');
  return isView(hash) ? hash : 'dashboard';
}
