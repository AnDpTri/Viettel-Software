import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma, registerUser, seedBasics, type TestUser } from './helpers/api';

let user: TestUser;
let other: TestUser;
let basics: Awaited<ReturnType<typeof seedBasics>>;

beforeAll(async () => {
  user = await registerUser();
  other = await registerUser();
  basics = await seedBasics(user);
  await user.api.post('/transactions').send({
    walletId: basics.cash.id,
    categoryId: basics.food.id,
    type: 'EXPENSE',
    amount: 400_000,
    occurredAt: '2026-09-03'
  });
  await user.api.post('/transactions').send({
    walletId: basics.bank.id,
    categoryId: basics.salary.id,
    type: 'INCOME',
    amount: 12_000_000,
    occurredAt: '2026-09-01'
  });
});

describe('Ngân sách', () => {
  it('tính đã chi, còn lại, phần trăm; chỉ nhận danh mục chi và khoảng ngày hợp lệ', async () => {
    const created = await user.api.post('/budgets').send({
      name: 'Ăn uống tháng 9',
      categoryId: basics.food.id,
      amount: 1_000_000,
      startDate: '2026-09-01',
      endDate: '2026-09-30'
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ spent: 400_000, remaining: 600_000, percentUsed: 40 });
    const id = created.body.data.id;
    expect((await user.api.get('/budgets')).body.data.some((item: { id: string }) => item.id === id)).toBe(true);
    expect((await user.api.get(`/budgets/${id}`)).body.data.spent).toBe(400_000);
    expect((await user.api.patch(`/budgets/${id}`).send({ amount: 800_000 })).body.data.percentUsed).toBe(50);
    expect((await user.api.patch(`/budgets/${id}`).send({ endDate: '2026-08-01' })).body.error.code).toBe(
      'INVALID_DATE_RANGE'
    );
    expect(
      (
        await user.api.post('/budgets').send({
          name: 'Sai',
          categoryId: basics.salary.id,
          amount: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-30'
        })
      ).body.error.code
    ).toBe('INVALID_BUDGET_CATEGORY');
    expect(
      (
        await user.api
          .post('/budgets')
          .send({ name: 'Sai', categoryId: randomUUID(), amount: 1, startDate: '2026-09-01', endDate: '2026-09-30' })
      ).status
    ).toBe(404);
    expect(
      (await user.api.post('/budgets').send({ name: 'Sai', amount: 1, startDate: '2026-09-30', endDate: '2026-09-01' }))
        .status
    ).toBe(422);
    expect((await user.api.delete(`/budgets/${id}`)).status).toBe(200);
    for (const response of [
      await other.api.get(`/budgets/${id}`),
      await other.api.patch(`/budgets/${id}`).send({ amount: 1 }),
      await other.api.delete(`/budgets/${id}`)
    ])
      expect(response.status).toBe(404);
  });

  it('tạo kỳ tiếp theo cho ngân sách lặp đã hết hạn, cộng phần dư khi bật rollover', async () => {
    await user.api.post('/budgets').send({
      name: 'Tháng 8',
      categoryId: basics.food.id,
      amount: 1_000_000,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      recurrence: 'MONTHLY',
      rollover: true
    });
    await user.api
      .post('/budgets')
      .send({ name: 'Tuần cũ', amount: 100_000, startDate: '2026-08-01', endDate: '2026-08-07', recurrence: 'WEEKLY' });
    const first = await user.api.post('/budgets/rollover');
    expect(first.body.data.created).toBe(2);
    // Mỗi lần chạy tiến thêm một kỳ; kỳ tháng 9 chưa hết hạn nên không bị tạo trùng.
    await user.api.post('/budgets/rollover');
    const next = await prisma.budget.findMany({
      where: { userId: user.id, name: 'Tháng 8', startDate: { gte: new Date('2026-09-01') } }
    });
    expect(next).toHaveLength(1);
    expect(Number(next[0]!.amount)).toBe(2_000_000);
  });
});

