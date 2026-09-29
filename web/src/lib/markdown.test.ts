import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMarkdownInline, streamAgentText } from './markdown';

describe('renderMarkdown', () => {
  it('hiển thị tiêu đề, danh sách, chữ đậm, code và bảng', () => {
    const html = renderMarkdown(
      '## Tổng quan\n\n- **Thu:** 1.000đ\n- `Chi`: 500đ\n\n| Mục | Số tiền |\n|---|---:|\n| Ăn uống | 500đ |'
    );
    expect(html).toContain('<h4>Tổng quan</h4>');
    expect(html).toContain('<ul><li><strong>Thu:</strong> 1.000đ</li><li><code>Chi</code>: 500đ</li></ul>');
    expect(html).toContain('<th>Mục</th>');
    expect(html).toContain('<td>Ăn uống</td>');
  });

  it('thoát mọi thẻ HTML người dùng hoặc mô hình chèn vào', () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('chỉ nhận liên kết http(s) hoặc đường dẫn nội bộ', () => {
    expect(renderMarkdownInline('[Báo cáo](/reports)')).toBe('<a href="/reports">Báo cáo</a>');
    expect(renderMarkdownInline('[Web](https://example.com)')).toContain('target="_blank" rel="noopener noreferrer"');
    expect(renderMarkdownInline('[x](javascript:alert(1))')).not.toContain('<a');
  });

  it('giữ nguyên nội dung khối code, không định dạng bên trong', () => {
    expect(renderMarkdown('```js\nconst a = **b**;\n```')).toBe(
      '<pre><code class="language-js">const a = **b**;</code></pre>'
    );
  });

  it('gộp các dòng liền nhau thành một đoạn, trích dẫn và đường kẻ', () => {
    expect(renderMarkdown('dòng 1\ndòng 2')).toBe('<p>dòng 1<br>dòng 2</p>');
    expect(renderMarkdown('> lưu ý')).toBe('<blockquote>lưu ý</blockquote>');
    expect(renderMarkdown('---')).toBe('<hr>');
    expect(renderMarkdown('1. một\n2. hai')).toBe('<ol><li>một</li><li>hai</li></ol>');
  });
});

describe('streamAgentText', () => {
  it('hiện toàn bộ ngay khi trang đang ẩn hoặc người dùng giảm chuyển động', async () => {
    window.matchMedia = () => ({ matches: true }) as MediaQueryList;
    const element = document.createElement('div');
    await streamAgentText(element, '**xong**');
    expect(element.innerHTML).toBe('<p><strong>xong</strong></p>');
    expect(element.classList.contains('streaming')).toBe(false);
  });
});
