import { useEffect, useMemo, useRef, useState } from 'react';
import { api, downloadFile } from '../../api/client';
import {
  transactionQuery,
  useCategories,
  useRefreshLedger,
  useTransactionPages,
  useWallets,
  type TransactionFilters
} from '../../api/queries';
import type { Transaction } from '../../api/types';
import { useUser } from '../../app/auth';
import { useUi } from '../../app/ui-state';
import { Empty, ViewSection } from '../../app/view';
import { moneyCurrency } from '../../lib/format';
import { groupByDay } from '../../lib/group-days';
import { useCategoryColors } from '../../ui/CategoryChip';
import { useIsPhone } from '../../ui/useIsPhone';
import { errorMessage, useToast } from '../../ui/Toast';
import { QuickEntry } from './QuickEntry';
import { TransactionRow } from './TransactionRow';
import { cancelDelete, scheduleDelete, usePendingDeletes } from './undoable-delete';

const FILTER_KEYS = ['type', 'walletId', 'categoryId', 'from', 'to'] as const;

/**
 * Danh sách giao dịch: ô ghi nhanh (máy tính), ô tìm kiếm luôn ở trên cùng, lọc nâng cao trong nút "Lọc", các dòng gom
 * theo ngày kèm tổng chi/thu của ngày, tải thêm khi cuộn tới cuối. Xóa có hoàn tác 5 giây thay vì hỏi xác nhận.
 */
