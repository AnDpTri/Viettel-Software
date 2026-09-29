import { $ } from '../../core/dom';
import { escapeHtml, moneyCurrency, shortDate } from '../../core/format';
import { renderMarkdown } from '../../core/markdown';
import { state } from '../../core/state';
import { nextOnboardingStep } from '../onboarding';

export const AGENT_PREVIEW_LABELS = {
  amount: 'Số tiền',
  wallet: 'Ví',
  category: 'Danh mục',
  parent: 'Danh mục cha',
  name: 'Tên',
  type: 'Loại',
  walletType: 'Loại ví',
  occurredAt: 'Thời gian',
  startDate: 'Bắt đầu',
  endDate: 'Kết thúc',
  targetAmount: 'Mục tiêu',
  currentAmount: 'Hiện có',
  targetDate: 'Hạn',
  openingBalance: 'Số dư đầu',
  note: 'Ghi chú',
  from: 'Từ ví',
  to: 'Đến ví',
  count: 'Số lượng',
  categories: 'Danh mục',
  goal: 'Mục tiêu',
  budget: 'Ngân sách',
  bill: 'Hóa đơn',
  dueAt: 'Hạn thanh toán',
  frequency: 'Chu kỳ',
  nextRunAt: 'Lần chạy tới',
  autoPost: 'Tự ghi sổ',
  rollover: 'Chuyển phần dư',
  recurrence: 'Lặp lại',
  currentBalance: 'Số dư hiện tại',
  actualBalance: 'Số dư thực tế',
  adjustment: 'Điều chỉnh',
  field: 'Trường',
  operator: 'Điều kiện',
  value: 'Giá trị',
  tagName: 'Nhãn',
  priority: 'Ưu tiên',
  payee: 'Người nhận',
  status: 'Trạng thái'
};
// Trường kỹ thuật không có ý nghĩa với người dùng (mã màu, ID) hoặc đã hiển thị cùng số tiền (tiền tệ).
export const AGENT_PREVIEW_HIDDEN = new Set([
  'title',
  'currency',
  'color',
  'parentId',
  'walletId',
  'categoryId',
  'changes'
]);
export const AGENT_ENUM_LABELS = {
  EXPENSE: 'Chi',
  INCOME: 'Thu',
  TRANSFER: 'Chuyển khoản',
  CASH: 'Tiền mặt',
  BANK: 'Ngân hàng',
  E_WALLET: 'Ví điện tử',
  CREDIT: 'Thẻ tín dụng',
  OTHER: 'Khác',
  DAILY: 'Hằng ngày',
  WEEKLY: 'Hằng tuần',
  MONTHLY: 'Hằng tháng',
  QUARTERLY: 'Hằng quý',
  YEARLY: 'Hằng năm',
  CLEARED: 'Đã ghi sổ',
  PENDING: 'Đang chờ',
  PLANNED: 'Dự kiến',
  RECONCILED: 'Đã đối soát',
  CANCELLED: 'Đã hủy',
  ACTIVE: 'Đang thực hiện',
  PAUSED: 'Tạm dừng',
  COMPLETED: 'Hoàn thành'
};
export const AGENT_STATUS_LABELS = {
  PENDING: 'Chờ xác nhận',
  EXECUTED: 'Đã lưu',
  CANCELLED: 'Đã hủy',
  UNDONE: 'Đã hoàn tác',
  EXPIRED: 'Đã hết hạn',
  FAILED: 'Không thực hiện được'
};
export const AGENT_MONEY_KEYS = [
  'amount',
  'targetAmount',
  'currentAmount',
  'openingBalance',
  'currentBalance',
  'actualBalance',
  'adjustment'
];
export const AGENT_DATE_KEYS = ['occurredAt', 'startDate', 'endDate', 'targetDate', 'dueAt', 'nextRunAt'];

export function agentPreviewValue(key, value, preview, kind?: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'money' || AGENT_MONEY_KEYS.includes(key))
    return moneyCurrency(value, preview.currency || state.user.currency);
  if (kind === 'date' || AGENT_DATE_KEYS.includes(key)) return shortDate(value);
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  return AGENT_ENUM_LABELS[value] || String(value);
}

