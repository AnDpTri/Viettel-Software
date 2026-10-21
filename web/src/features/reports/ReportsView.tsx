import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, downloadFile } from '../../api/client';
import { useReportsPeriodSummary, useWallets } from '../../api/queries';
import type { Reconciliation, ReportSummary } from '../../api/types';
import { useUser } from '../../app/auth';
import { useUi } from '../../app/ui-state';
import { PanelHead, useViewState, ViewSection } from '../../app/view';
import { localDateValue, moneyCurrency } from '../../lib/format';
import { isCurrentMonth, monthBounds, shiftMonth } from '../../lib/month';
import { computeNetWorthSeries } from '../../ui/charts/chart-math';
import { MonthlyFlowBarChart } from '../../ui/charts/MonthlyFlowBarChart';
import { NetWorthChart } from '../../ui/charts/NetWorthChart';
import { MonthSwitcher } from '../../ui/MonthSwitcher';
import { useIsPhone } from '../../ui/useIsPhone';
import { errorMessage, useToast } from '../../ui/Toast';

type Preset = 'month' | 'last-month' | '3m' | 'year';

const PRESETS: Array<[Preset, string]> = [
  ['month', 'Tháng này'],
  ['last-month', 'Tháng trước'],
  ['3m', '3 tháng'],
  ['year', 'Năm nay']
];

function presetRange(preset: Preset) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const [from, to] =
    preset === 'last-month'
      ? [new Date(year, month - 1, 1), new Date(year, month, 0)]
      : preset === '3m'
        ? [new Date(year, month - 2, 1), now]
        : preset === 'year'
          ? [new Date(year, 0, 1), now]
          : [new Date(year, month, 1), now];
  return { from: localDateValue(from), to: localDateValue(to) };
}

