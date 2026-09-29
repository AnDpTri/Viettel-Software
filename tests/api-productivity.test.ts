import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { client, PASSWORD, prisma, registerUser, seedBasics, type TestUser } from './helpers/api';

let user: TestUser;
let other: TestUser;
let basics: Awaited<ReturnType<typeof seedBasics>>;

beforeAll(async () => {
  user = await registerUser();
  other = await registerUser();
  basics = await seedBasics(user);
});

/** Kiểm tra CRUD đơn giản: tạo, sửa, người khác không xóa được, xóa, xóa lần hai báo 404. */
async function crud(path: string, body: Record<string, unknown>, patch: Record<string, unknown>) {
  const created = await user.api.post(path).send(body);
  expect(created.status).toBe(201);
  const id = created.body.data.id;
  expect((await user.api.get(path)).body.data.some((item: { id: string }) => item.id === id)).toBe(true);
  expect((await user.api.patch(`${path}/${id}`).send(patch)).status).toBe(200);
  expect((await other.api.patch(`${path}/${id}`).send(patch)).status).toBe(404);
  expect((await other.api.delete(`${path}/${id}`)).status).toBe(404);
  expect((await user.api.delete(`${path}/${id}`)).status).toBe(200);
  expect((await user.api.delete(`${path}/${id}`)).status).toBe(404);
}

describe('Danh mục phụ trợ', () => {
  it('nhãn, đơn vị giao dịch và quy tắc tự động', async () => {
    await crud('/productivity/tags', { name: 'Công tác', color: '#123456' }, { name: 'Công tác phí' });
    await crud('/productivity/merchants', { name: 'Highlands', defaultCategoryId: basics.food.id }, { name: 'Highlands Coffee' });
    await crud('/productivity/automation-rules', { name: 'Cà phê', field: 'note', operator: 'contains', value: 'cafe', categoryId: basics.food.id }, { priority: 10 });
  });

  it('mẫu giao dịch: tạo, dùng mẫu, chặn mẫu chuyển khoản và thiếu số tiền', async () => {
    const template = (await user.api.post('/productivity/templates').send({ name: 'Cà phê sáng', walletId: basics.cash.id, categoryId: basics.food.id, type: 'EXPENSE', amount: 35_000 })).body.data;
    expect((await user.api.get('/productivity/templates')).body.data).toHaveLength(1);
    const used = await user.api.post(`/productivity/templates/${template.id}/use`).send({ note: 'Thứ hai' });
    expect(used.status).toBe(201);
    expect(used.body.data).toMatchObject({ note: 'Thứ hai', type: 'EXPENSE' });
    const noAmount = (await user.api.post('/productivity/templates').send({ name: 'Tùy', walletId: basics.cash.id, type: 'EXPENSE' })).body.data;
    expect((await user.api.post(`/productivity/templates/${noAmount.id}/use`).send({})).body.error.code).toBe('AMOUNT_REQUIRED');
    const transfer = (await user.api.post('/productivity/templates').send({ name: 'Chuyển', walletId: basics.cash.id, type: 'TRANSFER', amount: 1 })).body.data;
    expect((await user.api.post(`/productivity/templates/${transfer.id}/use`).send({})).body.error.code).toBe('TRANSFER_TEMPLATE_UNSUPPORTED');
    expect((await user.api.post(`/productivity/templates/${randomUUID()}/use`).send({})).status).toBe(404);
    expect((await user.api.delete(`/productivity/templates/${template.id}`)).status).toBe(200);
    expect((await user.api.delete(`/productivity/templates/${template.id}`)).status).toBe(404);
  });
});

