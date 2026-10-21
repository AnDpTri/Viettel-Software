import { useState, type MouseEvent, type TouchEvent } from 'react';
import { useIsPhone } from '../useIsPhone';
import { useElementWidth } from '../useElementWidth';
import { compactMoneyVi, formatShortVi, niceTicks, proratedBudgetDiff } from './chart-math';
import { ChartEmpty } from './ChartEmpty';
import { ChartTooltip, type TooltipData } from './ChartTooltip';

export interface SpendLineProps {
  /** Chi tiêu lũy kế tới cuối mỗi ngày 1…n của tháng hiện tại. Phần sau hôm nay không có. */
  values: number[];
  /** Chi tiêu lũy kế của cùng kỳ tháng trước (màu xám so sánh). */
  previousValues?: number[];
  /** Số ngày của tháng (độ dài trục ngang). */
  totalDays: number;
  /** Chỉ số (0-based) của điểm "hôm nay" khi đang xem tháng hiện tại. */
  todayIndex?: number | null;
  /** Ngân sách tháng: đường tham chiếu nét đứt. */
  reference?: { value: number; label: string } | null;
  /** Định dạng số tiền đầy đủ cho nhãn và mô tả. */
  format: (value: number) => string;
  height?: number;
  description: string;
  /** Tổng ngân sách tháng để tính so sánh pro-rated hôm nay. */
  budgetTotal?: number;
}

const PAD = { left: 48, right: 18, top: 18, bottom: 26 };
const FALLBACK_TOP = 100_000;

