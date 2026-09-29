import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, uuidParam } from '../../core/http/request';
import { success } from '../../core/http/response';
import { notificationQuery } from './notification.schemas';
import type { NotificationService } from './notification.service';

export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  list = asyncHandler(async (req, res) => {
    const { unread } = notificationQuery.parse(req.query);
    return success(res, await this.notifications.list(currentUserId(req), unread === 'true'));
  });

  generate = asyncHandler(async (req, res) =>
    success(res, await this.notifications.generate(currentUserId(req)), 'Đã cập nhật thông báo.')
  );

  markAllRead = asyncHandler(async (req, res) => {
    await this.notifications.markAllRead(currentUserId(req));
    return success(res, null, 'Đã đọc tất cả thông báo.');
  });

  markRead = asyncHandler(async (req, res) =>
    success(res, await this.notifications.markRead(currentUserId(req), uuidParam(req)))
  );
}
