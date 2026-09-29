import type { Transaction } from '../../api/types';
import { moneyCurrency, shortDate } from '../../lib/format';

const ICONS = { EXPENSE: '↗', INCOME: '↙', TRANSFER: '↔' } as const;
const SIGNS = { EXPENSE: '−', INCOME: '＋', TRANSFER: '' } as const;

interface Props {
  transaction: Transaction;
  fallbackCurrency: string;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
}

/** Một dòng giao dịch: biểu tượng theo loại, ghi chú hoặc danh mục, ví và ngày, số tiền có dấu. */
export function TransactionRow({ transaction: item, fallbackCurrency, onEdit, onDelete }: Props) {
  const kind = item.type.toLowerCase();
  const title = item.note || item.category?.name || (item.type === 'TRANSFER' ? 'Chuyển khoản' : 'Giao dịch');
  const subtitle = [
    `${item.wallet.name}${item.destinationWallet ? ` → ${item.destinationWallet.name}` : ''}`,
    item.category?.name,
    shortDate(item.occurredAt)
  ]
    .filter(Boolean)
    .join(' · ');
  const actions = Boolean(onEdit || onDelete);
  return (
    <article className={`transaction-row${actions ? ' has-actions' : ''}`}>
      <div className={`transaction-icon ${kind}`} aria-hidden="true">
        {ICONS[item.type]}
      </div>
      <div className="transaction-info">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className={`transaction-amount ${kind}`}>
        {SIGNS[item.type]} {moneyCurrency(item.amount, item.wallet.currency || fallbackCurrency)}
      </div>
      {actions && (
        <div className="row-actions">
          {onEdit && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(item)}>
              Sửa
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => onDelete(item)}>
              Xóa
            </button>
          )}
        </div>
      )}
    </article>
  );
}
