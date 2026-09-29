import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { useGoals, useRefreshLedger, useWallets } from '../../api/queries';
import type { Goal } from '../../api/types';
import { useUser } from '../../app/auth';
import { useModal, useUi } from '../../app/ui-state';
import { Empty, Progress, SectionTitle, ViewSection } from '../../app/view';
import { moneyCurrency, shortDate } from '../../lib/format';
import { Modal, ModalClose } from '../../ui/Modal';
import { errorMessage, useToast } from '../../ui/Toast';

const STATUS_LABELS: Record<string, string> = { COMPLETED: 'ĐÃ HOÀN THÀNH', CANCELLED: 'ĐÃ HỦY' };

export function GoalsView() {
  const goals = useGoals().data ?? [];
  const user = useUser();
  const { openModal } = useUi();
  const toast = useToast();
  const refreshLedger = useRefreshLedger();

  async function remove(goal: Goal) {
    if (!confirm(`Xóa mục tiêu “${goal.name}”?`)) return;
    try {
      await api(`/goals/${goal.id}`, { method: 'DELETE' });
      await refreshLedger();
      toast('Đã xóa mục tiêu.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <ViewSection view="goals">
      <SectionTitle
        eyebrow="TIẾT KIỆM"
        title="Mục tiêu tiết kiệm"
        help="Liên kết một ví tiết kiệm: mỗi lần góp là một khoản chuyển tiền thật từ ví khác sang, nên số dư và tiến độ luôn khớp."
        actions={
          <button
            className="btn btn-primary btn-sm"
            id="open-goal"
            type="button"
            onClick={() => openModal('goal', null)}
          >
            ＋ Thêm mục tiêu
          </button>
        }
      />
      <div id="goal-list" className="card-grid">
        {goals.length ? (
          goals.map((goal) => {
            const currency = goal.wallet?.currency || user.currency || 'VND';
            return (
              <article key={goal.id} className={`plan-card${goal.status === 'COMPLETED' ? ' done' : ''}`}>
                <span className="eyebrow">{STATUS_LABELS[goal.status] ?? 'ĐANG THỰC HIỆN'}</span>
                <h3>{goal.name}</h3>
                <p>
                  {goal.targetDate ? `Hạn ${shortDate(goal.targetDate)}` : 'Không giới hạn thời gian'} ·{' '}
                  {goal.wallet ? `Giữ ở ví ${goal.wallet.name}` : 'Chưa liên kết ví'}
                </p>
                <div className="plan-numbers">
                  <span>
                    Đã có <b>{moneyCurrency(goal.currentAmount, currency)}</b>
                  </span>
                  <span>{Math.round(goal.percentCompleted)}%</span>
                </div>
                <Progress percent={goal.percentCompleted} tone="income" />
                <small>Đích đến {moneyCurrency(goal.targetAmount, currency)}</small>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openModal('contribution', goal)}
                  >
                    Góp tiền
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal('goal', goal)}>
                    Sửa
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => remove(goal)}>
                    Xóa
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="panel">
            <Empty text="Chưa có mục tiêu tài chính." action="Tạo mục tiêu" onAction={() => openModal('goal', null)} />
          </div>
        )}
      </div>
    </ViewSection>
  );
}

type GoalForm = {
  name: string;
  targetAmount: string;
  walletId: string;
  targetDate: string;
  recurringAmount: string;
  recurringFrequency: string;
  priority: string;
};

const goalForm = (goal: Goal | null): GoalForm => ({
  name: goal?.name ?? '',
  targetAmount: goal ? String(Number(goal.targetAmount)) : '',
  walletId: goal?.walletId ?? '',
  targetDate: goal?.targetDate?.slice(0, 10) ?? '',
  recurringAmount: goal?.recurringAmount ? String(Number(goal.recurringAmount)) : '',
  recurringFrequency: goal?.recurringFrequency ?? '',
  priority: String(goal?.priority ?? 0)
});

export function GoalModal() {
  const { open, payload, seq, close } = useModal('goal');
  const wallets = useWallets().data ?? [];
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const editing = payload ?? null;
  const [form, setForm] = useState(() => goalForm(null));
  useEffect(() => {
    if (open) setForm(goalForm(editing));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nạp lại form mỗi lần mở
  }, [open, seq]);
  const bind = (name: keyof GoalForm) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value })
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(editing ? `/goals/${editing.id}` : '/goals', {
        method: editing ? 'PATCH' : 'POST',
        body: {
          name: form.name,
          targetAmount: Number(form.targetAmount),
          walletId: form.walletId || null,
          targetDate: form.targetDate || null,
          recurringAmount: form.recurringAmount ? Number(form.recurringAmount) : null,
          recurringFrequency: form.recurringFrequency || null,
          priority: Number(form.priority || 0)
        }
      });
      close();
      await refreshLedger();
      toast(editing ? 'Đã cập nhật mục tiêu.' : 'Đã tạo mục tiêu.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <Modal id="goal-modal" open={open} onClose={close} labelledBy="goal-modal-title" initialFocus="#goal-name">
      <form id="goal-form" className="modal-card" onSubmit={submit}>
        <ModalClose modalId="goal-modal" label="Đóng cửa sổ mục tiêu" onClose={close} />
        <span className="eyebrow">KẾ HOẠCH TƯƠNG LAI</span>
        <h2 id="goal-modal-title">{editing ? 'Chỉnh sửa mục tiêu' : 'Thêm mục tiêu'}</h2>
        <label>
          Tên mục tiêu
          <input id="goal-name" maxLength={120} required {...bind('name')} />
        </label>
        <label>
          Số tiền mục tiêu
          <span className="money-input">
            <input id="goal-target" type="number" min="1" required {...bind('targetAmount')} />
            <span aria-hidden="true">₫</span>
          </span>
        </label>
        <div className="form-row">
          <label>
            Ví tiết kiệm (nơi giữ tiền)
            <select id="goal-wallet" {...bind('walletId')}>
              <option value="">Không liên kết</option>
              {wallets
                .filter((wallet) => !wallet.archivedAt)
                .map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Ngày dự kiến
            <input id="goal-date" type="date" {...bind('targetDate')} />
          </label>
        </div>
        <p className="form-help">
          Nên tạo một ví riêng cho khoản tiết kiệm. Có ví liên kết thì mỗi lần góp, Sổ Mộc chuyển tiền thật từ ví bạn
          chọn sang ví này.
        </p>
        <div className="form-row">
          <label>
            Đóng góp định kỳ
            <input id="goal-recurring-amount" type="number" min="0" {...bind('recurringAmount')} />
          </label>
          <label>
            Tần suất
            <select id="goal-recurring-frequency" {...bind('recurringFrequency')}>
              <option value="">Không tự động</option>
              <option value="WEEKLY">Hàng tuần</option>
              <option value="MONTHLY">Hàng tháng</option>
              <option value="YEARLY">Hàng năm</option>
            </select>
          </label>
        </div>
        <label>
          Độ ưu tiên
          <input id="goal-priority" type="number" min="0" max="100" {...bind('priority')} />
        </label>
        <button className="btn btn-primary btn-block" type="submit">
          Lưu mục tiêu <span aria-hidden="true">→</span>
        </button>
      </form>
    </Modal>
  );
}

/** Góp tiền cho mục tiêu. Mục tiêu có ví tiết kiệm thì ghi một khoản chuyển tiền thật từ ví đã chọn sang ví đó, để số
 * dư các ví luôn khớp với tiến độ; không có ví liên kết thì chỉ ghi tiến độ. */
export function ContributionModal() {
  const { open, payload: goal, seq, close } = useModal('contribution');
  const wallets = useWallets().data ?? [];
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fromWalletId, setFromWalletId] = useState('');
  const sources = goal?.walletId
    ? wallets.filter(
        (wallet) =>
          !wallet.archivedAt &&
          wallet.id !== goal.walletId &&
          wallet.currency === (goal.wallet?.currency ?? wallet.currency)
      )
    : [];
  useEffect(() => {
    if (!open) return;
    setAmount('');
    setNote('');
    setFromWalletId(sources[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- làm trống form mỗi lần mở
  }, [open, seq]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!goal) return;
    try {
      await api(`/goals/${goal.id}/contributions`, {
        method: 'POST',
        body: { amount: Number(amount), note: note || undefined, fromWalletId: fromWalletId || undefined }
      });
      close();
      await refreshLedger();
      toast(fromWalletId ? 'Đã chuyển tiền vào mục tiêu.' : 'Đã cập nhật tiến độ mục tiêu.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <Modal
      id="contribution-modal"
      open={open}
      onClose={close}
      labelledBy="contribution-title"
      initialFocus="#contribution-amount"
    >
      <form id="contribution-form" className="modal-card modal-card-narrow" onSubmit={submit}>
        <ModalClose modalId="contribution-modal" label="Đóng cửa sổ đóng góp" onClose={close} />
        <span className="eyebrow">CẬP NHẬT TIẾN ĐỘ</span>
        <h2 id="contribution-title">{goal?.name ?? 'Đóng góp mục tiêu'}</h2>
        <label>
          Số tiền (nhập số âm để rút bớt)
          <span className="money-input">
            <input
              id="contribution-amount"
              type="number"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <span aria-hidden="true">₫</span>
          </span>
        </label>
        {goal?.walletId && (
          <label id="contribution-wallet-group">
            Lấy tiền từ ví
            <select
              id="contribution-wallet"
              value={fromWalletId}
              onChange={(event) => setFromWalletId(event.target.value)}
            >
              {sources.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} · {moneyCurrency(wallet.balance, wallet.currency)}
                </option>
              ))}
              <option value="">Không chuyển tiền, chỉ ghi tiến độ</option>
            </select>
          </label>
        )}
        <p id="contribution-help" className="form-help">
          {goal?.walletId
            ? `Sổ Mộc sẽ ghi một khoản chuyển tiền từ ví đã chọn sang ví “${goal.wallet?.name ?? 'tiết kiệm'}”, nên số dư các ví luôn khớp với tiến độ.`
            : 'Mục tiêu này chưa liên kết ví tiết kiệm nên lần góp chỉ ghi tiến độ, không trừ tiền ở ví nào. Sửa mục tiêu để chọn ví tiết kiệm.'}
        </p>
        <label>
          Ghi chú
          <input
            id="contribution-note"
            maxLength={255}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-block" type="submit">
          Cập nhật tiến độ <span aria-hidden="true">→</span>
        </button>
      </form>
    </Modal>
  );
}
