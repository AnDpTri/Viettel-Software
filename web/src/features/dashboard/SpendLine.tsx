import { compactMoney, niceTicks } from '../../lib/spend-series';
import { useElementWidth } from '../../ui/useElementWidth';

interface Props {
  /** Chi tiêu lũy kế tới cuối mỗi ngày 1…n; không có phần tử nào thì chỉ vẽ khung. */
  values: number[];
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
}

const PAD = { left: 48, right: 14, top: 14, bottom: 26 };
const FALLBACK_TOP = 100_000;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Ước lượng bề rộng chữ 12px (đủ để tránh va chạm nhãn; không dùng đo thật để khỏi nhảy bố cục). */
const textWidth = (text: string) => text.length * 6.6 + 4;

/**
 * Đường chi tiêu lũy kế trong tháng: SVG tự vẽ, đoạn thẳng 2px màu nhấn, 4-5 mốc tròn, không chú giải (một đường).
 * Phần sau hôm nay không vẽ; ngân sách tháng là đường nét đứt có nhãn; nhãn tự tránh nhau.
 */
export function SpendLine({ values, totalDays, todayIndex, reference, format, height = 220, description }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const todayValue = todayIndex !== null && todayIndex !== undefined ? values[todayIndex] : undefined;
  const plotLeft = PAD.left;
  const plotRight = width - PAD.right;
  const plotTop = PAD.top;
  const plotBottom = height - PAD.bottom;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  const max = Math.max(0, ...values, reference?.value ?? 0);
  const { ticks, top } = niceTicks(max || FALLBACK_TOP);
  const x = (day: number) => plotLeft + (totalDays > 1 ? ((day - 1) / (totalDays - 1)) * plotW : 0);
  const y = (value: number) => plotBottom - (value / top) * plotH;

  const points = values.map((value, index) => `${x(index + 1).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const xLabels = Array.from({ length: Math.ceil(totalDays / 7) }, (_, index) => 1 + index * 7).filter(
    (day) => day <= totalDays
  );

  // Nhãn: nhãn ngân sách ở đầu phải đường nét đứt (trên, nếu không đủ chỗ thì dưới), nhãn hôm nay thử bốn vị trí.
  const taken: Box[] = [];
  let referenceLabel: { x: number; y: number; text: string } | null = null;
  if (reference) {
    const text = reference.label;
    const w = textWidth(text);
    const lineY = y(reference.value);
    const above = lineY - 18 >= 0;
    const box: Box = { x: plotRight - w, y: above ? lineY - 18 : lineY + 4, w, h: 14 };
    taken.push(box);
    referenceLabel = { x: plotRight, y: box.y + 11, text };
  }
  let todayLabel: { x: number; y: number; anchor: 'start' | 'end'; text: string } | null = null;
  if (todayIndex !== null && todayIndex !== undefined && todayValue !== undefined) {
    const value = todayValue;
    const px = x(todayIndex + 1);
    const py = y(value);
    const text = `Hôm nay ${format(value)}`;
    const w = textWidth(text);
    const candidates: Array<{ anchor: 'start' | 'end'; dy: number }> = [
      { anchor: 'start', dy: -10 },
      { anchor: 'end', dy: -10 },
      { anchor: 'start', dy: 20 },
      { anchor: 'end', dy: 20 }
    ];
    for (const candidate of candidates) {
      const left = candidate.anchor === 'start' ? px + 8 : px - 8 - w;
      const box: Box = { x: left, y: py + candidate.dy - 11, w, h: 14 };
      const inside =
        box.x >= plotLeft && box.x + box.w <= plotRight + PAD.right && box.y >= 0 && box.y + box.h <= height;
      if (inside && !taken.some((other) => overlaps(box, other))) {
        todayLabel = {
          x: candidate.anchor === 'start' ? px + 8 : px - 8,
          y: py + candidate.dy,
          anchor: candidate.anchor,
          text
        };
        break;
      }
    }
    todayLabel ??= { x: px - 8, y: py - 10, anchor: 'end', text };
  }

  return (
    <div ref={ref} className="spend-line">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={description}>
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
              {compactMoney(tick)}
            </text>
          </g>
        ))}
        {xLabels.map((day) => (
          <text key={day} className="spend-line-tick" x={x(day)} y={height - 6} textAnchor="middle">
            {day}
          </text>
        ))}
        {reference && (
          <line
            className="spend-line-ref"
            x1={plotLeft}
            x2={plotRight}
            y1={y(reference.value)}
            y2={y(reference.value)}
          />
        )}
        {referenceLabel && (
          <text className="spend-line-note" x={referenceLabel.x} y={referenceLabel.y} textAnchor="end">
            {referenceLabel.text}
          </text>
        )}
        {values.length > 1 && <polyline className="spend-line-path" points={points} />}
        {todayIndex !== null && todayIndex !== undefined && todayValue !== undefined && (
          <circle className="spend-line-dot" cx={x(todayIndex + 1)} cy={y(todayValue)} r={4} />
        )}
        {todayLabel && (
          <text className="spend-line-today" x={todayLabel.x} y={todayLabel.y} textAnchor={todayLabel.anchor}>
            {todayLabel.text}
          </text>
        )}
      </svg>
    </div>
  );
}
