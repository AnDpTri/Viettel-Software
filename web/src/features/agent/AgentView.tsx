import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, downloadFile, upload } from '../../api/client';
import { queryKeys, useOnboarding, useRefreshLedger } from '../../api/queries';
import type {
  AgentAction,
  AgentAttachment,
  AgentConversation,
  AgentMessage,
  AgentReply,
  AgentSettings,
  AgentUiAction
} from '../../api/types';
import { useUser } from '../../app/auth';
import { isView } from '../../app/navigation';
import { useUi } from '../../app/ui-state';
import { PanelHead, useViewState, ViewSection } from '../../app/view';
import { renderMarkdown, streamAgentText } from '../../lib/markdown';
import { errorMessage, useToast } from '../../ui/Toast';
import { AgentActionGroup, groupActions } from './AgentActionGroup';

type ChatMessage = AgentMessage & { stream?: boolean; attachments?: AgentAttachment[]; uiActions?: AgentUiAction[] };
type Entry =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'actions'; key: string; items: AgentAction[] }
  | { kind: 'thinking' };

/** Dòng thời gian của hội thoại đã lưu. Thay đổi được tạo trong lúc Agent xử lý, trước khi câu trả lời được lưu, nên thẻ
 * nhóm được đặt ngay SAU câu trả lời đầu tiên lưu sau nó (câu trả lời của cùng lượt). */
function buildTimeline(messages: AgentMessage[], actions: AgentAction[]): Entry[] {
  const pending = groupActions(actions)
    .map((items) => ({ items, at: new Date(items[0]!.createdAt).getTime() }))
    .sort((a, b) => a.at - b.at);
  const entries: Entry[] = [];
  for (const message of messages) {
    entries.push({ kind: 'message', message });
    if (message.role !== 'assistant') continue;
    const at = new Date(message.createdAt).getTime();
    while (pending.length && pending[0]!.at <= at) {
      const group = pending.shift()!;
      entries.push({ kind: 'actions', key: group.items[0]!.id, items: group.items });
    }
  }
  for (const group of pending) entries.push({ kind: 'actions', key: group.items[0]!.id, items: group.items });
  return entries;
}

let localId = 0;
const nextLocalId = () => `local-${(localId += 1)}`;

