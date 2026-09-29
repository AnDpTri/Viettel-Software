import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { useRefreshLedger, useWallets } from '../../api/queries';
import type { Wallet, WalletType } from '../../api/types';
import { useModal, useUi } from '../../app/ui-state';
import { Empty, SectionTitle, ViewSection } from '../../app/view';
import { moneyCurrency, shortDate, WALLET_TYPE_LABELS } from '../../lib/format';
import { Modal, ModalClose } from '../../ui/Modal';
import { errorMessage, useToast } from '../../ui/Toast';
import { WalletCard } from './WalletCard';

export function WalletsView() {
  const wallets = useWallets().data ?? [];
  const { openModal } = useUi();
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const [showArchived, setShowArchived] = useState(false);
  const visible = wallets.filter((wallet) => showArchived || !wallet.archivedAt);

  async function toggleArchive(wallet: Wallet) {
    const restore = Boolean(wallet.archivedAt);
    if (!restore && !confirm(`Lưu trữ ví “${wallet.name}”? Lịch sử giao dịch vẫn được giữ lại.`)) return;
    try {
      await api(`/wallets/${wallet.id}${restore ? '/restore' : ''}`, { method: restore ? 'POST' : 'DELETE' });
      await refreshLedger();
      toast(restore ? 'Đã khôi phục ví.' : 'Đã lưu trữ ví.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <ViewSection view="wallets">
      <SectionTitle
        eyebrow="TÀI SẢN"
        title="Ví của tôi"
        actions={
          <>
            <label className="check-row">
              <input
                id="show-archived-wallets"
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Hiện ví đã lưu trữ
            </label>
            <button
              className="btn btn-primary btn-sm"
              id="open-wallet"
              type="button"
              onClick={() => openModal('wallet', null)}
            >
              ＋ Thêm ví
            </button>
          </>
        }
      />
      <div id="all-wallets" className="wallet-grid large">
        {visible.length ? (
          visible.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              onDetail={() => openModal('walletDetail', wallet.id)}
              onEdit={() => openModal('wallet', wallet)}
              onArchiveToggle={() => toggleArchive(wallet)}
            />
          ))
        ) : (
          <div className="panel">
            <Empty text="Chưa có ví để quản lý." action="Tạo ví đầu tiên" onAction={() => openModal('wallet', null)} />
          </div>
        )}
      </div>
    </ViewSection>
  );
}

type WalletForm = {
  name: string;
  type: WalletType;
  currency: string;
  openingBalance: string;
  institutionName: string;
  color: string;
  creditLimit: string;
  billingDay: string;
  dueDay: string;
};

const walletForm = (wallet: Wallet | null): WalletForm => ({
  name: wallet?.name ?? '',
  type: wallet?.type ?? 'CASH',
  currency: wallet?.currency ?? 'VND',
  openingBalance: String(Number(wallet?.openingBalance ?? 0)),
  institutionName: wallet?.institutionName ?? '',
  color: wallet?.color ?? '#23654f',
  creditLimit: wallet?.creditLimit ? String(Number(wallet.creditLimit)) : '',
  billingDay: wallet?.billingDay ? String(wallet.billingDay) : '',
  dueDay: wallet?.dueDay ? String(wallet.dueDay) : ''
});

