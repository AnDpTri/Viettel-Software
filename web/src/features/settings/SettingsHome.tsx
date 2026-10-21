import { useCategories, useWallets } from '../../api/queries';
import { useUser } from '../../app/auth';
import { HUBS, type HubTab, type View } from '../../app/navigation';
import { useUi } from '../../app/ui-state';
import { ViewSection } from '../../app/view';

const SETTINGS_TABS: HubTab[] = HUBS.find((hub) => hub.nav === 'wallets')?.tabs ?? [];

/** Điện thoại: màn gốc của Thiết lập là danh sách mục; chọn một mục thì đẩy sang màn con (có nút quay lại ở đầu màn). */
export function SettingsHome() {
  const { showView, setPlanningTab } = useUi();
  const user = useUser();
  const wallets = (useWallets().data ?? []).filter((wallet) => !wallet.archivedAt);
  const categories = (useCategories().data ?? []).filter((category) => !category.archivedAt);

  const hints: Record<string, string> = {
    wallets: `${wallets.length} ví đang hoạt động`,
    categories: `${categories.length} danh mục thu chi`,
    tags: 'Gom giao dịch theo chủ đề',
    household: 'Nhóm dùng chung với người thân',
    profile: user.fullName || user.username
  };

  return (
    <ViewSection view="settings">
      <nav className="settings-home" aria-label="Các mục thiết lập">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="settings-home-item"
            data-settings-item={tab.id}
            onClick={() => {
              if (tab.planningTab) setPlanningTab(tab.planningTab);
              showView(tab.view as View);
            }}
          >
            <span>
              <strong>{tab.label}</strong>
              <small>{hints[tab.id]}</small>
            </span>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
        ))}
      </nav>
    </ViewSection>
  );
}
