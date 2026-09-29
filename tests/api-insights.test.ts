import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareAgentActions } from '../src/services/agent.service';
import { parseVietnameseTransaction } from '../src/routes/insight.routes';
import { prisma, registerUser, seedBasics, type TestUser } from './helpers/api';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let user: TestUser;
let other: TestUser;
let basics: Awaited<ReturnType<typeof seedBasics>>;

beforeAll(async () => {
  user = await registerUser();
  other = await registerUser();
  basics = await seedBasics(user);
});

describe('Trợ lý khi máy chủ chưa cấu hình AI', () => {
  it('cài đặt quyền riêng tư và quota', async () => {
    const settings = (await user.api.get('/insights/settings')).body.data;
    expect(settings).toMatchObject({ externalAiEnabled: false, consent: false, accountTier: 'FREE', remainingToday: 30 });
    expect((await user.api.put('/insights/settings').send({ consent: true })).body.data.consent).toBe(true);
    expect((await user.api.put('/insights/settings').send({ consent: false })).body.data.consent).toBe(false);
    await prisma.user.update({ where: { id: other.id }, data: { accountTier: 'VIP' } });
    expect((await other.api.get('/insights/settings')).body.data).toMatchObject({ isVip: true, dailyLimit: null });
  });

  it('Agent và đọc ảnh hóa đơn báo rõ là chưa cấu hình', async () => {
    expect((await user.api.post('/insights/assistant').send({ question: 'Chào' })).body.error.code).toBe('AI_PROVIDER_NOT_CONFIGURED');
    expect((await user.api.post('/insights/extract-receipt-image').attach('receipt', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(503);
  });

  it('tổng quan: cảnh báo chi tăng, khoản bất thường, gợi ý lập ngân sách', async () => {
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 10));
    await user.api.post('/transactions').send({ walletId: basics.cash.id, categoryId: basics.food.id, type: 'EXPENSE', amount: 100_000, occurredAt: lastMonth.toISOString() });
    await user.api.post('/transactions').send({ walletId: basics.cash.id, type: 'EXPENSE', amount: 2_000_000, occurredAt: now.toISOString() });
    await user.api.post('/transactions').send({ walletId: basics.bank.id, categoryId: basics.salary.id, type: 'INCOME', amount: 5_000_000, occurredAt: now.toISOString() });
    await user.api.post('/productivity/bills').send({ name: 'Điện', amount: 300_000, dueAt: new Date(now.getTime() + 86_400_000).toISOString() });
    await user.api.post('/productivity/recurring').send({ walletId: basics.bank.id, name: 'Nhà', type: 'EXPENSE', amount: 3_000_000, frequency: 'MONTHLY', nextRunAt: '2026-12-01' });
    const overview = (await user.api.get('/insights/overview')).body.data;
    expect(overview.recommendations.map((item: { title: string }) => item.title)).toEqual(expect.arrayContaining(['Chi tiêu đang tăng', 'Lập ngân sách đầu tiên']));
    expect(overview.anomalies.length).toBeGreaterThan(0);
    expect(overview.forecast.upcomingExpense).toBe(3_300_000);
    expect(overview.expenseByCategory.some((item: { name: string }) => item.name === 'Chưa phân loại')).toBe(true);
    const empty = await registerUser();
    expect((await empty.api.get('/insights/overview')).body.data.monthly).toEqual([]);
  });

  it('nhập nhanh bằng câu tiếng Việt, gợi ý ví và danh mục', async () => {
    const parsed = (await user.api.post('/insights/parse-transaction').send({ text: 'Ăn uống 75k tiền mặt hôm qua' })).body.data;
    expect(parsed).toMatchObject({ type: 'EXPENSE', amount: 75_000, suggestedWalletName: 'Tiền mặt', suggestedCategoryName: 'Ăn uống' });
    const solo = await registerUser();
    await solo.api.post('/wallets').send({ name: 'Duy nhất' });
    expect((await solo.api.post('/insights/parse-transaction').send({ text: 'nhận lương 15 triệu' })).body.data).toMatchObject({ type: 'INCOME', amount: 15_000_000, suggestedWalletName: 'Duy nhất', suggestedCategoryId: null });
  });

  it('bộ phân tích câu hiểu đơn vị, dấu phân cách, ngày tương đối và ngày cụ thể', () => {
    expect(parseVietnameseTransaction('mua nhà 2,5 tỷ').amount).toBe(2_500_000_000);
    expect(parseVietnameseTransaction('cafe 1.500.000 hôm kia').amount).toBe(1_500_000);
    expect(parseVietnameseTransaction('sách 45 nghìn').amount).toBe(45_000);
    expect(parseVietnameseTransaction('taxi 12.5').amount).toBe(12.5);
    expect(new Date(parseVietnameseTransaction('xăng 50k 15/08/26').occurredAt).getUTCMonth()).toBe(7);
    expect(parseVietnameseTransaction('không có số').confidence).toBe(0.4);
  });

  it('trích số tiền, ngày, cửa hàng từ văn bản hóa đơn', async () => {
    const result = (await user.api.post('/insights/extract-receipt').send({ text: 'CIRCLE K\nNgày 12/09/26\nTỔNG: 125.000 VND' })).body.data;
    expect(result).toMatchObject({ merchant: 'CIRCLE K', amount: 125_000, confidence: 0.75 });
    expect(result.occurredAt).toContain('2026-09-12');
    expect((await user.api.post('/insights/extract-receipt').send({ text: 'không số' })).body.data).toMatchObject({ amount: null, occurredAt: null });
  });

  it('hội thoại và ghi nhớ: tạo, xem tin nhắn, xóa; không đụng được của người khác', async () => {
    const conversation = (await user.api.post('/insights/conversations').send({})).body.data;
    expect(conversation.title).toBe('Cuộc trò chuyện mới');
    await prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'USER', content: 'Hello' } });
    expect((await user.api.get('/insights/conversations')).body.data.find((item: { id: string }) => item.id === conversation.id).messageCount).toBe(1);
    expect((await user.api.get(`/insights/conversations/${conversation.id}/messages`)).body.data.messages[0]).toMatchObject({ role: 'user', content: 'Hello' });
    expect((await other.api.get(`/insights/conversations/${conversation.id}/messages`)).status).toBe(404);
    const memory = await prisma.assistantMemory.create({ data: { userId: user.id, content: 'Thích tiết kiệm' } });
    expect((await user.api.get('/insights/memories')).body.data).toHaveLength(1);
    expect((await other.api.delete(`/insights/memories/${memory.id}`)).status).toBe(404);
    expect((await user.api.delete(`/insights/memories/${memory.id}`)).status).toBe(200);
    expect((await other.api.delete(`/insights/conversations/${conversation.id}`)).status).toBe(404);
    expect((await user.api.delete(`/insights/conversations/${conversation.id}`)).status).toBe(200);
  });

  it('xác nhận, hoàn tác và hủy hành động của Agent qua API', async () => {
    const conversation = (await user.api.post('/insights/conversations').send({ title: 'Hành động' })).body.data;
    const batchId = randomUUID();
    const [first] = await prepareAgentActions(user.id, conversation.id, [{ tool: 'CREATE_GOAL', arguments: { name: 'API goal', targetAmount: 1_000 } }, { tool: 'CREATE_GOAL', arguments: { name: 'API goal 2', targetAmount: 2_000 } }], { batchId });
    const confirmed = await user.api.post(`/insights/actions/${first!.id}/confirm`);
    expect(confirmed.body.message).toBe('Đã thực hiện 2 thay đổi.');
    expect(confirmed.body.data.actions).toHaveLength(2);
    expect((await user.api.post(`/insights/actions/${first!.id}/undo`)).body.data.status).toBe('UNDONE');
    const [single] = await prepareAgentActions(user.id, conversation.id, [{ tool: 'CREATE_GOAL', arguments: { name: 'Một mình', targetAmount: 1 } }]);
    expect((await user.api.post(`/insights/actions/${single!.id}/confirm`)).body.message).toBe('Đã thực hiện hành động.');
    const [cancel] = await prepareAgentActions(user.id, conversation.id, [{ tool: 'CREATE_GOAL', arguments: { name: 'Hủy', targetAmount: 1 } }]);
    expect((await user.api.post(`/insights/actions/${cancel!.id}/cancel`)).body.data.status).toBe('CANCELLED');
    expect((await other.api.post(`/insights/actions/${cancel!.id}/confirm`)).status).toBe(404);
  });
});
