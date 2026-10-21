import { Icon } from '../../ui/Icon';
import { navOf, NAV_ITEMS } from '../navigation';
import { Sidebar } from '../shell-parts';
import { useUi } from '../ui-state';

/**
 * Phần khung của giao diện điện thoại: menu trượt tài khoản (mở bằng nút menu) và thanh tab dưới đáy
 * với bốn mục và nút + ghi giao dịch to ở giữa. Nội dung các màn do AppShell đặt một chỗ cố định.
 */
export function PhoneShell() {
  const { view, planningTab, showView, sidebarOpen, setSidebarOpen, openModal } = useUi();
  const activeNav = navOf(view, planningTab);

  const tab = (item: (typeof NAV_ITEMS)[number]) => (
    <button
      key={item.view}
      type="button"
      className={`tab-item${activeNav === item.view ? ' active' : ''}`}
      data-view={item.view}
      aria-current={activeNav === item.view ? 'page' : undefined}
      onClick={() => showView(item.view)}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </button>
  );

  return (
    <>
      <Sidebar phone />
      <div
        id="sidebar-backdrop"
        className={`sidebar-backdrop${sidebarOpen ? ' show' : ''}`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />
      <nav className="tabbar" aria-label="Chức năng">
        {NAV_ITEMS.slice(0, 2).map(tab)}
        <button
          id="mobile-add-transaction"
          className="tab-add"
          type="button"
          aria-label="Ghi giao dịch mới"
          onClick={() => openModal('quick', null)}
        >
          <Icon name="plus" />
        </button>
        {NAV_ITEMS.slice(2).map(tab)}
      </nav>
    </>
  );
}
