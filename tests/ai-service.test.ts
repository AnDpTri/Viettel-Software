import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import { buildAgentMessages, generateAiAnswer, requestAgentTurn } from '../src/services/ai.service';

const original = {
  AI_PROVIDER: config.AI_PROVIDER,
  DEEPSEEK_API_KEY: config.DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL: config.DEEPSEEK_MODEL,
  AI_REQUEST_TIMEOUT_MS: config.AI_REQUEST_TIMEOUT_MS
};

afterEach(() => {
  Object.assign(config, original);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function deepseekResponse(message: Record<string, unknown>, finishReason = 'stop') {
  return new Response(JSON.stringify({ id: 'chat-test', model: 'deepseek-flash', choices: [{ finish_reason: finishReason, message }] }), { status: 200, headers: { 'Content-Type': 'application/json', 'x-request-id': 'request-test' } });
}

describe('AI provider service', () => {
  it('gọi DeepSeek bằng bearer secret cho câu trả lời thường', async () => {
    const fetchMock = vi.fn().mockResolvedValue(deepseekResponse({ content: 'Dòng tiền của bạn đang dương.' }));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-secret-not-a-real-key', DEEPSEEK_MODEL: 'deepseek-flash' });
    const result = await generateAiAnswer('Tôi đang chi tiêu thế nào?', { overview: { netCashFlow: 1_000_000 } }, []);
    expect(result).toMatchObject({ provider: 'deepseek', model: 'deepseek-flash', answer: 'Dòng tiền của bạn đang dương.' });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-secret-not-a-real-key');
    expect(JSON.parse(options.body).tools).toBeUndefined();
  });

  it('để AI tự chọn trả lời trực tiếp hoặc tool bằng tool_choice auto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(deepseekResponse({ content: 'Mình là trợ lý tài chính Sổ Mộc.', tool_calls: [] }));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-secret-not-a-real-key' });
    const messages = buildAgentMessages([{ role: 'user', content: 'Bạn là ai?' }], { now: new Date().toISOString(), currency: 'VND' });
    const result = await requestAgentTurn(messages);
    expect(result.answer).toContain('Sổ Mộc');
    expect(result.toolCalls).toEqual([]);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.tool_choice).toBe('auto');
    expect(body.response_format).toBeUndefined();
    expect(body.tools.length).toBeGreaterThan(20);
  });

  it('đọc native tool call và giữ nguyên dữ liệu nhạy cảm', async () => {
    const sensitiveNote = 'chi phí sức khỏe tình dục riêng tư';
    const fetchMock = vi.fn().mockResolvedValue(deepseekResponse({ content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'CREATE_TRANSACTION', arguments: JSON.stringify({ type: 'EXPENSE', amount: 500000, walletName: 'Tiền mặt', note: sensitiveNote }) } }] }, 'tool_calls'));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-secret-not-a-real-key' });
    const messages = buildAgentMessages([{ role: 'user', content: `Ghi 500k ${sensitiveNote}` }], { now: new Date().toISOString(), currency: 'VND' });
    const result = await requestAgentTurn(messages);
    expect(result.toolCalls).toEqual([{ id: 'call-1', name: 'CREATE_TRANSACTION', argumentsText: expect.stringContaining(sensitiveNote) }]);
    expect(String(messages[0]?.content)).toContain('Không phán xét');
  });

  it('thử lại nội dung rỗng rồi trả kết quả', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(deepseekResponse({ content: '' }))
      .mockResolvedValueOnce(deepseekResponse({ content: 'Đã ổn.' }));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-secret-not-a-real-key' });
    const result = await requestAgentTurn([{ role: 'user', content: 'Chào' }], false);
    expect(result.answer).toBe('Đã ổn.');
    expect(result.attemptCount).toBe(2);
  });

  it('trả lỗi rõ ràng khi nhà cung cấp lỗi và không ghi khóa ra log', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'never-log-this-test-secret' });
    await expect(generateAiAnswer('Phân tích ngân sách', {}, [])).rejects.toMatchObject({ statusCode: 503, code: 'AI_PROVIDER_UNAVAILABLE' });
    expect(warning).toHaveBeenCalledOnce();
    expect(String(warning.mock.calls[0]?.[0])).not.toContain('never-log-this-test-secret');
  });
});
