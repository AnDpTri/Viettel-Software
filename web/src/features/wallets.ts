import { api } from '../core/api';
import { $ } from '../core/dom';
import { escapeHtml, moneyCurrency, shortDate } from '../core/format';
import { closeNamedModal, openNamedModal } from '../core/modal';
import { state } from '../core/state';
import { toast } from '../core/toast';
import { render } from './dashboard';
import { loadData } from './session';
import type { Row } from '../core/state';

export function walletHtml(wallet, actions = false) {
  const icons = { CASH: '₫', BANK: '▣', E_WALLET: '◈', CREDIT: '◇', OTHER: '□' };
  const typeLabels = {
    CASH: 'Tiền mặt',
    BANK: 'Ngân hàng',
    E_WALLET: 'Ví điện tử',
    CREDIT: 'Thẻ tín dụng',
    OTHER: 'Khác'
  };
  return `<article class="wallet-card ${wallet.archivedAt ? 'archived' : ''}"><div class="wallet-type">${icons[wallet.type] || '□'}</div><span>${typeLabels[wallet.type] || wallet.type}${wallet.archivedAt ? ' · Đã lưu trữ' : ''}</span><h3>${escapeHtml(wallet.name)}</h3><strong>${moneyCurrency(wallet.balance, wallet.currency)}</strong>${actions ? `<div class="wallet-actions"><button data-wallet-action="detail" data-id="${wallet.id}">Chi tiết</button><button data-wallet-action="edit" data-id="${wallet.id}">Sửa</button><button class="${wallet.archivedAt ? '' : 'danger'}" data-wallet-action="${wallet.archivedAt ? 'restore' : 'archive'}" data-id="${wallet.id}">${wallet.archivedAt ? 'Khôi phục' : 'Lưu trữ'}</button></div>` : ''}</article>`;
}
export function renderWallets() {
  const empty =
    '<div class="empty"><span>Chưa có ví để quản lý.</span><button class="empty-action" type="button" data-empty-action="wallet">Tạo ví đầu tiên</button></div>';
  const active = state.wallets.filter((wallet) => !wallet.archivedAt);
  $('#wallet-preview').innerHTML = active.map((wallet) => walletHtml(wallet)).join('') || empty;
  const showArchived = $('#show-archived-wallets').checked;
  const visible = state.wallets.filter((wallet) => showArchived || !wallet.archivedAt);
  $('#all-wallets').innerHTML =
    visible.map((wallet) => walletHtml(wallet, true)).join('') || `<div class="panel">${empty}</div>`;
}

export function openWalletForm(wallet: Row | null = null) {
  $('#wallet-form').reset();
  $('#wallet-id').value = wallet?.id || '';
  $('#wallet-modal-title').textContent = wallet ? 'Chỉnh sửa ví' : 'Thêm ví mới';
  $('#wallet-name').value = wallet?.name || '';
  $('#wallet-type').value = wallet?.type || 'CASH';
  $('#wallet-currency').value = wallet?.currency || 'VND';
  $('#wallet-opening-balance').value = Number(wallet?.openingBalance || 0);
  $('#wallet-institution').value = wallet?.institutionName || '';
  $('#wallet-color').value = wallet?.color || '#23654f';
  $('#wallet-credit-limit').value = wallet?.creditLimit ? Number(wallet.creditLimit) : '';
  $('#wallet-billing-day').value = wallet?.billingDay || '';
  $('#wallet-due-day').value = wallet?.dueDay || '';
  openNamedModal('wallet-modal');
  $('#wallet-name').focus();
}

/** Form ví, chi tiết ví, lưu trữ và khôi phục ví. */
export function setupWallets() {
  $('#open-wallet').addEventListener('click', () => openWalletForm());
  $('#show-archived-wallets').addEventListener('change', renderWallets);
  $('#wallet-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('#wallet-id').value;
    const numberOrNull = (selector) => ($(selector).value ? Number($(selector).value) : null);
    const body = {
      name: $('#wallet-name').value,
      type: $('#wallet-type').value,
      currency: $('#wallet-currency').value.toUpperCase(),
      openingBalance: Number($('#wallet-opening-balance').value),
      institutionName: $('#wallet-institution').value || null,
      color: $('#wallet-color').value,
      creditLimit: numberOrNull('#wallet-credit-limit'),
      billingDay: numberOrNull('#wallet-billing-day'),
      dueDay: numberOrNull('#wallet-due-day')
    };
    try {
      await api(id ? `/wallets/${id}` : '/wallets', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      closeNamedModal('wallet-modal');
      await loadData();
      render();
      toast(id ? 'Đã cập nhật ví.' : 'Đã tạo ví mới.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#all-wallets').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-wallet-action]');
    if (!button) return;
    const wallet = state.wallets.find((item) => item.id === button.dataset.id);
    if (!wallet) return;
    const action = button.dataset.walletAction;
    if (action === 'edit') {
      openWalletForm(wallet);
      return;
    }
    if (action === 'detail') {
      try {
        const detail = await api(`/wallets/${wallet.id}`);
        const typeLabels = {
          CASH: 'Tiền mặt',
          BANK: 'Ngân hàng',
          E_WALLET: 'Ví điện tử',
          CREDIT: 'Thẻ tín dụng',
          OTHER: 'Khác'
        };
        $('#wallet-detail').innerHTML =
          `<h2>${escapeHtml(detail.name)}</h2><div class="wallet-detail-balance"><span>SỐ DƯ HIỆN TẠI</span><strong>${moneyCurrency(detail.balance, detail.currency)}</strong></div><div class="detail-grid"><div><span>Loại ví</span><b>${typeLabels[detail.type] || detail.type}</b></div><div><span>Tiền tệ</span><b>${detail.currency}</b></div><div><span>Số dư ban đầu</span><b>${moneyCurrency(detail.openingBalance, detail.currency)}</b></div><div><span>Trạng thái</span><b>${detail.archivedAt ? 'Đã lưu trữ' : 'Đang hoạt động'}</b></div><div><span>Ngày tạo</span><b>${shortDate(detail.createdAt)}</b></div><div><span>Cập nhật</span><b>${shortDate(detail.updatedAt)}</b></div></div>`;
        openNamedModal('wallet-detail-modal');
      } catch (error) {
        toast(error.message, true);
      }
      return;
    }
    if (action === 'archive' && !confirm(`Lưu trữ ví “${wallet.name}”? Lịch sử giao dịch vẫn được giữ lại.`)) return;
    try {
      await api(`/wallets/${wallet.id}${action === 'restore' ? '/restore' : ''}`, {
        method: action === 'restore' ? 'POST' : 'DELETE'
      });
      await loadData();
      render();
      toast(action === 'restore' ? 'Đã khôi phục ví.' : 'Đã lưu trữ ví.');
    } catch (error) {
      toast(error.message, true);
    }
  });
}
