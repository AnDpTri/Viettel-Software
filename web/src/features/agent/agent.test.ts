import { describe, expect, it } from 'vitest';
import type { AgentAction, AgentMessage } from '../../api/types';
import { buildTimeline } from './AgentView';

function makeMessage(id: string, role: 'user' | 'assistant', createdAt: string): AgentMessage {
  return {
    id,
    role,
    content: `Content ${id}`,
    provider: 'deepseek',
    model: 'chat',
    status: 'completed',
    errorCode: null,
    createdAt
  };
}

function makeAction(id: string, createdAt: string, status: AgentAction['status'] = 'PENDING'): AgentAction {
  return {
    id,
    batchId: null,
    type: 'CREATE_TRANSACTION',
    risk: 'LOW',
    status,
    preview: { amount: 50000 },
    createdAt
  };
}

describe('Trợ lý tài chính - buildTimeline', () => {
  it('trả về mảng rỗng khi không có tin nhắn và hành động nào', () => {
    expect(buildTimeline([], [])).toEqual([]);
  });

  it('giữ nguyên thứ tự tin nhắn khi không có hành động đề xuất', () => {
    const messages = [
      makeMessage('m1', 'user', '2026-10-21T10:00:00Z'),
      makeMessage('m2', 'assistant', '2026-10-21T10:00:05Z')
    ];
    const timeline = buildTimeline(messages, []);
    expect(timeline).toEqual([
      { kind: 'message', message: messages[0] },
      { kind: 'message', message: messages[1] }
    ]);
  });

  it('đặt nhóm hành động ngay sau câu trả lời của lượt tương ứng', () => {
    const userMsg = makeMessage('m1', 'user', '2026-10-21T10:00:00Z');
    const botMsg = makeMessage('m2', 'assistant', '2026-10-21T10:00:05Z');
    const action = makeAction('a1', '2026-10-21T10:00:03Z');

    const timeline = buildTimeline([userMsg, botMsg], [action]);
    expect(timeline).toHaveLength(3);
    expect(timeline[0]).toEqual({ kind: 'message', message: userMsg });
    expect(timeline[1]).toEqual({ kind: 'message', message: botMsg });
    expect(timeline[2]).toEqual({
      kind: 'actions',
      key: 'a1',
      items: [action]
    });
  });

  it('đưa hành động chưa gắn với câu trả lời nào xuống cuối dòng thời gian', () => {
    const userMsg = makeMessage('m1', 'user', '2026-10-21T10:00:00Z');
    const pendingAction = makeAction('a1', '2026-10-21T10:00:05Z');

    const timeline = buildTimeline([userMsg], [pendingAction]);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toEqual({ kind: 'message', message: userMsg });
    expect(timeline[1]).toEqual({
      kind: 'actions',
      key: 'a1',
      items: [pendingAction]
    });
  });

  it('xử lý đúng nhiều lượt đối thoại và nhóm hành động theo từng lượt', () => {
    const m1 = makeMessage('m1', 'user', '2026-10-21T10:00:00Z');
    const m2 = makeMessage('m2', 'assistant', '2026-10-21T10:00:05Z');
    const a1 = makeAction('a1', '2026-10-21T10:00:02Z');

    const m3 = makeMessage('m3', 'user', '2026-10-21T10:01:00Z');
    const m4 = makeMessage('m4', 'assistant', '2026-10-21T10:01:06Z');
    const a2 = makeAction('a2', '2026-10-21T10:01:03Z');

    const timeline = buildTimeline([m1, m2, m3, m4], [a1, a2]);
    expect(
      timeline.map((item) => (item.kind === 'message' ? item.message.id : item.kind === 'actions' ? item.key : ''))
    ).toEqual(['m1', 'm2', 'a1', 'm3', 'm4', 'a2']);
  });
});
