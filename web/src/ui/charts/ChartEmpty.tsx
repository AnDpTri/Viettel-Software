interface Props {
  width?: number;
  height?: number;
  message: string;
}

/**
 * Trạng thái rỗng của biểu đồ: vẽ đường 0 và một câu chú thích ở giữa, không ảnh.
 */
export function ChartEmpty({ width = 300, height = 180, message }: Props) {
  const y0 = Math.round(height * 0.65);
  return (
    <svg
      className="chart-empty-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={message}
    >
      <line
        className="spend-line-base"
        x1={48}
        x2={width - 16}
        y1={y0}
        y2={y0}
        stroke="var(--border-strong)"
        strokeWidth={1}
      />
      <text x={40} y={y0 + 4} textAnchor="end" fill="var(--text-muted)" fontSize={11} fontFamily="var(--font-sans)">
        0
      </text>
      <text
        x={width / 2}
        y={Math.round(height * 0.38)}
        textAnchor="middle"
        fill="var(--text-subtle)"
        fontSize={13}
        fontFamily="var(--font-sans)"
      >
        {message}
      </text>
    </svg>
  );
}
