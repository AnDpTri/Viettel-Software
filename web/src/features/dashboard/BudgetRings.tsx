import { moneyCurrency } from '../../lib/format';

export interface RingItem {
  id: string;
  name: string;
  amount: number;
  spent: number;
  currency: string;
}

const SIZE = 64;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Tỷ lệ đã dùng (%). Hạn mức bằng 0 thì có chi là vượt, không chi là 0. */
export const usedPercent = (item: Pick<RingItem, 'amount' | 'spent'>) =>
  item.amount > 0 ? (item.spent / item.amount) * 100 : item.spent > 0 ? 101 : 0;

/** Ổn là mực, từ 80% là cảnh báo, trên 100% là vượt. */
export const ringTone = (percent: number) => (percent > 100 ? 'danger' : percent >= 80 ? 'warning' : 'ok');

/** Vòng mảnh 4px, 64px cho một ngân sách: tên bên dưới, "còn X" hoặc "Vượt X" bên dưới nữa. */
export function BudgetRing({ item, onOpen }: { item: RingItem; onOpen?: () => void }) {
  const percent = usedPercent(item);
  const tone = ringTone(percent);
  const left = item.amount - item.spent;
  const filled = Math.min(100, Math.max(0, percent));
  return (
    <button type="button" className={`budget-ring ${tone}`} onClick={onOpen} title={item.name}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle className="budget-ring-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} />
        {filled > 0 && (
          <circle
            className="budget-ring-fill"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeDasharray={`${(filled / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
        <text className="budget-ring-percent" x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
          {percent > 999 ? '>999' : Math.round(percent)}%
        </text>
      </svg>
      <span className="budget-ring-name">{item.name}</span>
      <span className="budget-ring-left">
        {left < 0 ? `Vượt ${moneyCurrency(-left, item.currency)}` : `còn ${moneyCurrency(left, item.currency)}`}
      </span>
    </button>
  );
}