describe('Mục tiêu', () => {
  it('góp tiền cập nhật tiến độ, tự hoàn thành, không cho âm và không góp vào mục tiêu đã hủy', async () => {
    const goal = (
      await user.api
        .post('/goals')
        .send({ name: 'Quỹ dự phòng', targetAmount: 1_000_000, targetDate: '2026-12-31', priority: 5 })
    ).body.data;
    expect(goal).toMatchObject({ percentCompleted: 0, remainingAmount: 1_000_000 });
    expect((await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: -1 })).body.error.code).toBe(
      'NEGATIVE_GOAL_BALANCE'
    );
    expect((await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: 0 })).status).toBe(422);
    const done = await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: 1_000_000, note: 'Thưởng' });
    expect(done.body.data).toMatchObject({ status: 'COMPLETED', percentCompleted: 100 });
    expect((await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: -200_000 })).body.data.status).toBe(
      'ACTIVE'
    );
    expect((await user.api.get(`/goals/${goal.id}`)).body.data.contributions).toHaveLength(2);
    expect(
      (await user.api.get('/goals?status=ACTIVE')).body.data.some((item: { id: string }) => item.id === goal.id)
    ).toBe(true);
    await user.api.patch(`/goals/${goal.id}`).send({ status: 'CANCELLED' });
    expect((await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: 1 })).body.error.code).toBe(
      'GOAL_CANCELLED'
    );
    expect((await user.api.post(`/goals/${randomUUID()}/contributions`).send({ amount: 1 })).status).toBe(404);
  });

  it('góp từ ví tạo chuyển khoản thật sang ví của mục tiêu và rút ngược lại', async () => {
    const saving = (await user.api.post('/wallets').send({ name: 'Tiết kiệm', type: 'BANK' })).body.data;
    const goal = (await user.api.post('/goals').send({ name: 'Du lịch', targetAmount: 3_000_000, walletId: saving.id }))
      .body.data;
    const bankBefore = (await user.api.get(`/wallets/${basics.bank.id}`)).body.data.balance;
    const added = await user.api
      .post(`/goals/${goal.id}/contributions`)
      .send({ amount: 1_000_000, fromWalletId: basics.bank.id });
    expect(added.status).toBe(201);
    expect((await user.api.get(`/wallets/${saving.id}`)).body.data.balance).toBe(1_000_000);
    expect((await user.api.get(`/wallets/${basics.bank.id}`)).body.data.balance).toBe(bankBefore - 1_000_000);
    await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: -300_000, fromWalletId: basics.bank.id });
    expect((await user.api.get(`/wallets/${saving.id}`)).body.data.balance).toBe(700_000);
    expect(
      (await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: 1, fromWalletId: saving.id })).body.error
        .code
    ).toBe('INVALID_TRANSFER');
    expect(
      (await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: 1, fromWalletId: randomUUID() })).status
    ).toBe(404);
    const usd = (await user.api.post('/wallets').send({ name: 'USD tiết kiệm', currency: 'USD' })).body.data;
    expect(
      (await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: 1, fromWalletId: usd.id })).body.error.code
    ).toBe('CURRENCY_MISMATCH');
    const noWallet = (await user.api.post('/goals').send({ name: 'Không ví', targetAmount: 1_000 })).body.data;
    expect(
      (await user.api.post(`/goals/${noWallet.id}/contributions`).send({ amount: 1, fromWalletId: basics.bank.id }))
        .body.error.code
    ).toBe('GOAL_WALLET_REQUIRED');
    await prisma.wallet.update({ where: { id: saving.id }, data: { archivedAt: new Date() } });
    expect(
      (await user.api.post(`/goals/${goal.id}/contributions`).send({ amount: 1, fromWalletId: basics.bank.id })).status
    ).toBe(404);
  });

  it('sửa, tạm dừng, tiếp tục, góp định kỳ và xóa', async () => {
    const goal = (
      await user.api
        .post('/goals')
        .send({ name: 'Mua xe', targetAmount: 100_000, recurringAmount: 60_000, recurringFrequency: 'DAILY' })
    ).body.data;
    await prisma.goal.update({ where: { id: goal.id }, data: { createdAt: new Date('2026-01-01') } });
    expect((await user.api.post('/goals/run-recurring')).body.data.processed).toBeGreaterThanOrEqual(1);
    await prisma.goalContribution.updateMany({
      where: { goalId: goal.id },
      data: { createdAt: new Date('2026-01-01') }
    });
    await user.api.post('/goals/run-recurring');
    expect((await user.api.get(`/goals/${goal.id}`)).body.data.status).toBe('COMPLETED');
    expect(
      (await user.api.patch(`/goals/${goal.id}`).send({ name: 'Mua xe máy', walletId: basics.cash.id })).body.data.name
    ).toBe('Mua xe máy');
    expect((await user.api.patch(`/goals/${goal.id}`).send({ walletId: randomUUID() })).status).toBe(404);
    expect((await user.api.patch(`/goals/${goal.id}`).send({})).status).toBe(422);
    expect((await user.api.post(`/goals/${goal.id}/pause`)).body.data.pausedAt).not.toBeNull();
    expect((await user.api.post(`/goals/${goal.id}/resume`)).body.data.pausedAt).toBeNull();
    expect((await user.api.delete(`/goals/${goal.id}`)).status).toBe(200);
    for (const response of [
      await other.api.get(`/goals/${goal.id}`),
      await other.api.patch(`/goals/${goal.id}`).send({ name: 'x' }),
      await other.api.delete(`/goals/${goal.id}`),
      await other.api.post(`/goals/${goal.id}/pause`),
      await other.api.post(`/goals/${goal.id}/resume`)
    ])
      expect(response.status).toBe(404);
  });
});

