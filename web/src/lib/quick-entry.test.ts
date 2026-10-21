import { describe, expect, it } from 'vitest';
import {
  ERR_BAD_DATE,
  ERR_NO_AMOUNT,
  fold,
  frequentTransactions,
  parseQuickEntry,
  type QuickContext,
  type QuickEntry
} from './quick-entry';

// Thứ Tư 21/10/2026, 15:30.
const today = new Date(2026, 9, 21, 15, 30);

const ctx = (extra: Partial<QuickContext> = {}): QuickContext => ({
  today,
  categories: [
    { id: 'c-food', name: 'Ăn uống', type: 'EXPENSE' },
    { id: 'c-move', name: 'Di chuyển', type: 'EXPENSE' },
    { id: 'c-shop', name: 'Mua sắm', type: 'EXPENSE' },
    { id: 'c-salary', name: 'Lương', type: 'INCOME' }
  ],
  wallets: [
    { id: 'w-cash', name: 'Tiền mặt' },
    { id: 'w-bank', name: 'Vietcombank' },
    { id: 'w-momo', name: 'MoMo' }
  ],
  lastWalletId: 'w-bank',
  ...extra
});

const ok = (text: string, extra: Partial<QuickContext> = {}) => {
  const result = parseQuickEntry(text, ctx(extra));
  if (!result.ok) throw new Error(`"${text}" -> ${result.error}`);
  return result as QuickEntry;
};
const ymd = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

describe('fold', () => {
  it('bỏ dấu, hạ chữ thường, giữ độ dài', () => {
    expect(fold('Đồ Ăn Uống')).toBe('do an uong');
    expect(fold('Tiền mặt').length).toBe('Tiền mặt'.length);
  });
});

describe('số tiền', () => {
  it.each([
    ['cà phê 45k', 45_000],
    ['cà phê 45K', 45_000],
    ['cà phê 45 nghìn', 45_000],
    ['cà phê 45 nghin', 45_000],
    ['mua đồ 120 ngàn', 120_000],
    ['ăn tối 45.000', 45_000],
    ['ăn tối 45,000', 45_000],
    ['ăn tối 45000', 45_000],
    ['ăn tối 45000đ', 45_000],
    ['ăn tối 45.000 đ', 45_000],
    ['tiền nhà 1tr2', 1_200_000],
    ['tiền nhà 1,5tr', 1_500_000],
    ['tiền nhà 1.5tr', 1_500_000],
    ['sửa xe 2 triệu', 2_000_000],
    ['sửa xe 2tr', 2_000_000],
    ['sửa xe 2 trieu', 2_000_000],
    ['sắm đồ 1.250.000', 1_250_000],
    ['cà phê 45', 45_000]
  ])('"%s" -> %i', (text, amount) => {
    expect(ok(text).amount).toBe(amount);
  });

  it('không có số thì báo lỗi tiếng Việt', () => {
    expect(parseQuickEntry('cà phê', ctx())).toEqual({ ok: false, error: ERR_NO_AMOUNT });
    expect(parseQuickEntry('   ', ctx())).toEqual({ ok: false, error: ERR_NO_AMOUNT });
    expect(ERR_NO_AMOUNT).toBe('Chưa thấy số tiền');
  });

  it('ngày dạng 20/10 không bị đọc là số tiền', () => {
    expect(parseQuickEntry('cà phê 20/10', ctx())).toEqual({ ok: false, error: ERR_NO_AMOUNT });
    expect(ok('cà phê 20/10 45k').amount).toBe(45_000);
  });
});

describe('ngày', () => {
  it('mặc định là hôm nay, 12:00', () => {
    const entry = ok('cà phê 45k');
    expect(ymd(entry.date)).toBe('2026-10-21');
    expect(entry.date.getHours()).toBe(12);
  });
  it.each([
    ['cà phê 45k hôm nay', '2026-10-21'],
    ['cà phê 45k hôm qua', '2026-10-20'],
    ['cà phê 45k hôm kia', '2026-10-19'],
    ['cà phê 45k thứ hai', '2026-10-19'],
    ['cà phê 45k thứ 2', '2026-10-19'],
    ['cà phê 45k chủ nhật', '2026-10-18'],
    ['cà phê 45k thứ tư', '2026-10-14'], // hôm nay là thứ tư: lùi một tuần
    ['cà phê 45k thứ bảy', '2026-10-17'],
    ['cà phê 45k 20/10', '2026-10-20'],
    ['cà phê 45k 5/10', '2026-10-5'],
    ['cà phê 45k 20/10/2026', '2026-10-20'],
    ['cà phê 45k 3/2/2025', '2025-2-3'],
    ['cà phê 45k 20/12', '2025-12-20'] // chưa tới: hiểu là năm trước
  ])('"%s" -> %s', (text, date) => {
    expect(ymd(ok(text).date)).toBe(date);
  });
  it('ngày không tồn tại báo lỗi', () => {
    expect(parseQuickEntry('cà phê 45k 31/02', ctx())).toEqual({ ok: false, error: ERR_BAD_DATE });
    expect(parseQuickEntry('cà phê 45k 5/13', ctx())).toEqual({ ok: false, error: ERR_BAD_DATE });
  });
});

describe('loại giao dịch', () => {
  it.each([
    ['lương tháng 10 15tr', 'INCOME'],
    ['thưởng dự án 2tr', 'INCOME'],
    ['nhận tiền bạn trả 300k', 'INCOME'],
    ['thu tiền nhà 3tr', 'INCOME'],
    ['bán đồ cũ 500k', 'INCOME'],
    ['cà phê 45k', 'EXPENSE'],
    ['mua nhà 2 tỷ 1tr', 'EXPENSE']
  ])('"%s" là %s', (text, type) => {
    expect(ok(text).type).toBe(type);
  });
  it('"thứ hai" không bị coi là từ gợi ý thu', () => {
    expect(ok('cà phê 45k thứ hai').type).toBe('EXPENSE');
  });
});

