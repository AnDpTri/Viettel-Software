import { useMemo } from 'react';
import {
  useBills,
  useBudgets,
  useCategories,
  useMonthExpenses,
  useMonthSummary,
  useMonthTransactions,
  useOnboarding,
  useRecurringRules,
  useReportsPeriodSummary,
  useTransactions,
  useWallets
} from '../../api/queries';
import { useUser } from '../../app/auth';
import { useUi } from '../../app/ui-state';
import { Empty, PanelHead, ViewSection } from '../../app/view';
import { moneyCurrency, WALLET_TYPE_LABELS } from '../../lib/format';
import { isCurrentMonth, isFutureMonth, monthBounds, monthLabel, shiftMonth } from '../../lib/month';
import { dueItems, dueText, endOfDay, isDueSoon, startOfDay } from '../../lib/obligations';
import { budgetsInMonth, safeToSpendToday } from '../../lib/safe-to-spend';
import { cumulativeByDay } from '../../lib/spend-series';
import { CategoryChip, useCategoryColors } from '../../ui/CategoryChip';
import { compactMoneyVi, computeNetWorthSeries } from '../../ui/charts/chart-math';
import { DueTimeline } from '../../ui/charts/DueTimeline';
import { NetWorthChart } from '../../ui/charts/NetWorthChart';
import { useIsPhone } from '../../ui/useIsPhone';
import { MonthSwitcher } from '../../ui/MonthSwitcher';
import { OnboardingCard } from '../onboarding/OnboardingCard';
import { TransactionRow } from '../transactions/TransactionRow';
import { BudgetRing, type RingItem } from './BudgetRings';
import { SpendLine } from './SpendLine';

const DAY_MS = 86_400_000;

/**
 * Tổng quan. Câu hỏi: "Hôm nay mình còn tiêu được bao nhiêu?". Con số lớn nhất trả lời câu đó; bên cạnh là tổng tài sản,
 * thu, chi, ròng của tháng đang chọn; bên dưới là bằng chứng (đường chi tiêu, vòng ngân sách, khoản sắp đến hạn).
 * Lưới 12 cột, khoảng cách 12px, lề 32px: 6+6, 8+4, 8+4, 8+4 (mỗi hàng cộng đủ 12 cột).
 */
