import { useState } from 'react';
import { api, downloadFile } from '../../api/client';
import {
  transactionQuery,
  useCategories,
  useRefreshLedger,
  useTransactions,
  useWallets,
  type TransactionFilters
} from '../../api/queries';
import type { Transaction } from '../../api/types';
import { useUser } from '../../app/auth';
import { useUi } from '../../app/ui-state';
import { Empty, ViewSection } from '../../app/view';
import { money } from '../../lib/format';
import { errorMessage, useToast } from '../../ui/Toast';
import { TransactionRow } from './TransactionRow';

/** Danh sách giao dịch với tìm kiếm và bộ lọc. Đổi lựa chọn trong bộ lọc là áp dụng ngay; ô từ khóa áp dụng khi bấm
 * "Tìm" hoặc Enter. */
export function TransactionsView() {
  const user = useUser();
  const { openModal } = useUi();
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const wallets = useWallets().data ?? [];
  const categories = useCategories().data ?? [];
  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState<TransactionFilters>({});
  const transactions = useTransactions(filters);
  const rows = transactions.data ?? [];

  const setFilter = (name: keyof TransactionFilters, value: string) =>
    setFilters((current) => ({ ...current, [name]: value || undefined }));
  const applyKeyword = () => setFilter('keyword', keyword.trim());

  async function remove(transaction: Transaction) {
    if (!confirm(`Xóa giao dịch “${transaction.note || money(transaction.amount)}”?`)) return;
    try {
      await api(`/transactions/${transaction.id}`, { method: 'DELETE' });
      await refreshLedger();
      toast('Đã xóa giao dịch.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
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
      <div className="filter-bar" aria-label="Bộ lọc giao dịch">
        <input
          id="transaction-keyword-filter"
          type="search"
          placeholder="Tìm theo ghi chú, người nhận..."
          aria-label="Từ khóa"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && applyKeyword()}
        />
        <select
          id="transaction-type-filter"
          aria-label="Loại giao dịch"
          value={filters.type ?? ''}
          onChange={(event) => setFilter('type', event.target.value)}
        >
          <option value="">Tất cả loại</option>
          <option value="INCOME">Khoản thu</option>
          <option value="EXPENSE">Khoản chi</option>
          <option value="TRANSFER">Chuyển khoản</option>
        </select>
        <button id="apply-transaction-filter" className="btn btn-primary btn-sm" type="button" onClick={applyKeyword}>
          Tìm
        </button>
        <button id="export-csv" className="btn btn-outline btn-sm" type="button" onClick={exportCsv}>
          ↓ Xuất CSV
        </button>
        <details className="filter-more">
          <summary>Lọc thêm</summary>
          <div className="filter-more-body">
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
            <button
              id="reset-transaction-filter"
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setKeyword('');
                setFilters({});
              }}
            >
              Bỏ lọc
            </button>
          </div>
        </details>
      </div>
      <section className="panel">
        <div id="all-transactions" className="transaction-list">
          {rows.length ? (
            rows.map((item) => (
              <TransactionRow
                key={item.id}
                transaction={item}
                fallbackCurrency={user.currency}
                onEdit={(transaction) => openModal('transaction', transaction)}
                onDelete={remove}
              />
            ))
          ) : (
            <Empty
              text={transactions.isLoading ? 'Đang tải giao dịch...' : 'Chưa có giao dịch phù hợp.'}
              action={transactions.isLoading ? undefined : 'Ghi giao dịch'}
              onAction={() => openModal('transaction', null)}
            />
          )}
        </div>
      </section>
    </ViewSection>
  );
}
