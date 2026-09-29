import type { Prisma } from '@prisma/client';
import { isAiConfigured, type AppConfig } from '../../core/config/env';
import { AppError } from '../../core/errors/app-error';
import { isVipAccount } from '../../shared/account-tier';
import { jsonObject } from '../../shared/json';
import type { AssistantRepository } from './assistant.repository';

const DISCLOSURE = [
  'Nội dung chat và ghi chú, kể cả dữ liệu nhạy cảm bạn chủ động cung cấp',
  'Dữ liệu tài chính cần thiết khi agent dùng công cụ',
  'Tên ví, danh mục, ngân sách, mục tiêu và hóa đơn liên quan'
];

/** Quyền dùng AI bên ngoài: máy chủ đã cấu hình khóa, người dùng đã đồng ý, và còn lượt trong ngày (VIP không giới
 * hạn). Lượt được đếm theo nhật ký kiểm toán AI_AGENT_REQUEST/AI_AGENT_FAILURE từ 0h UTC. */
export class AiAccessService {
  constructor(
    private readonly assistant: AssistantRepository,
    private readonly config: AppConfig
  ) {}

  async quota(userId: string) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [account, used] = await Promise.all([
      this.assistant.accountTier(userId),
      this.assistant.countAiRequests(userId, start)
    ]);
    const isVip = isVipAccount(account);
    return {
      accountTier: isVip ? ('VIP' as const) : ('FREE' as const),
      isVip,
      unlimited: isVip,
      dailyLimit: isVip ? null : this.config.AI_DAILY_LIMIT,
      usedToday: used,
      remainingToday: isVip ? null : Math.max(0, this.config.AI_DAILY_LIMIT - used)
    };
  }

  async settings(userId: string) {
    const { preferences } = await this.assistant.preferences(userId);
    const quota = await this.quota(userId);
    return {
      provider: this.config.AI_PROVIDER,
      externalAiEnabled: isAiConfigured(this.config),
      consent: jsonObject(preferences).aiConsent === true,
      ...quota,
      disclosure: DISCLOSURE
    };
  }

  async setConsent(userId: string, consent: boolean) {
    const { preferences } = await this.assistant.preferences(userId);
    const next = {
      ...jsonObject(preferences),
      aiConsent: consent,
      aiConsentAt: consent ? new Date().toISOString() : null
    };
    await this.assistant.savePreferences(userId, next as Prisma.InputJsonValue);
  }

  hasConsent(preferences: Prisma.JsonValue) {
    return jsonObject(preferences).aiConsent === true;
  }

  assertConfigured() {
    if (!isAiConfigured(this.config))
      throw new AppError(
        503,
        'AI_PROVIDER_NOT_CONFIGURED',
        'Trợ lý AI chưa được cấu hình trên máy chủ này (thiếu khóa nhà cung cấp AI). Các chức năng khác vẫn dùng bình thường.'
      );
  }

  async enforceDailyQuota(userId: string) {
    const quota = await this.quota(userId);
    if (!quota.isVip && quota.usedToday >= this.config.AI_DAILY_LIMIT)
      throw new AppError(
        429,
        'AI_DAILY_LIMIT_REACHED',
        `Bạn đã dùng hết ${this.config.AI_DAILY_LIMIT} lượt AI hôm nay.`
      );
    return quota;
  }

  /** Đọc ảnh hóa đơn cần DeepSeek (mô hình thị giác) và sự đồng ý của người dùng. */
  async assertReceiptImageAllowed(userId: string) {
    const { preferences } = await this.assistant.preferences(userId);
    if (this.config.AI_PROVIDER !== 'deepseek' || !this.hasConsent(preferences))
      throw new AppError(428, 'AI_CONSENT_REQUIRED', 'Hãy đồng ý sử dụng AI bên ngoài trước khi đọc ảnh hóa đơn.');
    await this.enforceDailyQuota(userId);
  }
}
