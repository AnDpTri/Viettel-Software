import { z } from '../../core/http/zod';

export const notificationQuery = z.object({ unread: z.enum(['true', 'false']).optional() });
