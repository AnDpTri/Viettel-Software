import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { cancelAgentAction, executeAgentAction, executeImmediateAgentTool, executeReadAgentTools, prepareAgentActions, undoAgentAction, type PendingEntity } from '../src/services/agent.service';
import { getAgentMemoryContext, refreshConversationSummary } from '../src/services/agent-memory.service';
import type { AgentProposal } from '../src/services/ai.service';
import { prisma, registerUser, seedBasics, type TestUser } from './helpers/api';

let user: TestUser;
let basics: Awaited<ReturnType<typeof seedBasics>>;
let conversationId: string;

beforeAll(async () => {
  user = await registerUser();
  basics = await seedBasics(user);
  conversationId = (await prisma.assistantConversation.create({ data: { userId: user.id, title: 'Test agent' } })).id;
});

const propose = (tool: AgentProposal['tool'], args: Record<string, unknown>, options: { batchId?: string; pending?: PendingEntity[] } = {}) =>
  prepareAgentActions(user.id, conversationId, [{ tool, arguments: args }], options);

/** Đề xuất → xác nhận → hoàn tác một action, trả về action sau khi thực thi. */
async function roundTrip(tool: AgentProposal['tool'], args: Record<string, unknown>, check?: () => Promise<void>) {
  const [action] = await propose(tool, args);
  expect(action!.status).toBe('PENDING');
  const executed = (await executeAgentAction(user.id, action!.id))[0]!;
  expect(executed.status).toBe('EXECUTED');
  await check?.();
  const undone = (await undoAgentAction(user.id, action!.id))[0]!;
  expect(undone.status).toBe('UNDONE');
  return executed;
}

