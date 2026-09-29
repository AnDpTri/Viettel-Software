import type { AgentAction, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../core/errors/app-error';
import type { OnboardingService } from '../onboarding/onboarding.service';
import type { AgentActionRepository } from './agent-action.repository';
import type { AgentProposal, AgentToolName, PendingEntity } from './agent.types';
import { applyAgentAction, type Refs } from './tools/apply-action';
import { IMMEDIATE_TOOLS } from './tools/immediate-tools';
import { READ_TOOLS, type ToolResult } from './tools/read-tools';
import { applyAgentUndo } from './tools/undo-action';
import { WRITE_TOOLS, type PreparedAction } from './tools/write-tools';

/** Bản xem trước hết hạn sau 30 phút. */
const PREVIEW_TTL_MS = 30 * 60_000;

export const READ_AGENT_TOOLS = new Set(Object.keys(READ_TOOLS) as AgentToolName[]);
export const IMMEDIATE_AGENT_TOOLS = new Set(Object.keys(IMMEDIATE_TOOLS) as AgentToolName[]);

const notPending = () => new AppError(409, 'ACTION_NOT_PENDING', 'Hành động này không còn chờ xác nhận.');

export function publicAgentAction(action: AgentAction) {
  return {
    id: action.id,
    batchId: action.batchId,
    type: action.type,
    risk: action.risk,
    status: action.status,
    preview: action.preview,
    result: action.result,
    expiresAt: action.expiresAt,
    executedAt: action.executedAt,
    createdAt: action.createdAt
  };
}

/** Thực thi tool của Agent: tool đọc và tool chạy ngay trả kết quả tức thì; tool ghi chỉ tạo bản xem trước, được áp
 * dụng khi người dùng xác nhận cả nhóm và có thể hoàn tác. */
export class AgentActionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly actions: AgentActionRepository,
    private readonly onboarding: Pick<OnboardingService, 'status'>
  ) {}

  /** Tạo bản xem trước cho các tool ghi. Mọi action của cùng một lượt chat mang chung `batchId` để người dùng xác nhận,
   * hủy hoặc hoàn tác cả nhóm một lần. `pending` là danh sách ví/danh mục đang chờ trong lượt này: tool đọc nó để tham
   * chiếu bản ghi mà tool trước vừa đề xuất, và THÊM vào nó các ví/danh mục mới mà chính nó đề xuất. */
  async prepare(
    userId: string,
    conversationId: string,
    proposals: AgentProposal[],
    options: { batchId?: string | null; pending?: PendingEntity[] } = {}
  ) {
    const pending = options.pending ?? [];
    const { currency } = await this.actions.userCurrency(userId);
    const prepared: PreparedAction[] = [];
    const push = (item: Omit<PreparedAction, 'id'>, id: string = randomUUID()) => {
      prepared.push({ id, ...item });
      return id;
    };
    for (const proposal of proposals) {
      const tool = WRITE_TOOLS[proposal.tool];
      if (!tool) continue;
      await tool({ db: this.db, userId, args: proposal.arguments, tool: proposal.tool, pending, currency, push });
    }
    return this.actions.createPending(
      userId,
      conversationId,
      options.batchId ?? null,
      prepared,
      new Date(Date.now() + PREVIEW_TTL_MS)
    );
  }

  async runReadTools(userId: string, proposals: AgentProposal[]) {
    const results: ToolResult[] = [];
    for (const proposal of proposals) {
      const tool = READ_TOOLS[proposal.tool];
      if (!tool) continue;
      results.push(
        await tool({ db: this.db, onboarding: this.onboarding, userId, args: proposal.arguments, tool: proposal.tool })
      );
    }
    return results;
  }

  async runImmediateTool(userId: string, conversationId: string, proposal: AgentProposal) {
    const tool = IMMEDIATE_TOOLS[proposal.tool];
    if (!tool) throw new AppError(422, 'UNSUPPORTED_AGENT_TOOL', 'Công cụ này chưa được hỗ trợ.');
    return tool({ db: this.db, userId, conversationId, args: proposal.arguments, tool: proposal.tool });
  }

  /** Xác nhận cả nhóm: thực thi mọi action đang chờ theo đúng thứ tự tạo, trong MỘT transaction. Một action lỗi thì
   * toàn bộ nhóm rollback, không để lại nửa chừng (ví dụ đã tạo danh mục nhưng chưa ghi khoản chi vào đó). */
  async execute(userId: string, actionId: string) {
    const group = await this.actions.group(userId, actionId);
    const pending = group.filter((item) => item.status === 'PENDING');
    if (!pending.length) throw notPending();
    if (pending.some((item) => item.expiresAt < new Date())) {
      await this.actions.markExpired(pending.map((item) => item.id));
      throw new AppError(410, 'ACTION_EXPIRED', 'Bản xem trước đã hết hạn.');
    }
    return this.actions.transaction(async (tx) => {
      const refs: Refs = new Map();
      for (const action of pending) {
        if (!(await this.actions.claim(tx, action.id))) throw notPending();
        const { entity, undo, created = [] } = await applyAgentAction(tx, userId, action, refs);
        for (const [key, value] of created) refs.set(key, value);
        await this.actions.recordExecution(
          tx,
          action.id,
          { entityId: entity.id, entityType: action.type.toLowerCase() },
          undo
        );
      }
      return this.actions.group(userId, actionId, tx);
    });
  }

  async cancel(userId: string, actionId: string) {
    const group = await this.actions.group(userId, actionId);
    const result = await this.actions.cancelPending(
      userId,
      group.map((item) => item.id)
    );
    if (!result.count) throw notPending();
    return this.actions.group(userId, actionId);
  }

  /** Hoàn tác cả nhóm theo thứ tự NGƯỢC với lúc tạo (khoản chi trước, rồi danh mục con, rồi danh mục cha). */
  undo(userId: string, actionId: string) {
    return this.actions.transaction(async (tx) => {
      const group = await this.actions.group(userId, actionId, tx);
      const executed = group.filter((item) => item.status === 'EXECUTED' && item.undoData);
      if (!executed.length) throw new AppError(409, 'ACTION_NOT_UNDOABLE', 'Hành động này không thể hoàn tác.');
      for (const action of [...executed].reverse()) {
        await applyAgentUndo(tx, userId, action);
        await this.actions.markUndone(tx, action.id);
      }
      return this.actions.group(userId, actionId, tx);
    });
  }
}