export function agentActionDetailsHtml(action) {
  const preview = action.preview || {};
  const rows = Object.entries(preview)
    .filter(([key, value]) => !AGENT_PREVIEW_HIDDEN.has(key) && value !== null && value !== undefined && value !== '')
    .map(
      ([key, value]) =>
        `<div><span>${escapeHtml(AGENT_PREVIEW_LABELS[key] || key)}</span><b>${escapeHtml(agentPreviewValue(key, value, preview))}</b></div>`
    );
  // Mới: `changes` là danh sách {label, from, to}. Bản xem trước cũ lưu object thô, chỉ hiện giá trị mới và bỏ trường ID.
  const changes = Array.isArray(preview.changes)
    ? preview.changes.map(
        (change) =>
          `<div class="agent-change"><span>${escapeHtml(change.label)}</span><b>${escapeHtml(agentPreviewValue('', change.from, preview, change.kind))} → ${escapeHtml(agentPreviewValue('', change.to, preview, change.kind))}</b></div>`
      )
    : preview.changes && typeof preview.changes === 'object'
      ? Object.entries(preview.changes)
          .filter(([key]) => !/Id$/.test(key) && !AGENT_PREVIEW_HIDDEN.has(key))
          .map(
            ([key, value]) =>
              `<div><span>${escapeHtml(AGENT_PREVIEW_LABELS[key] || key)}</span><b>${escapeHtml(agentPreviewValue(key, value, preview))}</b></div>`
          )
      : [];
  return [...rows, ...changes].join('');
}

/** Một thẻ cho cả nhóm thay đổi Agent đề xuất trong cùng một lượt: xác nhận, hủy, hoàn tác đều áp dụng cho cả nhóm. */
export function agentActionGroupHtml(actions) {
  const count = actions.length;
  const statuses = actions.map((item) => item.status);
  const status = statuses.includes('PENDING') ? 'PENDING' : statuses.includes('EXECUTED') ? 'EXECUTED' : statuses[0];
  const anchor = actions.find((item) => item.status === status) || actions[0];
  const single = count === 1;
  const risky = actions.some((item) => item.risk === 'HIGH');
  const groupTitles = {
    PENDING: `${count} thay đổi chờ xác nhận`,
    EXECUTED: `Đã lưu ${count} thay đổi`,
    CANCELLED: `Đã hủy ${count} thay đổi`,
    UNDONE: `Đã hoàn tác ${count} thay đổi`,
    EXPIRED: `${count} thay đổi đã hết hạn`,
    FAILED: `${count} thay đổi không thực hiện được`
  };
  const title = single ? anchor.preview?.title || anchor.type : groupTitles[status] || `${count} thay đổi`;
  const body = single
    ? `<div class="agent-action-details">${agentActionDetailsHtml(anchor)}</div>`
    : `<ol class="agent-action-items">${actions.map((item) => `<li><b class="agent-action-item-title">${escapeHtml(item.preview?.title || item.type)}</b><div class="agent-action-details">${agentActionDetailsHtml(item)}</div></li>`).join('')}</ol>`;
  const controls =
    status === 'PENDING'
      ? `<button class="primary-btn compact" data-agent-confirm="${anchor.id}">${single ? 'Xác nhận' : `Xác nhận tất cả (${count})`}</button><button class="outline-btn" data-agent-cancel="${anchor.id}">${single ? 'Hủy' : 'Hủy tất cả'}</button>`
      : status === 'EXECUTED'
        ? `<span class="agent-status">${AGENT_STATUS_LABELS.EXECUTED}</span><button class="outline-btn" data-agent-undo="${anchor.id}" data-agent-count="${count}">${single ? 'Hoàn tác' : 'Hoàn tác cả nhóm'}</button>`
        : `<span class="agent-status">${escapeHtml(AGENT_STATUS_LABELS[status] || status)}</span>`;
  return `<article class="agent-action ${status.toLowerCase()}${risky ? ' high-risk' : ''}" data-agent-action="${anchor.id}"><strong>${escapeHtml(title)}</strong>${risky && status === 'PENDING' ? '<p class="agent-action-warning">Có thay đổi xóa hoặc lưu trữ dữ liệu, hãy kiểm tra kỹ.</p>' : ''}${body}<div class="agent-action-controls">${controls}</div></article>`;
}

export function groupAgentActions(actions) {
  const groups = new Map();
  for (const action of actions || []) {
    const key = action.batchId || action.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  }
  return [...groups.values()];
}

export function agentAttachmentsHtml(attachments) {
  return (attachments || [])
    .map(
      (item) =>
        `<button type="button" class="agent-download outline-btn" data-agent-download="${escapeHtml(item.url)}" data-agent-filename="${escapeHtml(item.filename || 'transactions.csv')}">↓ ${escapeHtml(item.label || 'Tải tệp')}</button>`
    )
    .join('');
}

