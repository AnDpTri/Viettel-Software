import { useState, type MouseEvent, type TouchEvent } from 'react';
import { useIsPhone } from '../useIsPhone';
import { useElementWidth } from '../useElementWidth';
import { compactMoneyVi, niceSignedTicks, type NetWorthPoint } from './chart-math';
import { ChartEmpty } from './ChartEmpty';
import { ChartTooltip, type TooltipData } from './ChartTooltip';

export interface NetWorthChartProps {
  data: NetWorthPoint[];
  format: (value: number) => string;
  mini?: boolean;
  height?: number;
  description?: string;
}

const PAD_FULL = { left: 54, right: 18, top: 20, bottom: 26 };
const PAD_MINI = { left: 4, right: 4, top: 4, bottom: 4 };

export function NetWorthChart({
  data,
  format,
  mini = false,
  height: customHeight,
  description = 'Tài sản ròng theo tháng'
}: NetWorthChartProps) {
  const isPhone = useIsPhone();
  const defaultHeight = mini ? 44 : isPhone ? 180 : 240;
  const height = customHeight ?? defaultHeight;
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const pad = mini ? PAD_MINI : PAD_FULL;
  const plotLeft = pad.left;
  const plotRight = Math.max(plotLeft + 40, width - pad.right);
  const plotTop = pad.top;
  const plotBottom = height - pad.bottom;
  const plotW = Math.max(1, plotRight - plotLeft);
  const plotH = Math.max(1, plotBottom - plotTop);

  if (!data || data.length === 0) {
    if (mini) return <div ref={ref} className="net-worth-mini-empty" />;
    return (
      <div ref={ref} className="net-worth-chart-wrap">
        <ChartEmpty width={width} height={height} message="Chưa có dữ liệu tài sản ròng." />
      </div>
    );
  }

  const values = data.map((d) => d.netWorth);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(1, ...values);

  const { ticks, top, bottom } = niceSignedTicks(minVal, maxVal, mini ? 2 : isPhone ? 3 : 4);
  const span = Math.max(1, top - bottom);

  const x = (index: number) => plotLeft + (data.length > 1 ? (index / (data.length - 1)) * plotW : plotW / 2);
  const y = (val: number) => plotBottom - ((val - bottom) / span) * plotH;
  const yBase = Math.min(plotBottom, Math.max(plotTop, y(0)));

  // Tọa độ các điểm (đoạn thẳng 2px, không làm mượt)
  const linePoints = data.map((d, i) => `${x(i).toFixed(1)},${y(d.netWorth).toFixed(1)}`).join(' ');

  // Vùng tô diện tích dưới đường với màu --accent độ mờ ~12%
  const firstX = x(0).toFixed(1);
  const lastX = x(data.length - 1).toFixed(1);
  const areaPoints = `${firstX},${yBase.toFixed(1)} ${linePoints} ${lastX},${yBase.toFixed(1)}`;

  // Nhãn trục X
  const xLabels = isPhone
    ? [0, Math.floor(data.length / 3), Math.floor((data.length * 2) / 3), data.length - 1].filter(
        (v, i, a) => a.indexOf(v) === i
      )
    : data.map((_, i) => i);

  const handlePointer = (clientX: number) => {
    if (!ref.current || data.length === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const relX = clientX - rect.left;
    const clampedRelX = Math.max(plotLeft, Math.min(plotRight, relX));
    const ratio = (clampedRelX - plotLeft) / plotW;
    const index = Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))));
    setHoverIndex(index);

    const item = data[index]!;
    const [year, month] = item.month.split('-');
    const label = `Tháng ${Number(month)}/${year}: ${format(item.netWorth)}`;

    setTooltip({
      x: x(index),
      y: y(item.netWorth),
      text: label
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
    <div ref={ref} className={`net-worth-chart-container${mini ? ' mini' : ''}`}>
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
        {!mini && (
          <>
            {/* Lưới ngang và mốc trục y */}
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
            {xLabels.map((idx) => {
              const item = data[idx];
              if (!item) return null;
              return (
                <text key={item.month} className="spend-line-tick" x={x(idx)} y={height - 6} textAnchor="middle">
                  {item.label}
                </text>
              );
            })}
          </>
        )}

        {/* Vùng tô màu --accent độ mờ ~12% */}
        <polygon points={areaPoints} fill="var(--accent)" fillOpacity={0.12} stroke="none" />

        {/* Đường nối các điểm: 2px --accent, không làm mượt */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Điểm tháng cuối (hiện tại) */}
        {!mini && (
          <circle
            cx={x(data.length - 1)}
            cy={y(data[data.length - 1]!.netWorth)}
            r={4}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}

        {/* Điểm và đường gióng khi hover */}
        {hoverIndex !== null && data[hoverIndex] && (
          <g pointerEvents="none">
            {!mini && (
              <line
                x1={x(hoverIndex)}
                x2={x(hoverIndex)}
                y1={plotTop}
                y2={plotBottom}
                stroke="var(--text-subtle)"
                strokeWidth={1}
                strokeDasharray="2 2"
                opacity={0.6}
              />
            )}
            <circle
              cx={x(hoverIndex)}
              cy={y(data[hoverIndex]!.netWorth)}
              r={4}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
        )}

        {/* Tooltip một dòng */}
        <ChartTooltip data={tooltip} chartWidth={width} />
      </svg>
    </div>
  );
}
