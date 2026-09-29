import { api } from '../core/api';
import { $ } from '../core/dom';
import { escapeHtml, shortDate } from '../core/format';
import { toast } from '../core/toast';

export async function loadNotifications() {
  try {
    await api('/productivity/notifications/generate', { method: 'POST' });
    const items = await api('/productivity/notifications');
    const unread = items.filter((item) => !item.readAt).length;
    $('#notification-count').textContent = unread;
    $('#notification-count').classList.toggle('hidden', !unread);
    $('#notification-list').innerHTML =
      items
        .map(
          (item) =>
            `<article class="notification-item ${item.readAt ? '' : 'unread'}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p><small>${shortDate(item.createdAt)}</small></article>`
        )
        .join('') || '<div class="empty">Chưa có thông báo.</div>';
  } catch (error) {
    toast(error.message, true);
  }
}

/** Ngăn thông báo: mở, đóng, đánh dấu đã đọc tất cả. */
export function setupNotifications() {
  $('#notification-btn').addEventListener('click', async () => {
    await loadNotifications();
    $('#notification-drawer').classList.toggle('hidden');
  });
  $('#close-notifications').addEventListener('click', () => $('#notification-drawer').classList.add('hidden'));
  $('#read-all-notifications').addEventListener('click', async () => {
    await api('/productivity/notifications/read-all', { method: 'POST' });
    await loadNotifications();
  });
}
