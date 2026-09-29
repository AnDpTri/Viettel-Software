import { assertNotProtectedDemo } from '../../shared/demo-account';
import type { AccountRepository } from './account.repository';

export class AccountService {
  constructor(private readonly accounts: AccountRepository) {}

  async exportData(userId: string) {
    return { exportedAt: new Date(), ...(await this.accounts.exportData(userId)) };
  }

  /** Xóa tài khoản; tài khoản demo dùng chung không được xóa. */
  async deactivate(userId: string, username: string | undefined) {
    assertNotProtectedDemo(username, 'xóa tài khoản');
    await this.accounts.deactivate(userId);
  }

  auditLogs(userId: string) {
    return this.accounts.auditLogs(userId);
  }
}
