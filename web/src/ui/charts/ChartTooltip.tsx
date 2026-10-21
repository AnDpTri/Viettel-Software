export interface TooltipData {
  x: number;
  y: number;
  text: string;
}

interface Props {
  data: TooltipData | null;
  chartWidth: number;
}

/**
 * Tooltip biểu đồ dạng SVG hoặc HTML, một dòng duy nhất: nhãn và giá trị.
 * Tự động canh lề không để tràn sang hai bên mép biểu đồ.
 */
export function ChartTooltip({ data, chartWidth }: Props) {
  if (!data || !data.text) return null;

  // Đo chiều rộng ước lượng: 7.2px mỗi ký tự + 16px đệm
  const w = Math.min(chartWidth - 16, Math.max(60, data.text.length * 7.2 + 18));
  const h = 26;

  // Canh giữa x quanh data.x, kẹp trong [8, chartWidth - w - 8]
  const idealX = data.x - w / 2;
  const clampedX = Math.max(8, Math.min(chartWidth - w - 8, idealX));

  // y: ưu tiên hiển thị bên trên điểm, nếu sát mép trên thì hiển thị bên dưới
  const y = data.y - h - 10 >= 4 ? data.y - h - 10 : data.y + 12;

  return (
    <g className="chart-tooltip-group" pointerEvents="none">
      <rect
        x={clampedX}
        y={y}
        width={w}
        height={h}
        rx={4}
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth={1}
      />
      <text
        x={clampedX + w / 2}
        y={y + 17}
        textAnchor="middle"
        fill="var(--text)"
        fontSize={12}
        fontWeight={500}
        fontFamily="var(--font-sans)"
      >
        {data.text}
      </text>
    </g>
  );
}
