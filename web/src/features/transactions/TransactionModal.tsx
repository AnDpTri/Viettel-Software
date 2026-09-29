import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, downloadFile, upload } from '../../api/client';
import { useCategories, useRefreshLedger, useWallets } from '../../api/queries';
import type { Receipt, Transaction, TransactionType } from '../../api/types';
import { useModal, useUi } from '../../app/ui-state';
import { localDateValue, middayIso } from '../../lib/format';
import { LAST_WALLET_KEY, storageGet, storageSet } from '../../lib/storage';
import { Modal } from '../../ui/Modal';
import { errorMessage, useToast } from '../../ui/Toast';

const TYPES: Array<{ value: TransactionType; label: string }> = [
  { value: 'EXPENSE', label: 'Khoản chi' },
  { value: 'INCOME', label: 'Khoản thu' },
  { value: 'TRANSFER', label: 'Chuyển ví' }
];

const STATUSES = [
  ['CLEARED', 'Đã xác nhận'],
  ['PENDING', 'Đang chờ'],
  ['PLANNED', 'Dự kiến'],
  ['RECONCILED', 'Đã đối soát'],
  ['CANCELLED', 'Đã hủy']
] as const;

type Form = {
  type: TransactionType;
  amount: string;
  walletId: string;
  destinationWalletId: string;
  categoryId: string;
  payee: string;
  status: string;
  paymentMethod: string;
  reference: string;
  location: string;
  note: string;
  date: string;
};

function formFor(transaction: Transaction | null, defaultWalletId: string): Form {
  return {
    type: transaction?.type ?? 'EXPENSE',
    amount: transaction ? String(Number(transaction.amount)) : '',
    walletId: transaction?.walletId ?? defaultWalletId,
    destinationWalletId: transaction?.destinationWalletId ?? '',
    categoryId: transaction?.categoryId ?? '',
    payee: transaction?.payee ?? '',
    status: transaction?.status ?? 'CLEARED',
    paymentMethod: transaction?.paymentMethod ?? '',
    reference: transaction?.reference ?? '',
    location: transaction?.location ?? '',
    note: transaction?.note ?? '',
    date: localDateValue(transaction ? new Date(transaction.occurredAt) : new Date())
  };
}

