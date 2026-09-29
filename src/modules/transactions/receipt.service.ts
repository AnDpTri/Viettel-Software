import { randomUUID } from 'node:crypto';
import { AppError, notFound } from '../../core/errors/app-error';
import { detectFileType } from '../../shared/file-signature';
import type { ReceiptRepository } from './receipt.repository';
import type { TransactionRepository } from './transaction.repository';

export const MAX_RECEIPTS_PER_TRANSACTION = 10;

export type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

/** Hóa đơn đính kèm: kiểm tra chữ ký tệp thật, giới hạn số lượng, chỉ chủ giao dịch được tải về hay xóa. */
export class ReceiptService {
  constructor(
    private readonly receipts: ReceiptRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async upload(userId: string, transactionId: string, file: UploadedFile | undefined) {
    if (!(await this.transactions.findOwned(userId, transactionId))) throw notFound('Giao dịch');
    if (!file) throw new AppError(422, 'FILE_REQUIRED', 'Vui lòng chọn tệp JPG, PNG hoặc PDF.');
    if (!detectFileType(file.buffer)) {
      throw new AppError(422, 'INVALID_FILE_SIGNATURE', 'Nội dung tệp không khớp định dạng JPG, PNG hoặc PDF.');
    }
    if ((await this.receipts.count(transactionId)) >= MAX_RECEIPTS_PER_TRANSACTION) {
      throw new AppError(422, 'RECEIPT_LIMIT_REACHED', 'Mỗi giao dịch được đính kèm tối đa 10 hóa đơn.');
    }
    return this.receipts.create({
      transactionId,
      originalName: file.originalname,
      storedName: randomUUID(),
      mimeType: file.mimetype,
      size: file.size,
      content: file.buffer
    });
  }

  async download(userId: string, transactionId: string, receiptId: string) {
    const receipt = await this.receipts.findOwned(userId, transactionId, receiptId);
    if (!receipt) throw notFound('Hóa đơn');
    if (!receipt.content) {
      throw new AppError(410, 'RECEIPT_CONTENT_UNAVAILABLE', 'Nội dung hóa đơn cũ không còn trên hệ thống.');
    }
    return { mimeType: receipt.mimeType, originalName: receipt.originalName, content: Buffer.from(receipt.content) };
  }

  async remove(userId: string, transactionId: string, receiptId: string) {
    if (!(await this.receipts.findOwned(userId, transactionId, receiptId))) throw notFound('Hóa đơn');
    await this.receipts.delete(receiptId);
  }
}
