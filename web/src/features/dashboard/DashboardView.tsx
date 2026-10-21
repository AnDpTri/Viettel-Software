import { useCategories, useMonthSummary, useOnboarding, useTransactions, useWallets } from '../../api/queries';
import { useUser } from '../../app/auth';
import { useUi } from '../../app/ui-state';
import { Empty, PanelHead, Progress, ViewSection } from '../../app/view';
import { moneyCurrency } from '../../lib/format';
import { CategoryChip, useCategoryColors } from '../../ui/CategoryChip';
import { OnboardingCard } from '../onboarding/OnboardingCard';
import { TransactionRow } from '../transactions/TransactionRow';
import { WalletCard } from '../wallets/WalletCard';

/** Tổng quan: tổng tài sản, thu chi tháng này, giao dịch gần đây, chi tiêu theo nhóm và các ví. Người chưa có ví và
 * giao dịch chỉ thấy lời mời thiết lập thay cho các khối 0 ₫. */
export function DashboardView() {
  const user = useUser();
  const { openModal, showView } = useUi();
  const wallets = useWallets().data ?? [];
  const transactions = useTransactions().data ?? [];
  const summary = useMonthSummary().data;
  const onboarding = useOnboarding().data;
  useCategories();
  const { colorOf, idOf } = useCategoryColors();

  const currency = user.currency || 'VND';
  const activeWallets = wallets.filter((wallet) => !wallet.archivedAt);
  const total = activeWallets
    .filter((wallet) => wallet.currency === currency)
    .reduce((sum, wallet) => sum + Number(wallet.balance), 0);
  const isNew = !activeWallets.length && !transactions.length;
  const onboardingVisible = Boolean(onboarding && !onboarding.completed && !onboarding.dismissed);
  const spending = summary?.expenseByCategory ?? [];
  const maxSpending = Math.max(...spending.map((item) => Number(item.amount)), 1);

  const net = Number(summary?.net ?? 0);
  const metrics = [
    {
      id: 'income',
      tone: 'income',
      label: 'Thu nhập',
      value: summary?.income,
      sign: Number(summary?.income ?? 0) > 0 ? '+' : '',
      note: 'Tháng này'
    },
    { id: 'expense', tone: 'expense', label: 'Chi tiêu', value: summary?.expense, sign: '', note: 'Tháng này' },
    {
      id: 'net',
      tone: net < 0 ? 'negative' : 'net',
      label: 'Dòng tiền ròng',
      value: summary?.net,
      sign: net > 0 ? '+' : '',
      note: 'Thu nhập trừ chi tiêu'
    }
  ];

  return (
    <ViewSection view="dashboard" className={isNew ? 'is-new' : undefined}>
      <OnboardingCard />
      <section id="dashboard-empty" className={`panel dashboard-empty${isNew && !onboardingVisible ? '' : ' hidden'}`}>
        <h2>Sổ của bạn đang trống</h2>
        <p>Cho Sổ Mộc biết tiền của bạn đang ở đâu và ghi khoản đầu tiên. Mất khoảng 1 phút.</p>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => openModal('welcome', undefined)}>
          Thiết lập nhanh
        </button>
      </section>

      <section className="kpi-strip" aria-label="Tóm tắt tháng này">
        <div className="kpi kpi-lead">
          <span>Tổng tài sản</span>
          <strong id="total-balance">{moneyCurrency(total, currency)}</strong>
          <small>Tất cả ví đang hoạt động</small>
        </div>
        {metrics.map((metric) => (
          <div key={metric.id} className="kpi">
            <span>{metric.label}</span>
            <strong id={metric.id} className={metric.tone}>
              {metric.sign}
              {moneyCurrency(metric.value ?? 0, currency)}
            </strong>
            <small>{metric.note}</small>
          </div>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHead
            title="Giao dịch mới nhất"
            action={
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                data-view-target="transactions"
                onClick={() => showView('transactions')}
              >
                Xem tất cả →
              </button>
            }
          />
          <div id="recent-transactions" className="transaction-list">
            {transactions.length ? (
              transactions
                .slice(0, 5)
                .map((item) => (
                  <TransactionRow
                    key={item.id}
                    transaction={item}
                    fallbackCurrency={currency}
                    categoryColor={colorOf(item.categoryId)}
                  />
                ))
            ) : (
              <Empty
                text="Chưa có giao dịch nào."
                action="Ghi giao dịch đầu tiên"
                onAction={() => openModal('transaction', null)}
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHead title="Chi tiêu theo nhóm" />
          <div id="spending-categories" className="spending-list">
            {spending.length ? (
              spending.slice(0, 5).map((item) => (
                <div key={item.categoryName} className="spending-item">
                  <div className="spending-top">
                    <CategoryChip
                      name={item.categoryName}
                      color={colorOf(null, item.categoryName)}
                      seed={idOf(item.categoryName) ?? item.categoryName}
                    />
                    <b>{moneyCurrency(item.amount, item.currency || currency)}</b>
                  </div>
                  <Progress percent={Math.max(2, (Number(item.amount) / maxSpending) * 100)} />
                </div>
              ))
            ) : (
              <Empty text="Chưa có dữ liệu chi tiêu tháng này." />
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <PanelHead
          title="Ví của bạn"
          action={
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              data-view-target="wallets"
              onClick={() => showView('wallets')}
            >
              Quản lý ví →
            </button>
          }
        />
        <div id="wallet-preview" className="wallet-grid">
          {activeWallets.length ? (
            activeWallets.map((wallet) => <WalletCard key={wallet.id} wallet={wallet} />)
          ) : (
            <Empty text="Chưa có ví nào." action="Tạo ví đầu tiên" onAction={() => openModal('wallet', null)} />
          )}
        </div>
      </section>
    </ViewSection>
  );
}
