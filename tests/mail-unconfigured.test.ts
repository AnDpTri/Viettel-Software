import { describe, expect, it, vi } from 'vitest';

// Production chưa cấu hình dịch vụ email: không được im lặng giả vờ đã gửi.
vi.hoisted(() => {
  process.env.NODE_ENV = 'production';
});

import { logMailFailure, mailProvider, sendVerificationEmail } from '../src/core/mail/mail.service';
import { logger } from '../src/core/observability/logger';

describe('Thiếu cấu hình gửi email ở production', () => {
  it('báo lỗi rõ ràng và ghi cảnh báo', async () => {
    expect(mailProvider()).toBe('none');
    await expect(sendVerificationEmail('ban@example.com', 'abc')).rejects.toMatchObject({
      code: 'EMAIL_DELIVERY_FAILED'
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    logMailFailure('password_reset', new Error('boom'));
    expect(warn.mock.calls[0]![0]).toMatchObject({ event: 'mail_delivery_failed', reason: 'boom' });
    warn.mockRestore();
  });
});
