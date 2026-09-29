import { useEffect, useState, type ReactNode } from 'react';
import type { View } from './navigation';
import { useUi } from './ui-state';

/** Màn hình đang mở hay không, và đã từng mở chưa (để chỉ tải dữ liệu riêng của màn khi người dùng ghé tới). */
export function useViewState(view: View) {
  const { view: current } = useUi();
  const active = current === view;
  const [visited, setVisited] = useState(active);
  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);
  return { active, visited };
}

/** Khung một màn hình. Mọi màn luôn có trong DOM, chỉ màn đang mở mang class `active`. */
export function ViewSection({ view, className, children }: { view: View; className?: string; children: ReactNode }) {
  const { active } = useViewState(view);
  return (
    <section id={`view-${view}`} className={['view', active && 'active', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  help,
  actions
}: {
  eyebrow: string;
  title: string;
  help?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {help && <p className="panel-help">{help}</p>}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  );
}

export function PanelHead({
  eyebrow,
  title,
  help,
  action
}: {
  eyebrow: string;
  title: string;
  help?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {help && <p className="panel-help">{help}</p>}
      </div>
      {action}
    </div>
  );
}

/** Trạng thái trống có lời mời hành động (ví dụ "Tạo ví đầu tiên"). */
export function Empty({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty">
      <span>{text}</span>
      {action && onAction && (
        <button className="btn btn-outline btn-sm" type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function Progress({ percent, tone }: { percent: number; tone?: 'income' | 'expense' | 'warning' }) {
  return (
    <div className={`progress${tone ? ` ${tone}` : ''}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}
