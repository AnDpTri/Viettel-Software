import { useUi } from '../app/ui-state';
import { isCurrentMonth, monthLabel, shiftMonth } from '../lib/month';

/** Chọn tháng: nút ‹ ›, tên tháng. Không đi qua tháng hiện tại (chưa có số liệu). Dùng chung Tổng quan và Phân tích. */
export function MonthSwitcher() {
  const { month, setMonth } = useUi();
  const atCurrent = isCurrentMonth(month);
  return (
    <div className="month-switcher" role="group" aria-label="Chọn tháng">
      <button
        type="button"
        className="icon-btn"
        aria-label="Tháng trước"
        onClick={() => setMonth(shiftMonth(month, -1))}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </svg>
      </button>
      <span className="month-switcher-label" aria-live="polite">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Tháng sau"
        disabled={atCurrent}
        onClick={() => setMonth(shiftMonth(month, 1))}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
      </button>
    </div>
  );
}
