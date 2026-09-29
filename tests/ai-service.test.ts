import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/core/observability/logger';
import { config } from '../src/core/config/env';
import {
  AGENT_TOOL_NAMES,
  buildAgentMessages,
  claimsDownloadLink,
  claimsPendingPreview,
  containsStaleOnboardingClaim,
  containsUnexpectedChinese,
  generateAiAnswer,
  requestAgentTurn
} from '../src/services/ai.service';

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
  return new Response(
    JSON.stringify({ id: 'chat-test', model: 'deepseek-flash', choices: [{ finish_reason: finishReason, message }] }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'x-request-id': 'request-test' } }
  );
}

describe('AI provider service', () => {
  it('phát hiện câu trả lời bị chuyển sang tiếng Trung', () => {
    expect(containsUnexpectedChinese('好，备份已拿到手，我们继续。')).toBe(true);
    expect(containsUnexpectedChinese('Bản sao lưu đã sẵn sàng, bạn có thể tiếp tục.')).toBe(false);
  });

  it('gọi DeepSeek bằng bearer secret cho câu trả lời thường', async () => {
    const fetchMock = vi.fn().mockResolvedValue(deepseekResponse({ content: 'Dòng tiền của bạn đang dương.' }));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(config, {
      AI_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'test-secret-not-a-real-key',
      DEEPSEEK_MODEL: 'deepseek-flash'
    });
    const result = await generateAiAnswer('Tôi đang chi tiêu thế nào?', { overview: { netCashFlow: 1_000_000 } }, []);
    expect(result).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-flash',
      answer: 'Dòng tiền của bạn đang dương.'
    });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-secret-not-a-real-key');
    expect(JSON.parse(options.body).tools).toBeUndefined();
  });

  it('để AI tự chọn trả lời trực tiếp hoặc tool bằng tool_choice auto', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(deepseekResponse({ content: 'Mình là trợ lý tài chính Sổ Mộc.', tool_calls: [] }));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-secret-not-a-real-key' });
    const messages = buildAgentMessages([{ role: 'user', content: 'Bạn là ai?' }], {
      now: new Date().toISOString(),
      currency: 'VND'
    });
    const result = await requestAgentTurn(messages);
    expect(result.answer).toContain('Sổ Mộc');
    expect(result.toolCalls).toEqual([]);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.tool_choice).toBe('auto');
    expect(body.response_format).toBeUndefined();
    expect(body.tools.length).toBeGreaterThan(20);
    expect(String(messages[0]?.content)).toContain('LUÔN trả lời bằng tiếng Việt');
  });

  it('đọc native tool call và giữ nguyên dữ liệu nhạy cảm', async () => {
    const sensitiveNote = 'chi phí sức khỏe tình dục riêng tư';
    const fetchMock = vi.fn().mockResolvedValue(
      deepseekResponse(
        {
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'CREATE_TRANSACTION',
                arguments: JSON.stringify({
                  type: 'EXPENSE',
                  amount: 500000,
                  walletName: 'Tiền mặt',
                  note: sensitiveNote
                })
              }
            }
          ]
        },
        'tool_calls'
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-secret-not-a-real-key' });
    const messages = buildAgentMessages([{ role: 'user', content: `Ghi 500k ${sensitiveNote}` }], {
      now: new Date().toISOString(),
      currency: 'VND'
    });
    const result = await requestAgentTurn(messages);
    expect(result.toolCalls).toEqual([
      { id: 'call-1', name: 'CREATE_TRANSACTION', argumentsText: expect.stringContaining(sensitiveNote) }
    ]);
    expect(String(messages[0]?.content)).toContain('Không phán xét');
  });

  it('thử lại nội dung rỗng rồi trả kết quả', async () => {
    const fetchMock = vi
      .fn()
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
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    Object.assign(config, { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'never-log-this-test-secret' });
    await expect(generateAiAnswer('Phân tích ngân sách', {}, [])).rejects.toMatchObject({
      statusCode: 503,
      code: 'AI_PROVIDER_UNAVAILABLE'
    });
    expect(warning).toHaveBeenCalledOnce();
    expect(JSON.stringify(warning.mock.calls[0])).not.toContain('never-log-this-test-secret');
  });

  it('gửi ngữ cảnh màn hình và tiến độ hướng dẫn để Agent chỉ dẫn đúng bước', async () => {
    const messages = buildAgentMessages([{ role: 'user', content: 'Tôi nên làm gì tiếp?' }], {
      now: new Date().toISOString(),
      currency: 'VND',
      currentView: 'wallets',
      onboarding: {
        completed: false,
        completedCount: 1,
        totalSteps: 4,
        nextStep: { id: 'wallet', title: 'Tạo ví đầu tiên' }
      }
    });
    const system = String(messages[0]?.content);
    expect(system).toContain('GET_ONBOARDING_STATUS');
    expect(system).toContain('Không tự tạo dữ liệu mẫu');
    const allText = messages.map((item) => String(item.content)).join('\n');
    expect(allText).toContain('"currentView":"Ví của tôi"');
    expect(allText).not.toContain('"currentView":"wallets"');
    expect(allText).toContain('Tạo ví đầu tiên');
    const toolResult = messages.find((item) => item.role === 'tool');
    expect(toolResult).toBeDefined();
    expect(String(toolResult?.content)).toContain('GET_ONBOARDING_STATUS');
    expect(messages.at(-1)?.content).toBe('Tôi nên làm gì tiếp?');
    expect(messages.at(-1)?.role).toBe('user');
    expect(AGENT_TOOL_NAMES).toHaveLength(39);
    expect(AGENT_TOOL_NAMES).toContain('CREATE_STARTER_CATEGORIES');
  });

  it('chèn kết quả GET_ONBOARDING_STATUS giả lập ngay trước câu hỏi mới nhất, để được ưu tiên hơn câu trả lời cũ', () => {
    const messages = buildAgentMessages(
      [
        { role: 'user', content: 'câu hỏi cũ' },
        { role: 'assistant', content: 'Bạn chỉ còn thiếu bước ghi giao dịch đầu tiên.' },
        { role: 'user', content: 'câu hỏi mới nhất' }
      ],
      {
        now: new Date().toISOString(),
        currency: 'VND',
        onboarding: { completed: true, completedCount: 4, totalSteps: 4, nextStep: null }
      }
    );
    expect(messages).toHaveLength(7);
    expect(messages[1]?.content).toBe('câu hỏi cũ');
    expect(messages[2]?.content).toBe('Bạn chỉ còn thiếu bước ghi giao dịch đầu tiên.');
    expect(messages[3]?.role).toBe('system');
    expect(messages[4]?.role).toBe('assistant');
    expect(messages[4]?.tool_calls?.[0]?.function.name).toBe('GET_ONBOARDING_STATUS');
    expect(messages[5]?.role).toBe('tool');
    expect(messages[6]?.role).toBe('user');
    expect(messages[6]?.content).toBe('câu hỏi mới nhất');
  });

  it('không chèn tool giả lập khi đã thiết lập xong và hội thoại chưa từng nói về thiết lập', () => {
    const messages = buildAgentMessages(
      [
        { role: 'user', content: 'sao lưu dữ liệu giúp tôi' },
        { role: 'assistant', content: 'Mình đã chuẩn bị liên kết tải.' },
        { role: 'user', content: 'đâu cơ' }
      ],
      {
        now: new Date().toISOString(),
        currency: 'VND',
        onboarding: { completed: true, completedCount: 4, totalSteps: 4, nextStep: null }
      }
    );
    expect(messages.some((item) => item.role === 'tool')).toBe(false);
  });

  it('không gửi màn Trợ lý thông minh làm ngữ cảnh vì khung chat luôn nằm ở đó', () => {
    const insights = buildAgentMessages([{ role: 'user', content: 'chào bạn' }], {
      now: new Date().toISOString(),
      currency: 'VND',
      currentView: 'insights'
    });
    expect(String(insights[1]?.content)).toContain('"currentView":null');
    const budgets = buildAgentMessages([{ role: 'user', content: 'chào bạn' }], {
      now: new Date().toISOString(),
      currency: 'VND',
      currentView: 'budgets'
    });
    expect(String(budgets[1]?.content)).toContain('"currentView":"Kế hoạch › Ngân sách"');
  });

  it('phát hiện câu trả lời khẳng định đã có liên kết tải', () => {
    expect(claimsDownloadLink('Bản sao dữ liệu của bạn đã sẵn sàng:')).toBe(true);
    expect(claimsDownloadLink('- **Tải bản sao dữ liệu JSON** — tệp so-moc-backup.json')).toBe(true);
    expect(claimsDownloadLink('Mình đã chuẩn bị liên kết tải CSV.')).toBe(true);
    expect(claimsDownloadLink('Bạn có thể sao lưu dữ liệu trước khi xóa.')).toBe(false);
    expect(claimsDownloadLink('Mình có thể xuất CSV giao dịch cho bạn.')).toBe(false);
    expect(
      claimsDownloadLink(
        'Được, mình chuẩn bị liên kết tải bản sao dữ liệu cho bạn nhé. Bấm vào nút tải xuất hiện ngay bên dưới để lấy file.'
      )
    ).toBe(true);
    expect(claimsDownloadLink('Tháng này bạn chi 1.610.000đ.')).toBe(false);
  });

  it('không chèn tool giả lập khi chưa có dữ liệu onboarding', () => {
    const messages = buildAgentMessages([{ role: 'user', content: 'hỏi' }], {
      now: new Date().toISOString(),
      currency: 'VND'
    });
    expect(messages.some((item) => item.role === 'tool')).toBe(false);
  });

  it('giữ nguyên system prompt tĩnh dù thời gian trong ngữ cảnh thay đổi, để tận dụng cache theo prefix', () => {
    const a = buildAgentMessages([{ role: 'user', content: 'hỏi' }], {
      now: '2026-01-01T00:00:00.000Z',
      currency: 'VND'
    });
    const b = buildAgentMessages([{ role: 'user', content: 'hỏi' }], {
      now: '2026-06-15T12:30:00.000Z',
      currency: 'VND'
    });
    expect(a[0]?.content).toBe(b[0]?.content);
    expect(a[1]?.content).not.toBe(b[1]?.content);
  });

  it('phát hiện câu trả lời khẳng định đã có bản xem trước', () => {
    expect(claimsPendingPreview('Đây là bản xem trước:\n- Cà phê 30.000đ')).toBe(true);
    expect(claimsPendingPreview('Mình đã tạo bản xem trước khoản chi 500k.')).toBe(true);
    expect(claimsPendingPreview('Bạn bấm xác nhận để mình lưu cả 3 khoản nhé.')).toBe(true);
    expect(claimsPendingPreview('Mọi thay đổi mình sẽ tạo bản xem trước để bạn xác nhận.')).toBe(false);
    expect(claimsPendingPreview('Tháng này bạn chi 2.000.000đ.')).toBe(false);
  });

  it('phát hiện Agent vẫn nhắc thiết lập chưa xong dù trạng thái thực tế đã hoàn thành', () => {
    expect(containsStaleOnboardingClaim('Bạn chỉ còn thiếu ghi giao dịch đầu tiên thôi.')).toBe(true);
    expect(containsStaleOnboardingClaim('Bạn chưa có giao dịch nào, hãy ghi một khoản chi nhé.')).toBe(true);
    expect(containsStaleOnboardingClaim('Bạn còn thiếu 2 bước nữa để hoàn tất thiết lập.')).toBe(true);
    expect(containsStaleOnboardingClaim('Tháng này bạn chi 500.000đ, thu 2.000.000đ.')).toBe(false);
    expect(containsStaleOnboardingClaim('Giao dịch đầu tiên của bạn trong tháng là 50.000đ tiền ăn sáng.')).toBe(false);
  });
});
