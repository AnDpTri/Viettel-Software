import { api } from '../core/api';
import { $, $$ } from '../core/dom';
import { escapeHtml, localDateValue, moneyCurrency, shortDate } from '../core/format';
import { state } from '../core/state';
import { toast } from '../core/toast';
import { AGENT_ENUM_LABELS } from './agent/agent-view';
import { render } from './dashboard';
import { loadData } from './session';

export async function loadPlanning() {
  try {
    const [recurring, bills, tags, households] = await Promise.all([
      api('/productivity/recurring'),
      api('/productivity/bills'),
      api('/productivity/tags'),
      api('/productivity/households')
    ]);
    const walletOptions =
      '<option value="">Chọn ví</option>' +
      state.wallets
        .filter((item) => !item.archivedAt)
        .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
        .join('');
    $('#recurring-wallet').innerHTML = walletOptions;
    $('#bill-wallet').innerHTML = walletOptions;
    $('#recurring-list').innerHTML =
      recurring
        .map(
          (item) =>
            `<article class="feature-row"><div><strong>${escapeHtml(item.name)}</strong><small>${AGENT_ENUM_LABELS[item.frequency] || item.frequency} · kỳ tới ${shortDate(item.nextRunAt)}${item.autoPost ? ' · tự động ghi' : ''}</small></div><b>${moneyCurrency(item.amount, item.wallet.currency)}</b><button data-recurring-delete="${item.id}" class="danger">Xóa</button></article>`
        )
        .join('') || '<div class="empty">Chưa có giao dịch định kỳ.</div>';
    $('#bill-list').innerHTML =
      bills
        .map(
          (item) =>
            `<article class="feature-row"><div><strong>${escapeHtml(item.name)}</strong><small>Hạn ${shortDate(item.dueAt)} · ${{ UPCOMING: 'Sắp tới', PAID: 'Đã trả', OVERDUE: 'Quá hạn', SKIPPED: 'Bỏ qua' }[item.status] || item.status}</small></div><b>${moneyCurrency(item.amount, item.wallet?.currency || state.user.currency)}</b>${item.status !== 'PAID' ? `<button data-bill-pay="${item.id}">Đã trả</button>` : ''}<button data-bill-delete="${item.id}" class="danger">Xóa</button></article>`
        )
        .join('') || '<div class="empty">Chưa có hóa đơn cần nhắc.</div>';
    $('#tag-list').innerHTML =
      tags
        .map(
          (item) =>
            `<button class="tag-chip" style="--tag-color:${item.color || '#23654f'}" data-tag-delete="${item.id}" title="Xóa nhãn">${escapeHtml(item.name)} ×</button>`
        )
        .join('') || '<span class="muted">Chưa có nhãn.</span>';
    $('#household-list').innerHTML =
      households
        .map(
          (item) =>
            `<article class="feature-row"><div><strong>${escapeHtml(item.name)}</strong><small>${item.members.length} thành viên · Mã mời <code>${item.inviteCode}</code></small></div></article>`
        )
        .join('') || '<div class="empty">Chưa tham gia nhóm gia đình.</div>';
  } catch (error) {
    toast(error.message, true);
  }
}

// Bốn khối của màn Định kỳ/Hóa đơn/Nhãn/Gia đình hiện từng khối một, chọn bằng tab con của Kế hoạch.
export function setupPlanningTabs() {
  const view = $('#view-planning');
  if (!view) return;
  const ids = ['recurring', 'bills', 'tags', 'household'];
  [...view.querySelectorAll('.automation-grid > .panel')].forEach((panel, index) => {
    panel.dataset.planningPanel = ids[index];
    panel.classList.toggle('hidden', index !== 0);
  });
  view.querySelectorAll('.automation-grid').forEach((grid) => grid.classList.add('planning-tab-grid'));
}
export function selectPlanningTab(id) {
  state.planningTab = id;
  $$('#view-planning [data-planning-panel]').forEach((panel) =>
    panel.classList.toggle('hidden', panel.dataset.planningPanel !== id)
  );
}

/** Giao dịch định kỳ, hóa đơn, nhãn và nhóm gia đình. */
export function setupPlanning() {
  $('#recurring-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/productivity/recurring', {
        method: 'POST',
        body: JSON.stringify({
          name: $('#recurring-name').value,
          amount: Number($('#recurring-amount').value),
          walletId: $('#recurring-wallet').value,
          type: $('#recurring-type').value,
          frequency: $('#recurring-frequency').value,
          nextRunAt: new Date(`${$('#recurring-date').value}T12:00:00`).toISOString(),
          autoPost: $('#recurring-auto').checked
        })
      });
      event.target.reset();
      $('#recurring-date').value = localDateValue();
      await loadPlanning();
      toast('Đã tạo lịch định kỳ.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#bill-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/productivity/bills', {
        method: 'POST',
        body: JSON.stringify({
          name: $('#bill-name').value,
          amount: Number($('#bill-amount').value),
          walletId: $('#bill-wallet').value || null,
          dueAt: new Date(`${$('#bill-date').value}T12:00:00`).toISOString(),
          recurrence: $('#bill-frequency').value || null
        })
      });
      event.target.reset();
      $('#bill-date').value = localDateValue();
      await loadPlanning();
      toast('Đã thêm hóa đơn.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#run-recurring').addEventListener('click', async () => {
    try {
      const result = await api('/productivity/recurring/run-due', { method: 'POST' });
      await loadData();
      render();
      await loadPlanning();
      toast(`Đã xử lý ${result.processed} giao dịch.`);
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#recurring-list').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-recurring-delete]')?.dataset.recurringDelete;
    if (!id) return;
    if (!confirm('Xóa lịch định kỳ này?')) return;
    try {
      await api(`/productivity/recurring/${id}`, { method: 'DELETE' });
      await loadPlanning();
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#bill-list').addEventListener('click', async (event) => {
    const pay = event.target.closest('[data-bill-pay]')?.dataset.billPay;
    const remove = event.target.closest('[data-bill-delete]')?.dataset.billDelete;
    try {
      if (pay) {
        const walletId = $('#bill-wallet').value || state.wallets.find((item) => !item.archivedAt)?.id;
        await api(`/productivity/bills/${pay}/pay`, { method: 'POST', body: JSON.stringify({ walletId }) });
        await loadData();
        render();
      }
      if (remove && confirm('Xóa hóa đơn này?')) await api(`/productivity/bills/${remove}`, { method: 'DELETE' });
      await loadPlanning();
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#tag-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/productivity/tags', {
        method: 'POST',
        body: JSON.stringify({ name: $('#tag-name').value, color: $('#tag-color').value })
      });
      event.target.reset();
      await loadPlanning();
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#tag-list').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-tag-delete]')?.dataset.tagDelete;
    if (!id) return;
    try {
      await api(`/productivity/tags/${id}`, { method: 'DELETE' });
      await loadPlanning();
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#household-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/productivity/households', {
        method: 'POST',
        body: JSON.stringify({ name: $('#household-name').value })
      });
      event.target.reset();
      await loadPlanning();
      toast('Đã tạo nhóm gia đình.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#household-join-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/productivity/households/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: $('#household-code').value })
      });
      event.target.reset();
      await loadPlanning();
      toast('Đã tham gia nhóm.');
    } catch (error) {
      toast(error.message, true);
    }
  });
}
