import { notFound } from '../../core/errors/app-error';
import type { CatalogRepository } from './catalog.repository';
import type { AutomationRuleInput, ExchangeRateInput, MerchantInput, TagInput } from './catalog.schemas';

/** Quản lý dữ liệu tham chiếu thuộc người dùng; sửa hoặc xóa bản ghi của người khác trả 404. */
export class CatalogService {
  constructor(private readonly catalog: CatalogRepository) {}

  listTags(userId: string) {
    return this.catalog.listTags(userId);
  }
  createTag(userId: string, input: TagInput) {
    return this.catalog.createTag(userId, input);
  }
  async updateTag(userId: string, id: string, input: Partial<TagInput>) {
    if (!(await this.catalog.findTag(userId, id))) throw notFound('Nhãn');
    return this.catalog.updateTag(id, input);
  }
  async deleteTag(userId: string, id: string) {
    if (!(await this.catalog.deleteTag(userId, id))) throw notFound('Nhãn');
  }

  listMerchants(userId: string) {
    return this.catalog.listMerchants(userId);
  }
  createMerchant(userId: string, input: MerchantInput) {
    return this.catalog.createMerchant(userId, input);
  }
  async updateMerchant(userId: string, id: string, input: Partial<MerchantInput>) {
    if (!(await this.catalog.findMerchant(userId, id))) throw notFound('Đơn vị giao dịch');
    return this.catalog.updateMerchant(id, input);
  }
  async deleteMerchant(userId: string, id: string) {
    if (!(await this.catalog.deleteMerchant(userId, id))) throw notFound('Đơn vị giao dịch');
  }

  listRules(userId: string) {
    return this.catalog.listRules(userId);
  }
  createRule(userId: string, input: AutomationRuleInput) {
    return this.catalog.createRule(userId, input);
  }
  async updateRule(userId: string, id: string, input: Partial<AutomationRuleInput>) {
    if (!(await this.catalog.findRule(userId, id))) throw notFound('Quy tắc');
    return this.catalog.updateRule(id, input);
  }
  async deleteRule(userId: string, id: string) {
    if (!(await this.catalog.deleteRule(userId, id))) throw notFound('Quy tắc');
  }

  listRates(userId: string) {
    return this.catalog.listRates(userId);
  }
  createRate(userId: string, input: ExchangeRateInput) {
    return this.catalog.createRate(userId, input);
  }
}
