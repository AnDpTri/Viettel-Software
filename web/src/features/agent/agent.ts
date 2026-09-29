/* eslint-disable @typescript-eslint/no-explicit-any -- dữ liệu API và phần tử DOM chưa được gán kiểu chi tiết. */
import { api, apiErrorMessage } from '../../core/api';
import { $, $$ } from '../../core/dom';
import { escapeHtml } from '../../core/format';
import { state } from '../../core/state';
import { toast } from '../../core/toast';
import {
  agentActionGroupHtml,
  agentAttachmentsHtml,
  agentUiActionsHtml,
  groupAgentActions,
  renderAgentMessages,
  streamAgentText
} from './agent-view';
import { render } from '../dashboard';
import { showView } from '../navigation';
import { renderOnboarding } from '../onboarding';
import { loadData } from '../session';

// Agent tài chính: một khung chat, hành động có xem trước, xác nhận và hoàn tác.
export function setupAgentShell() {
  const view = $('#view-insights');
  if (!view || $('#agent-toolbar')) return;
  view.querySelector(':scope > .section-title')?.classList.add('hidden');
  $('#insight-metrics')?.classList.add('hidden');
  view.querySelector(':scope > .automation-grid')?.classList.add('hidden');
  const panel = view.querySelector('.assistant-panel');
  panel.classList.add('agent-panel');
  panel.querySelector('h2').textContent = 'Agent tài chính Sổ Mộc';
  panel.querySelector('.eyebrow').textContent = 'TRÒ CHUYỆN VÀ LÀM VIỆC';
  panel.querySelector('.privacy-note').textContent = 'Mọi thay đổi đều cần bạn xác nhận';
  panel
    .querySelector('.panel-head')
    .insertAdjacentHTML(
      'afterend',
      `<div id="agent-toolbar" class="agent-toolbar"><select id="agent-conversation" aria-label="Cuộc trò chuyện"><option value="">Cuộc trò chuyện mới</option></select><button id="agent-new" class="outline-btn" type="button">＋ Mới</button><button id="agent-delete" class="outline-btn danger" type="button">Xóa</button></div><div id="agent-consent" class="agent-consent hidden"></div>`
    );
  const form = $('#assistant-form');
  $('#assistant-question').placeholder = 'Ví dụ: Ghi 120 nghìn tiền ăn trưa hôm qua bằng ví Tiền mặt';
  form.insertAdjacentHTML(
    'afterbegin',
    '<label class="agent-attach" title="Đọc ảnh hóa đơn">📎<input id="agent-receipt" type="file" accept="image/jpeg,image/png" hidden></label>'
  );
  form.querySelector('button').textContent = 'Gửi';
}