describe('Agent: bản xem trước, xác nhận, hoàn tác', () => {
  it('giao dịch: tạo, sửa, xóa, chuyển khoản, phân loại hàng loạt, đối soát ví', async () => {
    await roundTrip('CREATE_TRANSACTION', { type: 'EXPENSE', amount: 55_000, walletName: 'tien mat', categoryName: 'an uong', note: 'Bún chả', occurredAt: '2026-09-12' });
    const tx = (await user.api.post('/transactions').send({ walletId: basics.cash.id, type: 'EXPENSE', amount: 70_000, occurredAt: '2026-09-12', note: 'Trưa' })).body.data;
    const updated = await roundTrip('UPDATE_TRANSACTION', { transactionId: tx.id, amount: 80_000, categoryName: 'Ăn uống', occurredAt: '2026-09-13', note: 'Trưa mới', payee: 'Quán', status: 'CLEARED' });
    expect((updated.preview as { changes: Array<{ label: string }> }).changes.map((row) => row.label)).toEqual(expect.arrayContaining(['Danh mục', 'Số tiền', 'Thời gian']));
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).note).toBe('Trưa');
    await roundTrip('UPDATE_TRANSACTION', { transactionId: tx.id, categoryId: null });
    await roundTrip('DELETE_TRANSACTION', { transactionId: tx.id }, async () => {
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).deletedAt).not.toBeNull();
    });
    await roundTrip('CREATE_TRANSFER', { amount: 100_000, sourceWalletName: 'Ngân hàng', destinationWalletName: 'Tiền mặt' });
    await expect(propose('CREATE_TRANSFER', { amount: 1, sourceWalletId: basics.cash.id, destinationWalletId: basics.cash.id })).rejects.toMatchObject({ code: 'INVALID_TRANSFER' });
    await roundTrip('BULK_CATEGORIZE', { transactionIds: [tx.id], categoryId: basics.food.id });
    await expect(propose('BULK_CATEGORIZE', { transactionIds: [randomUUID()], categoryId: basics.food.id })).rejects.toMatchObject({ code: 'TRANSACTIONS_NOT_FOUND' });
    await roundTrip('RECONCILE_WALLET', { walletId: basics.cash.id, actualBalance: 2_000_000 });
    await expect(propose('RECONCILE_WALLET', { walletId: basics.bank.id, actualBalance: (await user.api.get(`/wallets/${basics.bank.id}`)).body.data.balance })).rejects.toMatchObject({ code: 'ALREADY_RECONCILED' });
  });

  it('ví và danh mục: tạo, sửa, lưu trữ, bộ danh mục khởi đầu, chặn trùng', async () => {
    await roundTrip('CREATE_WALLET', { name: 'Momo', type: 'E_WALLET', currency: 'vnd', openingBalance: 10_000 });
    await expect(propose('CREATE_WALLET', { name: 'tiền mặt', type: 'CASH' })).rejects.toMatchObject({ code: 'WALLET_EXISTS' });
    await roundTrip('UPDATE_WALLET', { walletId: basics.cash.id, name: 'Ví tiền mặt', openingBalance: 1_200_000 }, async () => {
      expect((await prisma.wallet.findUniqueOrThrow({ where: { id: basics.cash.id } })).name).toBe('Ví tiền mặt');
    });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: basics.cash.id } })).name).toBe('Tiền mặt');
    const temp = (await user.api.post('/wallets').send({ name: 'Tạm' })).body.data;
    await roundTrip('ARCHIVE_WALLET', { walletId: temp.id });
    await roundTrip('CREATE_CATEGORY', { name: 'Trà sữa', type: 'EXPENSE', parentName: 'Ăn uống', color: '#aa5500' });
    await expect(propose('CREATE_CATEGORY', { name: 'ăn uống', type: 'EXPENSE' })).rejects.toMatchObject({ code: 'CATEGORY_EXISTS' });
    const child = (await user.api.post('/categories').send({ name: 'Bánh', type: 'EXPENSE' })).body.data;
    await roundTrip('UPDATE_CATEGORY', { categoryId: child.id, name: 'Bánh ngọt', color: '#123123', parentName: 'Ăn uống' });
    await roundTrip('UPDATE_CATEGORY', { categoryId: child.id, parentId: null });
    await expect(propose('UPDATE_CATEGORY', { categoryId: child.id, parentId: child.id })).rejects.toMatchObject({ code: 'INVALID_PARENT' });
    await roundTrip('ARCHIVE_CATEGORY', { categoryId: child.id });
    await roundTrip('CREATE_STARTER_CATEGORIES', {}, async () => {
      await expect(propose('CREATE_STARTER_CATEGORIES', {})).rejects.toMatchObject({ code: 'STARTER_CATEGORIES_EXIST' });
    });
  });

  it('ngân sách, mục tiêu, hóa đơn, định kỳ, quy tắc tự động', async () => {
    await roundTrip('CREATE_BUDGET', { name: 'Ăn tháng 10', amount: 2_000_000, categoryName: 'Ăn uống', startDate: '2026-10-01', endDate: '2026-10-31', rollover: true });
    await expect(propose('CREATE_BUDGET', { name: 'Sai', amount: 1, startDate: '2026-10-31', endDate: '2026-10-01' })).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE' });
    const budget = (await user.api.post('/budgets').send({ name: 'B', amount: 100, startDate: '2026-10-01', endDate: '2026-10-31' })).body.data;
    await roundTrip('UPDATE_BUDGET', { budgetId: budget.id, amount: 200, startDate: '2026-10-02', endDate: '2026-10-30' });
    await roundTrip('DELETE_BUDGET', { budgetId: budget.id });
    await roundTrip('CREATE_GOAL', { name: 'Laptop', targetAmount: 20_000_000, currentAmount: 1_000_000, targetDate: '2027-01-01' });
    await expect(propose('CREATE_GOAL', { name: 'Sai', targetAmount: 1, currentAmount: 5 })).rejects.toMatchObject({ code: 'INVALID_GOAL_AMOUNT' });
    const goal = (await user.api.post('/goals').send({ name: 'G', targetAmount: 1_000 })).body.data;
    await roundTrip('UPDATE_GOAL', { goalId: goal.id, name: 'G2', targetDate: '2027-02-01' });
    await roundTrip('CONTRIBUTE_GOAL', { goalId: goal.id, amount: 1_000, note: 'Đủ' }, async () => {
      expect((await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })).status).toBe('COMPLETED');
    });
    expect((await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })).status).toBe('ACTIVE');
    await roundTrip('PAUSE_GOAL', { goalId: goal.id, paused: true });
    await roundTrip('DELETE_GOAL', { goalId: goal.id });
    await roundTrip('CREATE_BILL', { name: 'Internet', amount: 250_000, dueAt: '2026-10-05', walletName: 'Ngân hàng', recurrence: 'MONTHLY' });
    const bill = (await user.api.post('/productivity/bills').send({ name: 'Nước', amount: 90_000, dueAt: '2026-10-05', recurrence: 'MONTHLY' })).body.data;
    await roundTrip('PAY_BILL', { billId: bill.id, walletName: 'Ngân hàng' }, async () => {
      expect((await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).dueAt.toISOString()).toContain('2026-11-05');
    });
    const once = (await user.api.post('/productivity/bills').send({ name: 'Một lần', amount: 1_000, dueAt: '2026-10-05', walletId: basics.cash.id })).body.data;
    await roundTrip('PAY_BILL', { billId: once.id, occurredAt: '2026-10-01' });
    await roundTrip('CREATE_RECURRING', { name: 'Lương', type: 'INCOME', amount: 15_000_000, walletName: 'Ngân hàng', categoryName: 'Lương', frequency: 'MONTHLY', nextRunAt: '2026-10-05', autoPost: true });
    await roundTrip('CREATE_AUTOMATION_RULE', { name: 'Grab', field: 'payee', operator: 'contains', value: 'grab', categoryName: 'Ăn uống', tagName: 'Đi lại', priority: 3 });
  });

  it('một nhóm nhiều bước: ví và danh mục mới được tham chiếu bằng tên, xác nhận và hoàn tác cả nhóm', async () => {
    const batchId = randomUUID();
    const pending: PendingEntity[] = [];
    await propose('CREATE_WALLET', { name: 'ZaloPay', type: 'E_WALLET' }, { batchId, pending });
    await propose('CREATE_CATEGORY', { name: 'Thú cưng', type: 'EXPENSE' }, { batchId, pending });
    await propose('CREATE_CATEGORY', { name: 'Thức ăn mèo', type: 'EXPENSE', parentName: 'Thú cưng' }, { batchId, pending });
    const [last] = await propose('CREATE_TRANSACTION', { type: 'EXPENSE', amount: 120_000, walletName: 'ZaloPay', categoryName: 'Thức ăn mèo' }, { batchId, pending });
    await propose('CREATE_BUDGET', { name: 'Mèo', amount: 1, categoryName: 'Thú cưng', startDate: '2026-10-01', endDate: '2026-10-31' }, { batchId, pending });
    await propose('CREATE_BILL', { name: 'Tiêm mèo', amount: 1, dueAt: '2026-11-01', walletName: 'ZaloPay' }, { batchId, pending });
    await propose('CREATE_TRANSFER', { amount: 1, sourceWalletName: 'Ngân hàng', destinationWalletName: 'ZaloPay' }, { batchId, pending });
    const group = await executeAgentAction(user.id, last!.id);
    expect(group).toHaveLength(7);
    expect(group.every((item) => item.status === 'EXECUTED')).toBe(true);
    const tx = await prisma.transaction.findFirstOrThrow({ where: { userId: user.id, idempotencyKey: `agent:${last!.id}` }, include: { wallet: true, category: { include: { parent: true } } } });
    expect([tx.wallet.name, tx.category?.name, tx.category?.parent?.name]).toEqual(['ZaloPay', 'Thức ăn mèo', 'Thú cưng']);
    await expect(executeAgentAction(user.id, last!.id)).rejects.toMatchObject({ code: 'ACTION_NOT_PENDING' });
    expect((await undoAgentAction(user.id, last!.id)).every((item) => item.status === 'UNDONE')).toBe(true);
    await expect(undoAgentAction(user.id, last!.id)).rejects.toMatchObject({ code: 'ACTION_NOT_UNDOABLE' });
  });

  it('hủy, hết hạn, thiếu ví/danh mục và dữ liệu không thuộc người dùng', async () => {
    const [action] = await propose('CREATE_GOAL', { name: 'Hủy', targetAmount: 1 });
    expect((await cancelAgentAction(user.id, action!.id))[0]!.status).toBe('CANCELLED');
    await expect(cancelAgentAction(user.id, action!.id)).rejects.toMatchObject({ code: 'ACTION_NOT_PENDING' });
    const [old] = await propose('CREATE_GOAL', { name: 'Cũ', targetAmount: 1 });
    await prisma.agentAction.update({ where: { id: old!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(executeAgentAction(user.id, old!.id)).rejects.toMatchObject({ code: 'ACTION_EXPIRED' });
    await expect(executeAgentAction(user.id, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(propose('CREATE_TRANSACTION', { type: 'EXPENSE', amount: 1, walletName: 'Không có ví này' })).rejects.toMatchObject({ code: 'AGENT_NEEDS_WALLET' });
    const live = (await user.api.post('/transactions').send({ walletId: basics.bank.id, type: 'EXPENSE', amount: 1, occurredAt: '2026-09-20' })).body.data;
    await expect(propose('UPDATE_TRANSACTION', { transactionId: live.id, categoryName: 'Không tồn tại' })).rejects.toMatchObject({ code: 'AGENT_NEEDS_CATEGORY' });
    for (const [tool, args] of [['DELETE_TRANSACTION', { transactionId: randomUUID() }], ['ARCHIVE_WALLET', { walletId: randomUUID() }], ['DELETE_GOAL', { goalId: randomUUID() }], ['PAY_BILL', { billId: randomUUID() }]] as const) {
      await expect(propose(tool, args)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
    await expect(propose('CREATE_TRANSACTION', { type: 'EXPENSE', amount: -1 })).rejects.toThrow();
  });
});

describe('Agent: công cụ đọc và công cụ chạy ngay', () => {
  it('tìm giao dịch, tổng hợp, CSV, hóa đơn sắp tới, ví, danh mục, hướng dẫn, onboarding', async () => {
    const run = async (tool: AgentProposal['tool'], args: Record<string, unknown> = {}) => (await executeReadAgentTools(user.id, [{ tool, arguments: args }]))[0]!;
    expect((await run('SEARCH_TRANSACTIONS', { query: 'Trưa', type: 'EXPENSE', walletName: 'Tiền mặt', categoryName: 'Ăn uống', from: '2026-01-01', to: '2026-12-31', minAmount: 1, maxAmount: 1_000_000 })).summary).toMatch(/giao dịch/);
    expect((await run('SEARCH_TRANSACTIONS', { query: 'không-có-gì-khớp' })).summary).toBe('Không tìm thấy giao dịch phù hợp.');
    expect((await run('FINANCIAL_SUMMARY', { from: '2026-01-01', to: '2026-12-31' })).data).toMatchObject({ income: expect.any(Number) });
    expect((await run('FINANCIAL_SUMMARY')).tool).toBe('FINANCIAL_SUMMARY');
    const csv = await run('EXPORT_TRANSACTIONS_CSV', { from: '2026-01-01', to: '2026-12-31', type: 'EXPENSE', walletName: 'Tiền mặt', categoryName: 'Ăn uống' });
    expect(csv.attachment!.url).toContain('walletId=');
    expect((await run('EXPORT_TRANSACTIONS_CSV')).attachment!.url).toBe('/api/v1/transactions/export.csv');
    await user.api.post('/productivity/bills').send({ name: 'Sắp đến', amount: 1, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await run('LIST_UPCOMING_BILLS', { days: 10 })).summary).toMatch(/hóa đơn đến hạn/);
    expect((await run('LIST_WALLETS')).summary).toMatch(/ví đang hoạt động/);
    expect((await run('LIST_CATEGORIES', { type: 'EXPENSE' })).summary).toMatch(/danh mục phù hợp/);
    expect((await run('GET_APP_GUIDE', { topic: 'budgets' })).summary).toContain('Ngân sách');
    expect((await run('GET_APP_GUIDE')).data).toMatchObject({ uiActions: [] });
    expect((await run('GET_ONBOARDING_STATUS')).summary).toBeTruthy();
    const empty = await registerUser({ fullName: '' });
    const emptyRun = async (tool: AgentProposal['tool'], args: Record<string, unknown> = {}) => (await executeReadAgentTools(empty.id, [{ tool, arguments: args }]))[0]!;
    expect((await emptyRun('LIST_WALLETS')).summary).toContain('Chưa có ví');
    expect((await emptyRun('LIST_CATEGORIES')).summary).toBe('Chưa có danh mục phù hợp.');
    expect((await emptyRun('LIST_UPCOMING_BILLS')).summary).toContain('Không có hóa đơn');
    expect((await emptyRun('GET_ONBOARDING_STATUS')).summary).toContain('0/4');
  });

  it('ghi nhớ, xem lịch sử hội thoại, xem trước làm lại dữ liệu, sao lưu', async () => {
    const run = (tool: AgentProposal['tool'], args: Record<string, unknown> = {}) => executeImmediateAgentTool(user.id, conversationId, { tool, arguments: args });
    const saved = await run('SAVE_MEMORY', { content: 'Ưu tiên ví Ngân hàng' });
    await run('SAVE_MEMORY', { content: 'ưu tiên ví ngân hàng', kind: 'CONTEXT' });
    expect((await run('LIST_MEMORIES', { limit: 5 })).data).toHaveLength(1);
    expect((await run('DELETE_MEMORY', { memoryId: (saved.data as { id: string }).id })).summary).toContain('Đã xóa');
    await expect(run('DELETE_MEMORY', { memoryId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await run('LIST_MEMORIES')).summary).toBe('Chưa có ghi nhớ dài hạn nào.');
    await prisma.assistantMessage.create({ data: { conversationId, role: 'USER', content: 'Xin chào' } });
    expect((await run('GET_CONVERSATION_HISTORY', { limit: 5 })).data).toHaveLength(1);
    await expect(executeImmediateAgentTool(user.id, randomUUID(), { tool: 'GET_CONVERSATION_HISTORY', arguments: {} })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await run('PREVIEW_DATA_RESET', { scope: 'TRANSACTIONS' })).data).toMatchObject({ executed: false });
    expect((await run('PREVIEW_DATA_RESET', { scope: 'ALL_FINANCIAL_DATA' })).data).toMatchObject({ walletCount: expect.any(Number) });
    expect((await run('EXPORT_DATA_BACKUP')).attachment!.filename).toBe('so-moc-backup.json');
    await expect(run('CREATE_GOAL', {})).rejects.toMatchObject({ code: 'UNSUPPORTED_AGENT_TOOL' });
  });

  it('ngữ cảnh bộ nhớ hội thoại và tóm tắt khi hội thoại dài', async () => {
    const context = await getAgentMemoryContext(user.id, conversationId);
    expect(context.history.at(-1)).toEqual({ role: 'user', content: 'Xin chào' });
    expect(context.recentActions.length).toBeGreaterThan(0);
    await prisma.assistantMessage.createMany({ data: Array.from({ length: 19 }, (_, index) => ({ conversationId, role: index % 2 ? 'ASSISTANT' as const : 'USER' as const, content: `Tin ${index}` })) });
    await refreshConversationSummary(conversationId);
    expect((await prisma.assistantConversation.findUniqueOrThrow({ where: { id: conversationId } })).summary).toContain('Các chủ đề');
  });
});
