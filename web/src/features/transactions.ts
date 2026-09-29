import { api } from '../core/api';
import { $, $$ } from '../core/dom';
import { escapeHtml, localDateValue, money, moneyCurrency, shortDate } from '../core/format';
import { closeNamedModal, openNamedModal } from '../core/modal';
import { state } from '../core/state';
import { LAST_WALLET_KEY, storageGet, storageSet } from '../core/storage';
import { toast } from '../core/toast';
import { render } from './dashboard';
import { loadData } from './session';
import { openWelcome } from './welcome';
import type { Row } from '../core/state';

export function transactionHtml(item, actions = false) {
  const expense = item.type === 'EXPENSE';
  const transfer = item.type === 'TRANSFER';
  const title = item.note || item.category?.name || (transfer ? 'Chuyển khoản' : 'Giao dịch');
  const subtitle = `${item.wallet.name}${item.destinationWallet ? ' → ' + item.destinationWallet.name : ''}${item.category ? ' · ' + item.category.name : ''} · ${shortDate(item.occurredAt)}`;
  return `<article class="transaction-row${actions ? ' has-actions' : ''}"><div class="transaction-icon ${expense ? 'expense' : ''}">${expense ? '↗' : transfer ? '↔' : '↙'}</div><div class="transaction-info"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div><div class="transaction-amount ${expense ? 'expense' : ''}">${expense ? '−' : transfer ? '' : '＋'} ${moneyCurrency(item.amount, item.wallet.currency || state.user.currency)}</div>${actions ? `<div class="transaction-actions"><button data-transaction-action="edit" data-id="${item.id}">Sửa</button><button class="danger" data-transaction-action="delete" data-id="${item.id}">Xóa</button></div>` : ''}</article>`;
}
export function renderTransactions() {
  const empty =
    '<div class="empty"><span>Chưa có giao dịch phù hợp.</span><button class="empty-action" type="button" data-empty-action="transaction">Ghi giao dịch đầu tiên</button></div>';
  $('#recent-transactions').innerHTML =
    state.transactions
      .slice(0, 5)
      .map((item) => transactionHtml(item))
      .join('') || empty;
  $('#all-transactions').innerHTML = state.transactions.map((item) => transactionHtml(item, true)).join('') || empty;
  const walletValue = $('#transaction-wallet-filter').value;
  $('#transaction-wallet-filter').innerHTML =
    '<option value="">Tất cả ví</option>' +
    state.wallets.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  $('#transaction-wallet-filter').value = walletValue;
  const categoryValue = $('#transaction-category-filter').value;
  $('#transaction-category-filter').innerHTML =
    '<option value="">Tất cả danh mục</option>' +
    state.categories.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  $('#transaction-category-filter').value = categoryValue;
}

export function fillForm() {
  const type = $('input[name="type"]:checked').value;
  const activeWallets = state.wallets.filter((item) => !item.archivedAt);
  const sourceValue = $('#tx-wallet').value;
  const destinationValue = $('#tx-destination').value;
  const categoryValue = $('#tx-category').value;
  $('#tx-wallet').innerHTML = activeWallets
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${item.currency}</option>`)
    .join('');
  if (activeWallets.some((item) => item.id === sourceValue)) $('#tx-wallet').value = sourceValue;
  const source = activeWallets.find((item) => item.id === $('#tx-wallet').value);
  const destinations = activeWallets.filter((item) => item.id !== source?.id && item.currency === source?.currency);
  $('#tx-destination').innerHTML = destinations.length
    ? destinations
        .map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${item.currency}</option>`)
        .join('')
    : '<option value="">Không có ví đích phù hợp</option>';
  if (destinations.some((item) => item.id === destinationValue)) $('#tx-destination').value = destinationValue;
  const categories = state.categories.filter((item) => item.type === type);
  $('#tx-category').innerHTML =
    '<option value="">Chưa phân loại</option>' +
    categories.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  if (categories.some((item) => item.id === categoryValue)) $('#tx-category').value = categoryValue;
  $('#tx-category')
    .closest('label')
    .classList.toggle('hidden', type === 'TRANSFER');
  $('#tx-destination-group').classList.toggle('hidden', type !== 'TRANSFER');
  $('#tx-destination').required = type === 'TRANSFER';
  if (!$('#tx-date').value) $('#tx-date').value = localDateValue();
}

export function renderReceiptList(transaction) {
  $('#tx-receipts-list').innerHTML = (transaction?.receipts || [])
    .map(
      (receipt) =>
        `<div class="receipt-item"><span>${escapeHtml(receipt.originalName)}</span><div><button type="button" data-receipt-action="download" data-transaction-id="${transaction.id}" data-receipt-id="${receipt.id}" data-name="${escapeHtml(receipt.originalName)}">Tải</button><button type="button" class="danger" data-receipt-action="delete" data-transaction-id="${transaction.id}" data-receipt-id="${receipt.id}">Xóa</button></div></div>`
    )
    .join('');
}

