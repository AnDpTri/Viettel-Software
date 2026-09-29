import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { api, session } from '../api/client';
import { AgentView } from '../features/agent/AgentView';
import { BudgetModal, BudgetsView } from '../features/budgets/BudgetsView';
import { CategoriesView, CategoryModal } from '../features/categories/CategoriesView';
import { DashboardView } from '../features/dashboard/DashboardView';
import { ContributionModal, GoalModal, GoalsView } from '../features/goals/GoalsView';
import { NotificationBell, NotificationDrawer, useNotifications } from '../features/notifications/Notifications';
import { WelcomeModal } from '../features/onboarding/WelcomeModal';
import { PlanningView } from '../features/planning/PlanningView';
import { ProfileModal } from '../features/profile/ProfileModal';
import { ReportsView } from '../features/reports/ReportsView';
import { Coach } from '../features/tour/Coach';
import { TransactionModal } from '../features/transactions/TransactionModal';
import { TransactionsView } from '../features/transactions/TransactionsView';
import { WalletDetailModal, WalletModal, WalletsView } from '../features/wallets/WalletsView';
import { displayName, greetingText } from '../lib/format';
import { isDarkNow, applyTheme } from '../ui/theme';
import { errorMessage, useToast } from '../ui/Toast';
import { useAuth, useUser } from './auth';
import { hubOf, NAV_ITEMS, VIEW_TITLES, type View } from './navigation';
import { UiProvider, useUi } from './ui-state';

export function AppShell() {
  return (
    <UiProvider>
      <Shell />
    </UiProvider>
  );
}

function Shell() {
  const { sidebarOpen, setSidebarOpen, openModal } = useUi();
  const { welcomeRequested, consumeWelcome } = useAuth();
  const notifications = useNotifications();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.modal:not(.hidden)')) setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setSidebarOpen]);

  // Mở slide chào mừng một lần ngay sau đăng nhập/đăng ký khi người dùng mới chưa xem.
  useEffect(() => {
    if (!welcomeRequested) return;
    consumeWelcome();
    openModal('welcome', undefined);
  }, [welcomeRequested, consumeWelcome, openModal]);

  return (
    <div id="app" className={`app${sidebarOpen ? ' sidebar-open' : ''}`}>
      <Sidebar />
      <div
        id="sidebar-backdrop"
        className={`sidebar-backdrop${sidebarOpen ? ' show' : ''}`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />
      <main className="main">
        <Topbar notificationBell={<NotificationBell state={notifications} />} />
        <div className="content">
          <HubTabs />
          <DashboardView />
          <TransactionsView />
          <WalletsView />
          <CategoriesView />
          <BudgetsView />
          <GoalsView />
          <ReportsView />
          <PlanningView />
          <AgentView />
        </div>
      </main>
      <NotificationDrawer state={notifications} />
      <TransactionModal />
      <WalletModal />
      <WalletDetailModal />
      <CategoryModal />
      <BudgetModal />
      <GoalModal />
      <ContributionModal />
      <ProfileModal />
      <WelcomeModal />
      <Coach />
      <button
        id="mobile-add-transaction"
        className="mobile-fab"
        type="button"
        aria-label="Ghi giao dịch mới"
        onClick={() => openModal('transaction', null)}
      >
        ＋
      </button>
    </div>
  );
}

function Sidebar() {
  const { view, showView, sidebarOpen, setSidebarOpen, startTour } = useUi();
  const { leave } = useAuth();
  const toast = useToast();
  const activeNav = hubOf(view)?.nav ?? view;

  async function logout() {
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: session.refreshToken ? { refreshToken: session.refreshToken } : {}
      });
    } catch (error) {
      console.warn('Không thể thu hồi phiên đăng nhập:', errorMessage(error));
    } finally {
      leave();
      toast('Đã đăng xuất.');
    }
  }

  const navButton = (item: (typeof NAV_ITEMS)[number]) => (
    <button
      key={item.view}
      type="button"
      className={`nav-item${activeNav === item.view ? ' active' : ''}`}
      data-view={item.view}
      aria-current={activeNav === item.view ? 'page' : undefined}
      onClick={() => showView(item.view)}
    >
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
    </button>
  );

  return (
    <aside id="app-sidebar" className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Điều hướng chính">
      <button
        id="sidebar-close"
        className="sidebar-close"
        type="button"
        aria-label="Đóng menu"
        onClick={() => setSidebarOpen(false)}
      >
        ×
      </button>
      <a className="brand" href="#dashboard" onClick={(event) => (event.preventDefault(), showView('dashboard'))}>
        <span className="brand-mark">M</span>
        <span>Sổ Mộc</span>
      </a>
      <nav aria-label="Chức năng">
        {NAV_ITEMS.filter((item) => !item.group).map(navButton)}
        <span className="nav-label">THIẾT LẬP</span>
        {NAV_ITEMS.filter((item) => item.group === 'setup').map(navButton)}
      </nav>
      <div className="sidebar-bottom">
        <button
          id="open-help"
          type="button"
          onClick={() => {
            setSidebarOpen(false);
            startTour('main', true);
          }}
        >
          <span aria-hidden="true">?</span> Hướng dẫn nhanh
        </button>
        <a href="/api-docs/" target="_blank" rel="noreferrer">
          <span aria-hidden="true">⌘</span> Tài liệu API
        </a>
        <button id="logout-btn" type="button" onClick={logout}>
          <span aria-hidden="true">↪</span> Đăng xuất
        </button>
      </div>
    </aside>
  );
}

