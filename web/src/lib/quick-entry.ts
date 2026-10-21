/**
 * Bộ phân tích ghi nhanh chạy hoàn toàn trong trình duyệt ("cà phê 45k hôm qua"), không gọi trợ lý AI.
 * Hàm thuần: cùng đầu vào cho cùng kết quả, dễ kiểm thử.
 */

export type QuickType = 'INCOME' | 'EXPENSE';

export interface QuickCategory {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
}

export interface QuickWallet {
  id: string;
  name: string;
}

/** Một giao dịch cũ (tối đa 90 ngày gần đây) dùng để đoán danh mục và ví từ ghi chú giống nhau. */
export interface QuickHistoryItem {
  note: string | null;
  type: string;
  categoryId: string | null;
  walletId: string;
  occurredAt: string | Date;
}

export interface QuickContext {
  today: Date;
  categories: QuickCategory[];
  wallets: QuickWallet[];
  history?: QuickHistoryItem[];
  /** Ví dùng gần nhất (mặc định khi câu không nêu ví và lịch sử không gợi ý). */
  lastWalletId?: string | null;
}

export interface QuickEntry {
  ok: true;
  amount: number;
  type: QuickType;
  /** Ngày giao dịch (giờ địa phương, 12:00). */
  date: Date;
  note: string;
  categoryId: string | null;
  walletId: string | null;
}

export type QuickResult = QuickEntry | { ok: false; error: string };

export const ERR_NO_AMOUNT = 'Chưa thấy số tiền';
export const ERR_BAD_DATE = 'Ngày không hợp lệ';

/** Chữ thường không dấu, giữ nguyên độ dài chuỗi để vị trí khớp trùng với văn bản gốc. */
export function fold(text: string): string {
  return Array.from(text.normalize('NFC'), (char) => {
    const base = char.normalize('NFD')[0] ?? char;
    return (base === 'đ' || base === 'Đ' ? 'd' : base).toLowerCase();
  }).join('');
}

type Range = [number, number];

const WEEKDAYS: Record<string, number> = {
  'chu nhat': 0,
  'thu hai': 1,
  'thu ba': 2,
  'thu tu': 3,
  'thu nam': 4,
  'thu sau': 5,
  'thu bay': 6,
  'thu 2': 1,
  'thu 3': 2,
  'thu 4': 3,
  'thu 5': 4,
  'thu 6': 5,
  'thu 7': 6,
  cn: 0
};

const INCOME_WORDS = /(?<![a-z0-9])(luong|thuong|nhan|thu|ban)(?![a-z0-9])/;

const atNoon = (year: number, monthIndex: number, day: number) => new Date(year, monthIndex, day, 12, 0, 0, 0);

interface DateFound {
  date: Date;
  range: Range;
}

/** Tìm ngày trong câu đã gấp dấu. Ngày không tồn tại (31/02) trả `'invalid'`. */
function findDate(norm: string, today: Date): DateFound | 'invalid' | null {
  const base = atNoon(today.getFullYear(), today.getMonth(), today.getDate());

  const numeric = /(?<![0-9/.-])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?(?![0-9/])/.exec(norm);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : today.getFullYear();
    if (numeric[3] && numeric[3].length === 2) year += 2000;
    const date = atNoon(year, month - 1, day);
    if (month < 1 || month > 12 || date.getMonth() !== month - 1 || date.getDate() !== day) return 'invalid';
    // Chưa ghi năm mà ngày rơi vào tương lai thì hiểu là năm trước.
    if (!numeric[3] && date.getTime() > base.getTime()) date.setFullYear(year - 1);
    return { date, range: [numeric.index, numeric.index + numeric[0].length] };
  }

  const relative = /hom (nay|qua|kia)(?![a-z])/.exec(norm);
  if (relative) {
    const back = relative[1] === 'nay' ? 0 : relative[1] === 'qua' ? 1 : 2;
    return {
      date: atNoon(base.getFullYear(), base.getMonth(), base.getDate() - back),
      range: [relative.index, relative.index + relative[0].length]
    };
  }

  const weekday = /(?<![a-z0-9])(chu nhat|thu (?:hai|ba|tu|nam|sau|bay|[2-7])|cn)(?![a-z0-9])/.exec(norm);
  if (weekday) {
    const target = WEEKDAYS[weekday[1]!]!;
    // Ngày gần nhất đã qua: nếu hôm nay đúng thứ đó thì lùi một tuần.
    const back = (base.getDay() - target + 7) % 7 || 7;
    return {
      date: atNoon(base.getFullYear(), base.getMonth(), base.getDate() - back),
      range: [weekday.index, weekday.index + weekday[0].length]
    };
  }
  return null;
}

const UNIT_MULTIPLIER: Record<string, number> = {
  tr: 1_000_000,
  trieu: 1_000_000,
  cu: 1_000_000,
  k: 1_000,
  nghin: 1_000,
  ngan: 1_000,
  d: 1,
  vnd: 1
};

interface AmountFound {
  amount: number;
  range: Range;
}