function BotText({
  message,
  onStreamed,
  scroller
}: {
  message: ChatMessage;
  onStreamed: () => void;
  scroller: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const streamed = useRef(false);
  useEffect(() => {
    if (!message.stream || streamed.current) return;
    streamed.current = true;
    void streamAgentText(ref.current, message.content, scroller).then(onStreamed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ hiện dần một lần cho mỗi câu trả lời mới
  }, [message.stream]);
  if (message.stream) return <div ref={ref} className="agent-markdown" aria-live="polite" />;
  return <div className="agent-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />;
}

/** Trợ lý tài chính: trò chuyện, giao việc bằng tiếng Việt; mọi thay đổi dữ liệu hiện bản xem trước để xác nhận. */
export function AgentView() {
  const { visited } = useViewState('insights');
  const user = useUser();
  const ui = useUi();
  const toast = useToast();
  const client = useQueryClient();
  const refreshLedger = useRefreshLedger();
  const onboarding = useOnboarding().data;
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [busyActions, setBusyActions] = useState(false);

  const settings = useQuery({
    queryKey: ['agent', 'settings'],
    queryFn: () => api<AgentSettings>('/insights/settings'),
    enabled: visited
  });
  const conversations = useQuery({
    queryKey: ['agent', 'conversations'],
    queryFn: () => api<AgentConversation[]>('/insights/conversations'),
    enabled: visited
  });

  /** Thay đổi Agent đề xuất trong lượt vừa trả lời; hiện thành thẻ sau khi câu trả lời hiện dần xong. */
  const pendingReplyActions = useRef<AgentAction[]>([]);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      const history = historyRef.current;
      if (history) history.scrollTop = history.scrollHeight;
    });
  };
  useLayoutEffect(() => {
    scrollToEnd();
  }, [entries.length]);

  useEffect(() => {
    if (!ui.agentPrompt) return;
    setQuestion(ui.agentPrompt.text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [ui.agentPrompt]);

  async function loadConversation(id: string | null) {
    setConversationId(id);
    if (!id) return setEntries([]);
    const data = await api<{ messages: AgentMessage[]; actions: AgentAction[] }>(
      `/insights/conversations/${id}/messages`
    );
    setEntries(buildTimeline(data.messages, data.actions));
  }

  // Lần đầu mở Trợ lý thì tiếp tục cuộc trò chuyện gần nhất (API trả danh sách theo lần cập nhật mới nhất). Chỉ làm một
  // lần, để "＋ Mới" hay xóa hội thoại vẫn về khung trống như người dùng chọn.
  const resumedLatest = useRef(false);
  useEffect(() => {
    if (resumedLatest.current || !conversations.data) return;
    resumedLatest.current = true;
    const latest = conversations.data[0];
    if (latest && !conversationId && entries.length === 0)
      loadConversation(latest.id).catch((error) => toast(errorMessage(error), true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ xét khi danh sách hội thoại tải lần đầu
  }, [conversations.data]);

  async function send(text: string, retryMessageId?: string) {
    setSending(true);
    setEntries((current) => [
      ...current,
      ...(retryMessageId
        ? []
        : [
            {
              kind: 'message',
              message: {
                id: nextLocalId(),
                role: 'user',
                content: text,
                status: 'completed',
                createdAt: new Date().toISOString()
              }
            } as Entry
          ]),
      { kind: 'thinking' }
    ]);
    try {
      const reply = await api<AgentReply>('/insights/assistant', {
        method: 'POST',
        body: {
          question: text,
          conversationId: conversationId ?? undefined,
          retryMessageId,
          uiContext: { currentView: ui.view }
        }
      });
      setConversationId(reply.conversationId);
      if (reply.onboarding) client.setQueryData(queryKeys.onboarding, reply.onboarding);
      const message: ChatMessage = {
        id: nextLocalId(),
        role: 'assistant',
        content: reply.answer,
        provider: reply.provider,
        model: reply.model,
        status: 'completed',
        errorCode: null,
        createdAt: new Date().toISOString(),
        stream: true,
        attachments: reply.attachments,
        uiActions: reply.uiActions
      };
      setEntries((current) => [...current.filter((entry) => entry.kind !== 'thinking'), { kind: 'message', message }]);
      // Thẻ thay đổi hiện sau khi câu trả lời hiện xong, để lời nhắc "bạn xác nhận nhé" nằm phía trên thẻ.
      pendingReplyActions.current = reply.actions;
      await client.invalidateQueries({ queryKey: ['agent', 'conversations'] });
    } catch (error) {
      setEntries((current) => current.filter((entry) => entry.kind !== 'thinking'));
      const failedConversation =
        error instanceof ApiError ? (error.details?.conversationId as string | undefined) : undefined;
      if (failedConversation) {
        await client.invalidateQueries({ queryKey: ['agent', 'conversations'] });
        await loadConversation(failedConversation).catch(() => undefined);
      }
      toast(errorMessage(error), true);
    } finally {
      setSending(false);
    }
  }

  function finishStreaming(id: string) {
    const actions = pendingReplyActions.current;
    pendingReplyActions.current = [];
    setEntries((current) => [
      ...current.map((entry) =>
        entry.kind === 'message' && entry.message.id === id
          ? { ...entry, message: { ...entry.message, stream: false } }
          : entry
      ),
      ...groupActions(actions).map((items) => ({ kind: 'actions' as const, key: items[0]!.id, items }))
    ]);
    scrollToEnd();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || sending) return;
    setQuestion('');
    await send(text);
  }

  async function actOn(operation: () => Promise<void>) {
    setBusyActions(true);
    try {
      await operation();
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      setBusyActions(false);
    }
  }

  const confirmAction = (id: string) =>
    actOn(async () => {
      const result = await api<{ actions?: AgentAction[] }>(`/insights/actions/${id}/confirm`, { method: 'POST' });
      const count = result.actions?.length || 1;
      toast(count > 1 ? `Đã lưu ${count} thay đổi.` : 'Đã lưu thay đổi.');
      await Promise.all([refreshLedger(), loadConversation(conversationId)]);
    });
  const cancelAction = (id: string) =>
    actOn(async () => {
      await api(`/insights/actions/${id}/cancel`, { method: 'POST' });
      await loadConversation(conversationId);
    });
  const undoAction = (id: string, count: number) => {
    if (!confirm(count > 1 ? `Hoàn tác cả ${count} thay đổi?` : 'Hoàn tác thay đổi này?')) return;
    void actOn(async () => {
      await api(`/insights/actions/${id}/undo`, { method: 'POST' });
      toast('Đã hoàn tác.');
      await Promise.all([refreshLedger(), loadConversation(conversationId)]);
    });
  };

  async function readReceipt(file: File) {
    const form = new FormData();
    form.append('receipt', file);
    try {
      const receipt = await upload<{ merchant?: string; amount?: number; currency?: string; occurredAt?: string }>(
        '/api/v1/insights/extract-receipt-image',
        form
      );
      if (!Number(receipt.amount))
        return toast(
          'Không đọc được số tiền trên hóa đơn. Bạn thử ảnh rõ và thẳng hơn, hoặc nhắn số tiền để Trợ lý ghi giúp.',
          true
        );
      const known = [
        receipt.merchant && `cửa hàng ${receipt.merchant}`,
        `tổng tiền ${receipt.amount} ${receipt.currency || user.currency}`,
        receipt.occurredAt && `ngày ${String(receipt.occurredAt).slice(0, 10)}`
      ]
        .filter(Boolean)
        .join(', ');
      await send(`Hãy tạo bản nháp giao dịch từ hóa đơn: ${known}.`);
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  async function toggleConsent() {
    const current = settings.data;
    if (!current) return;
    try {
      await api('/insights/settings', { method: 'PUT', body: { consent: !current.consent } });
      client.setQueryData(['agent', 'settings'], { ...current, consent: !current.consent });
      toast(current.consent ? 'Đã thu hồi quyền sử dụng AI.' : 'Đã bật AI cho Trợ lý.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  const next = onboarding?.steps.find((step) => !step.completed);
  const prompts = [
    next ? `Hướng dẫn tôi ${next.title.toLocaleLowerCase('vi-VN')}` : 'Phân tích tình hình tài chính của tôi',
    'Trợ lý có thể làm gì cho tôi?',
    'Tôi nên chú ý điều gì trong tháng này?'
  ];
  const agentSettings = settings.data;
  const quota = agentSettings?.unlimited
    ? 'VIP · không giới hạn lượt hỏi'
    : `Còn ${agentSettings?.remainingToday}/${agentSettings?.dailyLimit} lượt hôm nay`;

  return (
    <ViewSection view="insights">
      <section className="panel agent-panel">
        <PanelHead
          eyebrow="TRÒ CHUYỆN VÀ LÀM VIỆC"
          title="Trợ lý tài chính Sổ Mộc"
          action={<span className="privacy-note">Mọi thay đổi đều cần bạn xác nhận</span>}
        />
        <div id="agent-toolbar" className="agent-toolbar">
          <select
            id="agent-conversation"
            aria-label="Cuộc trò chuyện"
            value={conversationId ?? ''}
            onChange={(event) =>
              loadConversation(event.target.value || null).catch((error) => toast(errorMessage(error), true))
            }
          >
            <option value="">Cuộc trò chuyện mới</option>
            {conversations.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <button
            id="agent-new"
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() => {
              void loadConversation(null);
              inputRef.current?.focus();
            }}
          >
            ＋ Mới
          </button>
          <button
            id="agent-delete"
            className="btn btn-outline btn-sm danger"
            type="button"
            disabled={!conversationId}
            onClick={() => {
              if (!conversationId || !confirm('Xóa cuộc trò chuyện này?')) return;
              void actOn(async () => {
                await api(`/insights/conversations/${conversationId}`, { method: 'DELETE' });
                await loadConversation(null);
                await client.invalidateQueries({ queryKey: ['agent', 'conversations'] });
              });
            }}
          >
            Xóa
          </button>
        </div>

        <div id="agent-consent" className={`agent-consent${agentSettings ? '' : ' hidden'}`}>
          {agentSettings &&
            (!agentSettings.externalAiEnabled ? (
              <span>Trợ lý AI chưa được cấu hình trên máy chủ này. Các chức năng khác vẫn dùng bình thường.</span>
            ) : agentSettings.consent ? (
              <>
                <span>
                  ✓ Đã cho phép {agentSettings.provider} xử lý nội dung chat. <b>{quota}</b>
                </span>
                <button
                  id="agent-consent-toggle"
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={toggleConsent}
                >
                  Thu hồi
                </button>
              </>
            ) : (
              <>
                <span>
                  Để trả lời, Trợ lý gửi nội dung chat và dữ liệu liên quan tới {agentSettings.provider}.{' '}
                  <details className="agent-disclosure">
                    <summary>Gửi những gì?</summary>
                    {agentSettings.disclosure.join(', ')}. Không gửi mật khẩu, token hay khóa bí mật.
                  </details>{' '}
                  <b>{quota}</b>
                </span>
                <button
                  id="agent-consent-toggle"
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={toggleConsent}
                >
                  Đồng ý dùng AI
                </button>
              </>
            ))}
        </div>

        <div id="assistant-history" className="assistant-history" ref={historyRef}>
          {entries.length === 0 ? (
            <>
              <div className="agent-empty">
                <strong>Bắt đầu theo cách tự nhiên</strong>
                <span>
                  Hỏi một câu hoặc giao việc; Trợ lý sẽ tự chọn công cụ khi cần và luôn cho bạn xem trước thay đổi.
                </span>
              </div>
              <div className="agent-prompt-chips">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="chip"
                    data-agent-prompt={prompt}
                    onClick={() => {
                      setQuestion(prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </>
          ) : (
            entries.map((entry, index) => {
              if (entry.kind === 'thinking')
                return (
                  <div key="thinking" className="assistant-message bot agent-thinking">
                    <span className="assistant-name">Sổ Mộc</span>
                    Đang suy nghĩ và tự chọn công cụ phù hợp…
                  </div>
                );
              if (entry.kind === 'actions')
                return (
                  <AgentActionGroup
                    key={`actions-${entry.key}`}
                    actions={entry.items}
                    currency={user.currency}
                    busy={busyActions}
                    onConfirm={confirmAction}
                    onCancel={cancelAction}
                    onUndo={undoAction}
                  />
                );
              const message = entry.message;
              const failed = message.status === 'failed';
              if (message.role === 'user')
                return (
                  <div key={message.id} className={`assistant-message user${failed ? ' failed' : ''}`}>
                    {message.content}
                    {failed && (
                      <>
                        <small>Không xử lý được · {message.errorCode || 'AI_ERROR'}</small>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-agent-retry={message.id}
                          disabled={sending}
                          onClick={() => send(message.content, message.id)}
                        >
                          Thử lại
                        </button>
                      </>
                    )}
                  </div>
                );
              return (
                <div key={message.id} className="assistant-message bot">
                  <span
                    className="assistant-name"
                    title={[message.provider, message.model].filter(Boolean).join(' · ')}
                  >
                    Sổ Mộc
                  </span>
                  <BotText
                    message={message}
                    scroller={historyRef.current}
                    onStreamed={() => finishStreaming(message.id)}
                  />
                  {!message.stream &&
                    message.attachments?.map((item) => (
                      <button
                        key={`${index}-${item.url}`}
                        type="button"
                        className="btn btn-outline btn-sm agent-download"
                        data-agent-download={item.url}
                        onClick={() =>
                          downloadFile(item.url, item.filename || 'download').catch((error) =>
                            toast(errorMessage(error), true)
                          )
                        }
                      >
                        ↓ {item.label || 'Tải tệp'}
                      </button>
                    ))}
                  {!message.stream && Boolean(message.uiActions?.length) && (
                    <div className="agent-ui-actions">
                      {message.uiActions!.map((action) => (
                        <button
                          key={`${action.view}-${action.label}`}
                          type="button"
                          className="chip"
                          data-agent-open-view={action.view}
                          onClick={() =>
                            action.view === 'profile'
                              ? ui.openModal('profile', null)
                              : ui.showView(isView(action.view) ? action.view : 'dashboard')
                          }
                        >
                          {action.label || 'Mở màn hình'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <form id="assistant-form" className="assistant-form" onSubmit={submit}>
          <label className="icon-btn agent-attach" title="Đọc ảnh hóa đơn">
            <span aria-hidden="true">📎</span>
            <span className="visually-hidden">Đọc ảnh hóa đơn</span>
            <input
              id="agent-receipt"
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void readReceipt(file);
              }}
            />
          </label>
          <input
            id="assistant-question"
            ref={inputRef}
            maxLength={1000}
            placeholder="Ví dụ: Ghi 120 nghìn tiền ăn trưa hôm qua bằng ví Tiền mặt"
            aria-label="Câu hỏi cho Trợ lý"
            required
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={sending}>
            Gửi
          </button>
        </form>
      </section>
    </ViewSection>
  );
}
