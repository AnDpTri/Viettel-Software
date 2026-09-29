import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Notification } from '../../api/types';
import { Empty, PanelHead } from '../../app/view';
import { shortDate } from '../../lib/format';
import { errorMessage, useToast } from '../../ui/Toast';

export interface NotificationState {
  items: Notification[];
  open: boolean;
  setOpen: (open: boolean) => void;
  load: () => Promise<void>;
  readAll: () => Promise<void>;
}

/** Thông báo trong ứng dụng. Mỗi lần mở ngăn, máy chủ sinh thông báo mới (hóa đơn sắp hạn, vượt ngân sách…). */
export function useNotifications(): NotificationState {
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      await api('/productivity/notifications/generate', { method: 'POST' });
      setItems(await api<Notification[]>('/productivity/notifications'));
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);
  const readAll = async () => {
    await api('/productivity/notifications/read-all', { method: 'POST' }).catch(() => undefined);
    await load();
  };
  return { items, open, setOpen, load, readAll };
}

export function NotificationBell({ state }: { state: NotificationState }) {
  const unread = state.items.filter((item) => !item.readAt).length;
  return (
    <button
      id="notification-btn"
      className="icon-btn notification-button"
      type="button"
      title="Thông báo"
      aria-label={unread ? `Xem thông báo, ${unread} chưa đọc` : 'Xem thông báo'}
      aria-expanded={state.open}
      onClick={async () => {
        await state.load();
        state.setOpen(!state.open);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 && (
        <span id="notification-count" className="notification-count">
          {unread}
        </span>
      )}
    </button>
  );
}

export function NotificationDrawer({ state }: { state: NotificationState }) {
  return (
    <aside
      id="notification-drawer"
      className={`notification-drawer${state.open ? '' : ' hidden'}`}
      aria-label="Thông báo"
    >
      <PanelHead
        eyebrow="CẬP NHẬT"
        title="Thông báo"
        action={
          <button
            id="close-notifications"
            className="icon-btn"
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => state.setOpen(false)}
          >
            ×
          </button>
        }
      />
      <div id="notification-list" className="notification-list">
        {state.items.length ? (
          state.items.map((item) => (
            <article key={item.id} className={`notification-item${item.readAt ? '' : ' unread'}`}>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
              <small>{shortDate(item.createdAt)}</small>
            </article>
          ))
        ) : (
          <Empty text="Chưa có thông báo." />
        )}
      </div>
      <button id="read-all-notifications" className="btn btn-outline btn-sm" type="button" onClick={state.readAll}>
        Đánh dấu đã đọc
      </button>
    </aside>
  );
}