describe('Định kỳ và hóa đơn', () => {
  it('khoản định kỳ tự ghi khi đến hạn và dời lịch sang kỳ sau', async () => {
    const rule = await user.api.post('/productivity/recurring').send({ walletId: basics.bank.id, categoryId: basics.food.id, name: 'Internet', type: 'EXPENSE', amount: 250_000, frequency: 'MONTHLY', nextRunAt: '2026-09-01', autoPost: true });
    expect(rule.status).toBe(201);
    await user.api.post('/productivity/recurring').send({ walletId: basics.bank.id, name: 'Chuyển tiết kiệm', type: 'TRANSFER', amount: 1, frequency: 'MONTHLY', nextRunAt: '2026-09-01', autoPost: true });
    const run = await user.api.post('/productivity/recurring/run-due');
    expect(run.body.data.processed).toBe(1);
    expect(new Date((await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.body.data.id } })).nextRunAt).toISOString()).toContain('2026-10-01');
    expect((await user.api.get('/productivity/recurring')).body.data.length).toBe(2);
    expect((await user.api.patch(`/productivity/recurring/${rule.body.data.id}`).send({ active: false })).body.data.active).toBe(false);
    expect((await user.api.post('/productivity/recurring').send({ walletId: randomUUID(), name: 'x', type: 'EXPENSE', amount: 1, frequency: 'DAILY', nextRunAt: '2026-09-01' })).status).toBe(404);
    expect((await other.api.patch(`/productivity/recurring/${rule.body.data.id}`).send({ active: true })).status).toBe(404);
    expect((await user.api.delete(`/productivity/recurring/${rule.body.data.id}`)).status).toBe(200);
    expect((await user.api.delete(`/productivity/recurring/${rule.body.data.id}`)).status).toBe(404);
  });

  it('hóa đơn: quá hạn tự đổi trạng thái, thanh toán ghi khoản chi và dời hạn nếu lặp', async () => {
    const monthly = (await user.api.post('/productivity/bills').send({ name: 'Tiền điện', amount: 600_000, dueAt: '2026-09-10', walletId: basics.bank.id, recurrence: 'MONTHLY' })).body.data;
    const once = (await user.api.post('/productivity/bills').send({ name: 'Học phí', amount: 2_000_000, dueAt: '2099-01-01' })).body.data;
    const list = (await user.api.get('/productivity/bills')).body.data;
    expect(list.find((item: { id: string }) => item.id === monthly.id).status).toBe('OVERDUE');
    const paid = await user.api.post(`/productivity/bills/${monthly.id}/pay`).send({});
    expect(paid.body.data.bill).toMatchObject({ status: 'UPCOMING' });
    expect(paid.body.data.bill.dueAt).toContain('2026-10-10');
    expect((await user.api.post(`/productivity/bills/${once.id}/pay`).send({})).body.error.code).toBe('WALLET_REQUIRED');
    expect((await user.api.post(`/productivity/bills/${once.id}/pay`).send({ walletId: basics.cash.id })).body.data.bill.status).toBe('PAID');
    expect((await user.api.patch(`/productivity/bills/${once.id}`).send({ status: 'SKIPPED' })).body.data.status).toBe('SKIPPED');
    expect((await user.api.patch(`/productivity/bills/${once.id}`).send({ amount: 1_500_000 })).status).toBe(200);
    expect((await other.api.patch(`/productivity/bills/${once.id}`).send({ status: 'PAID' })).status).toBe(404);
    expect((await other.api.post(`/productivity/bills/${once.id}/pay`).send({})).status).toBe(404);
    expect((await user.api.delete(`/productivity/bills/${once.id}`)).status).toBe(200);
    expect((await user.api.delete(`/productivity/bills/${once.id}`)).status).toBe(404);
  });
});

