/* eslint-disable @typescript-eslint/no-explicit-any -- dữ liệu API và phần tử DOM chưa được gán kiểu chi tiết. */
import { api } from '../core/api';
import { $, $$ } from '../core/dom';
import { escapeHtml } from '../core/format';
import { closeNamedModal, openNamedModal } from '../core/modal';
import { state } from '../core/state';
import { toast } from '../core/toast';
import { render } from './dashboard';
import { loadData } from './session';
import type { Row } from '../core/state';

export function categoryItemHtml(item, level = 0) {
  const parent = state.categories.find((category) => category.id === item.parentId);
  return `<article class="category-item ${level ? 'child' : ''}" style="${level ? `margin-left:${Math.min(level, 4) * 25}px` : ''}"><div class="category-main"><span class="category-color" style="background:${item.color || '#23654f'}"></span><span class="category-icon">${escapeHtml(item.icon || (item.type === 'INCOME' ? '↙' : '↗'))}</span><div class="category-info"><strong>${escapeHtml(item.name)}</strong><small>${parent ? `Thuộc ${escapeHtml(parent.name)}` : 'Danh mục gốc'}</small></div><div class="category-actions"><button data-category-action="edit" data-id="${item.id}">Sửa</button><button class="danger" data-category-action="delete" data-id="${item.id}">Xóa</button></div></div></article>`;
}
export function orderedCategories(type) {
  const items = state.categories.filter((item) => item.type === type);
  if (state.categoryMode === 'flat')
    return items.sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((item) => ({ item, level: 0 }));
  const children = new Map();
  for (const item of items) {
    const key = item.parentId || 'root';
    children.set(key, [...(children.get(key) || []), item]);
  }
  const output: any[] = [];
  function visit(parentId, level) {
    for (const item of (children.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name, 'vi'))) {
      output.push({ item, level });
      visit(item.id, level + 1);
    }
  }
  visit('root', 0);
  for (const item of items) if (!output.some((entry) => entry.item.id === item.id)) output.push({ item, level: 0 });
  return output;
}
export function renderCategories() {
  const income = orderedCategories('INCOME');
  const expense = orderedCategories('EXPENSE');
  $('#income-category-count').textContent = income.length;
  $('#expense-category-count').textContent = expense.length;
  $('#income-categories').innerHTML =
    income.map(({ item, level }) => categoryItemHtml(item, level)).join('') ||
    '<div class="empty">Chưa có danh mục thu.</div>';
  $('#expense-categories').innerHTML =
    expense.map(({ item, level }) => categoryItemHtml(item, level)).join('') ||
    '<div class="empty">Chưa có danh mục chi.</div>';
  $$('[data-category-mode]').forEach((button) =>
    button.classList.toggle('active', button.dataset.categoryMode === state.categoryMode)
  );
}

export function fillCategoryParents(type, currentId = '', selected = '') {
  const candidates = state.categories.filter((item) => item.type === type && item.id !== currentId);
  $('#category-parent').innerHTML =
    '<option value="">Không có</option>' +
    candidates
      .map(
        (item) =>
          `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`
      )
      .join('');
}
export function openCategoryForm(category: Row | null = null) {
  $('#category-form').reset();
  $('#category-id').value = category?.id || '';
  $('#category-modal-title').textContent = category ? 'Chỉnh sửa danh mục' : 'Thêm danh mục';
  $('#category-name').value = category?.name || '';
  $('#category-type').value = category?.type || 'EXPENSE';
  $('#category-icon').value = category?.icon || '';
  $('#category-color').value = category?.color || '#23654f';
  fillCategoryParents($('#category-type').value, category?.id || '', category?.parentId || '');
  openNamedModal('category-modal');
  $('#category-name').focus();
}

/** Form danh mục, chế độ xem cây/phẳng, sửa và xóa danh mục. */
export function setupCategories() {
  $('#open-category').addEventListener('click', () => openCategoryForm());
  $('#category-type').addEventListener('change', () =>
    fillCategoryParents($('#category-type').value, $('#category-id').value, '')
  );
  $$('[data-category-mode]').forEach((button) =>
    button.addEventListener('click', () => {
      state.categoryMode = button.dataset.categoryMode;
      renderCategories();
    })
  );
  $('#category-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('#category-id').value;
    const body = {
      name: $('#category-name').value,
      type: $('#category-type').value,
      parentId: $('#category-parent').value || null,
      icon: $('#category-icon').value || null,
      color: $('#category-color').value || null
    };
    try {
      await api(id ? `/categories/${id}` : '/categories', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body)
      });
      closeNamedModal('category-modal');
      await loadData();
      render();
      toast(id ? 'Đã cập nhật danh mục.' : 'Đã tạo danh mục mới.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('.category-columns').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-category-action]');
    if (!button) return;
    const category = state.categories.find((item) => item.id === button.dataset.id);
    if (!category) return;
    if (button.dataset.categoryAction === 'edit') {
      openCategoryForm(category);
      return;
    }
    if (!confirm(`Xóa danh mục “${category.name}”?`)) return;
    try {
      await api(`/categories/${category.id}`, { method: 'DELETE' });
      await loadData();
      render();
      toast('Đã xóa danh mục.');
    } catch (error) {
      toast(error.message, true);
    }
  });
}
