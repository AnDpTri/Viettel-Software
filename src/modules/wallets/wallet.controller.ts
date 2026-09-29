import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, patchSchema, uuidParam } from '../../core/http/request';
import { success } from '../../core/http/response';
import { walletInput, walletListQuery } from './wallet.schemas';
import type { WalletService } from './wallet.service';

const walletPatch = patchSchema(walletInput);

/** Chuyển request HTTP thành lời gọi service; không chứa nghiệp vụ. */
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  list = asyncHandler(async (req, res) => {
    const { includeArchived } = walletListQuery.parse(req.query);
    return success(res, await this.wallets.list(currentUserId(req), includeArchived === 'true'));
  });

  create = asyncHandler(async (req, res) => {
    const wallet = await this.wallets.create(currentUserId(req), walletInput.parse(req.body));
    return success(res, wallet, 'Tạo ví thành công.', 201);
  });

  get = asyncHandler(async (req, res) => success(res, await this.wallets.get(currentUserId(req), uuidParam(req))));

  update = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const wallet = await this.wallets.update(userId, id, walletPatch.parse(req.body));
    return success(res, wallet, 'Cập nhật ví thành công.');
  });

  archive = asyncHandler(async (req, res) => {
    await this.wallets.archive(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã lưu trữ ví.');
  });

  restore = asyncHandler(async (req, res) => {
    const wallet = await this.wallets.restore(currentUserId(req), uuidParam(req));
    return success(res, wallet, 'Khôi phục ví thành công.');
  });
}