/** Mở form giao dịch (mới hoặc sửa). Chưa có ví thì dẫn đi tạo ví; giao dịch mới chọn sẵn ví dùng lần trước; phần
 * "nâng cao" mở sẵn khi giao dịch đang sửa có dùng tới. */
export function openModal(transaction: Row | null = null) {
  if (!transaction && !state.wallets.some((wallet) => !wallet.archivedAt)) {
    toast('Bạn cần có ít nhất một ví trước khi ghi giao dịch.');
    openWelcome('wallet');
    return;
  }
  $('#transaction-form').reset();
  $('#tx-receipt-name').textContent = 'Chưa chọn tệp';
  $('#tx-id').value = transaction?.id || '';
  $('#transaction-modal-title').textContent = transaction ? 'Chỉnh sửa giao dịch' : 'Giao dịch mới';
  const type = transaction?.type || 'EXPENSE';
  $(`input[name="type"][value="${type}"]`).checked = true;
  if (transaction) $('#tx-wallet').value = transaction.walletId;
  fillForm();
  renderReceiptList(transaction);
  if (transaction) {
    $('#tx-amount').value = Number(transaction.amount);
    $('#tx-wallet').value = transaction.walletId;
    fillForm();
    $('#tx-destination').value = transaction.destinationWalletId || '';
    $('#tx-category').value = transaction.categoryId || '';
    $('#tx-payee').value = transaction.payee || '';
    $('#tx-status').value = transaction.status || 'CLEARED';
    $('#tx-payment-method').value = transaction.paymentMethod || '';
    $('#tx-reference').value = transaction.reference || '';
    $('#tx-location').value = transaction.location || '';
    $('#tx-note').value = transaction.note || '';
    $('#tx-date').value = localDateValue(new Date(transaction.occurredAt));
  }
  openNamedModal('transaction-modal', '#tx-amount');
  const details = $('#transaction-advanced');
  if (details)
    details.open = Boolean(
      transaction &&
      (transaction.status !== 'CLEARED' ||
        transaction.paymentMethod ||
        transaction.reference ||
        transaction.location ||
        (transaction.receipts || []).length)
    );
  const last = storageGet(LAST_WALLET_KEY);
  if (!transaction && last && state.wallets.some((wallet) => wallet.id === last && !wallet.archivedAt)) {
    $('#tx-wallet').value = last;
    fillForm();
  }
  renderCategoryChips();
}

export function closeModal() {
  closeNamedModal('transaction-modal');
}

export async function uploadReceipt(transactionId, file) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`/api/v1/transactions/${transactionId}/receipts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.token}` },
    body: form
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Không thể tải hóa đơn.');
}

export function transactionFilterParams(includeLimit = true) {
  const params = new URLSearchParams();
  if (includeLimit) params.set('limit', '100');
  if ($('#transaction-type-filter').value) params.set('type', $('#transaction-type-filter').value);
  if ($('#transaction-wallet-filter').value) params.set('walletId', $('#transaction-wallet-filter').value);
  if ($('#transaction-category-filter').value) params.set('categoryId', $('#transaction-category-filter').value);
  if ($('#transaction-from-filter').value) params.set('from', $('#transaction-from-filter').value);
  if ($('#transaction-to-filter').value) params.set('to', $('#transaction-to-filter').value);
  if ($('#transaction-keyword-filter').value.trim())
    params.set('keyword', $('#transaction-keyword-filter').value.trim());
  return params;
}
export async function applyTransactionFilters() {
  try {
    state.transactions = await api(`/transactions?${transactionFilterParams()}`);
    renderTransactions();
  } catch (error) {
    toast(error.message, true);
  }
}

export function renderCategoryChips() {
  const type = $('input[name="type"]:checked')?.value;
  const box = $('#tx-category-chips');
  if (type === 'TRANSFER') {
    box.innerHTML = '';
    return;
  }
  const selected = $('#tx-category').value;
  box.innerHTML = state.categories
    .filter((item) => item.type === type && !item.archivedAt)
    .slice(0, 10)
    .map(
      (item) =>
        `<button type="button" class="chip${item.id === selected ? ' active' : ''}" data-tx-category="${item.id}">${escapeHtml(item.name)}</button>`
    )
    .join('');
}