describe('Báo cáo và đối soát', () => {
  it('tổng hợp thu chi theo kỳ, theo tháng, theo danh mục và nhiều tiền tệ', async () => {
    const usd = (await user.api.post('/wallets').send({ name: 'Ví USD báo cáo', currency: 'USD' })).body.data;
    await user.api
      .post('/transactions')
      .send({ walletId: usd.id, type: 'EXPENSE', amount: 20, occurredAt: '2026-09-04' });
    const summary = (await user.api.get('/reports/summary?from=2026-09-01&to=2026-09-30')).body.data;
    expect(summary.currency).toBe('VND');
    expect(summary.income).toBe(12_000_000);
    expect(summary.byCurrency.map((item: { currency: string }) => item.currency)).toEqual(['USD', 'VND']);
    expect(
      summary.expenseByCategory.some((item: { categoryName: string }) => item.categoryName === 'Chưa phân loại')
    ).toBe(true);
    expect(summary.monthly[0].month).toBe('2026-09');
    expect((await user.api.get('/reports/summary?from=2026-09-30&to=2026-09-01')).body.error.code).toBe(
      'INVALID_DATE_RANGE'
    );
    const empty = await registerUser();
    expect((await empty.api.get('/reports/summary')).body.data).toMatchObject({ income: 0, expense: 0, net: 0 });
  });

  it('xuất báo cáo tổng hợp và đối soát ra CSV', async () => {
    const csv = await user.api.get('/reports/summary?from=2026-09-01T00:00:00Z&to=2026-09-30T23:59:59Z&format=csv');
    expect(csv.headers['content-disposition']).toContain('bao-cao-tong-hop_2026-09-01_2026-09-30.csv');
    expect(csv.text).toContain('Chi theo danh mục');
    const reconciliation = await user.api.get('/reports/reconciliation?format=csv');
    expect(reconciliation.text).toContain('Số dư tính toán');
    expect((await user.api.get('/reports/summary?format=pdf')).status).toBe(422);
  });

  it('đối soát số dư từng ví khớp với giao dịch, tài sản ròng theo tiền tệ', async () => {
    const data = (await user.api.get('/reports/reconciliation')).body.data;
    const cash = data.wallets.find((item: { walletId: string }) => item.walletId === basics.cash.id);
    expect(cash).toMatchObject({ openingBalance: 1_000_000, calculatedBalance: 600_000, archived: false });
    expect(data.totals.VND).toBeGreaterThan(0);
    const netWorth = (await user.api.get('/reports/net-worth')).body.data;
    expect(netWorth.byCurrency.VND).toBeGreaterThan(0);
    expect(netWorth.monthlyChange.some((item: { month: string }) => item.month === '2026-09')).toBe(true);
  });
});

describe('Hồ sơ và hướng dẫn người mới', () => {
  it('xem và cập nhật hồ sơ', async () => {
    const updated = await user.api.patch('/profile').send({
      fullName: 'Minh Anh',
      currency: 'usd',
      theme: 'DARK',
      timezone: 'Asia/Ho_Chi_Minh',
      preferences: { compact: true }
    });
    expect(updated.body.data).toMatchObject({ fullName: 'Minh Anh', currency: 'USD', theme: 'DARK' });
    expect((await user.api.patch('/profile').send({})).status).toBe(422);
    expect((await user.api.patch('/profile').send({ phone: 'abc' })).status).toBe(422);
    await user.api.patch('/profile').send({ currency: 'VND' });
  });

  it('tiến độ onboarding suy ra từ dữ liệu thật; ẩn, lưu mối quan tâm, làm lại', async () => {
    const fresh = await registerUser({ fullName: '' });
    const start = (await fresh.api.get('/profile/onboarding')).body.data;
    expect(start).toMatchObject({ completed: false, completedCount: 0, nextStep: { id: 'profile' } });
    await fresh.api.patch('/profile').send({ fullName: 'Người Mới' });
    expect(
      (
        await fresh.api
          .patch('/profile/onboarding')
          .send({ dismissed: true, welcomeSeen: true, interests: ['budget', 'save'] })
      ).body.data
    ).toMatchObject({ dismissed: true, welcomeSeen: true, interests: ['budget', 'save'] });
    expect((await fresh.api.patch('/profile/onboarding').send({ restart: true })).body.data).toMatchObject({
      dismissed: false,
      welcomeSeen: false
    });
    expect((await fresh.api.patch('/profile/onboarding').send({})).status).toBe(422);
    const some = await fresh.api.post('/profile/onboarding/starter-categories').send({ names: ['Lương', 'Ăn uống'] });
    expect(some.body.data.created).toBe(2);
    expect((await fresh.api.post('/profile/onboarding/starter-categories')).body.data.created).toBe(6);
    expect((await fresh.api.post('/profile/onboarding/starter-categories')).body.message).toBe(
      'Các danh mục gợi ý đã có sẵn.'
    );
    const wallet = (await fresh.api.post('/wallets').send({ name: 'Ví' })).body.data;
    await fresh.api
      .post('/transactions')
      .send({ walletId: wallet.id, type: 'EXPENSE', amount: 1_000, occurredAt: '2026-09-01' });
    expect((await fresh.api.get('/profile/onboarding')).body.data).toMatchObject({
      completed: true,
      progressPercent: 100,
      nextStep: null
    });
  });
});