/**
 * Tìm số tiền: 45k, 45 nghìn, 120 ngàn, 1tr2, 1,5tr, 2 triệu, 45.000, 45000.
 * Số trơn dưới 1000 hiểu là nghìn đồng ("cà phê 45" là 45.000).
 */
function findAmount(masked: string): AmountFound | null {
  const pattern = /(?<![a-z0-9.,])(\d+(?:[.,]\d+)*)(?:\s*(trieu|tr|cu|k|nghin|ngan|vnd|d)(?![a-z])(\d+)?|(?![a-z]))/g;
  // Ưu tiên số có đơn vị, rồi số từ 1000 trở lên, cuối cùng là số trơn nhỏ ở cuối câu ("lương tháng 10 15tr" lấy 15tr).
  const found: Array<AmountFound & { rank: number }> = [];
  for (const match of masked.matchAll(pattern)) {
    const [whole, digits, unit, tail] = match;
    const start = match.index!;
    let amount: number;
    if (unit && UNIT_MULTIPLIER[unit]! > 1) {
      // Có đơn vị: dấu . hoặc , là dấu thập phân (1,5tr); chữ số liền sau đơn vị là phần lẻ (1tr2 = 1,2 triệu).
      const decimal = Number(digits!.replace(',', '.'));
      if (Number.isNaN(decimal)) continue;
      amount = Math.round((decimal + (tail ? Number(`0.${tail}`) : 0)) * UNIT_MULTIPLIER[unit]!);
    } else {
      if (tail) continue;
      const grouped = /^\d{1,3}([.,]\d{3})+$/.test(digits!);
      if (grouped) amount = Number(digits!.replace(/[.,]/g, ''));
      else if (/^\d+$/.test(digits!)) amount = Number(digits);
      else {
        const value = Number(digits!.replace(',', '.'));
        if (Number.isNaN(value)) continue;
        amount = Math.round(value);
      }
      if (!unit && amount > 0 && amount < 1000 && /^\d+$/.test(digits!)) amount *= 1000;
    }
    if (!(amount > 0)) continue;
    const rank =
      unit && UNIT_MULTIPLIER[unit]! > 1 ? 3 : /^\d+$/.test(digits!) && Number(digits) < 1000 && !unit ? 1 : 2;
    found.push({ amount, range: [start, start + whole!.length], rank });
  }
  let best: (AmountFound & { rank: number }) | null = null;
  for (const item of found)
    if (!best || item.rank > best.rank || (item.rank === best.rank && item.rank === 1)) best = item;
  return best ? { amount: best.amount, range: best.range } : null;
}

const tokensOf = (norm: string) => norm.split(/[^a-z0-9]+/).filter((token) => token.length > 0);

/** Phân tích một dòng ghi nhanh. Lỗi (thiếu số tiền, ngày sai) trả `{ ok: false, error }` bằng tiếng Việt. */
export function parseQuickEntry(input: string, context: QuickContext): QuickResult {
  const text = input.normalize('NFC').trim();
  const norm = fold(text);
  const removed: Range[] = [];
  const mask = (range: Range) => {
    removed.push(range);
    return norm.slice(0, range[0]) + ' '.repeat(range[1] - range[0]) + norm.slice(range[1]);
  };
  const blank = (source: string, range: Range) =>
    source.slice(0, range[0]) + ' '.repeat(range[1] - range[0]) + source.slice(range[1]);

  // 1. Ngày (loại khỏi chuỗi trước khi tìm số tiền để "20/10" không bị đọc là tiền).
  const dateFound = findDate(norm, context.today);
  if (dateFound === 'invalid') return { ok: false, error: ERR_BAD_DATE };
  let masked = norm;
  if (dateFound) masked = mask(dateFound.range);
  const date =
    dateFound?.date ?? atNoon(context.today.getFullYear(), context.today.getMonth(), context.today.getDate());

  // 2. Số tiền.
  const amountFound = findAmount(masked);
  if (!amountFound) return { ok: false, error: ERR_NO_AMOUNT };
  masked = blank(masked, amountFound.range);
  removed.push(amountFound.range);

  // 3. Loại: từ gợi ý thu → thu, còn lại chi.
  const type: QuickType = INCOME_WORDS.test(masked) ? 'INCOME' : 'EXPENSE';

  // 4. Ví nêu trong câu ("bằng momo"): tên dài nhất khớp trọn từ.
  let walletId: string | null = null;
  let walletRange: Range | null = null;
  let bestWallet = 0;
  for (const wallet of context.wallets) {
    const name = fold(wallet.name).trim();
    if (!name || name.length <= bestWallet) continue;
    const match = new RegExp(`(?<![a-z0-9])(?:bang |tu |qua |vao )?${escapeRegExp(name)}(?![a-z0-9])`).exec(masked);
    if (!match) continue;
    walletId = wallet.id;
    bestWallet = name.length;
    walletRange = [match.index, match.index + match[0].length];
  }
  if (walletRange) {
    removed.push(walletRange);
    masked = blank(masked, walletRange);
  }

  // 5. Ghi chú: phần còn lại của câu gốc sau khi bỏ ngày, số tiền, ví.
  const note = noteFrom(text, removed);
  const noteNorm = fold(note);

  // 6. Danh mục theo tên (khớp trọn từ, tên dài nhất, đúng loại), sau đó theo lịch sử ghi chú giống nhất.
  let categoryId: string | null = null;
  let bestCategory = 0;
  for (const category of context.categories) {
    if (category.type !== type) continue;
    const name = fold(category.name).trim();
    if (!name || name.length <= bestCategory) continue;
    if (new RegExp(`(?<![a-z0-9])${escapeRegExp(name)}(?![a-z0-9])`).test(masked)) {
      categoryId = category.id;
      bestCategory = name.length;
    }
  }
  const similar = categoryId && walletId ? null : mostSimilar(noteNorm, type, context);
  if (similar) {
    if (!categoryId && similar.categoryId) categoryId = similar.categoryId;
    if (!walletId && context.wallets.some((wallet) => wallet.id === similar.walletId)) walletId = similar.walletId;
  }

  // 7. Ví mặc định: ví dùng gần nhất, không có thì ví đầu tiên.
  if (!walletId) {
    const last = context.lastWalletId;
    walletId = last && context.wallets.some((wallet) => wallet.id === last) ? last : (context.wallets[0]?.id ?? null);
  }

  return { ok: true, amount: amountFound.amount, type, date, note, categoryId, walletId };
}

