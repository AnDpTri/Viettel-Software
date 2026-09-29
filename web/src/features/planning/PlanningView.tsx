import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { api } from '../../api/client';
import { useRefreshLedger, useWallets } from '../../api/queries';
import type { Bill, Household, RecurringRule, Tag } from '../../api/types';
import { useUser } from '../../app/auth';
import type { PlanningTab } from '../../app/navigation';
import { useUi } from '../../app/ui-state';
import { Empty, PanelHead, useViewState, ViewSection } from '../../app/view';
import { ENUM_LABELS, localDateValue, middayIso, moneyCurrency, shortDate } from '../../lib/format';
import { errorMessage, useToast } from '../../ui/Toast';

const BILL_STATUS: Record<string, string> = {
  UPCOMING: 'Sắp tới',
  PAID: 'Đã trả',
  OVERDUE: 'Quá hạn',
  SKIPPED: 'Bỏ qua'
};

/** Chạy một thao tác, báo lỗi bằng toast; trả `true` khi thành công. */
function useAction() {
  const toast = useToast();
  return async (operation: () => Promise<unknown>, success?: string) => {
    try {
      await operation();
      if (success) toast(success);
      return true;
    } catch (error) {
      toast(errorMessage(error), true);
      return false;
    }
  };
}

function usePlanningQuery<T>(key: string, path: string, enabled: boolean) {
  return useQuery({ queryKey: ['planning', key], queryFn: () => api<T[]>(path), enabled });
}

function Panel({ id, tab, children }: { id: PlanningTab; tab: PlanningTab; children: ReactNode }) {
  return (
    <section className={`panel${tab === id ? '' : ' hidden'}`} data-planning-panel={id}>
      {children}
    </section>
  );
}

