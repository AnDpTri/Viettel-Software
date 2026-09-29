import { $, $$ } from '../core/dom';
import { escapeHtml } from '../core/format';
import { state } from '../core/state';
import { loadAgentUi } from './agent/agent';
import { loadPlanning, selectPlanningTab } from './planning';
import { loadReports, refreshReportVisuals } from './reports';
import { scheduleViewTour } from './tour';

export function setSidebar(open) {
  $('.sidebar').classList.toggle('open', open);
  $('#sidebar-backdrop').classList.toggle('show', open);
  $('#menu-btn').setAttribute('aria-expanded', String(open));
  $('#menu-btn').setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
  document.body.classList.toggle('sidebar-open', open);
}

/** Mở một màn hình: đánh dấu menu, cập nhật URL hash (hỗ trợ nút quay lại), tải dữ liệu riêng của màn, đặt tiêu đề,
 * tab con và hướng dẫn tại chỗ. Hash không hợp lệ quay về Tổng quan. */
export function showView(
  view,
  options: { replace?: boolean; fromHistory?: boolean; keepScroll?: boolean; smooth?: boolean } = {}
) {
  if (!document.getElementById(`view-${view}`)) view = 'dashboard';
  $$('.view').forEach((item) => item.classList.toggle('active', item.id === `view-${view}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  setSidebar(false);
  if (view === 'reports') void loadReports();
  if (view === 'planning') void loadPlanning();
  if (view === 'insights') void loadAgentUi();
  state.currentView = view;
  $$('.nav-item').forEach((item) => item.setAttribute('aria-current', item.dataset.view === view ? 'page' : 'false'));
  if (!options.fromHistory) {
    const method = options.replace ? 'replaceState' : 'pushState';
    history[method]({ view }, '', `#${view}`);
  }
  if (!options.keepScroll) window.scrollTo({ top: 0, behavior: options.smooth ? 'smooth' : 'auto' });
  if (view === 'reports') void refreshReportVisuals();
  renderTitle(state.currentView);
  renderHubTabs(state.currentView);
  scheduleViewTour(state.currentView);
}

// Bố cục gọn cho người mới: menu 4 mục chính, tab con cho Tổng quan và Kế hoạch, lời chào theo giờ.
export const HUBS = [
  {
    nav: 'dashboard',
    tabs: [
      { id: 'dashboard', label: 'Tổng quan' },
      { id: 'reports', label: 'Báo cáo' }
    ]
  },
  {
    nav: 'budgets',
    tabs: [
      { id: 'budgets', label: 'Ngân sách' },
      { id: 'goals', label: 'Mục tiêu' },
      { id: 'recurring', view: 'planning', label: 'Định kỳ' },
      { id: 'bills', view: 'planning', label: 'Hóa đơn' },
      { id: 'tags', view: 'planning', label: 'Nhãn' },
      { id: 'household', view: 'planning', label: 'Gia đình' }
    ]
  }
];
export const VIEW_TITLES = {
  transactions: 'Giao dịch',
  reports: 'Báo cáo',
  budgets: 'Kế hoạch',
  goals: 'Kế hoạch',
  planning: 'Kế hoạch',
  insights: 'Trợ lý',
  wallets: 'Ví của tôi',
  categories: 'Danh mục'
};
export function hubOf(view) {
  return HUBS.find((hub) => hub.tabs.some((tab) => (tab.view || tab.id) === view));
}
export function greetingText() {
  const hour = new Date().getHours();
  return hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
}
// Tên tiếng Việt gọi bằng tên riêng (chữ cuối); chưa có họ tên thì dùng tên đăng nhập.
export function displayName() {
  const full = (state.user?.fullName || '').trim();
  return full ? full.split(/\s+/).slice(-1)[0] : state.user?.username || 'bạn';
}
export function renderTitle(view) {
  $('#page-title').innerHTML =
    view === 'dashboard'
      ? `${greetingText()}, <span id="user-name">${escapeHtml(displayName())}</span>`
      : escapeHtml(VIEW_TITLES[view] || 'Sổ Mộc');
}
export function renderHubTabs(view) {
  const hub = hubOf(view);
  const bar = $('#hub-tabs');
  bar.classList.toggle('hidden', !hub);
  if (!hub) return;
  const activeId = view === 'planning' ? state.planningTab || 'recurring' : view;
  bar.innerHTML = hub.tabs
    .map(
      (tab) =>
        `<button type="button" role="tab" aria-selected="${tab.id === activeId}" class="${tab.id === activeId ? 'active' : ''}" data-hub-tab="${tab.id}"${tab.view === 'planning' ? ` data-planning-tab="${tab.id}"` : ''}>${tab.label}</button>`
    )
    .join('');
  $$('.nav-item').forEach((item) => {
    const current = item.dataset.view === hub.nav;
    item.classList.toggle('active', current);
    item.setAttribute('aria-current', current ? 'page' : 'false');
  });
}

/** Menu chính, nút mở màn hình, menu trên mobile, điều hướng bằng URL hash và tab con của các nhóm màn hình. */
export function setupNavigation() {
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $$('[data-view-target]').forEach((button) =>
    button.addEventListener('click', () => showView(button.dataset.viewTarget))
  );
  $('#menu-btn').addEventListener('click', () => setSidebar(!$('.sidebar').classList.contains('open')));
  $('#sidebar-backdrop').addEventListener('click', () => setSidebar(false));
  $('#sidebar-close').addEventListener('click', () => setSidebar(false));
  window.addEventListener('hashchange', () => {
    if (state.user) showView(location.hash.replace('#', '') || 'dashboard', { fromHistory: true });
  });
  $('#hub-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-hub-tab]');
    if (!button) return;
    const tab = hubOf(state.currentView)?.tabs.find((item) => item.id === button.dataset.hubTab);
    if (!tab) return;
    if (tab.view === 'planning') {
      selectPlanningTab(tab.id);
      if (state.currentView === 'planning') renderHubTabs('planning');
      else showView('planning');
    } else showView(tab.id);
  });
}
