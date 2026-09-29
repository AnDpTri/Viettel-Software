import type { CSSProperties } from 'react';
import type { Wallet } from '../../api/types';
import { moneyCurrency, WALLET_TYPE_LABELS } from '../../lib/format';

const ICONS: Record<string, string> = { CASH: '₫', BANK: '▣', E_WALLET: '◈', CREDIT: '◇', OTHER: '□' };

interface Props {
  wallet: Wallet;
  onDetail?: () => void;
  onEdit?: () => void;
  onArchiveToggle?: () => void;
}

/** Thẻ ví: loại, tên, số dư. Số dư âm (thường là thẻ tín dụng) hiện màu cảnh báo. */
export function WalletCard({ wallet, onDetail, onEdit, onArchiveToggle }: Props) {
  const balance = Number(wallet.balance);
  const archived = Boolean(wallet.archivedAt);
  return (
    <article
      className={`wallet-card${archived ? ' archived' : ''}`}
      style={{ '--wallet-color': wallet.color ?? undefined } as CSSProperties}
    >
      <div className="wallet-card-top">
        <span className="wallet-type">
          {WALLET_TYPE_LABELS[wallet.type] ?? wallet.type}
          {archived && ' · Đã lưu trữ'}
        </span>
        <span className="wallet-icon" aria-hidden="true">
          {ICONS[wallet.type] ?? '□'}
        </span>
      </div>
      <h3>{wallet.name}</h3>
      <strong className={balance < 0 ? 'negative' : undefined}>{moneyCurrency(wallet.balance, wallet.currency)}</strong>
      {(onDetail || onEdit || onArchiveToggle) && (
        <div className="row-actions">
          {onDetail && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDetail}>
              Chi tiết
            </button>
          )}
          {onEdit && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
              Sửa
            </button>
          )}
          {onArchiveToggle && (
            <button
              type="button"
              className={`btn btn-ghost btn-sm${archived ? '' : ' danger'}`}
              onClick={onArchiveToggle}
            >
              {archived ? 'Khôi phục' : 'Lưu trữ'}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
