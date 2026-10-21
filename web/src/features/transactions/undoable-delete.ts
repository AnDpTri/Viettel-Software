import { useSyncExternalStore } from 'react';
import { session } from '../../api/client';

/** Xóa có hoàn tác: dòng bị ẩn ngay, lệnh xóa thật chỉ gửi sau 5 giây nếu người dùng không bấm "Hoàn tác". */
export const UNDO_DELAY_MS = 5000;

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<void>;
}

const pending = new Map<string, Pending>();
let hidden: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function publish() {
  hidden = new Set(pending.keys());
  listeners.forEach((listener) => listener());
}

/** Ẩn `id` ngay và hẹn xóa thật sau 5 giây. Hẹn lại cùng `id` thì thay lịch cũ. */
export function scheduleDelete(id: string, run: () => Promise<void>, delay = UNDO_DELAY_MS) {
  const previous = pending.get(id);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(async () => {
    try {
      await run();
    } finally {
      pending.delete(id);
      publish();
    }
  }, delay);
  pending.set(id, { timer, run });
  publish();
}

/** Hủy lệnh xóa đã hẹn: dòng hiện lại. */
export function cancelDelete(id: string) {
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(id);
  publish();
}

/** Gửi ngay mọi lệnh xóa còn chờ (khi đóng hoặc tải lại trang) bằng `keepalive` để không bị hủy giữa chừng. */
export function flushPendingDeletes() {
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    void fetch(`/api/v1/transactions/${id}`, {
      method: 'DELETE',
      keepalive: true,
      credentials: 'same-origin',
      headers: session.token ? { Authorization: `Bearer ${session.token}` } : {}
    });
  }
  pending.clear();
  publish();
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushPendingDeletes);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Tập id đang chờ xóa (đã ẩn khỏi danh sách). */
export const usePendingDeletes = () =>
  useSyncExternalStore(
    subscribe,
    () => hidden,
    () => hidden
  );