/** Tách các đoạn đã dùng khỏi câu gốc, gộp khoảng trắng, bỏ dấu nối thừa ở hai đầu. */
function noteFrom(text: string, removed: Range[]): string {
  const sorted = [...removed].sort((a, b) => a[0] - b[0]);
  let out = '';
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start < cursor) continue;
    out += text.slice(cursor, start) + ' ';
    cursor = end;
  }
  out += text.slice(cursor);
  return out
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.\-–]+|[\s,;:.\-–]+$/g, '')
    .replace(/^(vào|lúc|ngày|hôm)\s+/i, '')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const NINETY_DAYS = 90 * 86_400_000;

/** Giao dịch trong 90 ngày gần đây có ghi chú giống nhất (tỷ lệ từ chung >= 0,5); hòa thì lấy cái mới hơn. */
function mostSimilar(noteNorm: string, type: QuickType, context: QuickContext): QuickHistoryItem | null {
  const mine = new Set(tokensOf(noteNorm));
  if (!mine.size || !context.history?.length) return null;
  let best: QuickHistoryItem | null = null;
  let bestScore = 0;
  let bestTime = 0;
  for (const item of context.history) {
    if (item.type !== type || !item.note) continue;
    const time = new Date(item.occurredAt).getTime();
    if (context.today.getTime() - time > NINETY_DAYS) continue;
    const theirs = new Set(tokensOf(fold(item.note)));
    if (!theirs.size) continue;
    let shared = 0;
    for (const token of mine) if (theirs.has(token)) shared += 1;
    const score = shared / (mine.size + theirs.size - shared);
    if (score < 0.5) continue;
    if (score > bestScore || (score === bestScore && time > bestTime)) {
      best = item;
      bestScore = score;
      bestTime = time;
    }
  }
  return best;
}

/** Giao dịch hay lặp lại: gom theo ghi chú, lấy số tiền dùng nhiều nhất và ví/danh mục của lần gần nhất. */
export interface QuickSuggestion {
  note: string;
  amount: number;
  count: number;
  type: string;
  walletId: string;
  categoryId: string | null;
}

export function frequentTransactions(
  history: Array<QuickHistoryItem & { amount: number | string }>,
  today: Date,
  options: { days?: number; limit?: number } = {}
): QuickSuggestion[] {
  const { days = 60, limit = 6 } = options;
  const since = today.getTime() - days * 86_400_000;
  const groups = new Map<string, Array<(typeof history)[number]>>();
  for (const item of history) {
    const note = item.note?.trim();
    if (!note || item.type === 'TRANSFER') continue;
    if (new Date(item.occurredAt).getTime() < since) continue;
    const key = `${item.type}:${fold(note)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const result: QuickSuggestion[] = [];
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    const latest = items.reduce((a, b) => (new Date(b.occurredAt) > new Date(a.occurredAt) ? b : a));
    const tally = new Map<number, { count: number; last: number }>();
    for (const item of items) {
      const amount = Number(item.amount);
      const entry = tally.get(amount) ?? { count: 0, last: 0 };
      entry.count += 1;
      entry.last = Math.max(entry.last, new Date(item.occurredAt).getTime());
      tally.set(amount, entry);
    }
    const [amount] = [...tally.entries()].sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)[0]!;
    result.push({
      note: latest.note!.trim(),
      amount,
      count: items.length,
      type: latest.type,
      walletId: latest.walletId,
      categoryId: latest.categoryId
    });
  }
  return result.sort((a, b) => b.count - a.count || a.note.localeCompare(b.note, 'vi')).slice(0, limit);
}