export function TransactionsView() {
  const user = useUser();
  const phone = useIsPhone();
  const { openModal } = useUi();
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const wallets = useWallets().data ?? [];
  const categories = useCategories().data ?? [];
  const { colorOf } = useCategoryColors();
  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState<TransactionFilters>({});
  const pages = useTransactionPages(filters);
  const pendingDeletes = usePendingDeletes();
  const today = useMemo(() => new Date(), []);

  const loaded = useMemo(() => pages.data?.pages.flatMap((page) => page.data) ?? [], [pages.data]);
  const rows = useMemo(() => loaded.filter((item) => !pendingDeletes.has(item.id)), [loaded, pendingDeletes]);
  const hiddenCount = loaded.length - rows.length;
  const total = Math.max(0, (pages.data?.pages.at(-1)?.meta.total ?? 0) - hiddenCount);
  const groups = useMemo(() => groupByDay(rows, today, user.currency), [rows, today, user.currency]);
  const activeFilters = FILTER_KEYS.filter((key) => filters[key]).length;

  const setFilter = (name: keyof TransactionFilters, value: string) =>
    setFilters((current) => ({ ...current, [name]: value || undefined }));
  const applyKeyword = () => setFilter('keyword', keyword.trim());

  // Tải thêm khi dòng đệm cuối danh sách vào khung nhìn (nút "Tải thêm" là lối dự phòng).
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

  function remove(transaction: Transaction) {
    scheduleDelete(transaction.id, async () => {
      try {
        await api(`/transactions/${transaction.id}`, { method: 'DELETE' });
        await refreshLedger();
      } catch (error) {
        toast(errorMessage(error), true);
      }
    });
    toast('Đã xóa giao dịch.', false, { label: 'Hoàn tác', onClick: () => cancelDelete(transaction.id) });
  }

  async function exportCsv() {
    try {
      await downloadFile(`/api/v1/transactions/export.csv?${transactionQuery(filters, false)}`, 'transactions.csv');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <ViewSection view="transactions">
      {!phone && (
        <section className="panel quick-panel" aria-label="Ghi nhanh">
          <QuickEntry inputId="quick-entry-input" />
        </section>
      )}
      <div className="filter-bar" aria-label="Tìm và lọc giao dịch">
        <input
          id="transaction-keyword-filter"
          type="search"
          placeholder="Tìm theo ghi chú, người nhận..."
          aria-label="Từ khóa"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && applyKeyword()}
        />
        <button id="apply-transaction-filter" className="btn btn-primary btn-sm" type="button" onClick={applyKeyword}>
          Tìm
        </button>
        <FilterPopover
          filters={filters}
          count={activeFilters}
          wallets={wallets}
          categories={categories}
          setFilter={setFilter}
          reset={() => {
            setKeyword('');
            setFilters({});
          }}
        />
        <button id="export-csv" className="btn btn-outline btn-sm" type="button" onClick={exportCsv}>
          ↓ Xuất CSV
        </button>
      </div>

      <section className="panel tx-panel">
        {rows.length > 0 && (
          <p className="tx-count" id="transaction-count">
            Hiển thị {rows.length} trên {total}
          </p>
        )}
        <div id="all-transactions" className="transaction-groups">
          {groups.length ? (
            groups.map((group) => (
              <section key={group.key} className="day-group" aria-label={group.label}>
                <header className="day-head">
                  <h3>{group.label}</h3>
                  <span className="day-totals">
                    {group.totals.map((entry) => (
                      <span key={entry.currency}>
                        {entry.expense > 0 && <b>−{moneyCurrency(entry.expense, entry.currency)}</b>}
                        {entry.income > 0 && <b className="income">+{moneyCurrency(entry.income, entry.currency)}</b>}
                      </span>
                    ))}
                  </span>
                </header>
                <div className="transaction-list">
                  {group.items.map((item) => (
                    <TransactionRow
                      key={item.id}
                      transaction={item}
                      fallbackCurrency={user.currency}
                      categoryColor={colorOf(item.categoryId)}
                      hideDate
                      phone={phone}
                      onEdit={(transaction) => openModal('transaction', transaction)}
                      onDelete={remove}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <Empty
              text={pages.isLoading ? 'Đang tải giao dịch...' : 'Chưa có giao dịch phù hợp.'}
              action={pages.isLoading ? undefined : 'Ghi giao dịch'}
              onAction={() => openModal('transaction', null)}
            />
          )}
        </div>
        {hasNextPage && (
          <div className="tx-more" ref={sentinel}>
            <button
              className="btn btn-outline btn-sm"
              type="button"
              id="load-more-transactions"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? 'Đang tải...' : 'Tải thêm'}
            </button>
          </div>
        )}
      </section>
    </ViewSection>
  );
}

interface PopoverProps {
  filters: TransactionFilters;
  count: number;
  wallets: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  setFilter: (name: keyof TransactionFilters, value: string) => void;
  reset: () => void;
}

/** Nút "Lọc" (kèm số bộ lọc đang bật) mở bảng nhỏ: loại, ví, danh mục, khoảng ngày. Đổi lựa chọn là áp dụng ngay. */
function FilterPopover({ filters, count, wallets, categories, setFilter, reset }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="filter-pop" ref={box}>
      <button
        id="open-transaction-filter"
        className="btn btn-outline btn-sm"
        type="button"
        aria-expanded={open}
        aria-controls="transaction-filter-panel"
        onClick={() => setOpen((value) => !value)}
      >
        Lọc
        {count > 0 && (
          <span className="filter-count" aria-label={`${count} bộ lọc đang bật`}>
            {count}
          </span>
        )}
      </button>
      {open && (
        <div id="transaction-filter-panel" className="filter-pop-body" role="group" aria-label="Lọc nâng cao">
          <label>
            Loại giao dịch
            <select
              id="transaction-type-filter"
              value={filters.type ?? ''}
              onChange={(event) => setFilter('type', event.target.value)}
            >
              <option value="">Tất cả loại</option>
              <option value="INCOME">Khoản thu</option>
              <option value="EXPENSE">Khoản chi</option>
              <option value="TRANSFER">Chuyển khoản</option>
            </select>
          </label>
          <label>
            Ví
            <select
              id="transaction-wallet-filter"
              value={filters.walletId ?? ''}
              onChange={(event) => setFilter('walletId', event.target.value)}
            >
              <option value="">Tất cả ví</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Danh mục
            <select
              id="transaction-category-filter"
              value={filters.categoryId ?? ''}
              onChange={(event) => setFilter('categoryId', event.target.value)}
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-pop-dates">
            <label>
              Từ ngày
              <input
                id="transaction-from-filter"
                type="date"
                value={filters.from ?? ''}
                onChange={(event) => setFilter('from', event.target.value)}
              />
            </label>
            <label>
              Đến ngày
              <input
                id="transaction-to-filter"
                type="date"
                value={filters.to ?? ''}
                onChange={(event) => setFilter('to', event.target.value)}
              />
            </label>
          </div>
          <button id="reset-transaction-filter" className="btn btn-ghost btn-sm" type="button" onClick={reset}>
            Bỏ lọc
          </button>
        </div>
      )}
    </div>
  );
}
