import { useState, type MouseEvent, type TouchEvent } from 'react';
import { useElementWidth } from '../useElementWidth';
import type { DueItem } from '../../lib/obligations';
import { dueText } from '../../lib/obligations';
import { ChartTooltip, type TooltipData } from './ChartTooltip';

export interface DueTimelineProps {
  items: DueItem[];
  today: Date;
  monthEnd: Date;
  fromDay?: number;
  format: (value: number) => string;
}

const PAD = { left: 24, right: 24, top: 12, bottom: 18 };

export function DueTimeline({ items, today, monthEnd, fromDay: customFromDay, format }: DueTimelineProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>(320);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const startDay = customFromDay ?? today.getDate();
  const endDay = monthEnd.getDate();
  const totalDaysSpan = Math.max(1, endDay - startDay);

  const plotLeft = PAD.left;
  const plotRight = Math.max(plotLeft + 40, width - PAD.right);
  const plotW = Math.max(1, plotRight - plotLeft);
  const axisY = 16;
  const height = 44;

  const xForDay = (day: number) => {
    const clamped = Math.max(startDay, Math.min(endDay, day));
    return plotLeft + ((clamped - startDay) / totalDaysSpan) * plotW;
  };

  // Lọc các khoản có ngày rơi vào [startDay, endDay]
  const timelineItems = items.filter((item) => {
    const d = item.due.getDate();
    return d >= startDay && d <= endDay;
  });

  const handlePointer = (clientX: number) => {
    if (!ref.current || timelineItems.length === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const relX = clientX - rect.left;

    // Tìm item gần vị trí con trỏ nhất
    let closest: DueItem | null = null;
    let minDist = Infinity;
    for (const item of timelineItems) {
      const ix = xForDay(item.due.getDate());
      const dist = Math.abs(ix - relX);
      if (dist < minDist) {
        minDist = dist;
        closest = item;
      }
    }

    if (closest && minDist < 28) {
      const ix = xForDay(closest.due.getDate());
      const statusLabel = closest.isPaid ? 'Đã ghi' : dueText(closest.due, today);
      setTooltip({
        x: ix,
        y: axisY,
        text: `${closest.name}: ${format(closest.amount)} · ${statusLabel}`
      });
    } else {
      setTooltip(null);
    }
  };

  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => handlePointer(e.clientX);
  const onTouchMove = (e: TouchEvent<SVGSVGElement>) => {
    if (e.touches[0]) handlePointer(e.touches[0].clientX);
  };
  const onPointerLeave = () => setTooltip(null);

  return (
    <div ref={ref} className="due-timeline">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Trục thời gian các khoản đến hạn"
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
        onMouseLeave={onPointerLeave}
        onTouchEnd={onPointerLeave}
        style={{ touchAction: 'none' }}
      >
        {/* Đường trục ngày */}
        <line
          x1={plotLeft}
          x2={plotRight}
          y1={axisY}
          y2={axisY}
          stroke="var(--border-strong)"
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Nhãn ngày đầu (hôm nay hoặc ngày bắt đầu) */}
        <text
          x={plotLeft}
          y={height - 6}
          textAnchor="start"
          fill="var(--text-muted)"
          fontSize={11}
          fontFamily="var(--font-sans)"
        >
          {startDay === today.getDate() ? 'Hôm nay' : `Ngày ${startDay}`}
        </text>

        {/* Nhãn ngày cuối tháng */}
        <text
          x={plotRight}
          y={height - 6}
          textAnchor="end"
          fill="var(--text-muted)"
          fontSize={11}
          fontFamily="var(--font-sans)"
        >
          {`Ngày ${endDay}`}
        </text>

        {/* Nhãn giữa tháng nếu dải đủ dài (> 10 ngày) */}
        {endDay - startDay > 10 && (
          <text
            x={plotLeft + plotW / 2}
            y={height - 6}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize={11}
            fontFamily="var(--font-sans)"
          >
            {Math.round((startDay + endDay) / 2)}
          </text>
        )}

        {/* Các chấm khoản đến hạn: đặc nếu đã ghi, rỗng nếu chưa trả */}
        {timelineItems.map((item) => {
          const cx = xForDay(item.due.getDate());
          const isPaid = Boolean(item.isPaid);

          return (
            <circle
              key={item.key}
              cx={cx}
              cy={axisY}
              r={5}
              fill={isPaid ? 'var(--accent)' : 'var(--surface)'}
              stroke="var(--accent)"
              strokeWidth={2}
              className={`due-timeline-dot${isPaid ? ' paid' : ' pending'}`}
            />
          );
        })}

        {/* Tooltip một dòng */}
        <ChartTooltip data={tooltip} chartWidth={width} />
      </svg>
    </div>
  );
}
