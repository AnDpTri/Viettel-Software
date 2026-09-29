import type { AgentAction, AgentActionStatus } from '../../api/types';
import { ENUM_LABELS, moneyCurrency, shortDate } from '../../lib/format';

const PREVIEW_LABELS: Record<string, string> = {
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
/** Trường kỹ thuật không có ý nghĩa với người dùng (mã màu, ID) hoặc đã hiển thị cùng số tiền (tiền tệ). */
const HIDDEN = new Set(['title', 'currency', 'color', 'parentId', 'walletId', 'categoryId', 'changes']);
const MONEY_KEYS = new Set([
  'amount',
  'targetAmount',
  'currentAmount',
  'openingBalance',
  'currentBalance',
  'actualBalance',
  'adjustment'
]);
const DATE_KEYS = new Set(['occurredAt', 'startDate', 'endDate', 'targetDate', 'dueAt', 'nextRunAt']);

export const ACTION_STATUS_LABELS: Record<AgentActionStatus, string> = {
  PENDING: 'Chờ xác nhận',
  EXECUTED: 'Đã lưu',
  CANCELLED: 'Đã hủy',
  UNDONE: 'Đã hoàn tác',
  EXPIRED: 'Đã hết hạn',
  FAILED: 'Không thực hiện được'
};

function previewValue(
  key: string,
  value: unknown,
  preview: Record<string, unknown>,
  fallbackCurrency: string,
  kind?: string
) {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'money' || MONEY_KEYS.has(key))
    return moneyCurrency(value, (preview.currency as string) || fallbackCurrency);
  if (kind === 'date' || DATE_KEYS.has(key)) return shortDate(value as string);
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.join(', ');
  return ENUM_LABELS[String(value)] ?? String(value);
}

type Change = { label: string; from: unknown; to: unknown; kind?: string };

function Details({ action, currency }: { action: AgentAction; currency: string }) {
  const preview = action.preview ?? {};
  const rows = Object.entries(preview).filter(
    ([key, value]) => !HIDDEN.has(key) && value !== null && value !== undefined && value !== ''
  );
  // `changes` là danh sách {label, from, to}; bản xem trước cũ lưu object thô thì chỉ hiện giá trị mới, bỏ trường ID.
  const changes = Array.isArray(preview.changes)
    ? (preview.changes as Change[])
    : preview.changes && typeof preview.changes === 'object'
      ? Object.entries(preview.changes as Record<string, unknown>)
          .filter(([key]) => !/Id$/.test(key) && !HIDDEN.has(key))
          .map(([key, value]): Change => ({ label: PREVIEW_LABELS[key] ?? key, from: undefined, to: value }))
      : [];
  return (
    <dl className="agent-action-details">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{PREVIEW_LABELS[key] ?? key}</dt>
          <dd>{previewValue(key, value, preview, currency)}</dd>
        </div>
      ))}
      {changes.map((change, index) => (
        <div key={`change-${index}`} className="agent-change">
          <dt>{change.label}</dt>
          <dd>
            {change.from !== undefined && <>{previewValue('', change.from, preview, currency, change.kind)} → </>}
            {previewValue('', change.to, preview, currency, change.kind)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Gộp các thay đổi Agent đề xuất trong cùng một lượt (cùng batchId) để xác nhận, hủy, hoàn tác một lần. */
export function groupActions(actions: AgentAction[]) {
  const groups = new Map<string, AgentAction[]>();
  for (const action of actions) {
    const key = action.batchId ?? action.id;
    groups.set(key, [...(groups.get(key) ?? []), action]);
  }
  return [...groups.values()];
}

interface Props {
  actions: AgentAction[];
  currency: string;
  busy: boolean;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onUndo: (id: string, count: number) => void;
}

/** Một thẻ cho cả nhóm thay đổi: tiêu đề, cảnh báo khi có thao tác xóa/lưu trữ, chi tiết từng mục và nút hành động. */
export function AgentActionGroup({ actions, currency, busy, onConfirm, onCancel, onUndo }: Props) {
  const count = actions.length;
  const statuses = actions.map((item) => item.status);
  const status: AgentActionStatus = statuses.includes('PENDING')
    ? 'PENDING'
    : statuses.includes('EXECUTED')
      ? 'EXECUTED'
      : statuses[0]!;
  const anchor = actions.find((item) => item.status === status) ?? actions[0]!;
  const single = count === 1;
  const risky = actions.some((item) => item.risk === 'HIGH');
  const groupTitles: Record<AgentActionStatus, string> = {
    PENDING: `${count} thay đổi chờ xác nhận`,
    EXECUTED: `Đã lưu ${count} thay đổi`,
    CANCELLED: `Đã hủy ${count} thay đổi`,
    UNDONE: `Đã hoàn tác ${count} thay đổi`,
    EXPIRED: `${count} thay đổi đã hết hạn`,
    FAILED: `${count} thay đổi không thực hiện được`
  };
  const title = single ? String(anchor.preview?.title ?? anchor.type) : groupTitles[status];

  return (
    <article
      className={`agent-action ${status.toLowerCase()}${risky ? ' high-risk' : ''}`}
      data-agent-action={anchor.id}
    >
      <strong className="agent-action-title">{title}</strong>
      {risky && status === 'PENDING' && (
        <p className="agent-action-warning">Có thay đổi xóa hoặc lưu trữ dữ liệu, hãy kiểm tra kỹ.</p>
      )}
      {single ? (
        <Details action={anchor} currency={currency} />
      ) : (
        <ol className="agent-action-items">
          {actions.map((item) => (
            <li key={item.id}>
              <b>{String(item.preview?.title ?? item.type)}</b>
              <Details action={item} currency={currency} />
            </li>
          ))}
        </ol>
      )}
      <div className="agent-action-controls">
        {status === 'PENDING' ? (
          <>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              data-agent-confirm={anchor.id}
              disabled={busy}
              onClick={() => onConfirm(anchor.id)}
            >
              {single ? 'Xác nhận' : `Xác nhận tất cả (${count})`}
            </button>
            <button
              className="btn btn-outline btn-sm"
              type="button"
              data-agent-cancel={anchor.id}
              disabled={busy}
              onClick={() => onCancel(anchor.id)}
            >
              {single ? 'Hủy' : 'Hủy tất cả'}
            </button>
          </>
        ) : status === 'EXECUTED' ? (
          <>
            <span className="agent-status">{ACTION_STATUS_LABELS.EXECUTED}</span>
            <button
              className="btn btn-outline btn-sm"
              type="button"
              data-agent-undo={anchor.id}
              disabled={busy}
              onClick={() => onUndo(anchor.id, count)}
            >
              {single ? 'Hoàn tác' : 'Hoàn tác cả nhóm'}
            </button>
          </>
        ) : (
          <span className="agent-status">{ACTION_STATUS_LABELS[status] ?? status}</span>
        )}
      </div>
    </article>
  );
}
