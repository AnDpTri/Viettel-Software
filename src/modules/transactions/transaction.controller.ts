import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, patchSchema, uuidParam } from '../../core/http/request';
import { pageMeta, success } from '../../core/http/response';
import { toCsv } from '../../shared/csv';
import type { ReceiptService } from './receipt.service';
import { bulkInput, filterQuery, importInput, pagingQuery, splitsInput, transactionInput } from './transaction.schemas';
import type { TransactionService } from './transaction.service';

const transactionPatch = patchSchema(transactionInput);

const CSV_HEADERS = {
  occurredAt: 'Thời gian',
  type: 'Loại',
  amount: 'Số tiền',
  wallet: 'Ví nguồn',
  destinationWallet: 'Ví đích',
  category: 'Danh mục',
  note: 'Ghi chú'
};

export class TransactionController {
  constructor(
    private readonly transactions: TransactionService,
    private readonly receipts: ReceiptService
  ) {}

  list = asyncHandler(async (req, res) => {
    const { page, limit } = pagingQuery.parse(req.query);
    const filter = filterQuery.parse(req.query);
    const { items, total } = await this.transactions.list(currentUserId(req), filter, page, limit);
    return success(res, items, 'Thành công.', 200, pageMeta(page, limit, total));
  });

  exportCsv = asyncHandler(async (req, res) => {
    const rows = await this.transactions.exportRows(currentUserId(req), filterQuery.parse(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    return res.send(toCsv(rows, CSV_HEADERS));
  });

  create = asyncHandler(async (req, res) => {
    const idempotencyKey = req.get('idempotency-key')?.slice(0, 100);
    const { transaction, replayed } = await this.transactions.create(
      currentUserId(req),
      transactionInput.parse(req.body),
      idempotencyKey
    );
    return replayed
      ? success(res, transaction, 'Yêu cầu đã được xử lý trước đó.')
      : success(res, transaction, 'Ghi giao dịch thành công.', 201);
  });

  trash = asyncHandler(async (req, res) => success(res, await this.transactions.trash(currentUserId(req))));

  bulk = asyncHandler(async (req, res) =>
    success(res, await this.transactions.bulk(currentUserId(req), bulkInput.parse(req.body)), 'Đã cập nhật hàng loạt.')
  );

  importRows = asyncHandler(async (req, res) => {
    const { rows } = importInput.parse(req.body);
    return success(
      res,
      await this.transactions.importRows(currentUserId(req), rows),
      'Nhập giao dịch thành công.',
      201
    );
  });

  get = asyncHandler(async (req, res) => success(res, await this.transactions.get(currentUserId(req), uuidParam(req))));

  update = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const transaction = await this.transactions.update(userId, id, transactionPatch.parse(req.body));
    return success(res, transaction, 'Cập nhật giao dịch thành công.');
  });

  remove = asyncHandler(async (req, res) => {
    await this.transactions.remove(currentUserId(req), uuidParam(req));
    return success(res, null, 'Đã chuyển giao dịch vào thùng rác.');
  });

  restore = asyncHandler(async (req, res) =>
    success(res, await this.transactions.restore(currentUserId(req), uuidParam(req)), 'Đã khôi phục giao dịch.')
  );

  split = asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const id = uuidParam(req);
    const splits = await this.transactions.split(userId, id, () => splitsInput.parse(req.body).splits);
    return success(res, splits, 'Đã chia giao dịch.');
  });

  uploadReceipt = asyncHandler(async (req, res) => {
    const receipt = await this.receipts.upload(currentUserId(req), uuidParam(req), req.file);
    return success(res, receipt, 'Tải hóa đơn thành công.', 201);
  });

  downloadReceipt = asyncHandler(async (req, res) => {
    const file = await this.receipts.download(
      currentUserId(req),
      uuidParam(req, 'transactionId'),
      uuidParam(req, 'receiptId')
    );
    res.type(file.mimeType);
    res.attachment(file.originalName);
    return res.send(file.content);
  });

  deleteReceipt = asyncHandler(async (req, res) => {
    await this.receipts.remove(currentUserId(req), uuidParam(req, 'transactionId'), uuidParam(req, 'receiptId'));
    return success(res, null, 'Xóa hóa đơn thành công.');
  });
}
