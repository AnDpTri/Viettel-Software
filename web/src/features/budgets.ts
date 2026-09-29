import { api } from '../core/api';
import { $ } from '../core/dom';
import { escapeHtml, moneyCurrency, shortDate } from '../core/format';
import { closeNamedModal, openNamedModal } from '../core/modal';
import { state } from '../core/state';
import { toast } from '../core/toast';
import { render } from './dashboard';
import { loadData } from './session';
import type { Row } from '../core/state';

export function renderBudgets() {
  $('#budget-list').innerHTML =
    state.budgets
      .map(
        (item) =>
          `<article class="plan-card"><span class="eyebrow">${item.category?.name || 'TOÀN BỘ CHI TIÊU'}</span><h3>${escapeHtml(item.name)}</h3><p>${shortDate(item.startDate)} — ${shortDate(item.endDate)}</p><div class="plan-numbers"><span>Đã dùng <b>${moneyCurrency(item.spent, item.currency || state.user.currency)}</b></span><span>${Math.round(item.percentUsed)}%</span></div><div class="progress"><span style="width:${Math.min(100, item.percentUsed)}%"></span></div><small>Còn lại ${moneyCurrency(item.remaining, item.currency || state.user.currency)}</small><div class="plan-actions"><button data-budget-action="edit" data-id="${item.id}">Sửa</button><button class="danger" data-budget-action="delete" data-id="${item.id}">Xóa</button></div></article>`
      )
      .join('') ||
    '<div class="panel empty"><span>Chưa thiết lập ngân sách.</span><button class="empty-action" type="button" data-empty-action="budget">Tạo ngân sách</button></div>';
}

export function openBudgetForm(budget: Row | null = null) {
  $('#budget-form').reset();
  $('#budget-id').value = budget?.id || '';
  $('#budget-modal-title').textContent = budget ? 'Chỉnh sửa ngân sách' : 'Thêm ngân sách';
  $('#budget-name').value = budget?.name || '';
  $('#budget-amount').value = budget ? Number(budget.amount) : '';
  $('#budget-category').innerHTML =
    '<option value="">Toàn bộ chi tiêu</option>' +
    state.categories
      .filter((item) => item.type === 'EXPENSE')
      .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
      .join('');
  $('#budget-category').value = budget?.categoryId || '';
  const today = new Date();
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  $('#budget-start').value = budget
    ? new Date(budget.startDate).toISOString().slice(0, 10)
    : today.toISOString().slice(0, 10);
  $('#budget-end').value = budget
    ? new Date(budget.endDate).toISOString().slice(0, 10)
    : monthEnd.toISOString().slice(0, 10);
  $('#budget-recurrence').value = budget?.recurrence || '';
  $('#budget-rollover').checked = Boolean(budget?.rollover);
  openNamedModal('budget-modal');
}

/** Form ngân sách, sửa và xóa ngân sách. */
export function setupBudgets() {
  $('#open-budget').addEventListener('click', () => openBudgetForm());
  $('#budget-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('#budget-id').value;
    const body = {
      name: $('#budget-name').value,
      amount: Number($('#budget-amount').value),
      categoryId: $('#budget-category').value || null,
      startDate: $('#budget-start').value,
      endDate: $('#budget-end').value,
      recurrence: $('#budget-recurrence').value || null,
      rollover: $('#budget-rollover').checked
    };
    try {
      await api(id ? `/budgets/${id}` : '/budgets', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      closeNamedModal('budget-modal');
      await loadData();
      render();
      toast(id ? 'Đã cập nhật ngân sách.' : 'Đã tạo ngân sách.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#budget-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-budget-action]');
    if (!button) return;
    const budget = state.budgets.find((item) => item.id === button.dataset.id);
    if (!budget) return;
    if (button.dataset.budgetAction === 'edit') {
      openBudgetForm(budget);
      return;
    }
    if (!confirm(`Xóa ngân sách “${budget.name}”?`)) return;
    try {
      await api(`/budgets/${budget.id}`, { method: 'DELETE' });
      await loadData();
      render();
      toast('Đã xóa ngân sách.');
    } catch (error) {
      toast(error.message, true);
    }
  });
}
