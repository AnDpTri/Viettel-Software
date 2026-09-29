import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { useBudgets, useCategories, useRefreshLedger } from '../../api/queries';
import type { Budget } from '../../api/types';
import { useUser } from '../../app/auth';
import { useModal, useUi } from '../../app/ui-state';
import { Empty, Progress, SectionTitle, ViewSection } from '../../app/view';
import { localDateValue, moneyCurrency, shortDate } from '../../lib/format';
import { Modal, ModalClose } from '../../ui/Modal';
import { errorMessage, useToast } from '../../ui/Toast';

export function BudgetsView() {
  const budgets = useBudgets().data ?? [];
  const user = useUser();
  const { openModal } = useUi();
  const toast = useToast();
  const refreshLedger = useRefreshLedger();

  async function remove(budget: Budget) {
    if (!confirm(`Xóa ngân sách “${budget.name}”?`)) return;
    try {
      await api(`/budgets/${budget.id}`, { method: 'DELETE' });
      await refreshLedger();
      toast('Đã xóa ngân sách.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <ViewSection view="budgets">
      <SectionTitle
        eyebrow="KẾ HOẠCH CHI"
        title="Ngân sách"
        help="Đặt hạn mức cho cả tháng hoặc từng nhóm chi. Thanh tiến độ cho biết còn được tiêu bao nhiêu."
        actions={
          <button
            className="btn btn-primary btn-sm"
            id="open-budget"
            type="button"
            onClick={() => openModal('budget', null)}
          >
            ＋ Thêm ngân sách
          </button>
        }
      />
      <div id="budget-list" className="card-grid">
        {budgets.length ? (
          budgets.map((budget) => {
            const currency = budget.currency || user.currency;
            const over = budget.percentUsed >= 100;
            return (
              <article key={budget.id} className={`plan-card${over ? ' over' : ''}`}>
                <span className="eyebrow">{budget.category?.name ?? 'TOÀN BỘ CHI TIÊU'}</span>
                <h3>{budget.name}</h3>
                <p>
                  {shortDate(budget.startDate)} — {shortDate(budget.endDate)}
                </p>
                <div className="plan-numbers">
                  <span>
                    Đã dùng <b>{moneyCurrency(budget.spent, currency)}</b>
                  </span>
                  <span>{Math.round(budget.percentUsed)}%</span>
                </div>
                <Progress
                  percent={budget.percentUsed}
                  tone={over ? 'expense' : budget.percentUsed >= 80 ? 'warning' : undefined}
                />
                <small>
                  {budget.remaining < 0
                    ? `Vượt ${moneyCurrency(-budget.remaining, currency)}`
                    : `Còn lại ${moneyCurrency(budget.remaining, currency)}`}
                </small>
                <div className="row-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal('budget', budget)}>
                    Sửa
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => remove(budget)}>
                    Xóa
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="panel">
            <Empty text="Chưa thiết lập ngân sách." action="Tạo ngân sách" onAction={() => openModal('budget', null)} />
          </div>
        )}
      </div>
    </ViewSection>
  );
}

type BudgetForm = {
  name: string;
  amount: string;
  categoryId: string;
  startDate: string;
  endDate: string;
  recurrence: string;
  rollover: boolean;
};

function budgetForm(budget: Budget | null): BudgetForm {
  const today = new Date();
  return {
    name: budget?.name ?? '',
    amount: budget ? String(Number(budget.amount)) : '',
    categoryId: budget?.categoryId ?? '',
    startDate: budget ? budget.startDate.slice(0, 10) : localDateValue(today),
    endDate: budget
      ? budget.endDate.slice(0, 10)
      : localDateValue(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    recurrence: budget?.recurrence ?? '',
    rollover: Boolean(budget?.rollover)
  };
}

export function BudgetModal() {
  const { open, payload, seq, close } = useModal('budget');
  const categories = useCategories().data ?? [];
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const editing = payload ?? null;
  const [form, setForm] = useState(() => budgetForm(null));
  useEffect(() => {
    if (open) setForm(budgetForm(editing));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nạp lại form mỗi lần mở
  }, [open, seq]);
  const bind = (name: Exclude<keyof BudgetForm, 'rollover'>) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value })
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(editing ? `/budgets/${editing.id}` : '/budgets', {
        method: editing ? 'PATCH' : 'POST',
        body: {
          name: form.name,
          amount: Number(form.amount),
          categoryId: form.categoryId || null,
          startDate: form.startDate,
          endDate: form.endDate,
          recurrence: form.recurrence || null,
          rollover: form.rollover
        }
      });
      close();
      await refreshLedger();
      toast(editing ? 'Đã cập nhật ngân sách.' : 'Đã tạo ngân sách.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <Modal id="budget-modal" open={open} onClose={close} labelledBy="budget-modal-title" initialFocus="#budget-name">
      <form id="budget-form" className="modal-card" onSubmit={submit}>
        <ModalClose modalId="budget-modal" label="Đóng cửa sổ ngân sách" onClose={close} />
        <span className="eyebrow">KẾ HOẠCH CHI TIÊU</span>
        <h2 id="budget-modal-title">{editing ? 'Chỉnh sửa ngân sách' : 'Thêm ngân sách'}</h2>
        <label>
          Tên ngân sách
          <input id="budget-name" maxLength={100} required {...bind('name')} />
        </label>
        <div className="form-row">
          <label>
            Hạn mức
            <span className="money-input">
              <input id="budget-amount" type="number" min="1" required {...bind('amount')} />
              <span aria-hidden="true">₫</span>
            </span>
          </label>
          <label>
            Danh mục chi
            <select id="budget-category" {...bind('categoryId')}>
              <option value="">Toàn bộ chi tiêu</option>
              {categories
                .filter((item) => item.type === 'EXPENSE')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Từ ngày
            <input id="budget-start" type="date" required {...bind('startDate')} />
          </label>
          <label>
            Đến ngày
            <input id="budget-end" type="date" required {...bind('endDate')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Lặp lại
            <select id="budget-recurrence" {...bind('recurrence')}>
              <option value="">Không lặp</option>
              <option value="MONTHLY">Hàng tháng</option>
              <option value="QUARTERLY">Hàng quý</option>
              <option value="YEARLY">Hàng năm</option>
            </select>
          </label>
          <label className="check-row">
            <input
              id="budget-rollover"
              type="checkbox"
              checked={form.rollover}
              onChange={(event) => setForm({ ...form, rollover: event.target.checked })}
            />
            Chuyển dư sang kỳ sau
          </label>
        </div>
        <button className="btn btn-primary btn-block" type="submit">
          Lưu ngân sách <span aria-hidden="true">→</span>
        </button>
      </form>
    </Modal>
  );
}
