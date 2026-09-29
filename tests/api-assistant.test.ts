import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Bật "nhà cung cấp AI" bằng khóa giả trước khi config được nạp; mọi lời gọi DeepSeek đi qua fetch giả bên dưới.
vi.hoisted(() => {
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  process.env.AI_RATE_LIMIT_PER_MINUTE = '1000';
});

import { analyzeReceiptImage, generateAiAnswer } from '../src/services/ai.service';
import { prisma, registerUser, seedBasics, type TestUser } from './helpers/api';

type Scripted = Record<string, unknown> | Response;
let queue: Scripted[] = [];
const requests: Array<{ messages: Array<{ role: string; content: unknown }>; tools?: unknown }> = [];

const reply = (content: string, finish = 'stop') => ({ model: 'deepseek-test', choices: [{ message: { content }, finish_reason: finish }] });
let callSeq = 0;
const call = (name: string, args: unknown) => ({ id: `call_${callSeq += 1}`, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
const tools = (...calls: unknown[]) => ({ model: 'deepseek-test', choices: [{ message: { content: '', tool_calls: calls }, finish_reason: 'tool_calls' }] });

let user: TestUser;

beforeAll(async () => {
  user = await registerUser();
  await seedBasics(user);
  await user.api.put('/insights/settings').send({ consent: true });
});

beforeEach(() => {
  queue = [];
  requests.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    requests.push(JSON.parse(init.body));
    const next = queue.shift();
    if (!next) throw new Error('Hết phản hồi giả lập');
    return next instanceof Response ? next : new Response(JSON.stringify(next), { headers: { 'x-request-id': 'req-test' } });
  }));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ask = (question: string, extra: Record<string, unknown> = {}) => user.api.post('/insights/assistant').send({ question, ...extra });

describe('Agent: vòng lặp gọi mô hình và công cụ', () => {
  it('trả lời trò chuyện thường và lưu hội thoại', async () => {
    queue.push(reply('Chào bạn, mình giúp gì được?'));
    const response = await ask('Xin chào', { uiContext: { currentView: 'budgets' } });
    expect(response.body.data).toMatchObject({ answer: 'Chào bạn, mình giúp gì được?', intent: 'GENERAL', provider: 'deepseek', model: 'deepseek-test' });
    expect(JSON.stringify(requests[0]!.messages)).toContain('Kế hoạch › Ngân sách');
    const messages = await prisma.assistantMessage.findMany({ where: { conversationId: response.body.data.conversationId } });
    expect(messages.map((item) => item.status)).toEqual(['COMPLETED', 'COMPLETED']);
    queue.push(reply('Vẫn là mình.'));
    expect((await ask('Còn đó không?', { conversationId: response.body.data.conversationId })).body.data.answer).toBe('Vẫn là mình.');
  });

  it('gọi công cụ đọc rồi trả lời, kèm nút điều hướng', async () => {
    queue.push(tools(call('LIST_WALLETS', {}), call('LIST_WALLETS', {})), reply('Bạn có 2 ví.'));
    const data = (await ask('Tôi có mấy ví?')).body.data;
    expect(data).toMatchObject({ intent: 'TOOL', answer: 'Bạn có 2 ví.' });
    expect(data.toolResults).toHaveLength(1);
    expect(data.uiActions[0]).toMatchObject({ view: 'wallets' });
  });

  it('công cụ ghi tạo bản xem trước chờ xác nhận; lỗi tham số được trả lại cho mô hình', async () => {
    queue.push(
      tools(call('CREATE_TRANSACTION', { type: 'EXPENSE', amount: 50_000, walletName: 'Tiền mặt', categoryName: 'Ăn uống' }), call('CREATE_TRANSACTION', '{hỏng'), call('CREATE_TRANSACTION', '[]'), call('CREATE_TRANSACTION', { type: 'EXPENSE', amount: -1 }), call('SAVE_MEMORY', { content: 'Hay ăn trưa ở quán' }), call('EXPORT_DATA_BACKUP', {})),
      reply('Mình đã chuẩn bị bản xem trước khoản chi 50.000đ, bạn bấm xác nhận để lưu. Link tải bản sao dữ liệu ở bên dưới.')
    );
    const data = (await ask('Ghi ăn trưa 50k')).body.data;
    expect(data.intent).toBe('ACTION');
    expect(data.actions).toHaveLength(1);
    expect(data.uiActions).toEqual([]);
    expect(data.attachments[0].filename).toBe('so-moc-backup.json');
    const toolMessages = (requests[1]!.messages as Array<{ role: string; content: unknown; tool_call_id?: string }>).filter((item) => item.role === 'tool' && item.tool_call_id?.startsWith('call_')).map((item) => JSON.parse(String(item.content)));
    expect(toolMessages.map((item) => item.ok)).toEqual([true, false, false, false, true, true]);
    expect(toolMessages[3].error.code).toBe('TOOL_VALIDATION_ERROR');
  });

  it('nhắc mô hình gọi công cụ thật khi nó khẳng định đã có bản xem trước hoặc liên kết tải', async () => {
    queue.push(reply('Đây là bản xem trước, bấm xác nhận để lưu.'), tools(call('CREATE_GOAL', { name: 'Xe', targetAmount: 1_000_000 })), reply('Mình đã tạo bản xem trước mục tiêu, bấm xác nhận để lưu.'));
    expect((await ask('Tạo mục tiêu mua xe')).body.data.actions).toHaveLength(1);
    queue.push(reply('Đây là nút tải về bản sao dữ liệu.'), tools(call('EXPORT_DATA_BACKUP', {})), reply('Nút tải ở bên dưới.'));
    expect((await ask('Cho tôi bản sao dữ liệu')).body.data.attachments).toHaveLength(1);
  });

  it('báo lỗi khi mô hình vẫn khẳng định sai sau khi được nhắc; gửi lại tin nhắn lỗi', async () => {
    queue.push(reply('Đây là bản xem trước, bấm xác nhận để lưu.'), reply('Đã tạo bản xem trước rồi, bấm xác nhận để lưu.'));
    const failed = await ask('Ghi giúp khoản chi');
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('AGENT_PREVIEW_MISSING');
    const { conversationId, messageId } = failed.body.error.details;
    expect((await prisma.assistantMessage.findUniqueOrThrow({ where: { id: messageId } })).status).toBe('FAILED');
    queue.push(reply('Bạn muốn ghi khoản nào?'));
    const retried = await ask('Ghi giúp khoản chi', { conversationId, retryMessageId: messageId });
    expect(retried.body.data.answer).toBe('Bạn muốn ghi khoản nào?');
    expect((await ask('x', { conversationId, retryMessageId: messageId })).body.error.code).toBe('MESSAGE_NOT_RETRYABLE');
    queue.push(reply('Đây là nút tải về.'), reply('Nút tải về ở trên.'));
    expect((await ask('Tải dữ liệu')).body.error.code).toBe('AGENT_ATTACHMENT_MISSING');
  });

  it('viết lại câu trả lời lẫn tiếng Trung và câu nhắc thiết lập đã lỗi thời', async () => {
    await user.api.post('/transactions').send({ walletId: (await user.api.get('/wallets')).body.data[0].id, type: 'EXPENSE', amount: 1, occurredAt: '2026-09-01' });
    queue.push(reply('这是一个中文回答内容'), reply('Đây là câu trả lời tiếng Việt.'));
    expect((await ask('Tóm tắt giúp')).body.data.answer).toBe('Đây là câu trả lời tiếng Việt.');
    queue.push(reply('这是一个中文回答内容'), reply('还是中文回答内容'));
    expect((await ask('Tóm tắt lại')).body.error.code).toBe('AI_LANGUAGE_MISMATCH');
    queue.push(reply('Bạn còn thiếu giao dịch đầu tiên đó.'), reply('Tháng này bạn chi ổn.'));
    expect((await ask('Tháng này thế nào?')).body.data.answer).toBe('Tháng này bạn chi ổn.');
  });

  it('giới hạn số vòng và số lời gọi công cụ; tóm tắt khi hết vòng mà đã có bản xem trước', async () => {
    for (let round = 0; round < 6; round += 1) queue.push(tools(call('LIST_WALLETS', {})));
    expect((await ask('Lặp mãi')).body.error.code).toBe('AGENT_LOOP_LIMIT');
    queue.push(tools(call('CREATE_GOAL', { name: 'Lặp', targetAmount: 1 })));
    for (let round = 0; round < 5; round += 1) queue.push(tools(call('LIST_WALLETS', {})));
    queue.push(reply('Nhóm gồm một mục tiêu, bạn bấm xác nhận nhé.'));
    const summarized = (await ask('Tạo mục tiêu')).body.data;
    expect(summarized.actions).toHaveLength(1);
    const many = () => tools(...Array.from({ length: 10 }, () => call('LIST_CATEGORIES', {})));
    queue.push(many(), many(), many());
    expect((await ask('Gọi thật nhiều')).body.error.code).toBe('AGENT_TOOL_LIMIT');
    const failedActions = await prisma.agentAction.count({ where: { userId: user.id, status: 'FAILED' } });
    expect(failedActions).toBe(0);
  });

  it('lỗi nhà cung cấp: HTTP lỗi, phản hồi rỗng, bị cắt ngắn', async () => {
    queue.push(new Response('{}', { status: 500 }), new Response('{}', { status: 500 }));
    expect((await ask('Lỗi mạng')).body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
    queue.push(reply(''), reply(''));
    expect((await ask('Rỗng')).body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
    queue.push(reply('Cắt', 'length'));
    expect((await ask('Dài quá')).body.error.code).toBe('AI_RESPONSE_TRUNCATED');
  });

  it('chặn khi chưa đồng ý dùng AI, hết lượt trong ngày hoặc sai hội thoại', async () => {
    const stranger = await registerUser();
    expect((await stranger.api.post('/insights/assistant').send({ question: 'Hi' })).body.error.code).toBe('AI_CONSENT_REQUIRED');
    expect((await ask('x', { conversationId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    const heavy = await registerUser();
    await heavy.api.put('/insights/settings').send({ consent: true });
    await prisma.auditLog.createMany({ data: Array.from({ length: 30 }, () => ({ userId: heavy.id, action: 'AI_AGENT_REQUEST' })) });
    expect((await heavy.api.post('/insights/assistant').send({ question: 'Hi' })).body.error.code).toBe('AI_DAILY_LIMIT_REACHED');
  });
});

describe('Đọc ảnh hóa đơn bằng AI', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('trả dữ liệu đọc được, báo lỗi khi thiếu ảnh hoặc AI không đọc được', async () => {
    queue.push(reply('```json\n{"merchant":"WinMart","amount":88000,"occurredAt":"2026-09-12","currency":"VND","items":[],"confidence":0.9}\n```'));
    const ok = await user.api.post('/insights/extract-receipt-image').attach('receipt', PNG, { filename: 'hd.png', contentType: 'image/png' });
    expect(ok.body.data).toMatchObject({ merchant: 'WinMart', amount: 88000, requiresConfirmation: true });
    expect((await user.api.post('/insights/extract-receipt-image')).body.error.code).toBe('IMAGE_REQUIRED');
    queue.push(new Response('{}', { status: 500 }));
    expect((await user.api.post('/insights/extract-receipt-image').attach('receipt', PNG, { filename: 'hd.png', contentType: 'image/png' })).body.error.code).toBe('AI_OCR_UNAVAILABLE');
    const noConsent = await registerUser();
    expect((await noConsent.api.post('/insights/extract-receipt-image').attach('receipt', PNG, { filename: 'hd.png', contentType: 'image/png' })).body.error.code).toBe('AI_CONSENT_REQUIRED');
  });

  it('dịch vụ AI dùng trực tiếp: trả lời một lượt và ảnh không có nội dung', async () => {
    queue.push(reply('Câu trả lời'));
    expect((await generateAiAnswer('Hỏi', { a: 1 }, [])).answer).toBe('Câu trả lời');
    queue.push({ choices: [{ message: {} }] });
    expect(await analyzeReceiptImage(PNG, 'image/png')).toBeNull();
  });
});
