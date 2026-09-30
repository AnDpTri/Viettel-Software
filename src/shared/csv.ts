/** Ô văn bản bắt đầu bằng = + - @ (hoặc tab/CR) bị Excel/Sheets hiểu là công thức (CSV injection): thêm `'` phía
 * trước để hiển thị nguyên văn. Số (kể cả số âm dạng chuỗi) giữ nguyên. */
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMBER = /^[-+]?\d+(\.\d+)?$/;

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], headers: Record<string, string>): string {
  const keys = Object.keys(headers);
  const lines = [keys.map((key) => csvEscape(headers[key])).join(',')];
  for (const row of rows) lines.push(keys.map((key) => csvEscape(row[key])).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}
