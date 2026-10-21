import { useMemo, useState, type KeyboardEvent } from 'react';
import { api } from '../../api/client';
import { useCategories, useRefreshLedger, useTransactions, useWallets } from '../../api/queries';
import type { Transaction, TransactionDraft } from '../../api/types';
import { useUi } from '../../app/ui-state';
import { dayLabel } from '../../lib/group-days';
import { localDateValue, middayIso, moneyCurrency } from '../../lib/format';
import {
  frequentTransactions,
  parseQuickEntry,
  type QuickEntry as ParsedEntry,
  type QuickSuggestion
} from '../../lib/quick-entry';
import { LAST_WALLET_KEY, storageGet, storageSet } from '../../lib/storage';
import { CategoryChip, useCategoryColors } from '../../ui/CategoryChip';
import { errorMessage, useToast } from '../../ui/Toast';

const DAY_MS = 86_400_000;
const NUMBER = new Intl.NumberFormat('vi-VN');

interface Props {
  /** `id` của ô nhập (mỗi nơi đặt một bản nên id khác nhau). */
  inputId: string;
  /** Gọi sau khi đã lưu hoặc chuyển sang biểu mẫu đầy đủ (để đóng bảng trượt). */
  onDone?: () => void;
}

/**
 * Ô ghi nhanh một dòng ("cà phê 45k hôm qua"). Phân tích trong trình duyệt, hiện bản xem trước một dòng rồi mới lưu;
 * dưới ô là các giao dịch hay lặp lại (một chạm là lưu). Sau khi lưu có thông báo Hoàn tác 5 giây.
 */
export function QuickEntry({ inputId, onDone }: Props) {
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const { openModal } = useUi();
  const walletData = useWallets().data;
  const categoryData = useCategories().data;
  const wallets = useMemo(() => (walletData ?? []).filter((wallet) => !wallet.archivedAt), [walletData]);
  const categories = useMemo(() => (categoryData ?? []).filter((category) => !category.archivedAt), [categoryData]);
  const { colorOf } = useCategoryColors();
  const today = useMemo(() => new Date(), []);
  const since = useMemo(() => localDateValue(new Date(today.getTime() - 90 * DAY_MS)), [today]);
  const historyData = useTransactions({ from: since }).data;
  const history = useMemo(() => historyData ?? [], [historyData]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const result = useMemo(
    () =>
      text.trim()
        ? parseQuickEntry(text, {
            today,
            categories,
            wallets,
            history,
            lastWalletId: storageGet(LAST_WALLET_KEY)
          })
        : null,
    [text, today, categories, wallets, history]
  );
  const suggestions = useMemo(() => frequentTransactions(history, today), [history, today]);
  const walletOf = (id: string | null) => wallets.find((wallet) => wallet.id === id);
  const categoryOf = (id: string | null) => categories.find((category) => category.id === id);

  async function save(
    entry: Pick<ParsedEntry, 'amount' | 'type' | 'note' | 'categoryId' | 'walletId'> & { date: Date }
  ) {
    const wallet = walletOf(entry.walletId);
    if (!wallet) return toast('Bạn cần có ít nhất một ví trước khi ghi giao dịch.', true);
    setBusy(true);
    try {
      const saved = await api<Transaction>('/transactions', {
        method: 'POST',
        body: {
          type: entry.type,
          amount: entry.amount,
          walletId: wallet.id,
          destinationWalletId: null,
          categoryId: entry.categoryId,
          note: entry.note || null,
          status: 'CLEARED',
          occurredAt: middayIso(localDateValue(entry.date))
        }
      });
      storageSet(LAST_WALLET_KEY, wallet.id);
      setText('');
      await refreshLedger();
      const sign = entry.type === 'INCOME' ? '+' : '−';
      toast(
        `Đã ghi ${sign}${moneyCurrency(entry.amount, wallet.currency)} · ${categoryOf(entry.categoryId)?.name ?? 'Chưa phân loại'}`,
        false,
        {
          label: 'Hoàn tác',
          onClick: async () => {
            try {
              await api(`/transactions/${saved.id}`, { method: 'DELETE' });
              await refreshLedger();
              toast('Đã hoàn tác.');
            } catch (error) {
              toast(errorMessage(error), true);
            }
          }
        }
      );
      onDone?.();
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  const saveSuggestion = (item: QuickSuggestion) =>
    save({
      amount: item.amount,
      type: item.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
      note: item.note,
      categoryId: item.categoryId,
      walletId: item.walletId,
      date: today
    });

  function editDetails(entry: ParsedEntry) {
    const draft: TransactionDraft = {
      type: entry.type,
      amount: entry.amount,
      walletId: entry.walletId ?? '',
      categoryId: entry.categoryId,
      note: entry.note,
      date: localDateValue(entry.date)
    };
    setText('');
    onDone?.();
    openModal('transaction', draft);
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && result?.ok && !busy) {
      event.preventDefault();
      void save(result);
    }
  };

  const entry = result?.ok ? result : null;
  const wallet = entry ? walletOf(entry.walletId) : undefined;
  const category = entry ? categoryOf(entry.categoryId) : undefined;

  return (
    <div className="quick-entry">
      <label className="quick-entry-field">
        <span className="visually-hidden">Ghi nhanh một giao dịch</span>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          placeholder="Ghi nhanh: cà phê 45k hôm qua"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>

      {result && !result.ok && <p className="quick-entry-error">{result.error}</p>}

      {entry && (
        <div className="quick-entry-preview" aria-live="polite">
          <div className="quick-entry-line">
            <strong className={entry.type === 'INCOME' ? 'income' : undefined}>
              {entry.type === 'INCOME' ? '+' : '−'}
              {moneyCurrency(entry.amount, wallet?.currency ?? 'VND')}
            </strong>
            {category ? (
              <CategoryChip name={category.name} color={colorOf(category.id)} seed={category.id} />
            ) : (
              <span className="quick-entry-muted">Chưa phân loại</span>
            )}
            <span className="quick-entry-muted">{wallet?.name ?? 'Chưa có ví'}</span>
            <span className="quick-entry-muted">{dayLabel(entry.date, today)}</span>
            {entry.note && <span className="quick-entry-note">{entry.note}</span>}
          </div>
          <div className="quick-entry-actions">
            <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void save(entry)}>
              Lưu
            </button>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => editDetails(entry)}>
              Sửa chi tiết
            </button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && !entry && (
        <div className="chip-row quick-entry-chips" role="group" aria-label="Giao dịch hay lặp lại">
          {suggestions.map((item) => (
            <button
              key={`${item.type}-${item.note}`}
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => void saveSuggestion(item)}
            >
              {item.note} · {NUMBER.format(item.amount)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
