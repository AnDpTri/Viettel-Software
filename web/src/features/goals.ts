import { api } from '../core/api';
import { $ } from '../core/dom';
import { escapeHtml, moneyCurrency, shortDate } from '../core/format';
import { closeNamedModal, openNamedModal } from '../core/modal';
import { state } from '../core/state';
import { toast } from '../core/toast';
import { render } from './dashboard';
import { loadData } from './session';
import type { Row } from '../core/state';

export function renderGoals() {
  $('#goal-list').innerHTML =
    state.goals
      .map((item) => {
        const currency = item.wallet?.currency || state.user.currency || 'VND';
        return `<article class="plan-card"><span class="eyebrow">${item.status === 'COMPLETED' ? 'ĐÃ HOÀN THÀNH' : item.status === 'CANCELLED' ? 'ĐÃ HỦY' : 'ĐANG THỰC HIỆN'}</span><h3>${escapeHtml(item.name)}</h3><p>${item.targetDate ? 'Hạn ' + shortDate(item.targetDate) : 'Không giới hạn thời gian'} · ${item.wallet ? 'Giữ ở ví ' + escapeHtml(item.wallet.name) : 'Chưa liên kết ví'}</p><div class="plan-numbers"><span>Đã có <b>${moneyCurrency(item.currentAmount, currency)}</b></span><span>${Math.round(item.percentCompleted)}%</span></div><div class="progress"><span style="width:${Math.min(100, item.percentCompleted)}%"></span></div><small>Đích đến ${moneyCurrency(item.targetAmount, currency)}</small><div class="plan-actions"><button data-goal-action="contribute" data-id="${item.id}">Góp tiền</button><button data-goal-action="edit" data-id="${item.id}">Sửa</button><button class="danger" data-goal-action="delete" data-id="${item.id}">Xóa</button></div></article>`;
      })
      .join('') ||
    '<div class="panel empty"><span>Chưa có mục tiêu tài chính.</span><button class="empty-action" type="button" data-empty-action="goal">Tạo mục tiêu</button></div>';
}

export function openGoalForm(goal: Row | null = null) {
  $('#goal-form').reset();
  $('#goal-id').value = goal?.id || '';
  $('#goal-modal-title').textContent = goal ? 'Chỉnh sửa mục tiêu' : 'Thêm mục tiêu';
  $('#goal-name').value = goal?.name || '';
  $('#goal-target').value = goal ? Number(goal.targetAmount) : '';
  $('#goal-wallet').innerHTML =
    '<option value="">Không liên kết</option>' +
    state.wallets
      .filter((item) => !item.archivedAt)
      .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
      .join('');
  $('#goal-wallet').value = goal?.walletId || '';
  $('#goal-date').value = goal?.targetDate ? new Date(goal.targetDate).toISOString().slice(0, 10) : '';
  $('#goal-recurring-amount').value = goal?.recurringAmount ? Number(goal.recurringAmount) : '';
  $('#goal-recurring-frequency').value = goal?.recurringFrequency || '';
  $('#goal-priority').value = goal?.priority || 0;
  openNamedModal('goal-modal');
}

/** Form mục tiêu, góp tiền (chuyển từ một ví thật sang ví tiết kiệm của mục tiêu), sửa và xóa mục tiêu. */
export function setupGoals() {
  $('#open-goal').addEventListener('click', () => openGoalForm());
  $('#goal-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('#goal-id').value;
    const body = {
      name: $('#goal-name').value,
      targetAmount: Number($('#goal-target').value),
      walletId: $('#goal-wallet').value || null,
      targetDate: $('#goal-date').value || null,
      recurringAmount: $('#goal-recurring-amount').value ? Number($('#goal-recurring-amount').value) : null,
      recurringFrequency: $('#goal-recurring-frequency').value || null,
      priority: Number($('#goal-priority').value || 0)
    };
    try {
      await api(id ? `/goals/${id}` : '/goals', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      closeNamedModal('goal-modal');
      await loadData();
      render();
      toast(id ? 'Đã cập nhật mục tiêu.' : 'Đã tạo mục tiêu.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#goal-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-goal-action]');
    if (!button) return;
    const goal = state.goals.find((item) => item.id === button.dataset.id);
    if (!goal) return;
    const action = button.dataset.goalAction;
    if (action === 'edit') {
      openGoalForm(goal);
      return;
    }
    if (action === 'contribute') {
      $('#contribution-form').reset();
      $('#contribution-goal-id').value = goal.id;
      $('#contribution-title').textContent = goal.name;
      openNamedModal('contribution-modal');
      return;
    }
    if (!confirm(`Xóa mục tiêu “${goal.name}”?`)) return;
    try {
      await api(`/goals/${goal.id}`, { method: 'DELETE' });
      await loadData();
      render();
      toast('Đã xóa mục tiêu.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#contribution-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('#contribution-goal-id').value;
    try {
      await api(`/goals/${id}/contributions`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number($('#contribution-amount').value),
          note: $('#contribution-note').value || undefined,
          fromWalletId: $('#contribution-wallet').value || undefined
        })
      });
      closeNamedModal('contribution-modal');
      await loadData();
      render();
      toast($('#contribution-wallet').value ? 'Đã chuyển tiền vào mục tiêu.' : 'Đã cập nhật tiến độ mục tiêu.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  // Mục tiêu: góp tiền từ một ví thật sang ví tiết kiệm của mục tiêu.
  $('#goal-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-goal-action="contribute"]');
    if (!button) return;
    const goal = state.goals.find((item) => item.id === button.dataset.id);
    if (!goal) return;
    const sources = goal.walletId
      ? state.wallets.filter(
          (wallet) =>
            !wallet.archivedAt &&
            wallet.id !== goal.walletId &&
            wallet.currency === (goal.wallet?.currency || wallet.currency)
        )
      : [];
    $('#contribution-wallet').innerHTML =
      sources
        .map(
          (wallet) =>
            `<option value="${wallet.id}">${escapeHtml(wallet.name)} · ${moneyCurrency(wallet.balance, wallet.currency)}</option>`
        )
        .join('') + '<option value="">Không chuyển tiền, chỉ ghi tiến độ</option>';
    $('#contribution-wallet-group').classList.toggle('hidden', !goal.walletId);
    $('#contribution-help').textContent = goal.walletId
      ? `Sổ Mộc sẽ ghi một khoản chuyển tiền từ ví đã chọn sang ví “${goal.wallet?.name || 'tiết kiệm'}”, nên số dư các ví luôn khớp với tiến độ.`
      : 'Mục tiêu này chưa liên kết ví tiết kiệm nên lần góp chỉ ghi tiến độ, không trừ tiền ở ví nào. Sửa mục tiêu để chọn ví tiết kiệm.';
  });
}
