export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], headers: Record<string, string>): string {
  const keys = Object.keys(headers);
  const lines = [keys.map((key) => csvEscape(headers[key])).join(',')];
  for (const row of rows) lines.push(keys.map((key) => csvEscape(row[key])).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}
