/* eslint-disable @typescript-eslint/no-explicit-any -- dữ liệu API và phần tử DOM chưa được gán kiểu chi tiết. */
import { escapeHtml } from './format';

export function renderMarkdownInline(value) {
  const tokens: any[] = [];
  const protect = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  let source = String(value ?? '');
  source = source.replace(/`([^`\n]+)`/g, (_, code) => protect(`<code>${escapeHtml(code)}</code>`));
  source = source.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/gi, (_, label, url) =>
    protect(
      `<a href="${escapeHtml(url)}"${/^https?:\/\//i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>`
    )
  );
  const html = escapeHtml(source)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');
  // Ký tự NUL đánh dấu chỗ giữ chỗ của code/liên kết đã thoát HTML; người dùng không gõ được ký tự này.
  // eslint-disable-next-line no-control-regex
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || '');
}

export function renderMarkdown(value) {
  const lines = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const output: any[] = [];
  const tableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim());
  const startsBlock = (index) => {
    const line = lines[index] || '';
    return (
      /^\s*```/.test(line) ||
      /^\s{0,3}#{1,4}\s+/.test(line) ||
      /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
      /^\s*[-+*]\s+/.test(line) ||
      /^\s*\d+[.)]\s+/.test(line) ||
      /^\s*>\s?/.test(line) ||
      (line.includes('|') && tableSeparator(lines[index + 1] || ''))
    );
  };
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = line.match(/^\s*```([\w-]*)\s*$/);
    if (fence) {
      const code: any[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : '';
      output.push(`<pre><code${language}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.includes('|') && tableSeparator(lines[index + 1] || '')) {
      const headings = cells(line);
      index += 2;
      const rows: any[] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|'))
        rows.push(cells(lines[index++]));
      output.push(
        `<div class="agent-table-wrap"><table><thead><tr>${headings.map((cell) => `<th>${renderMarkdownInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headings.map((_, cellIndex) => `<td>${renderMarkdownInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      );
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(5, heading[1].length + 2);
      output.push(`<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      output.push('<hr>');
      index += 1;
      continue;
    }
    const unordered = /^\s*[-+*]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const tag = unordered ? 'ul' : 'ol';
      const items: any[] = [];
      while (index < lines.length) {
        const match = (tag === 'ul' ? /^\s*[-+*]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/).exec(lines[index]);
        if (!match) break;
        items.push(`<li>${renderMarkdownInline(match[1])}</li>`);
        index += 1;
      }
      output.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: any[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      output.push(`<blockquote>${quote.map(renderMarkdownInline).join('<br>')}</blockquote>`);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !startsBlock(index)) paragraph.push(lines[index++]);
    output.push(`<p>${paragraph.map(renderMarkdownInline).join('<br>')}</p>`);
  }
  return output.join('');
}