export async function refreshAgentConversations(selectCurrent = true) {
  state.assistantConversations = await api('/insights/conversations');
  const select = $('#agent-conversation');
  select.innerHTML =
    '<option value="">Cuộc trò chuyện mới</option>' +
    state.assistantConversations
      .map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`)
      .join('');
  if (selectCurrent && state.assistantConversationId) select.value = state.assistantConversationId;
}

export async function loadAgentConversation(id) {
  state.assistantConversationId = id || null;
  if (!id) {
    renderAgentMessages(null);
    $('#agent-conversation').value = '';
    return;
  }
  const data = await api(`/insights/conversations/${id}/messages`);
  renderAgentMessages(data);
  $('#agent-conversation').value = id;
}

// Lời xin phép dùng AI gọn một dòng, chi tiết gửi gì nằm trong phần mở rộng.
export function renderAgentConsent() {
  const box = $('#agent-consent');
  box.classList.remove('hidden');
  if (!state.agentSettings?.externalAiEnabled) {
    box.innerHTML =
      '<span>Trợ lý AI chưa được cấu hình trên máy chủ này. Các chức năng khác vẫn dùng bình thường.</span>';
    return;
  }
  const settings = state.agentSettings;
  const quota = settings.unlimited
    ? 'VIP · không giới hạn lượt hỏi'
    : `Còn ${settings.remainingToday}/${settings.dailyLimit} lượt hôm nay`;
  box.innerHTML = settings.consent
    ? `<span>✓ Đã cho phép ${escapeHtml(settings.provider)} xử lý nội dung chat. <b>${escapeHtml(quota)}</b></span><button id="agent-consent-toggle" class="text-btn" type="button">Thu hồi</button>`
    : `<span>Để trả lời, Trợ lý gửi nội dung chat và dữ liệu liên quan tới ${escapeHtml(settings.provider)}. <details class="agent-disclosure"><summary>Gửi những gì?</summary>${escapeHtml(settings.disclosure.join(', '))}. Không gửi mật khẩu, token hay khóa bí mật.</details> <b>${escapeHtml(quota)}</b></span><button id="agent-consent-toggle" class="primary-btn compact" type="button">Đồng ý dùng AI</button>`;
  $('#agent-consent-toggle').onclick = async () => {
    try {
      const consent = !settings.consent;
      await api('/insights/settings', { method: 'PUT', body: JSON.stringify({ consent }) });
      settings.consent = consent;
      renderAgentConsent();
      toast(consent ? 'Đã bật AI cho Trợ lý.' : 'Đã thu hồi quyền sử dụng AI.');
    } catch (error) {
      toast(error.message, true);
    }
  };
}

export async function loadAgentUi() {
  setupAgentShell();
  try {
    [state.agentSettings] = await Promise.all([api('/insights/settings'), refreshAgentConversations()]);
    renderAgentConsent();
    if (state.assistantConversationId) await loadAgentConversation(state.assistantConversationId);
    else renderAgentMessages(null);
  } catch (error) {
    toast(error.message, true);
  }
}

export async function sendAgentMessage(question: string, retryMessageId?: string) {
  const history = $('#assistant-history');
  history.querySelector('.agent-thinking')?.remove();
  history.querySelectorAll('.agent-empty,.agent-prompt-chips').forEach((item) => item.remove());
  history.insertAdjacentHTML(
    'beforeend',
    `${retryMessageId ? '' : `<div class="assistant-message user">${escapeHtml(question)}</div>`}<div class="assistant-message bot agent-thinking"><span>Sổ Mộc</span>Đang suy nghĩ và tự chọn công cụ phù hợp…</div>`
  );
  history.scrollTop = history.scrollHeight;
  const result = await api('/insights/assistant', {
    method: 'POST',
    body: JSON.stringify({
      question,
      conversationId: state.assistantConversationId || undefined,
      retryMessageId,
      uiContext: { currentView: state.currentView }
    })
  });
  state.assistantConversationId = result.conversationId;
  history.querySelector('.agent-thinking')?.remove();
  if (result.onboarding) {
    state.onboarding = result.onboarding;
    renderOnboarding();
  }
  const message = document.createElement('div');
  message.className = 'assistant-message bot';
  message.innerHTML = `<span title="${escapeHtml([result.provider, result.model].filter(Boolean).join(' · '))}">Sổ Mộc</span><div class="agent-stream-text agent-markdown" aria-live="polite"></div>`;
  history.appendChild(message);
  await streamAgentText(message.querySelector('.agent-stream-text'), result.answer);
  message.insertAdjacentHTML(
    'beforeend',
    agentAttachmentsHtml(result.attachments) + agentUiActionsHtml(result.uiActions)
  );
  history.insertAdjacentHTML('beforeend', groupAgentActions(result.actions).map(agentActionGroupHtml).join(''));
  await refreshAgentConversations();
  history.scrollTop = history.scrollHeight;
}

/** Gửi câu hỏi, đổi hội thoại, đọc ảnh hóa đơn, xác nhận/hủy/hoàn tác nhóm thay đổi, tải tệp, câu hỏi gợi ý. */
export function setupAgent() {
  $('#assistant-form').addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const question = $('#assistant-question').value.trim();
      if (!question) return;
      const button = event.submitter || event.currentTarget.querySelector('button');
      button.disabled = true;
      $('#assistant-question').value = '';
      try {
        await sendAgentMessage(question);
      } catch (error) {
        document.querySelector('.agent-thinking')?.remove();
        if (error.details?.conversationId) {
          state.assistantConversationId = error.details.conversationId;
          await refreshAgentConversations();
          await loadAgentConversation(state.assistantConversationId);
        }
        toast(error.message, true);
      } finally {
        button.disabled = false;
      }
    },
    true
  );

  document.addEventListener('change', async (event: any) => {
    if (event.target.id === 'agent-conversation') {
      try {
        await loadAgentConversation(event.target.value);
      } catch (error) {
        toast(error.message, true);
      }
    }
    if (event.target.id === 'agent-receipt' && event.target.files?.[0]) {
      const file = event.target.files[0];
      const form = new FormData();
      form.append('receipt', file);
      try {
        const response = await fetch('/api/v1/insights/extract-receipt-image', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Authorization: `Bearer ${state.token}` },
          body: form
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apiErrorMessage(body));
        const receipt = body.data;
        if (!Number(receipt.amount)) {
          toast(
            'Không đọc được số tiền trên hóa đơn. Bạn thử ảnh rõ và thẳng hơn, hoặc nhắn số tiền để Agent ghi giúp.',
            true
          );
          return;
        }
        const known = [
          receipt.merchant && `cửa hàng ${receipt.merchant}`,
          `tổng tiền ${receipt.amount} ${receipt.currency || state.user.currency}`,
          receipt.occurredAt && `ngày ${String(receipt.occurredAt).slice(0, 10)}`
        ]
          .filter(Boolean)
          .join(', ');
        await sendAgentMessage(`Hãy tạo bản nháp giao dịch từ hóa đơn: ${known}.`);
      } catch (error) {
        toast(error.message, true);
      } finally {
        event.target.value = '';
      }
    }
  });

  document.addEventListener('click', async (event: any) => {
    const confirmId = event.target.closest('[data-agent-confirm]')?.dataset.agentConfirm;
    const cancelId = event.target.closest('[data-agent-cancel]')?.dataset.agentCancel;
    const undoId = event.target.closest('[data-agent-undo]')?.dataset.agentUndo;
    try {
      const retry = event.target.closest('[data-agent-retry]');
      if (retry) {
        retry.disabled = true;
        try {
          await sendAgentMessage(retry.dataset.agentQuestion, retry.dataset.agentRetry);
        } finally {
          retry.disabled = false;
        }
      }
      const downloadButton = event.target.closest('[data-agent-download]');
      const downloadUrl = downloadButton?.dataset.agentDownload;
      if (downloadUrl) {
        const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${state.token}` } });
        if (!response.ok) throw new Error('Không thể tải tệp.');
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = downloadButton.dataset.agentFilename || 'download';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
      const actionButton = event.target.closest('[data-agent-confirm],[data-agent-cancel],[data-agent-undo]');
      const card = actionButton?.closest('.agent-action');
      if (card)
        card.querySelectorAll('button').forEach((button) => {
          button.disabled = true;
        });
      if (confirmId) {
        const result = await api(`/insights/actions/${confirmId}/confirm`, { method: 'POST' });
        const count = (result.actions || []).length || 1;
        toast(count > 1 ? `Đã lưu ${count} thay đổi.` : 'Đã lưu thay đổi.');
        await loadData();
        render();
        await loadAgentConversation(state.assistantConversationId);
      }
      if (cancelId) {
        await api(`/insights/actions/${cancelId}/cancel`, { method: 'POST' });
        await loadAgentConversation(state.assistantConversationId);
      }
      const undoCount = Number(event.target.closest('[data-agent-undo]')?.dataset.agentCount || 1);
      if (undoId) {
        if (window.confirm(undoCount > 1 ? `Hoàn tác cả ${undoCount} thay đổi?` : 'Hoàn tác thay đổi này?')) {
          await api(`/insights/actions/${undoId}/undo`, { method: 'POST' });
          toast('Đã hoàn tác.');
          await loadData();
          render();
          await loadAgentConversation(state.assistantConversationId);
        } else if (card)
          card.querySelectorAll('button').forEach((button) => {
            button.disabled = false;
          });
      }
      if (event.target.id === 'agent-new') {
        state.assistantConversationId = null;
        renderAgentMessages(null);
        $('#agent-conversation').value = '';
        $('#assistant-question').focus();
      }
      if (
        event.target.id === 'agent-delete' &&
        state.assistantConversationId &&
        window.confirm('Xóa cuộc trò chuyện này?')
      ) {
        await api(`/insights/conversations/${state.assistantConversationId}`, { method: 'DELETE' });
        state.assistantConversationId = null;
        await refreshAgentConversations();
        renderAgentMessages(null);
      }
    } catch (error) {
      $$('.agent-action button:disabled').forEach((button) => {
        button.disabled = false;
      });
      toast(error.message, true);
    }
  });
  document.addEventListener('click', (event: any) => {
    const prompt = event.target.closest('[data-agent-prompt]')?.dataset.agentPrompt;
    if (prompt) {
      $('#assistant-question').value = prompt;
      $('#assistant-question').focus();
    }
    const action = event.target.closest('[data-agent-open-view]');
    if (action) {
      if (action.dataset.agentOpenView === 'profile') $('#open-profile').click();
      else showView(action.dataset.agentOpenView);
    }
  });
}
