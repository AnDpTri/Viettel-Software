/**
 * Kiểm tra tất định (không gọi AI) cho nhóm thay đổi của Agent trên database thật:
 * tham chiếu bản ghi đang chờ trong cùng lượt, thực thi theo thứ tự, rollback khi một mục lỗi,
 * hoàn tác ngược thứ tự, hai khoản giống hệt nhau không bị gộp, hủy cả nhóm, và action cũ không có batchId.
 * Chạy: npm run test:agent-batch (cần DATABASE_URL trỏ tới database đã migrate).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/core/database/prisma';
import { createContainer } from '../src/container';
import type { PendingEntity } from '../src/modules/agent/agent.types';

const agentActions = createContainer().services.agent.actions;

let passed = 0;
let failed = 0;

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

/** Mô phỏng một lượt chat: mỗi tool call là một lần gọi prepareAgentActions, chung batchId và danh sách pending. */
async function turn(userId: string, conversationId: string, calls: Array<[string, Record<string, unknown>]>) {
  const batchId = randomUUID();
  const pending: PendingEntity[] = [];
  const actions = [];
  for (const [tool, args] of calls)
    actions.push(
      ...(await agentActions.prepare(userId, conversationId, [{ tool: tool as never, arguments: args }], {
        batchId,
        pending
      }))
    );
  return actions;
}

