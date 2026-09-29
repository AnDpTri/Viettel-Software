import { $ } from '../core/dom';
import { escapeHtml, moneyCurrency } from '../core/format';
import { state } from '../core/state';
import { renderBudgets } from './budgets';
import { renderCategories } from './categories';
import { renderGoals } from './goals';
import { renderTitle } from './navigation';
import { renderOnboarding } from './onboarding';
import { fillForm, renderTransactions } from './transactions';
import { renderWallets } from './wallets';

/** Vẽ lại toàn bộ dữ liệu đã tải: số dư, thu chi tháng, các danh sách, form giao dịch, thẻ hướng dẫn và trạng thái
 * "sổ trống" của người mới. */
export function render() {
  const name = state.user.fullName || state.user.username;
  const userName = $('#user-name');
  if (userName) userName.textContent = name.split(' ').slice(-1)[0];
  const vip = Boolean(state.user.isVip);
  $('#open-profile').textContent = name[0].toUpperCase();
  $('#open-profile').classList.toggle('vip', vip);
  $('#vip-badge').classList.toggle('hidden', !vip);
  $('#today').textContent = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: 'long' })
    .format(new Date())
    .toUpperCase();
  const baseCurrency = state.user.currency || 'VND';
  const total = state.wallets
    .filter((wallet) => !wallet.archivedAt && wallet.currency === baseCurrency)
    .reduce((sum, wallet) => sum + Number(wallet.balance), 0);
  $('#total-balance').textContent = moneyCurrency(total, baseCurrency);
  $('#income').textContent = moneyCurrency(state.summary.income, baseCurrency);
  $('#expense').textContent = moneyCurrency(state.summary.expense, baseCurrency);
  $('#net').textContent = moneyCurrency(state.summary.net, baseCurrency);
  renderTransactions();
  renderWallets();
  renderCategories();
  renderSpending();
  renderBudgets();
  renderGoals();
  fillForm();
  renderOnboarding();
  // Tổng quan của người chưa có dữ liệu: ẩn các khối 0 ₫, chỉ còn lời mời thiết lập.
  const isNew = !state.wallets.some((wallet) => !wallet.archivedAt) && !state.transactions.length;
  $('#view-dashboard').classList.toggle('is-new', isNew);
  $('#dashboard-empty').classList.toggle('hidden', !isNew || !$('#onboarding-card').classList.contains('hidden'));
  if (state.user) renderTitle(state.currentView);
}

export function renderSpending() {
  const items = state.summary.expenseByCategory || [];
  const max = Math.max(...items.map((item) => item.amount), 1);
  $('#spending-categories').innerHTML =
    items
      .slice(0, 5)
      .map(
        (item) =>
          `<div class="spending-item"><div class="spending-top"><span>${escapeHtml(item.categoryName)}</span><b>${moneyCurrency(item.amount, item.currency || state.user.currency)}</b></div><div class="progress"><span style="width:${Math.max(5, (item.amount / max) * 100)}%"></span></div></div>`
      )
      .join('') || '<div class="empty">Chưa có dữ liệu chi tiêu.</div>';
}

/** Khối "sổ trống" cho người mới, chèn ngay sau thẻ hướng dẫn. */
export function setupDashboard() {
  $('#onboarding-card').insertAdjacentHTML(
    'afterend',
    '<section id="dashboard-empty" class="panel dashboard-empty hidden"><span class="eyebrow">BẮT ĐẦU</span><h2>Sổ của bạn đang trống</h2><p>Cho Sổ Mộc biết tiền của bạn đang ở đâu và ghi khoản đầu tiên. Mất khoảng 1 phút.</p><button class="primary-btn compact" type="button" data-welcome-open>Thiết lập nhanh</button></section>'
  );
}