/** Tự động hóa tài chính, mỗi tab con một khối: giao dịch định kỳ, hóa đơn, nhãn, nhóm gia đình. */
export function PlanningView() {
  const { planningTab } = useUi();
  const { visited } = useViewState('planning');
  const user = useUser();
  const client = useQueryClient();
  const refreshLedger = useRefreshLedger();
  const toast = useToast();
  const run = useAction();
  const wallets = (useWallets().data ?? []).filter((wallet) => !wallet.archivedAt);
  const recurring = usePlanningQuery<RecurringRule>('recurring', '/productivity/recurring', visited).data ?? [];
  const bills = usePlanningQuery<Bill>('bills', '/productivity/bills', visited).data ?? [];
  const tags = usePlanningQuery<Tag>('tags', '/productivity/tags', visited).data ?? [];
  const households = usePlanningQuery<Household>('households', '/productivity/households', visited).data ?? [];
  const reload = () => client.invalidateQueries({ queryKey: ['planning'] });

  const today = localDateValue();
  const [recurringForm, setRecurringForm] = useState({
    name: '',
    amount: '',
    walletId: '',
    type: 'EXPENSE',
    frequency: 'MONTHLY',
    date: today,
    autoPost: false
  });
  const [billForm, setBillForm] = useState({ name: '', amount: '', walletId: '', date: today, recurrence: '' });
  const [tagForm, setTagForm] = useState({ name: '', color: '#23654f' });
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const walletOptions = (
    <>
      <option value="">Chọn ví</option>
      {wallets.map((wallet) => (
        <option key={wallet.id} value={wallet.id}>
          {wallet.name}
        </option>
      ))}
    </>
  );

  async function addRecurring(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      () =>
        api('/productivity/recurring', {
          method: 'POST',
          body: {
            name: recurringForm.name,
            amount: Number(recurringForm.amount),
            walletId: recurringForm.walletId,
            type: recurringForm.type,
            frequency: recurringForm.frequency,
            nextRunAt: middayIso(recurringForm.date),
            autoPost: recurringForm.autoPost
          }
        }),
      'Đã tạo lịch định kỳ.'
    );
    if (ok) {
      setRecurringForm({ ...recurringForm, name: '', amount: '', date: today, autoPost: false });
      await reload();
    }
  }

  async function addBill(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      () =>
        api('/productivity/bills', {
          method: 'POST',
          body: {
            name: billForm.name,
            amount: Number(billForm.amount),
            walletId: billForm.walletId || null,
            dueAt: middayIso(billForm.date),
            recurrence: billForm.recurrence || null
          }
        }),
      'Đã thêm hóa đơn.'
    );
    if (ok) {
      setBillForm({ ...billForm, name: '', amount: '', date: today });
      await reload();
    }
  }

  async function payBill(bill: Bill) {
    const walletId = billForm.walletId || wallets[0]?.id;
    if (
      await run(
        () => api(`/productivity/bills/${bill.id}/pay`, { method: 'POST', body: { walletId } }),
        'Đã ghi khoản chi cho hóa đơn.'
      )
    )
      await Promise.all([reload(), refreshLedger()]);
  }

  return (
    <ViewSection view="planning">
      <Panel id="recurring" tab={planningTab}>
        <PanelHead
          eyebrow="ĐỊNH KỲ"
          title="Khoản thu chi lặp lại"
          help="Lương, tiền nhà, internet… Đến hạn thì Sổ Mộc ghi giúp (nếu bật “Tự động ghi”) hoặc nhắc bạn."
          action={
            <button
              className="btn btn-outline btn-sm"
              id="run-recurring"
              type="button"
              onClick={async () => {
                let processed = 0;
                const ok = await run(async () => {
                  processed = (await api<{ processed: number }>('/productivity/recurring/run-due', { method: 'POST' }))
                    .processed;
                });
                if (!ok) return;
                await Promise.all([reload(), refreshLedger()]);
                toast(`Đã xử lý ${processed} giao dịch.`);
              }}
            >
              Ghi các khoản đến hạn
            </button>
          }
        />
        <form id="recurring-form" className="inline-form" onSubmit={addRecurring}>
          <input
            id="recurring-name"
            placeholder="Tên lịch"
            required
            value={recurringForm.name}
            onChange={(event) => setRecurringForm({ ...recurringForm, name: event.target.value })}
          />
          <input
            id="recurring-amount"
            type="number"
            min="1"
            placeholder="Số tiền"
            required
            value={recurringForm.amount}
            onChange={(event) => setRecurringForm({ ...recurringForm, amount: event.target.value })}
          />
          <select
            id="recurring-wallet"
            required
            aria-label="Ví"
            value={recurringForm.walletId}
            onChange={(event) => setRecurringForm({ ...recurringForm, walletId: event.target.value })}
          >
            {walletOptions}
          </select>
          <select
            id="recurring-type"
            aria-label="Loại"
            value={recurringForm.type}
            onChange={(event) => setRecurringForm({ ...recurringForm, type: event.target.value })}
          >
            <option value="EXPENSE">Khoản chi</option>
            <option value="INCOME">Khoản thu</option>
          </select>
          <select
            id="recurring-frequency"
            aria-label="Chu kỳ"
            value={recurringForm.frequency}
            onChange={(event) => setRecurringForm({ ...recurringForm, frequency: event.target.value })}
          >
            <option value="MONTHLY">Hàng tháng</option>
            <option value="WEEKLY">Hàng tuần</option>
            <option value="YEARLY">Hàng năm</option>
          </select>
          <input
            id="recurring-date"
            type="date"
            required
            aria-label="Kỳ đầu tiên"
            value={recurringForm.date}
            onChange={(event) => setRecurringForm({ ...recurringForm, date: event.target.value })}
          />
          <label className="check-row">
            <input
              id="recurring-auto"
              type="checkbox"
              checked={recurringForm.autoPost}
              onChange={(event) => setRecurringForm({ ...recurringForm, autoPost: event.target.checked })}
            />
            Tự động ghi
          </label>
          <button className="btn btn-primary btn-sm" type="submit">
            Thêm lịch
          </button>
        </form>
        <div id="recurring-list" className="feature-list">
          {recurring.length ? (
            recurring.map((item) => (
              <article key={item.id} className="feature-row">
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {ENUM_LABELS[item.frequency] ?? item.frequency} · kỳ tới {shortDate(item.nextRunAt)}
                    {item.autoPost && ' · tự động ghi'}
                  </small>
                </div>
                <b>{moneyCurrency(item.amount, item.wallet.currency)}</b>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm danger"
                  onClick={async () => {
                    if (
                      confirm('Xóa lịch định kỳ này?') &&
                      (await run(() => api(`/productivity/recurring/${item.id}`, { method: 'DELETE' })))
                    )
                      await reload();
                  }}
                >
                  Xóa
                </button>
              </article>
            ))
          ) : (
            <Empty text="Chưa có giao dịch định kỳ." />
          )}
        </div>
      </Panel>

      <Panel id="bills" tab={planningTab}>
        <PanelHead
          eyebrow="NHẮC VIỆC"
          title="Hóa đơn sắp tới"
          help="Điện, nước, học phí… Sổ Mộc nhắc trước hạn; bấm “Đã trả” là ghi luôn khoản chi."
        />
        <form id="bill-form" className="inline-form" onSubmit={addBill}>
          <input
            id="bill-name"
            placeholder="Tên hóa đơn"
            required
            value={billForm.name}
            onChange={(event) => setBillForm({ ...billForm, name: event.target.value })}
          />
          <input
            id="bill-amount"
            type="number"
            min="1"
            placeholder="Số tiền"
            required
            value={billForm.amount}
            onChange={(event) => setBillForm({ ...billForm, amount: event.target.value })}
          />
          <select
            id="bill-wallet"
            aria-label="Ví thanh toán"
            value={billForm.walletId}
            onChange={(event) => setBillForm({ ...billForm, walletId: event.target.value })}
          >
            {walletOptions}
          </select>
          <input
            id="bill-date"
            type="date"
            required
            aria-label="Hạn thanh toán"
            value={billForm.date}
            onChange={(event) => setBillForm({ ...billForm, date: event.target.value })}
          />
          <select
            id="bill-frequency"
            aria-label="Lặp lại"
            value={billForm.recurrence}
            onChange={(event) => setBillForm({ ...billForm, recurrence: event.target.value })}
          >
            <option value="">Một lần</option>
            <option value="MONTHLY">Hàng tháng</option>
            <option value="YEARLY">Hàng năm</option>
          </select>
          <button className="btn btn-primary btn-sm" type="submit">
            Thêm hóa đơn
          </button>
        </form>
        <div id="bill-list" className="feature-list">
          {bills.length ? (
            bills.map((bill) => (
              <article key={bill.id} className={`feature-row${bill.status === 'OVERDUE' ? ' overdue' : ''}`}>
                <div>
                  <strong>{bill.name}</strong>
                  <small>
                    Hạn {shortDate(bill.dueAt)} · {BILL_STATUS[bill.status] ?? bill.status}
                  </small>
                </div>
                <b>{moneyCurrency(bill.amount, bill.wallet?.currency || user.currency)}</b>
                <div className="row-actions">
                  {bill.status !== 'PAID' && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => payBill(bill)}>
                      Đã trả
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm danger"
                    onClick={async () => {
                      if (
                        confirm('Xóa hóa đơn này?') &&
                        (await run(() => api(`/productivity/bills/${bill.id}`, { method: 'DELETE' })))
                      )
                        await reload();
                    }}
                  >
                    Xóa
                  </button>
                </div>
              </article>
            ))
          ) : (
            <Empty text="Chưa có hóa đơn cần nhắc." />
          )}
        </div>
      </Panel>

      <Panel id="tags" tab={planningTab}>
        <PanelHead
          eyebrow="NHÃN"
          title="Tổ chức dữ liệu"
          help="Gắn nhãn để gom các giao dịch theo chủ đề, ví dụ “Du lịch Đà Lạt”."
        />
        <form
          id="tag-form"
          className="inline-form compact"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(() => api('/productivity/tags', { method: 'POST', body: tagForm }), 'Đã thêm nhãn.')) {
              setTagForm({ ...tagForm, name: '' });
              await reload();
            }
          }}
        >
          <input
            id="tag-name"
            maxLength={50}
            placeholder="Tên nhãn"
            required
            value={tagForm.name}
            onChange={(event) => setTagForm({ ...tagForm, name: event.target.value })}
          />
          <input
            id="tag-color"
            type="color"
            aria-label="Màu nhãn"
            value={tagForm.color}
            onChange={(event) => setTagForm({ ...tagForm, color: event.target.value })}
          />
          <button className="btn btn-primary btn-sm" type="submit">
            Thêm
          </button>
        </form>
        <div id="tag-list" className="chip-row">
          {tags.length ? (
            tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="tag-chip"
                style={{ '--tag-color': tag.color ?? '#23654f' } as CSSProperties}
                title="Xóa nhãn"
                onClick={async () => {
                  if (await run(() => api(`/productivity/tags/${tag.id}`, { method: 'DELETE' }))) await reload();
                }}
              >
                {tag.name} <span aria-hidden="true">×</span>
              </button>
            ))
          ) : (
            <span className="muted">Chưa có nhãn.</span>
          )}
        </div>
      </Panel>

      <Panel id="household" tab={planningTab}>
        <PanelHead
          eyebrow="GIA ĐÌNH"
          title="Không gian dùng chung"
          help="Tạo nhóm gia đình rồi gửi mã mời để người thân tham gia."
        />
        <form
          id="household-form"
          className="inline-form compact"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await run(
                () => api('/productivity/households', { method: 'POST', body: { name: householdName } }),
                'Đã tạo nhóm gia đình.'
              )
            ) {
              setHouseholdName('');
              await reload();
            }
          }}
        >
          <input
            id="household-name"
            maxLength={120}
            placeholder="Tên gia đình"
            value={householdName}
            onChange={(event) => setHouseholdName(event.target.value)}
          />
          <button className="btn btn-primary btn-sm" type="submit">
            Tạo nhóm
          </button>
        </form>
        <form
          id="household-join-form"
          className="inline-form compact"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await run(
                () => api('/productivity/households/join', { method: 'POST', body: { inviteCode } }),
                'Đã tham gia nhóm.'
              )
            ) {
              setInviteCode('');
              await reload();
            }
          }}
        >
          <input
            id="household-code"
            maxLength={32}
            placeholder="Mã mời"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
          />
          <button className="btn btn-outline btn-sm" type="submit">
            Tham gia
          </button>
        </form>
        <div id="household-list" className="feature-list">
          {households.length ? (
            households.map((household) => (
              <article key={household.id} className="feature-row">
                <div>
                  <strong>{household.name}</strong>
                  <small>
                    {household.members.length} thành viên · Mã mời <code>{household.inviteCode}</code>
                  </small>
                </div>
              </article>
            ))
          ) : (
            <Empty text="Chưa tham gia nhóm gia đình." />
          )}
        </div>
      </Panel>
    </ViewSection>
  );
}
