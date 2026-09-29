import type { Prisma, TransactionType } from '@prisma/client';
import { AppError, notFound } from '../../core/errors/app-error';
import { resolveAutomation } from './automation-rules';
import type { TransactionRepository } from './transaction.repository';
import type { BulkInput, SplitInput, TransactionFilter, TransactionInput } from './transaction.schemas';

type References = {
  walletId: string;
  destinationWalletId?: string | null;
  categoryId?: string | null;
  type: TransactionType;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** Ngày dạng YYYY-MM-DD lọc trọn ngày; giá trị có giờ được dùng nguyên. */
function dateBoundary(value: string, endOfDay: boolean) {
  if (!DATE_ONLY.test(value)) return new Date(value);
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
}

/** Điều kiện truy vấn cho bộ lọc giao dịch (dùng chung cho danh sách và xuất CSV). */
export function buildTransactionFilter(userId: string, filter: TransactionFilter): Prisma.TransactionWhereInput {
  const from = filter.from ? dateBoundary(filter.from, false) : undefined;
  const to = filter.to ? dateBoundary(filter.to, true) : undefined;
  if (from && to && from > to) {
    throw new AppError(422, 'INVALID_DATE_RANGE', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  }
  return {
    userId,
    deletedAt: null,
    ...(filter.walletId ? { OR: [{ walletId: filter.walletId }, { destinationWalletId: filter.walletId }] } : {}),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(filter.keyword
      ? {
          AND: [
            {
              OR: [
                { note: { contains: filter.keyword, mode: 'insensitive' } },
                { payee: { contains: filter.keyword, mode: 'insensitive' } },
                { reference: { contains: filter.keyword, mode: 'insensitive' } }
              ]
            }
          ]
        }
      : {})
  };
}

/** Nghiệp vụ giao dịch: kiểm tra ví/danh mục thuộc người dùng, chuyển khoản hợp lệ, quy tắc tự phân loại,
 * chống ghi trùng bằng Idempotency-Key, xóa mềm vào thùng rác. */
export class TransactionService {
  constructor(private readonly transactions: TransactionRepository) {}

  async list(userId: string, filter: TransactionFilter, page: number, limit: number) {
    return this.transactions.page(buildTransactionFilter(userId, filter), page, limit);
  }

  async exportRows(userId: string, filter: TransactionFilter) {
    const rows = await this.transactions.forExport(buildTransactionFilter(userId, filter));
    return rows.map((item) => ({
      occurredAt: item.occurredAt.toISOString(),
      type: item.type,
      amount: item.amount.toString(),
      wallet: item.wallet.name,
      destinationWallet: item.destinationWallet?.name ?? '',
      category: item.category?.name ?? '',
      note: item.note ?? ''
    }));
  }

  trash(userId: string) {
    return this.transactions.trash(userId);
  }

  async get(userId: string, id: string) {
    const transaction = await this.transactions.findOwnedDetail(userId, id);
    if (!transaction) throw notFound('Giao dịch');
    return transaction;
  }

  /** Ghi giao dịch. Trả `replayed: true` khi Idempotency-Key đã được xử lý trước đó (không ghi thêm). */
  async create(userId: string, input: TransactionInput, idempotencyKey?: string) {
    const prepared = await this.applyAutomation(userId, input);
    await this.assertReferences(userId, prepared);
    if (idempotencyKey) {
      const existing = await this.transactions.findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return { transaction: existing, replayed: true };
    }
    const { tagIds, ...data } = prepared;
    return {
      transaction: await this.transactions.create(userId, { ...data, idempotencyKey }, tagIds),
      replayed: false
    };
  }

  async importRows(userId: string, rows: TransactionInput[]) {
    for (const row of rows) await this.assertReferences(userId, row);
    return { imported: await this.transactions.createMany(userId, rows) };
  }

  async update(userId: string, id: string, input: Partial<TransactionInput>) {
    const existing = await this.transactions.findOwned(userId, id);
    if (!existing) throw notFound('Giao dịch');
    await this.assertReferences(userId, { ...existing, ...input });
    const { tagIds, ...data } = input;
    return this.transactions.update(id, data, tagIds);
  }

  async remove(userId: string, id: string) {
    if (!(await this.transactions.findOwned(userId, id))) throw notFound('Giao dịch');
    await this.transactions.setDeleted(id, new Date());
  }

  async restore(userId: string, id: string) {
    if (!(await this.transactions.findOwned(userId, id))) throw notFound('Giao dịch');
    return this.transactions.setDeleted(id, null);
  }

  async bulk(userId: string, input: BulkInput) {
    const change =
      input.action === 'DELETE'
        ? { deletedAt: new Date() }
        : input.action === 'RESTORE'
          ? { deletedAt: null }
          : { status: 'RECONCILED' as const };
    const data = { ...change, ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}) };
    return { updated: await this.transactions.updateMany(userId, input.ids, data) };
  }

  /** Chia giao dịch. `readSplits` chỉ được gọi sau khi xác nhận quyền sở hữu, để người khác gửi dữ liệu sai vẫn
   * nhận 404 thay vì lỗi validation (không lộ giao dịch có tồn tại hay không). */
  async split(userId: string, id: string, readSplits: () => SplitInput) {
    const transaction = await this.transactions.findOwnedActive(userId, id);
    if (!transaction) throw notFound('Giao dịch');
    const splits = readSplits();
    const total = splits.reduce((sum, item) => sum + Number(item.amount), 0);
    if (Math.abs(total - Number(transaction.amount)) > 0.0001) {
      throw new AppError(422, 'SPLIT_TOTAL_MISMATCH', 'Tổng các phần phải bằng số tiền giao dịch.');
    }
    return this.transactions.replaceSplits(id, splits);
  }

  /** Ví nguồn/đích phải thuộc người dùng và đang hoạt động; chuyển khoản cần hai ví khác nhau, cùng tiền tệ,
   * không có danh mục; danh mục thu/chi phải cùng loại với giao dịch. */
  private async assertReferences(userId: string, input: References) {
    const wallet = await this.transactions.findActiveWallet(userId, input.walletId);
    if (!wallet) throw notFound('Ví nguồn');
    if (input.type === 'TRANSFER') {
      if (!input.destinationWalletId || input.destinationWalletId === input.walletId) {
        throw new AppError(422, 'INVALID_TRANSFER', 'Chuyển khoản cần ví đích khác ví nguồn.');
      }
      const destination = await this.transactions.findActiveWallet(userId, input.destinationWalletId);
      if (!destination) throw notFound('Ví đích');
      if (destination.currency !== wallet.currency) {
        throw new AppError(422, 'CURRENCY_MISMATCH', 'Hai ví chuyển khoản phải cùng đơn vị tiền tệ.');
      }
    } else if (input.destinationWalletId) {
      throw new AppError(422, 'INVALID_DESTINATION', 'Ví đích chỉ áp dụng cho giao dịch chuyển khoản.');
    }
    if (input.categoryId) {
      const category = await this.transactions.findCategory(userId, input.categoryId);
      if (!category) throw notFound('Danh mục');
      if (input.type === 'TRANSFER' || category.type !== input.type) {
        throw new AppError(422, 'CATEGORY_TYPE_MISMATCH', 'Danh mục không phù hợp loại giao dịch.');
      }
    }
  }

  /** Áp quy tắc tự phân loại cho khoản thu/chi: gán danh mục nếu còn trống và gắn các nhãn khớp. */
  private async applyAutomation(userId: string, input: TransactionInput): Promise<TransactionInput> {
    if (input.type === 'TRANSFER') return input;
    const rules = await this.transactions.activeAutomationRules(userId);
    const { categoryId, tagNames } = resolveAutomation(rules, input, input.categoryId);
    const tagIds = new Set(input.tagIds ?? []);
    for (const name of tagNames) tagIds.add(await this.transactions.ensureTag(userId, name));
    return { ...input, categoryId, tagIds: [...tagIds] };
  }
}
