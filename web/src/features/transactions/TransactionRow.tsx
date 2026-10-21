import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Transaction } from '../../api/types';
import { moneyCurrency, shortDate } from '../../lib/format';
import { CategoryChip } from '../../ui/CategoryChip';

const SIGNS = { EXPENSE: '−', INCOME: '+', TRANSFER: '' } as const;

/** Khoảng vuốt (px) để kích hoạt Sửa hoặc Xóa, và khoảng kéo tối đa của dòng. */
const SWIPE_TRIGGER = 72;
const SWIPE_MAX = 104;

interface Props {
  transaction: Transaction;
  fallbackCurrency: string;
  /** Màu người dùng đặt cho danh mục của giao dịch (để chọn tông của viên danh mục). */
  categoryColor?: string | null;
  /** Bỏ ngày khỏi dòng (khi danh sách đã gom theo ngày). */
  hideDate?: boolean;
  /** Dòng hai lớp cho điện thoại: vuốt trái để Xóa, vuốt phải để Sửa, kèm nút "…". */
  phone?: boolean;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
}

/** Giờ trong ngày (HH:mm); biểu mẫu chỉ lưu ngày nên 12:00 đúng là giờ mặc định và không hiện. */
export function timeLabel(value: string | Date): string {
  const date = new Date(value);
  if (date.getHours() === 12 && date.getMinutes() === 0) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function titleOf(item: Transaction) {
  return item.note || item.category?.name || (item.type === 'TRANSFER' ? 'Chuyển khoản' : 'Giao dịch');
}

function walletText(item: Transaction) {
  return `${item.wallet.name}${item.destinationWallet ? ` → ${item.destinationWallet.name}` : ''}`;
}

/** Một dòng giao dịch: ghi chú hoặc danh mục, ví và ngày, số tiền có dấu (thu màu xanh lục, chi để màu mực). */
export function TransactionRow(props: Props) {
  return props.phone ? <PhoneRow {...props} /> : <WideRow {...props} />;
}

function WideRow({ transaction: item, fallbackCurrency, categoryColor, hideDate, onEdit, onDelete }: Props) {
  const kind = item.type.toLowerCase();
  // Ba mảnh luôn có đủ chỗ (mảnh trống để trống) để bảng giao dịch rộng giữ thẳng cột.
  const time = timeLabel(item.occurredAt);
  const wallet = hideDate && time ? `${walletText(item)} · ${time}` : walletText(item);
  const chip = item.category ? (
    <CategoryChip name={item.category.name} color={categoryColor} seed={item.categoryId ?? item.category.name} />
  ) : (
    ''
  );
  const parts = hideDate ? [wallet, chip] : [wallet, chip, shortDate(item.occurredAt)];
  const actions = Boolean(onEdit || onDelete);
  return (
    <article className={`transaction-row${actions ? ' has-actions' : ''}${hideDate ? ' no-date' : ''}`}>
      <div className="transaction-info">
        <strong>{titleOf(item)}</strong>
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

/** Dòng hai lớp: lớp trên ghi chú và viên danh mục; lớp dưới ví và giờ. Số tiền ở bên phải, nút "…" cho ai không vuốt được. */
function PhoneRow({ transaction: item, fallbackCurrency, categoryColor, hideDate, onEdit, onDelete }: Props) {
  const kind = item.type.toLowerCase();
  const [dx, setDx] = useState(0);
  const [menu, setMenu] = useState(false);
  const drag = useRef<{ x: number; y: number; active: boolean; id: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse' || (event.target as HTMLElement).closest('button')) return;
    drag.current = { x: event.clientX, y: event.clientY, active: false, id: event.pointerId };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const moveX = event.clientX - state.x;
    const moveY = event.clientY - state.y;
    if (!state.active) {
      if (Math.abs(moveX) < 10 || Math.abs(moveX) < Math.abs(moveY) * 1.5) return;
      state.active = true;
      (event.currentTarget as HTMLElement).setPointerCapture(state.id);
    }
    setDx(Math.max(onDelete ? -SWIPE_MAX : 0, Math.min(onEdit ? SWIPE_MAX : 0, moveX)));
  };
  const finish = () => {
    const state = drag.current;
    drag.current = null;
    const moved = dx;
    setDx(0);
    if (!state?.active) return;
    if (moved <= -SWIPE_TRIGGER) onDelete?.(item);
    else if (moved >= SWIPE_TRIGGER) onEdit?.(item);
  };

  const time = timeLabel(item.occurredAt);
  const line2 = [walletText(item), hideDate ? time : shortDate(item.occurredAt)].filter(Boolean).join(' · ');
  return (
    <article className="transaction-row tx-phone">
      <div className="tx-swipe-bg" aria-hidden="true">
        <span className="tx-swipe-edit">Sửa</span>
        <span className="tx-swipe-delete">Xóa</span>
      </div>
      <div
        className={`tx-swipe-fg${dx !== 0 ? ' dragging' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={() => {
          drag.current = null;
          setDx(0);
        }}
      >
        <div className="tx-phone-info">
          <div className="tx-phone-top">
            <strong>{titleOf(item)}</strong>
            {item.category && (
              <CategoryChip
                name={item.category.name}
                color={categoryColor}
                seed={item.categoryId ?? item.category.name}
              />
            )}
          </div>
          <span className="tx-phone-sub">{line2}</span>
        </div>
        <div className={`transaction-amount ${kind}`}>
          {SIGNS[item.type]}
          {moneyCurrency(item.amount, item.wallet.currency || fallbackCurrency)}
        </div>
        {(onEdit || onDelete) && (
          <div className="tx-menu" ref={menuRef}>
            <button
              type="button"
              className="icon-btn tx-menu-btn"
              aria-label={`Thao tác với ${titleOf(item)}`}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((open) => !open)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8h.01M8 8h.01M12.5 8h.01" />
              </svg>
            </button>
            {menu && (
              <div className="tx-menu-list" role="menu">
                {onEdit && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onEdit(item);
                    }}
                  >
                    Sửa
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      setMenu(false);
                      onDelete(item);
                    }}
                  >
                    Xóa
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
