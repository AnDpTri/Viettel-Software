import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import { generateAiAnswer } from '../src/services/ai.service';

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

describe('AI provider service', () => {
  it('không gọi mạng ở chế độ local', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(config, { AI_PROVIDER: 'local' });
    await expect(generateAiAnswer('Tình hình chi tiêu?', {}, [])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gọi DeepSeek bằng bearer secret và chỉ trả kết luận', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'deepseek-flash', choices: [{ message: { content: 'Dòng tiền của bạn đang dương.' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-secret-not-a-real-key', DEEPSEEK_MODEL: 'deepseek-flash' });
    const result = await generateAiAnswer('Tôi đang chi tiêu thế nào?', { overview: { netCashFlow: 1_000_000 } }, []);
    expect(result).toMatchObject({ provider: 'deepseek', model: 'deepseek-flash', answer: 'Dòng tiền của bạn đang dương.' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-secret-not-a-real-key');
    const body = JSON.parse(options.body);
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.messages[0].role).toBe('system');
  });

  it('fallback an toàn khi nhà cung cấp lỗi mà không ghi khóa ra log', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'never-log-this-test-secret' });
    await expect(generateAiAnswer('Phân tích ngân sách', {}, [])).resolves.toBeNull();
    expect(warning).toHaveBeenCalledOnce();
    expect(String(warning.mock.calls[0]?.[0])).not.toContain('never-log-this-test-secret');
  });
});
