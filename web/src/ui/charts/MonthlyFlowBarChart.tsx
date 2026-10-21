import { useState, type MouseEvent, type TouchEvent } from 'react';
import { useIsPhone } from '../useIsPhone';
import { useElementWidth } from '../useElementWidth';
import { compactMoneyVi, niceSignedTicks } from './chart-math';
import { ChartEmpty } from './ChartEmpty';
import { ChartTooltip, type TooltipData } from './ChartTooltip';

export interface MonthlyFlowItem {
  month: string;
  income: number;
  expense: number;
}

export interface MonthlyFlowBarChartProps {
  data: MonthlyFlowItem[];
  format: (value: number) => string;
  monthsCount: 6 | 12;
  onMonthsCountChange: (count: 6 | 12) => void;
  height?: number;
  description?: string;
}

const PAD = { left: 52, right: 18, top: 20, bottom: 28 };

export function MonthlyFlowBarChart({
  data,
  format,
  monthsCount,
  onMonthsCountChange,
  height: customHeight,
  description = 'Thu và chi theo tháng'
}: MonthlyFlowBarChartProps) {
  const isPhone = useIsPhone();
  const defaultHeight = isPhone ? 190 : 250;
  const height = customHeight ?? defaultHeight;
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotLeft = PAD.left;
  const plotRight = Math.max(plotLeft + 40, width - PAD.right);
  const plotTop = PAD.top;
  const plotBottom = height - PAD.bottom;
  const plotW = Math.max(1, plotRight - plotLeft);
  const plotH = Math.max(1, plotBottom - plotTop);

  // Lấy đúng số tháng theo toggle (6 hoặc 12 tháng gần nhất)
  const sliced = data.slice(-monthsCount);
  const isEmpty = sliced.length === 0 || sliced.every((d) => d.income === 0 && d.expense === 0);

  if (isEmpty) {
    return (
      <div ref={ref} className="flow-chart-wrap">
        <div className="flow-chart-head">
          <div className="chip-row">
            <button
              type="button"
              className={`chip${monthsCount === 6 ? ' active' : ''}`}
              onClick={() => onMonthsCountChange(6)}
            >
              6 tháng
            </button>
            <button
              type="button"
              className={`chip${monthsCount === 12 ? ' active' : ''}`}
              onClick={() => onMonthsCountChange(12)}
            >
              12 tháng
            </button>
          </div>
        </div>
        <ChartEmpty width={width} height={height} message="Chưa có dữ liệu thu chi theo tháng." />
      </div>
    );
  }

  // Giá trị dương lớn nhất (thu) và âm lớn nhất (chi)
  const maxUp = Math.max(1, ...sliced.map((d) => Math.max(d.income, d.income - d.expense)));
  const maxDown = Math.max(1, ...sliced.map((d) => Math.max(d.expense, d.expense - d.income)));

  const { ticks, top, bottom } = niceSignedTicks(-maxDown, maxUp, isPhone ? 3 : 4);
  const span = Math.max(1, top - bottom);

  const y = (val: number) => plotBottom - ((val - bottom) / span) * plotH;
  const y0 = Math.round(y(0));

  const slotW = plotW / sliced.length;
  const barW = Math.max(6, Math.min(22, slotW * 0.42));
  const cx = (i: number) => plotLeft + (i + 0.5) * slotW;

  // Đường nối các chấm ròng
  const netPoints = sliced.map((d, i) => `${cx(i).toFixed(1)},${y(d.income - d.expense).toFixed(1)}`).join(' ');

  const handlePointer = (clientX: number) => {
    if (!ref.current || sliced.length === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const relX = clientX - rect.left;
    const clampedRelX = Math.max(plotLeft, Math.min(plotRight, relX));
    const index = Math.min(sliced.length - 1, Math.max(0, Math.floor((clampedRelX - plotLeft) / slotW)));
    setHoverIndex(index);

    const item = sliced[index]!;
    const net = item.income - item.expense;
    const [, month] = item.month.split('-');
    const netSign = net > 0 ? '+' : '';
    const text = isPhone
      ? `T${Number(month)}: Thu +${compactMoneyVi(item.income)} · Chi ${compactMoneyVi(item.expense)} · Ròng ${netSign}${compactMoneyVi(net)}`
      : `Tháng ${Number(month)}: Thu +${format(item.income)} · Chi ${format(item.expense)} · Ròng ${netSign}${format(net)}`;

    setTooltip({
      x: cx(index),
      y: y(net),
      text
    });
  };

  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => handlePointer(e.clientX);
  const onTouchMove = (e: TouchEvent<SVGSVGElement>) => {
    if (e.touches[0]) handlePointer(e.touches[0].clientX);
  };
  const onPointerLeave = () => {
    setTooltip(null);
    setHoverIndex(null);
  };

  return (
    <div ref={ref} className="flow-chart-wrap">
      <div className="flow-chart-head">
        <div className="chip-row">
          <button
            type="button"
            className={`chip${monthsCount === 6 ? ' active' : ''}`}
            onClick={() => onMonthsCountChange(6)}
          >
            6 tháng
          </button>
          <button
            type="button"
            className={`chip${monthsCount === 12 ? ' active' : ''}`}
            onClick={() => onMonthsCountChange(12)}
          >
            12 tháng
          </button>
        </div>
      </div>

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={description}
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
        onMouseLeave={onPointerLeave}
        onTouchEnd={onPointerLeave}
        style={{ touchAction: 'none' }}
      >
        {/* Đường lưới và mốc trục y */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'spend-line-base' : 'spend-line-grid'}
              x1={plotLeft}
              x2={plotRight}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="spend-line-tick" x={plotLeft - 8} y={y(tick) + 4} textAnchor="end">
              {compactMoneyVi(tick)}
            </text>
          </g>
        ))}

        {/* Trục 0 có dấu đậm hơn */}
        <line x1={plotLeft} x2={plotRight} y1={y0} y2={y0} stroke="var(--border-strong)" strokeWidth={1.5} />

        {/* Cột thu (lên - xanh lục) và chi (xuống - mực) của từng tháng */}
        {sliced.map((item, idx) => {
          const xCenter = cx(idx);
          const xBar = xCenter - barW / 2;

          // Cột thu (hướng lên từ y0)
          const incomeH = item.income > 0 ? Math.max(2, y0 - y(item.income)) : 0;
          const incomeY = y0 - incomeH;

          // Cột chi (hướng xuống từ y0)
          const expenseH = item.expense > 0 ? Math.max(2, y(-item.expense) - y0) : 0;
          const expenseY = y0;

          const [, m] = item.month.split('-');
          const label = `T${Number(m)}`;

          return (
            <g key={item.month}>
              {incomeH > 0 && <rect x={xBar} y={incomeY} width={barW} height={incomeH} rx={2} fill="var(--income)" />}
              {expenseH > 0 && <rect x={xBar} y={expenseY} width={barW} height={expenseH} rx={2} fill="var(--text)" />}
              {/* Nhãn tháng trục x */}
              <text className="spend-line-tick" x={xCenter} y={height - 6} textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}

        {/* Đường nối mờ giữa các điểm ròng */}
        {sliced.length > 1 && (
          <polyline
            points={netPoints}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        )}

        {/* Điểm "ròng" của tháng là chấm --accent */}
        {sliced.map((item, idx) => {
          const net = item.income - item.expense;
          return (
            <circle
              key={`net-${item.month}`}
              cx={cx(idx)}
              cy={y(net)}
              r={4}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          );
        })}

        {/* Highlight khi hover */}
        {hoverIndex !== null && sliced[hoverIndex] && (
          <g pointerEvents="none">
            <line
              x1={cx(hoverIndex)}
              x2={cx(hoverIndex)}
              y1={plotTop}
              y2={plotBottom}
              stroke="var(--text-subtle)"
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.5}
            />
          </g>
        )}

        {/* Tooltip một dòng */}
        <ChartTooltip data={tooltip} chartWidth={width} />
      </svg>
    </div>
  );
}