describe('Thông báo, nhật ký, tỷ giá', () => {
  it('sinh cảnh báo hóa đơn và ngân sách, không lặp lại, đánh dấu đã đọc', async () => {
    const tester = await registerUser();
    const own = await seedBasics(tester);
    const today = new Date();
    const start = new Date(today.getTime() - 5 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
    await tester.api.post('/budgets').send({ name: 'Chạm trần', categoryId: own.food.id, amount: 100_000, startDate: start, endDate: end });
    await tester.api.post('/budgets').send({ name: 'Toàn bộ', amount: 100_000_000, startDate: start, endDate: end });
    await tester.api.post('/transactions').send({ walletId: own.cash.id, categoryId: own.food.id, type: 'EXPENSE', amount: 90_000, occurredAt: today.toISOString() });
    await tester.api.post('/productivity/bills').send({ name: 'Sắp tới', amount: 1_000, dueAt: new Date(today.getTime() + 2 * 86_400_000).toISOString() });
    await tester.api.post('/productivity/bills').send({ name: 'Quá hạn', amount: 1_000, dueAt: '2026-01-01' });
    await tester.api.get('/productivity/bills');
    expect((await tester.api.post('/productivity/notifications/generate')).body.data.created).toBe(3);
    expect((await tester.api.post('/productivity/notifications/generate')).body.data.created).toBe(0);
    const unread = (await tester.api.get('/productivity/notifications?unread=true')).body.data;
    expect(unread.map((item: { title: string }) => item.title)).toEqual(expect.arrayContaining(['Hóa đơn quá hạn', 'Hóa đơn sắp đến hạn', 'Ngân sách sắp chạm giới hạn']));
    expect((await tester.api.patch(`/productivity/notifications/${unread[0].id}/read`)).body.data.readAt).not.toBeNull();
    expect((await other.api.patch(`/productivity/notifications/${unread[0].id}/read`)).status).toBe(404);
    await tester.api.post('/productivity/notifications/read-all');
    expect((await tester.api.get('/productivity/notifications?unread=true')).body.data).toHaveLength(0);
    expect((await tester.api.get('/productivity/notifications')).body.data.length).toBe(3);
  });

  it('nhật ký hoạt động và tỷ giá thủ công', async () => {
    const logs = (await user.api.get('/productivity/audit-logs')).body.data;
    expect(logs.some((item: { action: string }) => item.action === 'AUTH_REGISTER')).toBe(true);
    const rate = await user.api.post('/productivity/exchange-rates').send({ baseCurrency: 'usd', quoteCurrency: 'vnd', rate: 25_400 });
    expect(rate.body.data).toMatchObject({ baseCurrency: 'USD', quoteCurrency: 'VND', source: 'MANUAL' });
    expect((await user.api.get('/productivity/exchange-rates')).body.data).toHaveLength(1);
  });
});

describe('Gia đình và dữ liệu cá nhân', () => {
  it('tạo nhóm gia đình, người khác tham gia bằng mã mời', async () => {
    const household = (await user.api.post('/productivity/households').send({ name: 'Nhà mình' })).body.data;
    expect(household.members).toHaveLength(1);
    expect((await other.api.post('/productivity/households/join').send({ inviteCode: household.inviteCode })).status).toBe(200);
    expect((await other.api.post('/productivity/households/join').send({ inviteCode: household.inviteCode })).status).toBe(200);
    expect((await other.api.get('/productivity/households')).body.data[0].members).toHaveLength(2);
    expect((await other.api.post('/productivity/households/join').send({ inviteCode: 'khongtontai' })).status).toBe(404);
  });

  it('xuất toàn bộ dữ liệu và xóa tài khoản có xác nhận', async () => {
    const exported = await user.api.get('/productivity/data-export');
    expect(exported.headers['content-disposition']).toContain('so-moc-data.json');
    expect(exported.body.data.wallets.length).toBeGreaterThanOrEqual(2);
    const leaving = await registerUser({ email: `bye_${Date.now()}@example.com` });
    expect((await leaving.api.delete('/productivity/account').send({ confirmation: 'xoa' })).status).toBe(422);
    expect((await leaving.api.delete('/productivity/account').send({ confirmation: 'XOA TAI KHOAN' })).status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: leaving.id } });
    expect(row).toMatchObject({ email: null, fullName: 'Tài khoản đã xóa' });
    expect((await client().post('/auth/login').send({ identifier: leaving.username, password: PASSWORD })).status).toBe(401);
  });
});
