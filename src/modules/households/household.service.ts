import { randomBytes } from 'node:crypto';
import { notFound } from '../../core/errors/app-error';
import type { HouseholdRepository } from './household.repository';

/** Nhóm gia đình: người tạo là chủ nhóm, người khác tham gia bằng mã mời ngẫu nhiên (tham gia lại không tạo trùng). */
export class HouseholdService {
  constructor(private readonly households: HouseholdRepository) {}

  list(userId: string) {
    return this.households.listForMember(userId);
  }

  create(userId: string, name: string) {
    return this.households.createWithOwner(userId, name, randomBytes(8).toString('hex'));
  }

  async join(userId: string, inviteCode: string) {
    const household = await this.households.findByInvite(inviteCode);
    if (!household) throw notFound('Mã mời');
    await this.households.addMember(household.id, userId);
    return household;
  }
}