export function SpendLineChart({
  values,
  previousValues = [],
  totalDays,
  todayIndex,
  reference,
  format,
  height: customHeight,
  description,
  budgetTotal = 0
}: SpendLineProps) {
  const isPhone = useIsPhone();
  const defaultHeight = isPhone ? 180 : 220;
  const height = customHeight ?? defaultHeight;
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const plotLeft = PAD.left;
  const plotRight = Math.max(plotLeft + 50, width - PAD.right);
  const plotTop = PAD.top;
  const plotBottom = height - PAD.bottom;
  const plotW = Math.max(1, plotRight - plotLeft);
  const plotH = Math.max(1, plotBottom - plotTop);

  const maxVal = Math.max(0, ...values, ...previousValues, reference?.value ?? 0);
  const isEmpty = values.length === 0 && (!previousValues || previousValues.length === 0);

  if (isEmpty && !reference) {
    return (
      <div ref={ref} className="spend-line">
        <ChartEmpty width={width} height={height} message="Chưa có khoản chi nào trong tháng này." />
      </div>
    );
  }

  const { ticks, top } = niceTicks(maxVal || FALLBACK_TOP, isPhone ? 3 : 4);
  const x = (day: number) => plotLeft + (totalDays > 1 ? ((day - 1) / (totalDays - 1)) * plotW : 0);
  const y = (val: number) => plotBottom - (Math.max(0, val) / top) * plotH;

  // Đường tháng này: màu --accent, nét 2px, không làm mượt, phần sau hôm nay không vẽ
  const points = values.map((val, idx) => `${x(idx + 1).toFixed(1)},${y(val).toFixed(1)}`).join(' ');

  // Đường cùng kỳ tháng trước: màu xám
  const prevPoints =
    previousValues && previousValues.length > 0
      ? previousValues
          .slice(0, totalDays)
          .map((val, idx) => `${x(idx + 1).toFixed(1)},${y(val).toFixed(1)}`)
          .join(' ')
      : null;

  // Nhãn trục x: điện thoại 3-4 nhãn (1, 10, 20, cuối tháng); máy tính mỗi 7 ngày
  const xLabels = isPhone
    ? [1, Math.round(totalDays / 3), Math.round((totalDays * 2) / 3), totalDays].filter((v, i, a) => a.indexOf(v) === i)
    : Array.from({ length: Math.ceil(totalDays / 7) }, (_, idx) => 1 + idx * 7).filter((day) => day <= totalDays);

  // Điểm hôm nay và viên nhãn
  const todayValue = todayIndex !== null && todayIndex !== undefined ? values[todayIndex] : undefined;
  const todayX = todayIndex !== null && todayIndex !== undefined ? x(todayIndex + 1) : null;
  const todayY = todayValue !== undefined ? y(todayValue) : null;

  // Tính chênh lệch so với ngân sách tính tới hôm nay
  const prorated =
    todayIndex !== null && todayIndex !== undefined && todayValue !== undefined && budgetTotal > 0
      ? proratedBudgetDiff(todayValue, budgetTotal, todayIndex + 1, totalDays)
      : null;

  // Xử lý hover / touch để hiện tooltip 1 dòng
  const handlePointer = (clientX: number) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const relX = clientX - rect.left;
    const clampedRelX = Math.max(plotLeft, Math.min(plotRight, relX));
    const dayRatio = (clampedRelX - plotLeft) / plotW;
    const day = Math.min(totalDays, Math.max(1, Math.round(dayRatio * (totalDays - 1)) + 1));
    setHoverDay(day);

    const hasToday = day <= values.length;
    const dayVal = hasToday ? values[day - 1]! : null;
    const dayPrevVal = previousValues && day <= previousValues.length ? previousValues[day - 1] : null;

    let text = `Ngày ${day}`;
    if (dayVal !== null) {
      text += `: ${format(dayVal)}`;
      if (dayPrevVal !== null && dayPrevVal !== undefined) {
        text += ` (Kỳ trước: ${compactMoneyVi(dayPrevVal)})`;
      }
    } else if (dayPrevVal !== null && dayPrevVal !== undefined) {
      text += ` · Kỳ trước: ${format(dayPrevVal)}`;
    }

    const dotY = dayVal !== null ? y(dayVal) : dayPrevVal !== null && dayPrevVal !== undefined ? y(dayPrevVal) : y(0);
    setTooltip({
      x: x(day),
      y: dotY,
      text
    });
  };

  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => handlePointer(e.clientX);
  const onTouchMove = (e: TouchEvent<SVGSVGElement>) => {
    if (e.touches[0]) handlePointer(e.touches[0].clientX);
  };
  const onPointerLeave = () => {
    setTooltip(null);
    setHoverDay(null);
  };

  return (
    <div ref={ref} className="spend-line">
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

        {/* Mốc trục x */}
        {xLabels.map((day) => (
          <text key={day} className="spend-line-tick" x={x(day)} y={height - 6} textAnchor="middle">
            {day}
          </text>
        ))}

        {/* Đường ngân sách tháng nét đứt có nhãn ở cuối */}
        {reference && reference.value > 0 && (
          <g className="spend-line-ref-group">
            <line
              className="spend-line-ref"
              x1={plotLeft}
              x2={plotRight}
              y1={y(reference.value)}
              y2={y(reference.value)}
            />
            <text
              className="spend-line-note"
              x={plotRight}
              y={Math.max(plotTop + 10, y(reference.value) - 6)}
              textAnchor="end"
            >
              {reference.label}
            </text>
          </g>
        )}

        {/* Đường cùng kỳ tháng trước: màu xám nét 2px */}
        {prevPoints && (
          <polyline
            className="spend-line-path-prev"
            points={prevPoints}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Đường tháng này: màu --accent nét 2px */}
        {values.length > 1 && (
          <polyline
            className="spend-line-path"
            points={points}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Điểm hôm nay */}
        {todayX !== null && todayY !== null && (
          <circle
            className="spend-line-dot"
            cx={todayX}
            cy={todayY}
            r={4.5}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}

        {/* Nhãn dạng viên ngay đầu đường hôm nay */}
        {todayX !== null && todayY !== null && (
          <PillBadge
            x={todayX}
            y={todayY}
            plotLeft={plotLeft}
            plotRight={plotRight}
            plotTop={plotTop}
            plotBottom={plotBottom}
            prorated={prorated}
            fallbackText={todayValue !== undefined ? `Hôm nay ${formatShortVi(todayValue)}` : undefined}
          />
        )}

        {/* Đường gióng hover */}
        {hoverDay !== null && (
          <line
            x1={x(hoverDay)}
            x2={x(hoverDay)}
            y1={plotTop}
            y2={plotBottom}
            stroke="var(--text-subtle)"
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.6}
            pointerEvents="none"
          />
        )}

        {/* Tooltip một dòng */}
        <ChartTooltip data={tooltip} chartWidth={width} />
      </svg>
    </div>
  );
}

function PillBadge({
  x,
  y,
  plotLeft,
  plotRight,
  plotTop,
  plotBottom,
  prorated,
  fallbackText
}: {
  x: number;
  y: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  prorated: { diff: number; isOver: boolean; label: string } | null;
  fallbackText?: string;
}) {
  const text = prorated ? prorated.label : fallbackText;
  if (!text) return null;

  const isOver = prorated?.isOver ?? false;
  const isIncome = prorated && !prorated.isOver;

  // Màu sắc theo biến tokens.css
  const bg = isOver ? 'var(--danger-soft)' : isIncome ? 'var(--income-soft)' : 'var(--surface)';
  const textColor = isOver ? 'var(--danger)' : isIncome ? 'var(--income)' : 'var(--text)';
  const border = isOver ? 'var(--danger)' : isIncome ? 'var(--income)' : 'var(--border-strong)';

  const pillW = Math.max(70, text.length * 6.8 + 16);
  const pillH = 22;

  // Canh vị trí viên
  let pillX = x + 8;
  if (pillX + pillW > plotRight) {
    pillX = x - pillW - 8;
    if (pillX < plotLeft) pillX = plotLeft + 4;
  }

  let pillY = y - pillH / 2;
  if (pillY < plotTop) pillY = plotTop + 4;
  if (pillY + pillH > plotBottom) pillY = plotBottom - pillH - 2;

  return (
    <g className="spend-line-pill" pointerEvents="none">
      <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={11} fill={bg} stroke={border} strokeWidth={1} />
      <text
        x={pillX + pillW / 2}
        y={pillY + 15}
        textAnchor="middle"
        fill={textColor}
        fontSize={11}
        fontWeight={600}
        fontFamily="var(--font-sans)"
      >
        {text}
      </text>
    </g>
  );
}