export function ReportsView() {
  const user = useUser();
  const toast = useToast();
  const client = useQueryClient();
  const { visited } = useViewState('reports');
  const phone = useIsPhone();
  const { month } = useUi();
  const [preset, setPreset] = useState<Preset | null>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  // Đổi tháng ở đầu màn thì khoảng báo cáo chuyển theo tháng đó (lần dựng đầu giữ mặc định "Tháng này").
  const firstMonth = useRef(true);
  useEffect(() => {
    if (firstMonth.current) {
      firstMonth.current = false;
      return;
    }
    if (isCurrentMonth(month)) {
      setPreset('month');
      setRange(presetRange('month'));
    } else {
      const { from, to } = monthBounds(month);
      setPreset(null);
      setRange({ from, to });
    }
  }, [month]);
  const params = new URLSearchParams(range);
  const summary = useQuery({
    queryKey: ['reports', 'summary', range.from, range.to],
    queryFn: () => api<ReportSummary>(`/reports/summary?${params}`),
    enabled: visited
  }).data;
  const reconciliation = useQuery({
    queryKey: ['reports', 'reconciliation'],
    queryFn: () => api<Reconciliation>('/reports/reconciliation'),
    enabled: visited
  }).data;

  const [flowMonthsCount, setFlowMonthsCount] = useState<6 | 12>(6);
  const wallets = useWallets().data ?? [];
  const activeWallets = wallets.filter((w) => !w.archivedAt);
  const totalBalance = activeWallets
    .filter((w) => (w.currency || user.currency) === user.currency)
    .reduce((sum, w) => sum + Number(w.balance), 0);

  // 12 tháng gần nhất cho tài sản ròng và biểu đồ cột thu/chi
  const twelveMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11)), [month]);
  const from12 = monthBounds(twelveMonths[0]!).from;
  const to12 = monthBounds(twelveMonths[11]!).to;
  const summary12 = useReportsPeriodSummary(from12, to12, visited).data;

  const flowsMap = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const m of summary12?.monthly ?? []) {
      map.set(m.month, { income: Number(m.income), expense: Number(m.expense) });
    }
    return map;
  }, [summary12]);

  const netWorthSeries = useMemo(
    () => computeNetWorthSeries(totalBalance, twelveMonths, flowsMap),
    [totalBalance, twelveMonths, flowsMap]
  );

  const monthlyFlowData = useMemo(() => {
    return twelveMonths.map((m) => {
      const item = summary12?.monthly?.find((entry) => entry.month === m);
      return {
        month: m,
        income: Number(item?.income ?? 0),
        expense: Number(item?.expense ?? 0)
      };
    });
  }, [twelveMonths, summary12]);

  const currencies = summary?.byCurrency?.length
    ? summary.byCurrency
    : summary
      ? [
          {
            currency: summary.currency || user.currency,
            income: summary.income,
            expense: summary.expense,
            net: summary.net
          }
        ]
      : [];
  const multi = currencies.length > 1;
  const categories = (summary?.expenseByCategory ?? []).slice(0, 6);
  const categoryMax = Math.max(1, ...categories.map((item) => Number(item.amount)));

  const download = (path: string, name: string) =>
    downloadFile(path, name).catch((error) => toast(errorMessage(error), true));

  return (
    <ViewSection view="reports">
      {phone && (
        <div className="dash-bar">
          <MonthSwitcher />
        </div>
      )}
      <div className="panel report-filter-bar" aria-label="Khoảng thời gian báo cáo">
        <div id="report-presets" className="chip-row" role="group" aria-label="Chọn nhanh kỳ báo cáo">
          {PRESETS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`chip${preset === value ? ' active' : ''}`}
              aria-pressed={preset === value}
              data-report-range={value}
              onClick={() => {
                const next = presetRange(value);
                setPreset(value);
                // Bấm lại đúng kỳ đang xem thì tải lại số liệu mới nhất.
                if (next.from === range.from && next.to === range.to)
                  void client.invalidateQueries({ queryKey: ['reports'] });
                else setRange(next);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="report-dates">
          <label>
            Từ ngày
            <input
              id="report-from"
              type="date"
              value={range.from}
              onChange={(event) => (setPreset(null), setRange({ ...range, from: event.target.value }))}
            />
          </label>
          <label>
            Đến ngày
            <input
              id="report-to"
              type="date"
              value={range.to}
              onChange={(event) => (setPreset(null), setRange({ ...range, to: event.target.value }))}
            />
          </label>
        </div>
        <div className="report-export">
          <button
            className="btn btn-outline btn-sm"
            id="export-summary-csv"
            type="button"
            onClick={() =>
              download(
                `/api/v1/reports/summary?${new URLSearchParams({ ...range, format: 'csv' })}`,
                'bao-cao-tong-hop.csv'
              )
            }
          >
            ↓ CSV tổng hợp
          </button>
          <button
            className="btn btn-outline btn-sm"
            id="export-reconciliation-csv"
            type="button"
            onClick={() => download('/api/v1/reports/reconciliation?format=csv', 'doi-soat-vi.csv')}
          >
            ↓ CSV đối soát
          </button>
        </div>
      </div>

      <div id="report-currencies" className="kpi-strip kpi-strip-3">
        {currencies.map((item) => {
          const suffix = multi ? ` (${item.currency})` : '';
          const net = Number(item.net);
          return [
            { tone: 'income', sign: '+', label: `Thu vào${suffix}`, value: item.income, note: 'Trong kỳ đã chọn' },
            { tone: 'expense', sign: '', label: `Chi ra${suffix}`, value: item.expense, note: 'Trong kỳ đã chọn' },
            {
              tone: net < 0 ? 'negative' : 'net',
              sign: net > 0 ? '+' : '',
              label: `Còn lại${suffix}`,
              value: item.net,
              note: net < 0 ? 'Chi nhiều hơn thu' : 'Thu trừ chi'
            }
          ].map((metric) => (
            <div key={`${item.currency}-${metric.label}`} className="kpi metric-card">
              <span>{metric.label}</span>
              <strong className={metric.tone}>
                {Number(metric.value) > 0 ? metric.sign : ''}
                {moneyCurrency(metric.value, item.currency)}
              </strong>
              <small>{metric.note}</small>
            </div>
          ));
        })}
      </div>

      {/* Biểu đồ tài sản ròng theo tháng (bản lớn ở tab Phân tích) */}
      <section className="panel report-chart-panel" aria-label="Tài sản ròng 12 tháng">
        <PanelHead title="Tài sản ròng 12 tháng qua" help="Tính từ số dư hiện tại trừ dòng tiền từng tháng" />
        <NetWorthChart
          data={netWorthSeries}
          format={(v) => moneyCurrency(v, user.currency)}
          height={phone ? 180 : 230}
          description="Đường tài sản ròng 12 tháng qua"
        />
      </section>

      {/* Cột thu và chi theo tháng (nút chuyển 6/12 tháng) */}
      <section id="report-visuals" className="panel report-visuals">
        <PanelHead title="Dòng tiền theo thời gian" />
        <div className="report-charts">
          <div id="report-monthly-chart" className="report-flow-chart-block">
            <MonthlyFlowBarChart
              data={monthlyFlowData}
              format={(v) => moneyCurrency(v, user.currency)}
              monthsCount={flowMonthsCount}
              onMonthsCountChange={setFlowMonthsCount}
              height={phone ? 190 : 250}
              description="Thu và chi theo tháng"
            />
          </div>
          {categories.length > 0 && (
            <div id="report-category-chart" className="report-bars">
              <strong>Nhóm chi tiêu lớn nhất</strong>
              {categories.map((item) => (
                <div key={item.categoryName} className="report-bar expense">
                  <span>{item.categoryName}</span>
                  <div className="report-bar-track">
                    <span style={{ width: `${(Number(item.amount) / categoryMax) * 100}%` }} />
                  </div>
                  <b>{moneyCurrency(item.amount, item.currency || user.currency)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <PanelHead title="Số dư các ví" />
        <div id="reconciliation-list" className="reconciliation-list" role="table" aria-label="Số dư các ví">
          <div className="reconciliation-row header" role="row">
            <span role="columnheader">Ví</span>
            <span role="columnheader">Tiền tệ</span>
            <span role="columnheader">Số dư đầu kỳ</span>
            <span role="columnheader">Số dư hiện tại</span>
          </div>
          {reconciliation?.wallets.map((item, index) => (
            <div key={`${item.walletName}-${index}`} className="reconciliation-row" role="row">
              <span role="cell" data-label="Ví">
                {item.walletName}
                {item.archived && ' (đã lưu trữ)'}
              </span>
              <span role="cell" data-label="Tiền tệ">
                {item.currency}
              </span>
              <span role="cell" data-label="Số dư đầu kỳ">
                {moneyCurrency(item.openingBalance, item.currency)}
              </span>
              <b
                role="cell"
                data-label="Số dư hiện tại"
                className={Number(item.calculatedBalance) < 0 ? 'negative' : undefined}
              >
                {moneyCurrency(item.calculatedBalance, item.currency)}
              </b>
            </div>
          ))}
        </div>
      </section>
    </ViewSection>
  );
}