describe('danh mục', () => {
  it('khớp tên không dấu, không phân biệt hoa thường', () => {
    expect(ok('an uong sang 40k').categoryId).toBe('c-food');
    expect(ok('ĂN UỐNG trưa 55k').categoryId).toBe('c-food');
  });
  it('danh mục thu chỉ khớp khi loại là thu', () => {
    expect(ok('lương 15tr').categoryId).toBe('c-salary');
    expect(ok('lương 15tr').type).toBe('INCOME');
  });
  it('không khớp thì để trống (Chưa phân loại)', () => {
    expect(ok('cà phê 45k').categoryId).toBeNull();
  });
  it('dùng lại danh mục và ví của ghi chú giống nhất trong 90 ngày', () => {
    const history = [
      {
        note: 'Cà phê sáng',
        type: 'EXPENSE',
        categoryId: 'c-food',
        walletId: 'w-momo',
        occurredAt: new Date(2026, 9, 10)
      },
      {
        note: 'Grab đi làm',
        type: 'EXPENSE',
        categoryId: 'c-move',
        walletId: 'w-cash',
        occurredAt: new Date(2026, 9, 12)
      }
    ];
    const entry = ok('cà phê sáng 45k', { history });
    expect(entry.categoryId).toBe('c-food');
    expect(entry.walletId).toBe('w-momo');
    expect(ok('grab đi làm 60k', { history }).categoryId).toBe('c-move');
  });
  it('lịch sử cũ hơn 90 ngày hoặc khác loại bị bỏ qua', () => {
    const old = [
      {
        note: 'cà phê sáng',
        type: 'EXPENSE',
        categoryId: 'c-food',
        walletId: 'w-momo',
        occurredAt: new Date(2026, 5, 1)
      },
      {
        note: 'cà phê sáng',
        type: 'INCOME',
        categoryId: 'c-salary',
        walletId: 'w-momo',
        occurredAt: new Date(2026, 9, 1)
      }
    ];
    const entry = ok('cà phê sáng 45k', { history: old });
    expect(entry.categoryId).toBeNull();
    expect(entry.walletId).toBe('w-bank');
  });
  it('ghi chú chỉ trùng một từ trong ba thì không đủ giống', () => {
    const history = [
      { note: 'cà ri gà', type: 'EXPENSE', categoryId: 'c-food', walletId: 'w-momo', occurredAt: new Date(2026, 9, 10) }
    ];
    expect(ok('cà phê 45k', { history }).categoryId).toBeNull();
  });
});

describe('ví', () => {
  it('khớp tên ví trong câu và bỏ cụm "bằng ..." khỏi ghi chú', () => {
    const entry = ok('cà phê 45k bằng momo');
    expect(entry.walletId).toBe('w-momo');
    expect(entry.note).toBe('cà phê');
  });
  it('khớp tên ví nhiều từ không dấu', () => {
    expect(ok('xăng 100k tien mat').walletId).toBe('w-cash');
  });
  it('không nêu ví thì dùng ví gần nhất, rồi ví đầu tiên', () => {
    expect(ok('cà phê 45k').walletId).toBe('w-bank');
    expect(ok('cà phê 45k', { lastWalletId: null }).walletId).toBe('w-cash');
    expect(ok('cà phê 45k', { lastWalletId: 'không-có' }).walletId).toBe('w-cash');
  });
  it('không có ví nào thì walletId là null', () => {
    expect(ok('cà phê 45k', { wallets: [], lastWalletId: null }).walletId).toBeNull();
  });
});

describe('ghi chú', () => {
  it('bỏ số tiền và ngày khỏi câu gốc, giữ chữ có dấu', () => {
    expect(ok('Cà phê 45k hôm qua').note).toBe('Cà phê');
    expect(ok('20/10 cà phê sữa 45k').note).toBe('cà phê sữa');
    expect(ok('45k').note).toBe('');
  });
});

describe('frequentTransactions', () => {
  const mk = (note: string, amount: number, day: number, walletId = 'w-cash', type = 'EXPENSE') => ({
    note,
    amount,
    type,
    categoryId: 'c-food',
    walletId,
    occurredAt: new Date(2026, 9, day)
  });
  it('gom theo ghi chú, lấy số tiền hay dùng nhất, ví của lần gần nhất, xếp theo số lần', () => {
    const history = [
      mk('Cà phê', 45_000, 1),
      mk('cà phê', 45_000, 5),
      mk('Cà phê', 50_000, 9, 'w-momo'),
      mk('Grab', 60_000, 3),
      mk('Grab', 60_000, 4),
      mk('Một lần', 10_000, 2),
      mk('Chuyển', 10_000, 2, 'w-cash', 'TRANSFER'),
      mk('Chuyển', 10_000, 3, 'w-cash', 'TRANSFER'),
      mk('Cũ', 5_000, 1),
      { ...mk('Cũ', 5_000, 1), occurredAt: new Date(2026, 1, 1) }
    ];
    const result = frequentTransactions(history, today);
    expect(result.map((item) => [item.note, item.amount, item.count, item.walletId])).toEqual([
      ['Cà phê', 45_000, 3, 'w-momo'],
      ['Grab', 60_000, 2, 'w-cash']
    ]);
  });
  it('giới hạn số gợi ý', () => {
    const history = Array.from({ length: 10 }, (_, index) => [
      mk(`mục ${index}`, 1000 * (index + 1), 1),
      mk(`mục ${index}`, 1000 * (index + 1), 2)
    ]).flat();
    expect(frequentTransactions(history, today, { limit: 4 })).toHaveLength(4);
  });
});
