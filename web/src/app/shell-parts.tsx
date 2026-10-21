import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, session } from '../api/client';
import { AgentView } from '../features/agent/AgentView';
import { BudgetModal, BudgetsView } from '../features/budgets/BudgetsView';
import { CategoriesView, CategoryModal } from '../features/categories/CategoriesView';
import { DashboardView } from '../features/dashboard/DashboardView';
import { ContributionModal, GoalModal, GoalsView } from '../features/goals/GoalsView';
import { NotificationDrawer, type useNotifications } from '../features/notifications/Notifications';
import { WelcomeModal } from '../features/onboarding/WelcomeModal';
import { PlanningView } from '../features/planning/PlanningView';
import { ProfileModal } from '../features/profile/ProfileModal';
import { ReportsView } from '../features/reports/ReportsView';
import { Coach } from '../features/tour/Coach';
import { TransactionModal } from '../features/transactions/TransactionModal';
import { TransactionsView } from '../features/transactions/TransactionsView';
import { WalletDetailModal, WalletModal, WalletsView } from '../features/wallets/WalletsView';
import { displayName, greetingText } from '../lib/format';
import { DEMO_USERNAME, DEMO_WELCOME_KEY, storageGet, storageSet } from '../lib/storage';
import { BrandMark, Icon } from '../ui/Icon';
import { isDarkNow, applyTheme } from '../ui/theme';
import { errorMessage, useToast } from '../ui/Toast';
import { useAuth, useUser } from './auth';
import { HUBS, navOf, NAV_ITEMS, VIEW_TITLES, type View } from './navigation';
import { useUi } from './ui-state';

/** Hiệu ứng toàn vỏ: Escape, chào mừng sau đăng nhập, xem thử cho tài khoản demo. Dùng chung cho hai vỏ. */
export function useShellEffects(chatOpen: boolean, closeChat: () => void) {
  const { setSidebarOpen, openModal, view } = useUi();
  const { welcomeRequested, consumeWelcome } = useAuth();
  const user = useUser();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.modal:not(.hidden)')) return;
      setSidebarOpen(false);
      if (chatOpen) closeChat();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setSidebarOpen, chatOpen, closeChat]);

  // Vào trang Trợ lý đầy đủ thì ô chat nổi không còn cần thiết.
  useEffect(() => {
    if (view === 'insights') closeChat();
  }, [view, closeChat]);

  // Mở slide chào mừng một lần ngay sau đăng nhập/đăng ký khi người dùng mới chưa xem.
  useEffect(() => {
    if (!welcomeRequested) return;
    consumeWelcome();
    openModal('welcome', undefined);
  }, [welcomeRequested, consumeWelcome, openModal]);

  // Tài khoản demo dùng chung đã có dữ liệu mẫu nên không tự hiện hướng dẫn người mới: mở bản xem thử một lần trên
  // mỗi trình duyệt để người đánh giá thấy luồng thiết lập (không ghi gì); xem lại ở Hồ sơ › Làm lại thiết lập ban đầu.
  useEffect(() => {
    if (user.username !== DEMO_USERNAME || storageGet(DEMO_WELCOME_KEY)) return;
    storageSet(DEMO_WELCOME_KEY, '1');
    openModal('welcome', 'preview');
  }, [user.username, openModal]);
}

/** Ô chat nổi: trạng thái mở/đóng nằm ở vỏ chung nên đổi cỡ cửa sổ không làm mất cuộc trò chuyện đang mở. */
export function useChatDock() {
  const [chatOpen, setChatOpen] = useState(false);
  const chatFabRef = useRef<HTMLButtonElement>(null);
  const closeChat = useCallback(() => {
    setChatOpen(false);
    // Trả tiêu điểm về nút FAB khi đóng ô chat nổi.
    requestAnimationFrame(() => chatFabRef.current?.focus());
  }, []);
  return { chatOpen, setChatOpen, chatFabRef, closeChat };
}

export function ChatDock({ dock }: { dock: ReturnType<typeof useChatDock> }) {
  const { view } = useUi();
  const { chatOpen, setChatOpen, chatFabRef, closeChat } = dock;
  return (
    <>
      {view !== 'insights' && !chatOpen && (
        <button
          ref={chatFabRef}
          id="chat-fab"
          className="chat-fab"
          type="button"
          aria-label="Mở trợ lý"
          aria-haspopup="dialog"
          onClick={() => setChatOpen(true)}
        >
          <Icon name="chat" />
        </button>
      )}
      {chatOpen && view !== 'insights' && <AgentView dock onClose={closeChat} />}
    </>
  );
}