export async function streamAgentText(element, text) {
  if (!element) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
    element.innerHTML = renderMarkdown(text);
    return;
  }
  element.classList.add('streaming');
  element.innerHTML = '';
  const chunkSize = Math.max(2, Math.ceil(text.length / 120));
  for (let index = 0; index < text.length; index += chunkSize) {
    const visibleText = text.slice(0, index + chunkSize);
    element.innerHTML = renderMarkdown(visibleText);
    if (index % (chunkSize * 6) === 0) {
      const history = $('#assistant-history');
      history.scrollTop = history.scrollHeight;
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  element.innerHTML = renderMarkdown(text);
  element.classList.remove('streaming');
}

/** Nút mở màn hình mà công cụ đọc của Agent gợi ý (ví dụ "Mở Ví của tôi"). */
export function agentUiActionsHtml(actions) {
  const buttons = (actions || [])
    .map(
      (action) =>
        `<button type="button" class="agent-ui-action" data-agent-open-view="${escapeHtml(action.view || 'dashboard')}">${escapeHtml(action.label || 'Mở màn hình')}</button>`
    )
    .join('');
  return buttons ? `<div class="agent-ui-actions">${buttons}</div>` : '';
}

export function contextualAgentPrompts() {
  const next = nextOnboardingStep();
  return [
    next ? `Hướng dẫn tôi ${next.title.toLocaleLowerCase('vi-VN')}` : 'Phân tích tình hình tài chính của tôi',
    'Agent có thể làm gì cho tôi?',
    'Tôi nên chú ý điều gì trong tháng này?'
  ];
}

/** Vẽ hội thoại: tin nhắn theo thời gian, thẻ nhóm thay đổi đặt ngay sau câu trả lời của cùng lượt. Hội thoại trống
 * hiện lời mời và vài câu hỏi gợi ý theo ngữ cảnh. */
export function renderAgentMessages(data) {
  const history = $('#assistant-history');
  const messages = data?.messages || [];
  const actions = data?.actions || [];
  if (!messages.length) {
    history.innerHTML = `<div class="agent-empty"><strong>Bắt đầu theo cách tự nhiên</strong><span>Hỏi một câu hoặc giao việc; Agent sẽ tự chọn công cụ khi cần và luôn cho bạn xem trước thay đổi.</span></div><div class="agent-prompt-chips">${contextualAgentPrompts()
      .map(
        (prompt) =>
          `<button type="button" class="agent-prompt-chip" data-agent-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`
      )
      .join('')}</div>`;
    history.scrollTop = history.scrollHeight;
    return;
  }
  // Action được tạo trong lúc Agent đang xử lý, trước khi câu trả lời được lưu. Đặt thẻ nhóm ngay SAU câu trả lời
  // đầu tiên được lưu sau nó (câu trả lời của cùng lượt), để lời nhắc "bạn xác nhận nhé" nằm phía trên thẻ.
  const pendingGroups = groupAgentActions(actions)
    .map((items) => ({ items, at: new Date(items[0].createdAt).getTime() }))
    .sort((a, b) => a.at - b.at);
  const timeline: Array<{ kind: 'message'; item } | { kind: 'actions'; items }> = [];
  for (const item of messages) {
    timeline.push({ kind: 'message', item });
    if (item.role === 'assistant') {
      const at = new Date(item.createdAt).getTime();
      while (pendingGroups.length && pendingGroups[0].at <= at)
        timeline.push({ kind: 'actions', items: pendingGroups.shift()!.items });
    }
  }
  for (const group of pendingGroups) timeline.push({ kind: 'actions', items: group.items });
  history.innerHTML = timeline
    .map((entry) => {
      if (entry.kind === 'actions') return agentActionGroupHtml(entry.items);
      const item = entry.item;
      const failed = item.status === 'failed';
      const content =
        item.role === 'assistant'
          ? `<div class="agent-markdown">${renderMarkdown(item.content)}</div>`
          : escapeHtml(item.content);
      return `<div class="assistant-message ${item.role === 'user' ? 'user' : 'bot'}${failed ? ' failed' : ''}">${item.role === 'assistant' ? `<span title="${escapeHtml([item.provider, item.model].filter(Boolean).join(' · '))}">Sổ Mộc</span>` : ''}${content}${failed ? `<small>Không xử lý được · ${escapeHtml(item.errorCode || 'AI_ERROR')}</small><button type="button" class="text-btn" data-agent-retry="${item.id}" data-agent-question="${escapeHtml(item.content)}">Thử lại</button>` : ''}</div>`;
    })
    .join('');
  history.scrollTop = history.scrollHeight;
}