/** Form giao dịch, hóa đơn đính kèm, danh sách, bộ lọc tự áp dụng, xuất CSV và chip chọn nhanh danh mục. */
export function setupTransactions() {
  $('#open-transaction').addEventListener('click', () => openModal());
  $('#close-modal').addEventListener('click', closeModal);
  $('#transaction-modal').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  $$('input[name="type"]').forEach((input) => input.addEventListener('change', fillForm));
  $('#tx-wallet').addEventListener('change', fillForm);
  $('#tx-receipt').addEventListener('change', (event) => {
    $('#tx-receipt-name').textContent = event.target.files[0]?.name || 'Chưa chọn tệp';
  });
  $('#transaction-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('#tx-id').value;
    const type = $('input[name="type"]:checked').value;
    const walletId = $('#tx-wallet').value;
    const destinationWalletId = type === 'TRANSFER' ? $('#tx-destination').value : null;
    if (!walletId) {
      toast('Bạn cần tạo hoặc chọn ví nguồn.', true);
      return;
    }
    if (type === 'TRANSFER' && !destinationWalletId) {
      toast('Cần có một ví đích khác, cùng loại tiền tệ.', true);
      return;
    }
    const body = {
      type,
      amount: Number($('#tx-amount').value),
      walletId,
      destinationWalletId,
      categoryId: type === 'TRANSFER' ? null : $('#tx-category').value || null,
      payee: $('#tx-payee').value || null,
      status: $('#tx-status').value,
      paymentMethod: $('#tx-payment-method').value || null,
      reference: $('#tx-reference').value || null,
      location: $('#tx-location').value || null,
      note: $('#tx-note').value || null,
      occurredAt: new Date(`${$('#tx-date').value}T12:00:00`).toISOString()
    };
    try {
      const button = event.submitter;
      button.disabled = true;
      const transaction = await api(id ? `/transactions/${id}` : '/transactions', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body)
      });
      const file = $('#tx-receipt').files[0];
      if (file) await uploadReceipt(transaction.id, file);
      event.target.reset();
      closeModal();
      await loadData();
      render();
      toast(id ? 'Đã cập nhật giao dịch.' : 'Đã lưu giao dịch mới.');
    } catch (error) {
      toast(error.message, true);
    } finally {
      if (event.submitter) event.submitter.disabled = false;
    }
  });
  $('#tx-receipts-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-receipt-action]');
    if (!button) return;
    const path = `/api/v1/transactions/${button.dataset.transactionId}/receipts/${button.dataset.receiptId}`;
    try {
      if (button.dataset.receiptAction === 'download') {
        const response = await fetch(path, { headers: { Authorization: `Bearer ${state.token}` } });
        if (!response.ok) throw new Error('Không thể tải hóa đơn.');
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = button.dataset.name || 'receipt';
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (!confirm('Xóa hóa đơn này?')) return;
      await api(`/transactions/${button.dataset.transactionId}/receipts/${button.dataset.receiptId}`, {
        method: 'DELETE'
      });
      const transaction = state.transactions.find((item) => item.id === button.dataset.transactionId);
      if (transaction)
        transaction.receipts = transaction.receipts.filter((item) => item.id !== button.dataset.receiptId);
      renderReceiptList(transaction);
      toast('Đã xóa hóa đơn.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#all-transactions').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-transaction-action]');
    if (!button) return;
    const transaction = state.transactions.find((item) => item.id === button.dataset.id);
    if (!transaction) return;
    if (button.dataset.transactionAction === 'edit') {
      openModal(transaction);
      return;
    }
    if (!confirm(`Xóa giao dịch “${transaction.note || money(transaction.amount)}”?`)) return;
    try {
      await api(`/transactions/${transaction.id}`, { method: 'DELETE' });
      await loadData();
      render();
      toast('Đã xóa giao dịch.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#apply-transaction-filter').addEventListener('click', applyTransactionFilters);
  $('#transaction-keyword-filter').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void applyTransactionFilters();
  });
  $('#reset-transaction-filter').addEventListener('click', async () => {
    $$(
      '#transaction-type-filter,#transaction-wallet-filter,#transaction-category-filter,#transaction-from-filter,#transaction-to-filter,#transaction-keyword-filter'
    ).forEach((input) => (input.value = ''));
    await applyTransactionFilters();
  });
  $('#export-csv').addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`/api/v1/transactions/export.csv?${transactionFilterParams(false)}`, {
        headers: { Authorization: `Bearer ${state.token}` }
      });
      if (!response.ok) throw new Error('Không thể xuất CSV.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'transactions.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#mobile-add-transaction').addEventListener('click', () => openModal());
  $$('input[name="type"]').forEach((input) => input.addEventListener('change', renderCategoryChips));
  $('#tx-category').addEventListener('change', renderCategoryChips);
  $('#tx-category-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tx-category]');
    if (!chip) return;
    $('#tx-category').value = $('#tx-category').value === chip.dataset.txCategory ? '' : chip.dataset.txCategory;
    renderCategoryChips();
  });
  $('#transaction-form').addEventListener('submit', () => {
    if ($('#tx-wallet').value) storageSet(LAST_WALLET_KEY, $('#tx-wallet').value);
  });

  // Giao dịch: bộ lọc tự áp dụng khi đổi lựa chọn, không cần bấm "Lọc".
  [
    '#transaction-type-filter',
    '#transaction-wallet-filter',
    '#transaction-category-filter',
    '#transaction-from-filter',
    '#transaction-to-filter'
  ].forEach((selector) => $(selector).addEventListener('change', applyTransactionFilters));
  $('#transaction-keyword-filter').addEventListener('search', applyTransactionFilters);
}
