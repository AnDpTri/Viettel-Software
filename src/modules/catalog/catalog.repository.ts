import type { Prisma, PrismaClient } from '@prisma/client';

/** Dữ liệu tham chiếu của người dùng: nhãn, đơn vị giao dịch, quy tắc tự phân loại, tỷ giá. */
export class CatalogRepository {
  constructor(private readonly db: PrismaClient) {}

  // Nhãn
  listTags(userId: string) {
    return this.db.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  }
  createTag(userId: string, data: Omit<Prisma.TagUncheckedCreateInput, 'userId'>) {
    return this.db.tag.create({ data: { ...data, userId } });
  }
  findTag(userId: string, id: string) {
    return this.db.tag.findFirst({ where: { id, userId } });
  }
  updateTag(id: string, data: Prisma.TagUncheckedUpdateInput) {
    return this.db.tag.update({ where: { id }, data });
  }
  async deleteTag(userId: string, id: string) {
    return (await this.db.tag.deleteMany({ where: { id, userId } })).count;
  }

  // Đơn vị giao dịch
  listMerchants(userId: string) {
    return this.db.merchant.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  }
  createMerchant(userId: string, data: Omit<Prisma.MerchantUncheckedCreateInput, 'userId'>) {
    return this.db.merchant.create({ data: { ...data, userId } });
  }
  findMerchant(userId: string, id: string) {
    return this.db.merchant.findFirst({ where: { id, userId } });
  }
  updateMerchant(id: string, data: Prisma.MerchantUncheckedUpdateInput) {
    return this.db.merchant.update({ where: { id }, data });
  }
  async deleteMerchant(userId: string, id: string) {
    return (await this.db.merchant.deleteMany({ where: { id, userId } })).count;
  }

  // Quy tắc tự phân loại
  listRules(userId: string) {
    return this.db.automationRule.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { priority: 'desc' }
    });
  }
  createRule(userId: string, data: Omit<Prisma.AutomationRuleUncheckedCreateInput, 'userId'>) {
    return this.db.automationRule.create({ data: { ...data, userId } });
  }
  findRule(userId: string, id: string) {
    return this.db.automationRule.findFirst({ where: { id, userId } });
  }
  updateRule(id: string, data: Prisma.AutomationRuleUncheckedUpdateInput) {
    return this.db.automationRule.update({ where: { id }, data });
  }
  async deleteRule(userId: string, id: string) {
    return (await this.db.automationRule.deleteMany({ where: { id, userId } })).count;
  }

  // Tỷ giá
  listRates(userId: string) {
    return this.db.exchangeRate.findMany({ where: { userId }, orderBy: { effectiveAt: 'desc' } });
  }
  createRate(userId: string, data: Omit<Prisma.ExchangeRateUncheckedCreateInput, 'userId'>) {
    return this.db.exchangeRate.create({ data: { ...data, userId } });
  }
}
