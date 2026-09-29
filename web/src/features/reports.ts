import { api, apiErrorMessage } from '../core/api';
import { $, $$ } from '../core/dom';
import { escapeHtml, localDateValue, moneyCurrency, monthStartValue } from '../core/format';
import { state } from '../core/state';
import { toast } from '../core/toast';

export async function loadReports() {
  try {
    const params = new URLSearchParams();
    if ($('#report-from').value) params.set('from', $('#report-from').value);
    if ($('#report-to').value) params.set('to', $('#report-to').value);
    const [summary, reconciliation] = await Promise.all([
      api(`/reports/summary?${params}`),
      api('/reports/reconciliation')
    ]);
    const currencies = summary.byCurrency?.length
      ? summary.byCurrency
      : [{ currency: summary.currency || 'VND', income: summary.income, expense: summary.expense, net: summary.net }];
    const multi = currencies.length > 1;
    $('#report-currencies').innerHTML = currencies
      .map((item) => {
        const suffix = multi ? ` (${item.currency})` : '';
        return `<article class="metric-card income"><div class="metric-icon">↙</div><div><span>Thu vào${suffix}</span><strong>${moneyCurrency(item.income, item.currency)}</strong><small>Trong kỳ đã chọn</small></div></article><article class="metric-card expense"><div class="metric-icon">↗</div><div><span>Chi ra${suffix}</span><strong>${moneyCurrency(item.expense, item.currency)}</strong><small>Trong kỳ đã chọn</small></div></article><article class="metric-card net"><div class="metric-icon">≈</div><div><span>Còn lại${suffix}</span><strong>${moneyCurrency(item.net, item.currency)}</strong><small>${Number(item.net) < 0 ? 'Chi nhiều hơn thu' : 'Thu trừ chi'}</small></div></article>`;
      })
      .join('');
    $('#reconciliation-list').innerHTML =
      '<div class="reconciliation-row header"><span>Ví</span><span>Tiền tệ</span><span>Số dư đầu kỳ</span><b>Số dư hiện tại</b></div>' +
      reconciliation.wallets
        .map(
          (item) =>
            `<div class="reconciliation-row"><span data-label="Ví">${escapeHtml(item.walletName)}${item.archived ? ' (đã lưu trữ)' : ''}</span><span data-label="Tiền tệ">${item.currency}</span><span data-label="Số dư đầu kỳ">${moneyCurrency(item.openingBalance, item.currency)}</span><b data-label="Số dư hiện tại">${moneyCurrency(item.calculatedBalance, item.currency)}</b></div>`
        )
        .join('');
  } catch (error) {
    toast(error.message, true);
  }
}

export function renderReportBars(summary) {
  const monthly = summary.monthly || [];
  const categories = (summary.expenseByCategory || []).slice(0, 6);
  const monthlyMax = Math.max(1, ...monthly.flatMap((item) => [Number(item.income || 0), Number(item.expense || 0)]));
  const categoryMax = Math.max(1, ...categories.map((item) => Number(item.amount || 0)));
  $('#report-monthly-chart').innerHTML =
    '<strong>Thu và chi theo tháng</strong>' +
    monthly
      .flatMap((item) => [
        { label: `${item.month} · Thu`, value: Number(item.income || 0), kind: 'income' },
        { label: `${item.month} · Chi`, value: Number(item.expense || 0), kind: 'expense' }
      ])
      .map(
        (item) =>
          `<div class="report-bar ${item.kind}"><span>${escapeHtml(item.label)}</span><div class="report-bar-track"><span style="width:${(item.value / monthlyMax) * 100}%"></span></div><b>${moneyCurrency(item.value, state.user.currency)}</b></div>`
      )
      .join('');
  $('#report-category-chart').innerHTML =
    '<strong>Nhóm chi tiêu lớn nhất</strong>' +
    categories
      .map(
        (item) =>
          `<div class="report-bar expense"><span>${escapeHtml(item.categoryName)}</span><div class="report-bar-track"><span style="width:${(Number(item.amount) / categoryMax) * 100}%"></span></div><b>${moneyCurrency(item.amount, item.currency || state.user.currency)}</b></div>`
      )
      .join('');
  $('#report-visuals').classList.toggle('hidden', !monthly.length && !categories.length);
}
export async function refreshReportVisuals() {
  const params = new URLSearchParams();
  if ($('#report-from').value) params.set('from', $('#report-from').value);
  if ($('#report-to').value) params.set('to', $('#report-to').value);
  try {
    renderReportBars(await api(`/reports/summary?${params}`));
  } catch (error) {
    toast(error.message, true);
  }
}

// Tải báo cáo dạng CSV (tổng hợp theo khoảng ngày đang chọn, và đối soát số dư ví).
export async function downloadReportCsv(path, fallbackName) {
  try {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(apiErrorMessage(body) || 'Không thể xuất CSV.');
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    toast(error.message, true);
  }
}

// Báo cáo: chọn nhanh kỳ; đổi ngày là tự tính lại, không còn nút "Xem báo cáo"/"Cập nhật".
export function reportRange(kind) {
  const now = new Date();
  const year = now.getFullYear(),
    month = now.getMonth();
  if (kind === 'last-month') return [new Date(year, month - 1, 1), new Date(year, month, 0)];
  if (kind === '3m') return [new Date(year, month - 2, 1), now];
  if (kind === 'year') return [new Date(year, 0, 1), now];
  return [new Date(year, month, 1), now];
}
export function reloadReports() {
  void loadReports();
  void refreshReportVisuals();
}

/** Kỳ báo cáo mặc định là tháng này, chọn nhanh kỳ, tự tính lại khi đổi ngày và tải CSV. */
export function setupReports() {
  $('#report-from').value = monthStartValue();
  $('#report-to').value = localDateValue();
  $('#export-summary-csv').addEventListener('click', () => {
    const params = new URLSearchParams({ format: 'csv' });
    if ($('#report-from').value) params.set('from', $('#report-from').value);
    if ($('#report-to').value) params.set('to', $('#report-to').value);
    downloadReportCsv(`/api/v1/reports/summary?${params}`, 'bao-cao-tong-hop.csv');
  });
  $('#export-reconciliation-csv').addEventListener('click', () =>
    downloadReportCsv('/api/v1/reports/reconciliation?format=csv', 'doi-soat-vi.csv')
  );
  $('#report-presets').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-report-range]');
    if (!chip) return;
    const [from, to] = reportRange(chip.dataset.reportRange);
    $('#report-from').value = localDateValue(from);
    $('#report-to').value = localDateValue(to);
    $$('#report-presets .chip').forEach((item) => item.classList.toggle('active', item === chip));
    reloadReports();
  });
  ['#report-from', '#report-to'].forEach((selector) =>
    $(selector).addEventListener('change', () => {
      $$('#report-presets .chip').forEach((item) => item.classList.remove('active'));
      reloadReports();
    })
  );
}
