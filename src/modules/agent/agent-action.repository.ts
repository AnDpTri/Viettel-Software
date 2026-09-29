import type { Prisma, PrismaClient } from '@prisma/client';
import { notFound } from '../../core/errors/app-error';
import type { PreparedAction } from './tools/write-tools';

type Client = PrismaClient | Prisma.TransactionClient;

/** Lưu trữ AgentAction: thay đổi Agent đề xuất, chờ người dùng xác nhận, hủy hoặc hoàn tác theo nhóm. */
export class AgentActionRepository {
  constructor(private readonly db: PrismaClient) {}

  userCurrency(userId: string) {
    return this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });
  }

  /** Lưu các action PENDING. Ghi createdAt tăng dần tường minh: các lệnh trong cùng transaction có CURRENT_TIMESTAMP
   * giống hệt nhau, mà thứ tự tạo chính là thứ tự thực thi của nhóm (danh mục cha phải được tạo trước danh mục con và
   * khoản chi tham chiếu nó). */
  createPending(
    userId: string,
    conversationId: string,
    batchId: string | null,
    prepared: PreparedAction[],
    expiresAt: Date
  ) {
    const startedAt = Date.now();
    return this.db.$transaction(
      prepared.map((item, index) =>
        this.db.agentAction.create({
          data: {
            id: item.id,
            userId,
            conversationId,
            batchId,
            type: item.type,
            risk: item.risk ?? 'NORMAL',
            payload: item.payload as Prisma.InputJsonValue,
            preview: item.preview as Prisma.InputJsonValue,
            expiresAt,
            createdAt: new Date(startedAt + index)
          }
        })
      )
    );
  }

  /** Mọi action cùng nhóm với `actionId` (action cũ không có batchId được coi là nhóm một phần tử), theo thứ tự tạo. */
  async group(userId: string, actionId: string, client: Client = this.db) {
    const anchor = await client.agentAction.findFirst({ where: { id: actionId, userId } });
    if (!anchor) throw notFound('Hành động');
    if (!anchor.batchId) return [anchor];
    return client.agentAction.findMany({
      where: { userId, batchId: anchor.batchId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
  }

  markExpired(ids: string[]) {
    return this.db.agentAction.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'EXPIRED' }
    });
  }

  cancelPending(userId: string, ids: string[]) {
    return this.db.agentAction.updateMany({
      where: { id: { in: ids }, userId, status: 'PENDING' },
      data: { status: 'CANCELLED' }
    });
  }

  /** Chiếm action bằng cập nhật có điều kiện để hai lần bấm xác nhận đồng thời không thực thi hai lần. */
  async claim(tx: Prisma.TransactionClient, id: string) {
    const claimed = await tx.agentAction.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXECUTED' } });
    return claimed.count === 1;
  }

  recordExecution(tx: Prisma.TransactionClient, id: string, result: Prisma.InputJsonValue, undoData: unknown) {
    return tx.agentAction.update({
      where: { id },
      data: { executedAt: new Date(), result, undoData: undoData as Prisma.InputJsonValue }
    });
  }

  markUndone(tx: Prisma.TransactionClient, id: string) {
    return tx.agentAction.update({ where: { id }, data: { status: 'UNDONE' } });
  }

  transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(work, { timeout: 30_000 });
  }
}
