import { notFound } from '../../core/errors/app-error';
import type { NotificationRepository } from './notification.repository';

const DAY_MS = 24 * 60 * 60_000;
const BUDGET_ALERT_PERCENT = 80;

/** Trung tâm thông báo: cảnh báo hóa đơn sắp/đã quá hạn và ngân sách sắp chạm hoặc vượt hạn mức, không nhắc lặp. */
export class NotificationService {
  constructor(private readonly notifications: NotificationRepository) {}

  list(userId: string, unreadOnly: boolean) {
    return this.notifications.list(userId, unreadOnly);
  }

  async markRead(userId: string, id: string) {
    if (!(await this.notifications.findOwned(userId, id))) throw notFound('Thông báo');
    return this.notifications.markRead(id);
  }

  async markAllRead(userId: string) {
    await this.notifications.markAllRead(userId);
  }

  /** Sinh thông báo mới: hóa đơn đến hạn trong 7 ngày (mỗi ngày tối đa một lần) và ngân sách từ 80% (mỗi mốc 10%
   * một lần). Trả số thông báo đã tạo. */
  async generate(userId: string, now = new Date()) {
    const [bills, budgets] = await Promise.all([
      this.notifications.billsDueBefore(userId, new Date(now.getTime() + 7 * DAY_MS)),
      this.notifications.activeBudgets(userId, now)
    ]);
    let created = 0;
    for (const bill of bills) {
      const type = `BILL_${bill.id}`;
      if (await this.notifications.exists(userId, type, new Date(now.getTime() - DAY_MS))) continue;
      await this.notifications.create({
        userId,
        type,
        title: bill.status === 'OVERDUE' ? 'Hóa đơn quá hạn' : 'Hóa đơn sắp đến hạn',
        message: `${bill.name}: ${Number(bill.amount).toLocaleString('vi-VN')}`,
        actionUrl: '/#bills'
      });
      created += 1;
    }
    for (const budget of budgets) {
      const percent = ((await this.notifications.expenseTotal(userId, budget)) / Number(budget.amount)) * 100;
      if (percent < BUDGET_ALERT_PERCENT) continue;
      const type = `BUDGET_${budget.id}_${Math.floor(percent / 10)}`;
      if (await this.notifications.exists(userId, type)) continue;
      await this.notifications.create({
        userId,
        type,
        title: percent >= 100 ? 'Ngân sách đã vượt mức' : 'Ngân sách sắp chạm giới hạn',
        message: `${budget.name} đã dùng ${Math.round(percent)}%.`,
        actionUrl: '/#budgets'
      });
      created += 1;
    }
    return { created };
  }
}