export function DashboardView() {
  const user = useUser();
  const phone = useIsPhone();
  const { openModal, showView, month } = useUi();
  const wallets = useWallets().data ?? [];
  const anyTransactions = useTransactions().data ?? [];
  const monthTransactions = useMonthTransactions(month).data ?? [];
  const summary = useMonthSummary(month).data;
  const expenses = useMonthExpenses(month).data;
  const budgets = useBudgets().data ?? [];
  const recurringData = useRecurringRules().data;
  const billsData = useBills().data;
  const recurring = useMemo(() => recurringData ?? [], [recurringData]);
  const bills = useMemo(() => billsData ?? [], [billsData]);
  const onboarding = useOnboarding().data;
  useCategories();
  const { colorOf, idOf } = useCategoryColors();

  const currency = user.currency || 'VND';
  const today = useMemo(() => new Date(), []);
  const current = isCurrentMonth(month, today);
  const future = isFutureMonth(month, today);
  const bounds = monthBounds(month);

  const activeWallets = wallets.filter((wallet) => !wallet.archivedAt);
  const total = activeWallets
    .filter((wallet) => wallet.currency === currency)
    .reduce((sum, wallet) => sum + Number(wallet.balance), 0);
  const isNew = !activeWallets.length && !anyTransactions.length;
  const onboardingVisible = Boolean(onboarding && !onboarding.completed && !onboarding.dismissed);

  // Ngân sách có hiệu lực trong tháng đang xem (cùng tiền tệ chính).
  const monthBudgets = budgetsInMonth(
    budgets.filter((budget) => (budget.currency || currency) === currency),
    month
  ).map((budget) => ({ ...budget, amountNumber: Number(budget.amount), spentNumber: Number(budget.spent) }));
  // Đường tham chiếu chỉ là ngân sách cho toàn bộ chi tiêu: ngân sách theo danh mục chỉ phủ một phần khoản chi nên không so với tổng chi.
  const budgetTotal = monthBudgets
    .filter((budget) => !budget.categoryId)
    .reduce((sum, budget) => sum + budget.amountNumber, 0);

  // Khoản chi đã biết sẽ đến hạn: từ hôm nay (hoặc đầu tháng nếu tháng sau) tới hết tháng; danh sách "Sắp đến hạn" xem xa hơn.
  const monthEnd = endOfDay(new Date(Number(bounds.to.slice(0, 4)), Number(bounds.to.slice(5, 7)) - 1, bounds.days));
  const monthStart = startOfDay(new Date(Number(bounds.from.slice(0, 4)), Number(bounds.from.slice(5, 7)) - 1, 1));
  const dueFrom = current ? startOfDay(today) : monthStart;
  const dueThroughMonth =
    future || current ? dueItems({ recurring, bills, from: dueFrom, to: monthEnd, currency }) : [];
  const dueThroughMonthWithPaid = useMemo(
    () =>
      future || current ? dueItems({ recurring, bills, from: dueFrom, to: monthEnd, currency, includePaid: true }) : [],
    [future, current, recurring, bills, dueFrom, monthEnd, currency]
  );
  const dueTotal = dueThroughMonth.reduce((sum, item) => sum + item.amount, 0);
  const upcomingList = current
    ? dueItems({
        recurring,
        bills,
        from: startOfDay(today),
        to: endOfDay(new Date(Math.max(monthEnd.getTime(), today.getTime() + 14 * DAY_MS))),
        currency
      })
    : dueThroughMonth;

  const safe = current
    ? safeToSpendToday({
        budgets: monthBudgets.map((budget) => ({
          amount: budget.amountNumber,
          spent: budget.spentNumber,
          startDate: budget.startDate,
          endDate: budget.endDate
        })),
        upcoming: dueTotal,
        today,
        currency
      })
    : null;

  const income = Number(summary?.income ?? 0);
  const expense = Number(summary?.expense ?? 0);
  const net = Number(summary?.net ?? 0);
  const spending = summary?.expenseByCategory ?? [];
  const maxSpending = Math.max(...spending.map((item) => Number(item.amount)), 1);
  const money = (value: number) => moneyCurrency(value, currency);
  const expenseRows = (expenses ?? []).filter((item) => (item.wallet.currency || currency) === currency);
  const throughDay = current ? today.getDate() : future ? 0 : bounds.days;
  const cumulative = cumulativeByDay(expenseRows, month, throughDay);

  // Dữ liệu tháng trước phục vụ so sánh cùng kỳ trên đường chi tiêu
  const prevMonth = shiftMonth(month, -1);
  const prevExpenses = useMonthExpenses(prevMonth).data;
  const prevExpenseRows = (prevExpenses ?? []).filter((item) => (item.wallet.currency || currency) === currency);
  const prevBounds = monthBounds(prevMonth);
  const prevCumulative = cumulativeByDay(prevExpenseRows, prevMonth, prevBounds.days);

  // Chuỗi tài sản ròng 12 tháng gần nhất (tính lùi từ số dư hiện tại trừ dòng tiền từng tháng)
  const twelveMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11)), [month]);
  const from12 = monthBounds(twelveMonths[0]!).from;
  const to12 = monthBounds(twelveMonths[11]!).to;
  const summary12 = useReportsPeriodSummary(from12, to12).data;
  const flowsMap = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const m of summary12?.monthly ?? []) {
      map.set(m.month, { income: Number(m.income), expense: Number(m.expense) });
    }
    return map;
  }, [summary12]);
  const netWorthSeries = useMemo(
    () => computeNetWorthSeries(total, twelveMonths, flowsMap),
    [total, twelveMonths, flowsMap]
  );
  const currentNetWorth = netWorthSeries[11]?.netWorth ?? total;
  const prevNetWorth = netWorthSeries[10]?.netWorth ?? currentNetWorth;
  const changeVsLastMonth = currentNetWorth - prevNetWorth;

  const rings: RingItem[] = monthBudgets.map((budget) => ({
    id: budget.id,
    name: budget.category?.name ?? budget.name,
    amount: budget.amountNumber,
    spent: budget.spentNumber,
    currency
  }));

  // Phần chữ của khối con số chính: mọi số lấy từ cùng biến với con số.
  let heroLabel = 'Còn tiêu được hôm nay';
  let heroValue = '';
  let heroClass = '';
  let heroNote: string = '';
  let heroId: string | undefined;
  if (safe?.kind === 'amount') {
    heroValue = money(safe.perDay);
    heroNote = `Còn ${money(safe.remaining)} ngân sách, ${safe.days} ngày${
      safe.upcoming > 0 ? `, trừ ${money(safe.upcoming)} hóa đơn` : ''
    }`;
  } else if (safe?.kind === 'over') {
    heroLabel = 'Ngân sách tháng này';
    heroValue = `Đã vượt ${money(safe.over)}`;
    heroClass = ' danger';
    heroNote = `Ví bắt đầu rơm rớm rồi: đã vượt ${money(safe.over)} ngân sách tháng.`;
  } else if (!current) {
    heroLabel = `Đã chi trong ${monthLabel(month).toLowerCase()}`;
    heroValue = money(expense);
    heroNote = future ? 'Tháng này chưa có số liệu.' : `${expenseRows.length} khoản chi`;
  } else {
    heroLabel = 'Tổng tài sản';
    heroValue = money(total);
    heroNote = 'Tất cả ví đang hoạt động';
    heroId = 'total-balance';
  }

  const finding =
    budgetTotal > 0 && !future
      ? `Đã chi ${money(expense)}, bằng ${Math.round((expense / budgetTotal) * 100)}% ngân sách tháng`
      : expenseRows.length || expense
        ? `Đã chi ${money(expense)}`
        : 'Chưa có khoản chi nào';

  return (
    <ViewSection view="dashboard" className={isNew ? 'is-new' : undefined}>
      <OnboardingCard />
      <section id="dashboard-empty" className={`panel dashboard-empty${isNew && !onboardingVisible ? '' : ' hidden'}`}>
        <h2>Sổ của bạn đang trống</h2>
        <p>Cho Wallet May Cry biết tiền của bạn đang ở đâu và ghi khoản đầu tiên để ví an lòng.</p>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => openModal('welcome', undefined)}>
          Thiết lập nhanh
        </button>
      </section>

      {phone && (
        <div className="dash-bar">
          <MonthSwitcher />
        </div>
      )}

      <div className="dash">
        <section className="dash-hero panel" aria-label="Còn tiêu được hôm nay">
          <span className="dash-hero-label">{heroLabel}</span>
          <strong id={heroId} className={`dash-hero-value${heroClass}`}>
            {heroValue}
          </strong>
          <p className="dash-hero-note">{heroNote}</p>
          {safe?.kind === 'no-budget' && (
            <button className="btn btn-outline btn-sm" type="button" onClick={() => openModal('budget', null)}>
              Đặt ngân sách tháng này
            </button>
          )}
        </section>

        <section className="dash-kpis" aria-label={`Tóm tắt ${monthLabel(month)}`}>
          <div className="dash-kpi dash-kpi-networth">
            <div className="dash-kpi-head">
              <span>Tài sản ròng</span>
              <span
                className={`dash-kpi-diff ${
                  changeVsLastMonth > 0 ? 'income' : changeVsLastMonth < 0 ? 'danger' : 'neutral'
                }`}
              >
                {changeVsLastMonth > 0 ? '+' : ''}
                {compactMoneyVi(changeVsLastMonth)}
              </span>
            </div>
            <strong id={heroId === 'total-balance' ? 'kpi-total-balance' : 'total-balance'} className="lead">
              {money(total)}
            </strong>
            <NetWorthChart data={netWorthSeries} mini height={32} format={money} />
          </div>
          <div className="dash-kpi">
            <span>Thu nhập</span>
            <strong id="income" className="income">
              {income > 0 ? '+' : ''}
              {money(income)}
            </strong>
          </div>
          <div className="dash-kpi">
            <span>Chi tiêu</span>
            <strong id="expense" className="expense">
              {money(expense)}
            </strong>
          </div>
          <div className="dash-kpi">
            <span>Dòng tiền ròng</span>
            <strong id="net" className={net < 0 ? 'negative' : 'net'}>
              {net > 0 ? '+' : ''}
              {money(net)}
            </strong>
          </div>
        </section>

        <section className="dash-chart panel">
          <PanelHead title={`Chi tiêu ${monthLabel(month).toLowerCase()}`} help={finding} />
          <SpendLine
            values={cumulative}
            previousValues={prevCumulative}
            totalDays={bounds.days}
            todayIndex={current ? today.getDate() - 1 : null}
            reference={budgetTotal > 0 ? { value: budgetTotal, label: `Ngân sách ${money(budgetTotal)}` } : null}
            format={money}
            height={phone ? 180 : 220}
            description={`Chi tiêu lũy kế ${monthLabel(month)}: ${finding}`}
            budgetTotal={budgetTotal}
          />
        </section>

        <section className="dash-top panel">
          <PanelHead title="Danh mục chi nhiều nhất" />
          <div id="spending-categories" className="spending-list">
            {spending.length ? (
              spending.slice(0, 5).map((item) => (
                <div key={item.categoryName} className="spending-item">
                  <div className="spending-top">
                    <CategoryChip
                      name={item.categoryName}
                      color={colorOf(item.categoryId, item.categoryName)}
                      seed={item.categoryId ?? idOf(item.categoryName) ?? item.categoryName}
                    />
                    <b>{moneyCurrency(item.amount, item.currency || currency)}</b>
                  </div>
                  <div className="spending-bar">
                    <span style={{ width: `${Math.max(2, (Number(item.amount) / maxSpending) * 100)}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <Empty text="Chưa có khoản chi nào trong tháng này." />
            )}
          </div>
        </section>

        {rings.length > 0 && (
          <section className="dash-rings panel">
            <PanelHead
              title="Ngân sách còn lại"
              action={
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  data-view-target="budgets"
                  onClick={() => showView('budgets')}
                >
                  Xem tất cả →
                </button>
              }
            />
            <div className="ring-row">
              {rings.map((ring) => (
                <BudgetRing key={ring.id} item={ring} onOpen={() => showView('budgets')} />
              ))}
            </div>
          </section>
        )}

        <div className="dash-main">
          <section className="dash-recent panel">
            <PanelHead
              title="Giao dịch gần đây"
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
              {monthTransactions.length ? (
                monthTransactions
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
                  text={
                    current
                      ? 'Ví đang yên. Ghi khoản đầu tiên để nó khỏi lo.'
                      : 'Không có giao dịch nào trong tháng này.'
                  }
                  action={current ? 'Ghi giao dịch' : undefined}
                  onAction={() => openModal('transaction', null)}
                />
              )}
            </div>
          </section>
        </div>

        <div className="dash-side">
          <section className="dash-due panel">
            <PanelHead
              title="Sắp đến hạn"
              action={
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  data-view-target="planning"
                  onClick={() => showView('planning')}
                >
                  Khoản định kỳ →
                </button>
              }
            />
            {dueThroughMonthWithPaid.length > 0 && (
              <DueTimeline
                items={dueThroughMonthWithPaid}
                today={today}
                monthEnd={monthEnd}
                fromDay={current ? today.getDate() : 1}
                format={money}
              />
            )}
            <div className="due-list">
              {upcomingList.length ? (
                upcomingList.slice(0, 4).map((item) => (
                  <div key={item.key} className="due-item">
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {dueText(item.due, today)}
                        {isDueSoon(item.due, today) && <em>Sắp đến hạn</em>}
                      </span>
                    </div>
                    <b>{moneyCurrency(item.amount, item.currency)}</b>
                  </div>
                ))
              ) : (
                <Empty text={current ? 'Không có khoản nào sắp đến hạn.' : 'Không có khoản nào đến hạn.'} />
              )}
            </div>
          </section>

          <section className="dash-wallets panel">
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
            <div id="wallet-preview" className="wallet-list">
              {activeWallets.length ? (
                activeWallets.map((wallet) => (
                  <div key={wallet.id} className="wallet-line">
                    <i className="wallet-dot" style={{ background: wallet.color ?? undefined }} aria-hidden="true" />
                    <div>
                      <strong>{wallet.name}</strong>
                      <span>{WALLET_TYPE_LABELS[wallet.type] ?? wallet.type}</span>
                    </div>
                    <b className={Number(wallet.balance) < 0 ? 'negative' : undefined}>
                      {moneyCurrency(wallet.balance, wallet.currency)}
                    </b>
                  </div>
                ))
              ) : (
                <Empty text="Chưa có ví nào." action="Tạo ví" onAction={() => openModal('wallet', null)} />
              )}
            </div>
          </section>
        </div>
      </div>
    </ViewSection>
  );
}
