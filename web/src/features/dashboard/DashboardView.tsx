import { useCategories, useMonthSummary, useOnboarding, useTransactions, useWallets } from '../../api/queries';
import { useUser } from '../../app/auth';
import { useUi } from '../../app/ui-state';
import { Empty, PanelHead, Progress, ViewSection } from '../../app/view';
import { moneyCurrency } from '../../lib/format';
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

  const currency = user.currency || 'VND';
  const activeWallets = wallets.filter((wallet) => !wallet.archivedAt);
  const total = activeWallets
    .filter((wallet) => wallet.currency === currency)
    .reduce((sum, wallet) => sum + Number(wallet.balance), 0);
  const isNew = !activeWallets.length && !transactions.length;
  const onboardingVisible = Boolean(onboarding && !onboarding.completed && !onboarding.dismissed);
  const spending = summary?.expenseByCategory ?? [];
  const maxSpending = Math.max(...spending.map((item) => Number(item.amount)), 1);

  const metrics = [
    { id: 'income', tone: 'income', icon: '↙', label: 'Thu nhập', value: summary?.income, note: 'Trong tháng này' },
    { id: 'expense', tone: 'expense', icon: '↗', label: 'Chi tiêu', value: summary?.expense, note: 'Trong tháng này' },
    { id: 'net', tone: 'net', icon: '≈', label: 'Dòng tiền ròng', value: summary?.net, note: 'Thu nhập trừ chi tiêu' }
  ];

  return (
    <ViewSection view="dashboard" className={isNew ? 'is-new' : undefined}>
      <OnboardingCard />
      <section id="dashboard-empty" className={`panel dashboard-empty${isNew && !onboardingVisible ? '' : ' hidden'}`}>
        <span className="eyebrow">BẮT ĐẦU</span>
        <h2>Sổ của bạn đang trống</h2>
        <p>Cho Sổ Mộc biết tiền của bạn đang ở đâu và ghi khoản đầu tiên. Mất khoảng 1 phút.</p>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => openModal('welcome', undefined)}>
          Thiết lập nhanh
        </button>
      </section>

      <div className="dash-top">
        <div className="hero-card">
          <span className="eyebrow">TỔNG TÀI SẢN</span>
          <div id="total-balance" className="hero-value">
            {moneyCurrency(total, currency)}
          </div>
          <p>Cập nhật từ tất cả ví đang hoạt động</p>
          <span className="hero-period">THÁNG NÀY</span>
        </div>
        <div className="metric-grid">
          {metrics.map((metric) => (
            <article key={metric.id} className={`metric-card ${metric.tone}`}>
              <div className="metric-icon" aria-hidden="true">
                {metric.icon}
              </div>
              <div>
                <span>{metric.label}</span>
                <strong id={metric.id}>{moneyCurrency(metric.value ?? 0, currency)}</strong>
                <small>{metric.note}</small>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHead
            eyebrow="GẦN ĐÂY"
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
                .map((item) => <TransactionRow key={item.id} transaction={item} fallbackCurrency={currency} />)
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
          <PanelHead eyebrow="PHÂN BỔ" title="Chi tiêu theo nhóm" />
          <div id="spending-categories" className="spending-list">
            {spending.length ? (
              spending.slice(0, 5).map((item) => (
                <div key={item.categoryName} className="spending-item">
                  <div className="spending-top">
                    <span>{item.categoryName}</span>
                    <b>{moneyCurrency(item.amount, item.currency || currency)}</b>
                  </div>
                  <Progress percent={Math.max(5, (Number(item.amount) / maxSpending) * 100)} tone="expense" />
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
          eyebrow="TÀI KHOẢN"
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
