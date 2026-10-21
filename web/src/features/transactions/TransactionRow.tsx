import type { Transaction } from '../../api/types';
import { moneyCurrency, shortDate } from '../../lib/format';

const SIGNS = { EXPENSE: '−', INCOME: '+', TRANSFER: '' } as const;

interface Props {
  transaction: Transaction;
  fallbackCurrency: string;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
}

/** Một dòng giao dịch: ghi chú hoặc danh mục, ví và ngày, số tiền có dấu (thu màu xanh lục, chi để màu mực). */
export function TransactionRow({ transaction: item, fallbackCurrency, onEdit, onDelete }: Props) {
  const kind = item.type.toLowerCase();
  const title = item.note || item.category?.name || (item.type === 'TRANSFER' ? 'Chuyển khoản' : 'Giao dịch');
  // Ba mảnh luôn có đủ chỗ (mảnh trống để trống) để bảng giao dịch rộng giữ thẳng cột.
  const parts = [
    `${item.wallet.name}${item.destinationWallet ? ` → ${item.destinationWallet.name}` : ''}`,
    item.category?.name ?? '',
    shortDate(item.occurredAt)
  ];
  const actions = Boolean(onEdit || onDelete);
  return (
    <article className={`transaction-row${actions ? ' has-actions' : ''}`}>
      <div className="transaction-info">
        <strong>{title}</strong>
        <span className="transaction-meta">
          {parts.map((part, index) => (
            <i key={index}>{part}</i>
          ))}
        </span>
      </div>
      <div className={`transaction-amount ${kind}`}>
        {SIGNS[item.type]}
        {moneyCurrency(item.amount, item.wallet.currency || fallbackCurrency)}
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