/** Mọi màn hình. Luôn có trong DOM; vỏ nào cũng đặt đúng một bản này nên trạng thái màn không mất khi đổi vỏ. */
export function Screens() {
  return (
    <>
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
    </>
  );
}

export function Overlays({ notifications }: { notifications: ReturnType<typeof useNotifications> }) {
  return (
    <>
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
    </>
  );
}

function useLogout() {
  const { leave } = useAuth();
  const toast = useToast();
  return async function logout() {
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
  };
}

/** Hướng dẫn nhanh, tài liệu API, đăng xuất: cuối thanh bên (máy tính) và trong menu trượt (điện thoại). */
function AccountLinks() {
  const { setSidebarOpen, startTour } = useUi();
  const logout = useLogout();
  return (
    <div className="sidebar-bottom">
      <button
        id="open-help"
        type="button"
        title="Hướng dẫn nhanh"
        onClick={() => {
          setSidebarOpen(false);
          startTour('main', true);
        }}
      >
        <Icon name="help" /> <span className="label">Hướng dẫn nhanh</span>
      </button>
      <a href="/api-docs/" target="_blank" rel="noreferrer" title="Tài liệu API">
        <Icon name="code" /> <span className="label">Tài liệu API</span>
      </a>
      <button id="logout-btn" type="button" title="Đăng xuất" onClick={logout}>
        <Icon name="logout" /> <span className="label">Đăng xuất</span>
      </button>
    </div>
  );
}

/** Thanh bên (máy tính; từ 761 tới 1100px thu thành thanh ngang trên cùng) hoặc menu trượt tài khoản (điện thoại). */
export function Sidebar({ phone }: { phone: boolean }) {
  const { view, showView, sidebarOpen, setSidebarOpen, planningTab } = useUi();
  const activeNav = navOf(view, planningTab);

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
        <BrandMark />
        <span>Sổ Mộc</span>
      </a>
      {!phone && (
        <nav aria-label="Chức năng">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              type="button"
              className={`nav-item${activeNav === item.view ? ' active' : ''}`}
              data-view={item.view}
              aria-current={activeNav === item.view ? 'page' : undefined}
              onClick={() => showView(item.view)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
      )}
      <AccountLinks />
    </aside>
  );
}

export function Topbar({ phone, notificationBell }: { phone: boolean; notificationBell: ReactNode }) {
  const { view, planningTab, sidebarOpen, setSidebarOpen, openModal } = useUi();
  const user = useUser();
  const { setUser } = useAuth();
  const vip = Boolean(user.isVip);
  const name = user.fullName || user.username;
  const today = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const nav = navOf(view, planningTab);
  const title = view === 'insights' ? VIEW_TITLES.insights : (NAV_ITEMS.find((item) => item.view === nav)?.label ?? '');

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
        aria-expanded={phone ? sidebarOpen : undefined}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Icon name="menu" />
      </button>
      <div className="topbar-title">
        <h1 id="page-title">
          {view === 'dashboard' ? (
            <>
              {greetingText()}, <span id="user-name">{displayName(user)}</span>
            </>
          ) : (
            title
          )}
        </h1>
        <span id="today" className="topbar-date">
          {today}
        </span>
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
        {!phone && (
          <button
            id="open-transaction"
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => openModal('transaction', null)}
          >
            + Ghi giao dịch
          </button>
        )}
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
  const { view, showView, planningTab, setPlanningTab, openModal } = useUi();
  const nav = navOf(view, planningTab);
  const hub = HUBS.find((item) => item.nav === nav);
  if (!hub) return <nav id="hub-tabs" className="hub-tabs hidden" aria-label="Mục con" />;
  const activeId = view === 'planning' ? planningTab : view;
  return (
    <nav id="hub-tabs" className="hub-tabs" role="tablist" aria-label="Mục con">
      {hub.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={!tab.action && tab.id === activeId}
          className={!tab.action && tab.id === activeId ? 'active' : ''}
          data-hub-tab={tab.id}
          data-planning-tab={tab.planningTab}
          onClick={() => {
            if (tab.action === 'profile') return openModal('profile', null);
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