export function WalletModal() {
  const { open, payload, seq, close } = useModal('wallet');
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const editing = payload ?? null;
  const [form, setForm] = useState(() => walletForm(null));
  useEffect(() => {
    if (open) setForm(walletForm(editing));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nạp lại form mỗi lần mở
  }, [open, seq]);
  const bind = (name: keyof WalletForm) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value })
  });
  const numberOrNull = (value: string) => (value ? Number(value) : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(editing ? `/wallets/${editing.id}` : '/wallets', {
        method: editing ? 'PATCH' : 'POST',
        body: {
          name: form.name,
          type: form.type,
          currency: form.currency.toUpperCase(),
          openingBalance: Number(form.openingBalance),
          institutionName: form.institutionName || null,
          color: form.color,
          creditLimit: numberOrNull(form.creditLimit),
          billingDay: numberOrNull(form.billingDay),
          dueDay: numberOrNull(form.dueDay)
        }
      });
      close();
      await refreshLedger();
      toast(editing ? 'Đã cập nhật ví.' : 'Đã tạo ví mới.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <Modal id="wallet-modal" open={open} onClose={close} labelledBy="wallet-modal-title" initialFocus="#wallet-name">
      <form id="wallet-form" className="modal-card" onSubmit={submit}>
        <ModalClose modalId="wallet-modal" label="Đóng cửa sổ ví" onClose={close} />
        <span className="eyebrow">TÀI KHOẢN TIỀN</span>
        <h2 id="wallet-modal-title">{editing ? 'Chỉnh sửa ví' : 'Thêm ví mới'}</h2>
        <label>
          Tên ví
          <input id="wallet-name" maxLength={100} placeholder="Ví dụ: Tài khoản lương" required {...bind('name')} />
        </label>
        <div className="form-row">
          <label>
            Loại ví
            <select id="wallet-type" required {...bind('type')}>
              {Object.entries(WALLET_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tiền tệ
            <input id="wallet-currency" maxLength={3} required {...bind('currency')} />
          </label>
        </div>
        <label>
          Số dư ban đầu
          <span className="money-input">
            <input id="wallet-opening-balance" type="number" required {...bind('openingBalance')} />
            <span aria-hidden="true">₫</span>
          </span>
        </label>
        <div className="form-row">
          <label>
            Ngân hàng / tổ chức
            <input id="wallet-institution" maxLength={120} {...bind('institutionName')} />
          </label>
          <label>
            Màu ví
            <input id="wallet-color" type="color" {...bind('color')} />
          </label>
        </div>
        {form.type === 'CREDIT' && (
          <div className="form-row">
            <label>
              Hạn mức tín dụng
              <input id="wallet-credit-limit" type="number" min="0" {...bind('creditLimit')} />
            </label>
            <label>
              Ngày chốt / đến hạn
              <span className="dual-input">
                <input
                  id="wallet-billing-day"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Chốt"
                  {...bind('billingDay')}
                />
                <input id="wallet-due-day" type="number" min="1" max="31" placeholder="Hạn" {...bind('dueDay')} />
              </span>
            </label>
          </div>
        )}
        <button className="btn btn-primary btn-block" type="submit">
          Lưu ví <span aria-hidden="true">→</span>
        </button>
      </form>
    </Modal>
  );
}

export function WalletDetailModal() {
  const { open, payload: walletId, close } = useModal('walletDetail');
  const detail = useQuery({
    queryKey: ['wallet', walletId],
    queryFn: () => api<Wallet>(`/wallets/${walletId}`),
    enabled: open && Boolean(walletId)
  }).data;
  // Mở hộp khi đã có dữ liệu của đúng ví được chọn, tránh nháy nội dung trống hoặc của ví trước.
  const ready = open && detail?.id === walletId;
  return (
    <Modal id="wallet-detail-modal" open={ready} onClose={close} labelledBy="wallet-detail-heading">
      <div className="modal-card">
        <ModalClose modalId="wallet-detail-modal" label="Đóng chi tiết ví" onClose={close} />
        <span className="eyebrow" id="wallet-detail-heading">
          CHI TIẾT VÍ
        </span>
        <div id="wallet-detail">
          {detail && detail.id === walletId && (
            <>
              <h2>{detail.name}</h2>
              <div className="wallet-detail-balance">
                <span className="eyebrow">SỐ DƯ HIỆN TẠI</span>
                <strong className={Number(detail.balance) < 0 ? 'negative' : undefined}>
                  {moneyCurrency(detail.balance, detail.currency)}
                </strong>
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>Loại ví</dt>
                  <dd>{WALLET_TYPE_LABELS[detail.type] ?? detail.type}</dd>
                </div>
                <div>
                  <dt>Tiền tệ</dt>
                  <dd>{detail.currency}</dd>
                </div>
                <div>
                  <dt>Số dư ban đầu</dt>
                  <dd>{moneyCurrency(detail.openingBalance, detail.currency)}</dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{detail.archivedAt ? 'Đã lưu trữ' : 'Đang hoạt động'}</dd>
                </div>
                <div>
                  <dt>Ngày tạo</dt>
                  <dd>{shortDate(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt>Cập nhật</dt>
                  <dd>{shortDate(detail.updatedAt)}</dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
