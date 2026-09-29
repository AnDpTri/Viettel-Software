import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, downloadFile } from '../../api/client';
import type { Reconciliation, ReportSummary } from '../../api/types';
import { useUser } from '../../app/auth';
import { PanelHead, SectionTitle, useViewState, ViewSection } from '../../app/view';
import { localDateValue, moneyCurrency } from '../../lib/format';
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
  const [preset, setPreset] = useState<Preset | null>('month');
  const [range, setRange] = useState(() => presetRange('month'));
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
  const monthly = summary?.monthly ?? [];
  const categories = (summary?.expenseByCategory ?? []).slice(0, 6);
  const monthlyMax = Math.max(1, ...monthly.flatMap((item) => [Number(item.income), Number(item.expense)]));
  const categoryMax = Math.max(1, ...categories.map((item) => Number(item.amount)));

  const download = (path: string, name: string) =>
    downloadFile(path, name).catch((error) => toast(errorMessage(error), true));

  return (
    <ViewSection view="reports">
      <SectionTitle eyebrow="PHÂN TÍCH" title="Báo cáo và đối soát" />
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

      <div id="report-currencies" className="metric-grid">
        {currencies.map((item) => {
          const suffix = multi ? ` (${item.currency})` : '';
          return [
            { tone: 'income', icon: '↙', label: `Thu vào${suffix}`, value: item.income, note: 'Trong kỳ đã chọn' },
            { tone: 'expense', icon: '↗', label: `Chi ra${suffix}`, value: item.expense, note: 'Trong kỳ đã chọn' },
            {
              tone: 'net',
              icon: '≈',
              label: `Còn lại${suffix}`,
              value: item.net,
              note: Number(item.net) < 0 ? 'Chi nhiều hơn thu' : 'Thu trừ chi'
            }
          ].map((metric) => (
            <article key={`${item.currency}-${metric.tone}`} className={`metric-card ${metric.tone}`}>
              <div className="metric-icon" aria-hidden="true">
                {metric.icon}
              </div>
              <div>
                <span>{metric.label}</span>
                <strong>{moneyCurrency(metric.value, item.currency)}</strong>
                <small>{metric.note}</small>
              </div>
            </article>
          ));
        })}
      </div>

      {(monthly.length > 0 || categories.length > 0) && (
        <section id="report-visuals" className="panel report-visuals">
          <PanelHead eyebrow="XU HƯỚNG" title="Dòng tiền theo thời gian" />
          <div className="report-charts">
            <div id="report-monthly-chart" className="report-bars">
              <strong>Thu và chi theo tháng</strong>
              {monthly.flatMap((item) =>
                (['income', 'expense'] as const).map((kind) => {
                  const value = Number(item[kind]);
                  return (
                    <div key={`${item.month}-${kind}`} className={`report-bar ${kind}`}>
                      <span>
                        {item.month} · {kind === 'income' ? 'Thu' : 'Chi'}
                      </span>
                      <div className="report-bar-track">
                        <span style={{ width: `${(value / monthlyMax) * 100}%` }} />
                      </div>
                      <b>{moneyCurrency(value, user.currency)}</b>
                    </div>
                  );
                })
              )}
            </div>
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
          </div>
        </section>
      )}

      <section className="panel">
        <PanelHead eyebrow="ĐỐI SOÁT" title="Số dư các ví" />
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
