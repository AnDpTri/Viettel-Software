import { AppError, notFound } from '../../core/errors/app-error';
import type { SchedulingRepository } from './scheduling.repository';
import type {
  BillInput,
  BillPatch,
  BillPayInput,
  RecurringInput,
  TemplateInput,
  TemplateUseInput
} from './scheduling.schemas';

/** Nghiệp vụ lịch thu chi: khoản định kỳ tự ghi khi đến hạn, hóa đơn nhắc việc, mẫu giao dịch dùng lại. */
export class SchedulingService {
  constructor(private readonly scheduling: SchedulingRepository) {}

  listRecurring(userId: string) {
    return this.scheduling.listRecurring(userId);
  }

  async createRecurring(userId: string, input: RecurringInput) {
    if (!(await this.scheduling.walletExists(userId, input.walletId))) throw notFound('Ví');
    return this.scheduling.createRecurring(userId, input);
  }

  async updateRecurring(userId: string, id: string, input: Partial<RecurringInput>) {
    if (!(await this.scheduling.findRecurring(userId, id))) throw notFound('Lịch định kỳ');
    return this.scheduling.updateRecurring(id, input);
  }

  async deleteRecurring(userId: string, id: string) {
    if (!(await this.scheduling.deleteRecurring(userId, id))) throw notFound('Lịch định kỳ');
  }

  /** Ghi các khoản định kỳ bật "tự động ghi" đã đến hạn. Chuyển khoản định kỳ chưa hỗ trợ tự ghi nên bỏ qua. */
  async runDue(userId: string, now = new Date()) {
    const transactions = [];
    for (const rule of await this.scheduling.dueAutoPostRules(userId, now)) {
      if (rule.type === 'TRANSFER') continue;
      transactions.push(await this.scheduling.postRecurring(rule));
    }
    return { processed: transactions.length, transactions };
  }

  /** Danh sách hóa đơn; hóa đơn quá hạn chưa trả được chuyển sang OVERDUE trước khi trả về. */
  async listBills(userId: string, now = new Date()) {
    await this.scheduling.markOverdueBills(userId, now);
    return this.scheduling.listBills(userId);
  }

  createBill(userId: string, input: BillInput) {
    return this.scheduling.createBill(userId, input);
  }

  async updateBill(userId: string, id: string, input: BillPatch) {
    if (!(await this.scheduling.findBill(userId, id))) throw notFound('Hóa đơn');
    return this.scheduling.updateBill(id, input);
  }

  async payBill(userId: string, id: string, input: BillPayInput) {
    const bill = await this.scheduling.findBill(userId, id);
    if (!bill) throw notFound('Hóa đơn');
    const walletId = input.walletId ?? bill.walletId;
    if (!walletId) throw new AppError(422, 'WALLET_REQUIRED', 'Cần chọn ví để thanh toán.');
    return this.scheduling.payBill(bill, { userId, walletId, categoryId: input.categoryId ?? null });
  }

  async deleteBill(userId: string, id: string) {
    if (!(await this.scheduling.deleteBill(userId, id))) throw notFound('Hóa đơn');
  }

  listTemplates(userId: string) {
    return this.scheduling.listTemplates(userId);
  }

  createTemplate(userId: string, input: TemplateInput) {
    return this.scheduling.createTemplate(userId, input);
  }

  /** Ghi giao dịch từ mẫu; số tiền và ghi chú truyền vào ghi đè giá trị của mẫu. */
  async useTemplate(userId: string, id: string, readOverride: () => TemplateUseInput) {
    const template = await this.scheduling.findTemplate(userId, id);
    if (!template) throw notFound('Mẫu giao dịch');
    if (template.type === 'TRANSFER') {
      throw new AppError(422, 'TRANSFER_TEMPLATE_UNSUPPORTED', 'Vui lòng chọn ví đích khi dùng mẫu chuyển khoản.');
    }
    const override = readOverride();
    const amount = override.amount ?? template.amount;
    if (!amount) throw new AppError(422, 'AMOUNT_REQUIRED', 'Cần nhập số tiền.');
    return this.scheduling.createTransaction({
      userId,
      walletId: template.walletId,
      categoryId: template.categoryId,
      type: template.type,
      amount,
      occurredAt: override.occurredAt,
      note: override.note ?? template.note
    });
  }

  async deleteTemplate(userId: string, id: string) {
    if (!(await this.scheduling.deleteTemplate(userId, id))) throw notFound('Mẫu giao dịch');
  }
}