function Topbar({ notificationBell }: { notificationBell: ReactNode }) {
  const { view, sidebarOpen, setSidebarOpen, openModal } = useUi();
  const user = useUser();
  const { setUser } = useAuth();
  const vip = Boolean(user.isVip);
  const name = user.fullName || user.username;
  const today = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: 'long' })
    .format(new Date())
    .toUpperCase();

  async function toggleTheme() {
    const next = isDarkNow() ? 'LIGHT' : 'DARK';
    applyTheme(next);
    setUser({ ...user, theme: next });
    await api('/profile', { method: 'PATCH', body: { theme: next } }).catch(() => undefined);
  }

  return (
    <header className="topbar">
      <button
        id="menu-btn"
        className="icon-btn menu-btn"
        type="button"
        aria-label={sidebarOpen ? 'Đóng menu' : 'Mở menu'}
        aria-controls="app-sidebar"
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        ☰
      </button>
      <div className="topbar-title">
        <span id="today" className="eyebrow">
          {today}
        </span>
        <h1 id="page-title">
          {view === 'dashboard' ? (
            <>
              {greetingText()}, <span id="user-name">{displayName(user)}</span>
            </>
          ) : (
            VIEW_TITLES[view]
          )}
        </h1>
      </div>
      <div className="top-actions">
        {notificationBell}
        <button
          id="theme-btn"
          className="icon-btn"
          type="button"
          title="Chế độ sáng / tối"
          aria-label="Chuyển chế độ sáng tối"
          onClick={toggleTheme}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
          </svg>
        </button>
        <button
          id="open-transaction"
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => openModal('transaction', null)}
        >
          ＋ Ghi giao dịch
        </button>
        {vip && (
          <span id="vip-badge" className="vip-badge" title="Tài khoản VIP">
            VIP
          </span>
        )}
        <button
          id="open-profile"
          className={`avatar${vip ? ' vip' : ''}`}
          type="button"
          title="Hồ sơ cá nhân"
          aria-label="Mở hồ sơ cá nhân"
          onClick={() => openModal('profile', null)}
        >
          {name[0]?.toUpperCase()}
        </button>
      </div>
    </header>
  );
}

function HubTabs() {
  const { view, showView, planningTab, setPlanningTab } = useUi();
  const hub = hubOf(view);
  if (!hub) return <nav id="hub-tabs" className="hub-tabs hidden" aria-label="Mục con" />;
  const activeId = view === 'planning' ? planningTab : view;
  return (
    <nav id="hub-tabs" className="hub-tabs" role="tablist" aria-label="Mục con">
      {hub.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={tab.id === activeId ? 'active' : ''}
          data-hub-tab={tab.id}
          data-planning-tab={tab.planningTab}
          onClick={() => {
            if (tab.planningTab) setPlanningTab(tab.planningTab);
            if (view !== tab.view) showView(tab.view as View);
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
