import { audit } from '../../core/audit/audit';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId } from '../../core/http/request';
import { success } from '../../core/http/response';
import { assertNotProtectedDemo } from '../../shared/demo-account';
import { deleteAccountInput } from './account.schemas';
import type { AccountService } from './account.service';

export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  exportData = asyncHandler(async (req, res) => {
    const data = await this.accounts.exportData(currentUserId(req));
    await audit(req, 'DATA_EXPORT', 'User', currentUserId(req));
    res.setHeader('Content-Disposition', 'attachment; filename="so-moc-data.json"');
    return success(res, data);
  });

  deleteAccount = asyncHandler(async (req, res) => {
    // Kiểm tra quyền (tài khoản demo) trước khi đọc xác nhận, để thông báo lỗi nói đúng lý do.
    assertNotProtectedDemo(req.user?.username, 'xóa tài khoản');
    deleteAccountInput.parse(req.body);
    await audit(req, 'ACCOUNT_DELETE_REQUESTED', 'User', currentUserId(req));
    await this.accounts.deactivate(currentUserId(req), req.user?.username);
    return success(res, null, 'Tài khoản đã được vô hiệu hóa và đăng xuất.');
  });

  auditLogs = asyncHandler(async (req, res) => success(res, await this.accounts.auditLogs(currentUserId(req))));
}