/** Ghi mới hoặc sửa giao dịch thu, chi, chuyển ví; kèm hóa đơn đính kèm. Chưa có ví thì dẫn đi tạo ví trước. */
export function TransactionModal() {
  const { open, payload, seq, close } = useModal('transaction');
  const { openModal } = useUi();
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const wallets = useWallets().data;
  const categories = useCategories().data ?? [];
  const activeWallets = useMemo(() => (wallets ?? []).filter((wallet) => !wallet.archivedAt), [wallets]);
  const editing = payload ?? null;
  const [form, setForm] = useState<Form>(() => formFor(null, ''));
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!editing && !activeWallets.length) {
      close();
      toast('Bạn cần có ít nhất một ví trước khi ghi giao dịch.');
      openModal('welcome', 'wallet');
      return;
    }
    const last = storageGet(LAST_WALLET_KEY);
    const defaultWallet = activeWallets.some((wallet) => wallet.id === last) ? last! : (activeWallets[0]?.id ?? '');
    setForm(formFor(editing, defaultWallet));
    setReceipts(editing?.receipts ?? []);
    setFile(null);
    setAdvanced(
      Boolean(
        editing &&
        (editing.status !== 'CLEARED' ||
          editing.paymentMethod ||
          editing.reference ||
          editing.location ||
          editing.receipts?.length)
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nạp lại form mỗi lần mở (seq đổi)
  }, [open, seq]);

  const source = activeWallets.find((wallet) => wallet.id === form.walletId);
  const destinations = activeWallets.filter(
    (wallet) => wallet.id !== source?.id && wallet.currency === source?.currency
  );
  const typeCategories = categories.filter((category) => category.type === form.type && !category.archivedAt);

  // Ví đích và danh mục luôn hợp lệ với ví nguồn và loại giao dịch đang chọn.
  const validDestination = destinations.some((wallet) => wallet.id === form.destinationWalletId)
    ? form.destinationWalletId
    : (destinations[0]?.id ?? '');
  const validCategory = typeCategories.some((category) => category.id === form.categoryId) ? form.categoryId : '';
  useEffect(() => {
    if (form.type === 'TRANSFER' && validDestination !== form.destinationWalletId)
      setForm((current) => ({ ...current, destinationWalletId: validDestination }));
    if (validCategory !== form.categoryId) setForm((current) => ({ ...current, categoryId: validCategory }));
  }, [form.type, form.destinationWalletId, form.categoryId, validDestination, validCategory]);

  const set = <K extends keyof Form>(name: K, value: Form[K]) => setForm((current) => ({ ...current, [name]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.walletId) return toast('Bạn cần tạo hoặc chọn ví nguồn.', true);
    if (form.type === 'TRANSFER' && !form.destinationWalletId)
      return toast('Cần có một ví đích khác, cùng loại tiền tệ.', true);
    setBusy(true);
    try {
      const body = {
        type: form.type,
        amount: Number(form.amount),
        walletId: form.walletId,
        destinationWalletId: form.type === 'TRANSFER' ? form.destinationWalletId : null,
        categoryId: form.type === 'TRANSFER' ? null : form.categoryId || null,
        payee: form.payee || null,
        status: form.status,
        paymentMethod: form.paymentMethod || null,
        reference: form.reference || null,
        location: form.location || null,
        note: form.note || null,
        occurredAt: middayIso(form.date)
      };
      const saved = await api<Transaction>(editing ? `/transactions/${editing.id}` : '/transactions', {
        method: editing ? 'PATCH' : 'POST',
        body
      });
      if (file) {
        const data = new FormData();
        data.append('file', file);
        await upload(`/api/v1/transactions/${saved.id}/receipts`, data);
      }
      storageSet(LAST_WALLET_KEY, form.walletId);
      close();
      await refreshLedger();
      toast(editing ? 'Đã cập nhật giao dịch.' : 'Đã lưu giao dịch mới.');
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function removeReceipt(receipt: Receipt) {
    if (!editing || !confirm('Xóa hóa đơn này?')) return;
    try {
      await api(`/transactions/${editing.id}/receipts/${receipt.id}`, { method: 'DELETE' });
      setReceipts((current) => current.filter((item) => item.id !== receipt.id));
      await refreshLedger();
      toast('Đã xóa hóa đơn.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <Modal
      id="transaction-modal"
      open={open}
      onClose={close}
      labelledBy="transaction-modal-title"
      initialFocus="#tx-amount"
    >
      <form id="transaction-form" className="modal-card" onSubmit={submit}>
        <button
          type="button"
          className="modal-close"
          id="close-modal"
          aria-label="Đóng cửa sổ giao dịch"
          onClick={close}
        >
          ×
        </button>
        <span className="eyebrow">GHI CHÉP NHANH</span>
        <h2 id="transaction-modal-title">{editing ? 'Chỉnh sửa giao dịch' : 'Giao dịch mới'}</h2>
        <div className="type-switch" role="radiogroup" aria-label="Loại giao dịch">
          {TYPES.map((item) => (
            <label key={item.value} className={form.type === item.value ? 'active' : undefined}>
              <input
                type="radio"
                name="type"
                value={item.value}
                checked={form.type === item.value}
                onChange={() => set('type', item.value)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <label>
          Số tiền
          <span className="money-input">
            <input
              id="tx-amount"
              type="number"
              min="1"
              placeholder="0"
              required
              value={form.amount}
              onChange={(event) => set('amount', event.target.value)}
            />
            <span aria-hidden="true">₫</span>
          </span>
        </label>
        <div className="form-row">
          <label>
            Ví
            <select
              id="tx-wallet"
              required
              value={form.walletId}
              onChange={(event) => set('walletId', event.target.value)}
            >
              {activeWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} · {wallet.currency}
                </option>
              ))}
            </select>
          </label>
          <label className={form.type === 'TRANSFER' ? 'hidden' : undefined}>
            Danh mục
            <select
              id="tx-category"
              value={form.categoryId}
              onChange={(event) => set('categoryId', event.target.value)}
            >
              <option value="">Chưa phân loại</option>
              {typeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {form.type !== 'TRANSFER' && typeCategories.length > 0 && (
          <div id="tx-category-chips" className="chip-row" role="group" aria-label="Chọn nhanh danh mục">
            {typeCategories.slice(0, 10).map((category) => (
              <button
                key={category.id}
                type="button"
                className={`chip${category.id === form.categoryId ? ' active' : ''}`}
                aria-pressed={category.id === form.categoryId}
                onClick={() => set('categoryId', form.categoryId === category.id ? '' : category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
        <label id="tx-destination-group" className={form.type === 'TRANSFER' ? undefined : 'hidden'}>
          Ví đích
          <select
            id="tx-destination"
            required={form.type === 'TRANSFER'}
            value={form.destinationWalletId}
            onChange={(event) => set('destinationWalletId', event.target.value)}
          >
            {destinations.length ? (
              destinations.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} · {wallet.currency}
                </option>
              ))
            ) : (
              <option value="">Không có ví đích phù hợp</option>
            )}
          </select>
        </label>
        <label>
          Ghi chú
          <input
            id="tx-note"
            maxLength={500}
            placeholder="Ví dụ: Cà phê cùng đồng nghiệp"
            value={form.note}
            onChange={(event) => set('note', event.target.value)}
          />
        </label>
        <label>
          Ngày giao dịch
          <input
            id="tx-date"
            type="date"
            required
            value={form.date}
            onChange={(event) => set('date', event.target.value)}
          />
        </label>
        <details
          id="transaction-advanced"
          className="advanced-fields"
          open={advanced}
          onToggle={(event) => setAdvanced(event.currentTarget.open)}
        >
          <summary>
            Thêm chi tiết <span>người nhận, trạng thái, địa điểm, ảnh hóa đơn</span>
          </summary>
          <div className="advanced-fields-body">
            <label>
              Đối tác / người nhận
              <input
                id="tx-payee"
                maxLength={160}
                placeholder="Ví dụ: Siêu thị"
                value={form.payee}
                onChange={(event) => set('payee', event.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                Trạng thái
                <select id="tx-status" value={form.status} onChange={(event) => set('status', event.target.value)}>
                  {STATUSES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Phương thức
                <input
                  id="tx-payment-method"
                  maxLength={50}
                  placeholder="Tiền mặt, chuyển khoản..."
                  value={form.paymentMethod}
                  onChange={(event) => set('paymentMethod', event.target.value)}
                />
              </label>
            </div>
            <label>
              Mã tham chiếu
              <input
                id="tx-reference"
                maxLength={120}
                value={form.reference}
                onChange={(event) => set('reference', event.target.value)}
              />
            </label>
            <label>
              Địa điểm
              <input
                id="tx-location"
                maxLength={255}
                value={form.location}
                onChange={(event) => set('location', event.target.value)}
              />
            </label>
            <label>
              Hóa đơn (JPG, PNG hoặc PDF — tùy chọn)
              <span className="file-picker">
                <input
                  key={seq}
                  id="tx-receipt"
                  className="visually-hidden"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <span className="btn btn-outline btn-sm" aria-hidden="true">
                  Chọn hóa đơn
                </span>
                <span id="tx-receipt-name" className="file-picker-name">
                  {file?.name ?? 'Chưa chọn tệp'}
                </span>
              </span>
            </label>
          </div>
        </details>
        <div id="tx-receipts-list" className="receipt-list">
          {editing &&
            receipts.map((receipt) => (
              <div key={receipt.id} className="receipt-item">
                <span>{receipt.originalName}</span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-receipt-action="download"
                    onClick={() =>
                      downloadFile(
                        `/api/v1/transactions/${editing.id}/receipts/${receipt.id}`,
                        receipt.originalName
                      ).catch((error) => toast(errorMessage(error), true))
                    }
                  >
                    Tải
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm danger"
                    data-receipt-action="delete"
                    onClick={() => removeReceipt(receipt)}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          Lưu giao dịch <span aria-hidden="true">→</span>
        </button>
      </form>
    </Modal>
  );
}