async function main() {
  const user = await prisma.user.create({
    data: {
      username: `batch_${Date.now().toString(36)}`,
      email: `batch_${Date.now()}@example.com`,
      passwordHash: 'x',
      fullName: 'Kiểm tra nhóm'
    }
  });
  const conversation = await prisma.assistantConversation.create({ data: { userId: user.id, title: 'Kiểm tra nhóm' } });
  const wallet = await prisma.wallet.create({
    data: { userId: user.id, name: 'Ngân hàng', type: 'BANK', currency: 'VND' }
  });
  try {
    await check('Một lượt tạo danh mục cha, danh mục con và khoản chi trong danh mục con', async () => {
      const actions = await turn(user.id, conversation.id, [
        ['CREATE_CATEGORY', { name: 'Dịch vụ', type: 'EXPENSE' }],
        ['CREATE_CATEGORY', { name: 'Đăng ký phần mềm', type: 'EXPENSE', parentName: 'Dịch vụ' }],
        [
          'CREATE_TRANSACTION',
          {
            type: 'EXPENSE',
            amount: 500000,
            walletName: 'Ngân hàng',
            categoryName: 'Đăng ký phần mềm',
            note: 'Mua Claude'
          }
        ]
      ]);
      assert.equal(actions.length, 3);
      assert.equal(new Set(actions.map((item) => item.batchId)).size, 1, 'ba action phải chung một nhóm');
      assert.equal((actions[1]!.preview as Record<string, unknown>).parent, 'Dịch vụ');
      assert.equal((actions[2]!.preview as Record<string, unknown>).category, 'Đăng ký phần mềm');

      const group = await agentActions.execute(user.id, actions[2]!.id);
      assert.deepEqual(
        group.map((item) => item.status),
        ['EXECUTED', 'EXECUTED', 'EXECUTED']
      );
      const parent = await prisma.category.findFirstOrThrow({ where: { userId: user.id, name: 'Dịch vụ' } });
      const child = await prisma.category.findFirstOrThrow({ where: { userId: user.id, name: 'Đăng ký phần mềm' } });
      const transaction = await prisma.transaction.findFirstOrThrow({ where: { userId: user.id, note: 'Mua Claude' } });
      assert.equal(child.parentId, parent.id, 'danh mục con phải trỏ tới danh mục cha vừa tạo');
      assert.equal(transaction.categoryId, child.id, 'khoản chi phải nằm trong danh mục con vừa tạo');
      assert.equal(transaction.walletId, wallet.id);

      const undone = await agentActions.undo(user.id, actions[0]!.id);
      assert.deepEqual(
        undone.map((item) => item.status),
        ['UNDONE', 'UNDONE', 'UNDONE']
      );
      assert.ok(
        (await prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } })).deletedAt,
        'hoàn tác phải xóa mềm khoản chi'
      );
      assert.ok(
        (await prisma.category.findUniqueOrThrow({ where: { id: child.id } })).archivedAt,
        'hoàn tác phải lưu trữ danh mục con'
      );
      assert.ok(
        (await prisma.category.findUniqueOrThrow({ where: { id: parent.id } })).archivedAt,
        'hoàn tác phải lưu trữ danh mục cha'
      );
    });

    await check('Hai khoản chi giống hệt nhau thành hai bản ghi', async () => {
      const args = { type: 'EXPENSE', amount: 30000, walletName: 'Ngân hàng', note: 'Cà phê giống nhau' };
      const actions = await turn(user.id, conversation.id, [
        ['CREATE_TRANSACTION', args],
        ['CREATE_TRANSACTION', args]
      ]);
      await agentActions.execute(user.id, actions[0]!.id);
      assert.equal(
        await prisma.transaction.count({ where: { userId: user.id, note: 'Cà phê giống nhau', deletedAt: null } }),
        2
      );
    });

    await check('Một mục lỗi thì cả nhóm rollback, không để lại nửa chừng', async () => {
      const victim = await prisma.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          type: 'EXPENSE',
          amount: 1000,
          occurredAt: new Date(),
          note: 'Sẽ bị xóa'
        }
      });
      const actions = await turn(user.id, conversation.id, [
        ['CREATE_CATEGORY', { name: 'Không được còn lại', type: 'EXPENSE' }],
        ['UPDATE_TRANSACTION', { transactionId: victim.id, note: 'Sửa' }]
      ]);
      await prisma.transaction.delete({ where: { id: victim.id } });
      await assert.rejects(() => agentActions.execute(user.id, actions[0]!.id));
      assert.equal(
        await prisma.category.count({ where: { userId: user.id, name: 'Không được còn lại' } }),
        0,
        'danh mục không được tạo khi mục khác trong nhóm lỗi'
      );
      const statuses = await prisma.agentAction.findMany({
        where: { id: { in: actions.map((item) => item.id) } },
        select: { status: true }
      });
      assert.ok(
        statuses.every((item) => item.status === 'PENDING'),
        'trạng thái phải quay về PENDING sau rollback'
      );
      await agentActions.cancel(user.id, actions[0]!.id);
    });

    await check('Hủy một mục là hủy cả nhóm', async () => {
      const actions = await turn(user.id, conversation.id, [
        ['CREATE_CATEGORY', { name: 'Hủy A', type: 'EXPENSE' }],
        ['CREATE_CATEGORY', { name: 'Hủy B', type: 'EXPENSE' }]
      ]);
      const group = await agentActions.cancel(user.id, actions[1]!.id);
      assert.deepEqual(
        group.map((item) => item.status),
        ['CANCELLED', 'CANCELLED']
      );
      await assert.rejects(() => agentActions.execute(user.id, actions[0]!.id), /không còn chờ xác nhận/);
    });

    await check('Không cho tạo trùng danh mục trong cùng lượt', async () => {
      await assert.rejects(
        () =>
          turn(user.id, conversation.id, [
            ['CREATE_CATEGORY', { name: 'Trùng', type: 'EXPENSE' }],
            ['CREATE_CATEGORY', { name: 'trùng', type: 'EXPENSE' }]
          ]),
        /đã tồn tại/
      );
    });

    await check('Action cũ không có batchId vẫn xác nhận riêng được', async () => {
      const [action] = await agentActions.prepare(user.id, conversation.id, [
        { tool: 'CREATE_CATEGORY', arguments: { name: 'Không nhóm', type: 'INCOME' } }
      ]);
      assert.equal(action!.batchId, null);
      const group = await agentActions.execute(user.id, action!.id);
      assert.equal(group.length, 1);
      assert.equal(group[0]!.status, 'EXECUTED');
    });
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.category.deleteMany({ where: { userId: user.id, parentId: { not: null } } });
    await prisma.category.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
  console.log(`\nKết quả kiểm tra nhóm thay đổi: ${passed} đạt, ${failed} lỗi.`);
  if (failed) process.exitCode = 1;
}

void main();
