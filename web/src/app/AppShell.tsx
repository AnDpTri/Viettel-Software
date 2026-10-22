import { useEffect } from 'react';
import { AgentChatProvider } from '../features/agent/AgentView';
import { NotificationBell, useNotifications } from '../features/notifications/Notifications';
import { useIsPhone } from '../ui/useIsPhone';
import { DesktopShell } from './desktop/DesktopShell';
import { PhoneShell } from './phone/PhoneShell';
import { ChatDock, Overlays, Screens, Topbar, useChatDock, useShellEffects } from './shell-parts';
import { UiProvider, useUi } from './ui-state';

export function AppShell() {
  return (
    <UiProvider>
      <Shell />
    </UiProvider>
  );
}

/**
 * Chọn vỏ theo cỡ cửa sổ. Khung `div#app`, thanh trên, nội dung các màn, hộp thoại và ô chat luôn nằm đúng một chỗ,
 * chỉ phần khung điều hướng (DesktopShell hay PhoneShell) được thay: đổi cỡ cửa sổ không làm mất dữ liệu đang nhập.
 */
function Shell() {
  const { sidebarOpen, view, showView } = useUi();
  const isPhone = useIsPhone();
  const notifications = useNotifications();
  const dock = useChatDock();
  useShellEffects(dock.chatOpen, dock.closeChat);
  // Danh sách mục Thiết lập chỉ dành cho điện thoại; máy tính có danh sách dọc bên trái nên vào thẳng mục Ví.
  useEffect(() => {
    if (!isPhone && view === 'settings') showView('wallets', { replace: true });
  }, [isPhone, view, showView]);

  return (
    <AgentChatProvider chatOpen={dock.chatOpen}>
      <a href="#main-content" className="skip-link">
        Chuyển đến nội dung chính
      </a>
      <div id="app" className={`app ${isPhone ? 'is-phone' : 'is-desktop'}${sidebarOpen ? ' sidebar-open' : ''}`}>
        {isPhone ? <PhoneShell /> : <DesktopShell />}
        <main className="main">
          <Topbar phone={isPhone} notificationBell={<NotificationBell state={notifications} />} />
          <div className="content" id="main-content">
            <Screens />
          </div>
        </main>
        <Overlays notifications={notifications} />
        <ChatDock dock={dock} />
      </div>
    </AgentChatProvider>
  );
}
