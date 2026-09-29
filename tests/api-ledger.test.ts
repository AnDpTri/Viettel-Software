import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma, registerUser, seedBasics, type TestUser } from './helpers/api';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.4\n%test');
let user: TestUser;
let other: TestUser;
let basics: Awaited<ReturnType<typeof seedBasics>>;

beforeAll(async () => {
  user = await registerUser();
  other = await registerUser();
  basics = await seedBasics(user);
});

describe('Ví', () => {
  it('tạo, xem, sửa, lưu trữ và khôi phục ví; số dư tính từ giao dịch', async () => {
    const created = await user.api.post('/wallets').send({ name: 'Ví USD', type: 'E_WALLET', currency: 'usd', openingBalance: 100 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ currency: 'USD', balance: 100 });
    const id = created.body.data.id;
    await user.api.post('/transactions').send({ walletId: id, type: 'INCOME', amount: 50, occurredAt: '2026-09-01' });
    expect((await user.api.get(`/wallets/${id}`)).body.data.balance).toBe(150);
    expect((await user.api.patch(`/wallets/${id}`).send({ name: 'Ví đô' })).body.data).toMatchObject({ name: 'Ví đô', balance: 150 });
    expect((await user.api.patch(`/wallets/${id}`).send({})).status).toBe(422);
    expect((await user.api.delete(`/wallets/${id}`)).body.message).toBe('Đã lưu trữ ví.');
    expect((await user.api.get('/wallets')).body.data.some((item: { id: string }) => item.id === id)).toBe(false);
    expect((await user.api.get('/wallets?includeArchived=true')).body.data.some((item: { id: string }) => item.id === id)).toBe(true);
    expect((await user.api.post(`/wallets/${id}/restore`)).body.data.archivedAt).toBeNull();
  });

  it('không cho xem hay sửa ví của người khác', async () => {
    const id = basics.cash.id;
    for (const response of [await other.api.get(`/wallets/${id}`), await other.api.patch(`/wallets/${id}`).send({ name: 'x' }), await other.api.delete(`/wallets/${id}`), await other.api.post(`/wallets/${id}/restore`)]) {
      expect(response.status).toBe(404);
    }
    expect((await user.api.get('/wallets/khong-phai-uuid')).body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Danh mục', () => {
  it('cây cha-con, danh sách phẳng, lọc theo loại', async () => {
    const child = await user.api.post('/categories').send({ name: 'Cà phê', type: 'EXPENSE', parentId: basics.food.id });
    expect(child.status).toBe(201);
    const tree = (await user.api.get('/categories?type=EXPENSE')).body.data;
    expect(tree.find((item: { id: string }) => item.id === basics.food.id).children.map((item: { name: string }) => item.name)).toContain('Cà phê');
    const flat = (await user.api.get('/categories?tree=false')).body.data;
    expect(flat.some((item: { id: string }) => item.id === child.body.data.id)).toBe(true);
    expect((await user.api.get(`/categories/${basics.food.id}`)).body.data.children).toHaveLength(1);
  });

  it('chặn cha/con khác loại, vòng lặp và đổi loại khi đang được dùng', async () => {
    expect((await user.api.post('/categories').send({ name: 'Sai', type: 'INCOME', parentId: basics.food.id })).body.error.code).toBe('CATEGORY_TYPE_MISMATCH');
    const parent = (await user.api.post('/categories').send({ name: 'Nhà cửa', type: 'EXPENSE' })).body.data;
    const child = (await user.api.post('/categories').send({ name: 'Điện nước', type: 'EXPENSE', parentId: parent.id })).body.data;
    expect((await user.api.patch(`/categories/${parent.id}`).send({ parentId: child.id })).body.error.code).toBe('CATEGORY_CYCLE');
    expect((await user.api.patch(`/categories/${parent.id}`).send({ type: 'INCOME' })).body.error.code).toBe('CATEGORY_IN_USE');
    expect((await user.api.patch(`/categories/${child.id}`).send({ name: 'Điện', color: '#112233' })).body.data.name).toBe('Điện');
    expect((await user.api.patch(`/categories/${child.id}`).send({ type: 'INCOME', parentId: null })).body.data.type).toBe('INCOME');
    expect((await user.api.get(`/categories/${randomUUID()}`)).status).toBe(404);
  });

  it('lưu trữ, khôi phục và gộp danh mục kèm dữ liệu liên quan', async () => {
    const source = (await user.api.post('/categories').send({ name: 'Ăn vặt', type: 'EXPENSE' })).body.data;
    const tx = (await user.api.post('/transactions').send({ walletId: basics.cash.id, categoryId: source.id, type: 'EXPENSE', amount: 20_000, occurredAt: '2026-09-02' })).body.data;
    expect((await user.api.post(`/categories/${source.id}/merge`).send({ targetId: source.id })).body.error.code).toBe('INVALID_CATEGORY_MERGE');
    expect((await user.api.post(`/categories/${source.id}/merge`).send({ targetId: basics.food.id })).status).toBe(200);
    expect((await user.api.get(`/transactions/${tx.id}`)).body.data.categoryId).toBe(basics.food.id);
    expect((await user.api.post(`/categories/${source.id}/merge`).send({ targetId: randomUUID() })).status).toBe(404);
    const temp = (await user.api.post('/categories').send({ name: 'Tạm', type: 'INCOME' })).body.data;
    expect((await user.api.delete(`/categories/${temp.id}`)).status).toBe(200);
    expect((await user.api.get('/categories?includeArchived=true&tree=false')).body.data.find((item: { id: string }) => item.id === temp.id).archivedAt).not.toBeNull();
    expect((await user.api.post(`/categories/${temp.id}/restore`)).body.data.archivedAt).toBeNull();
    expect((await other.api.delete(`/categories/${temp.id}`)).status).toBe(404);
    expect((await other.api.post(`/categories/${temp.id}/restore`)).status).toBe(404);
    expect((await other.api.patch(`/categories/${temp.id}`).send({ name: 'x' })).status).toBe(404);
  });
});

describe('Giao dịch', () => {
  it('ghi thu, chi, chuyển khoản và kiểm tra tham chiếu hợp lệ', async () => {
    const income = await user.api.post('/transactions').send({ walletId: basics.bank.id, categoryId: basics.salary.id, type: 'INCOME', amount: 10_000_000, occurredAt: '2026-09-05T08:00:00+07:00', note: 'Lương tháng 9' });
    expect(income.status).toBe(201);
    const transfer = await user.api.post('/transactions').send({ walletId: basics.bank.id, destinationWalletId: basics.cash.id, type: 'TRANSFER', amount: 500_000, occurredAt: '2026-09-06' });
    expect(transfer.status).toBe(201);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ walletId: basics.bank.id, type: 'TRANSFER', amount: 1, occurredAt: '2026-09-06' }, 'INVALID_TRANSFER'],
      [{ walletId: basics.bank.id, destinationWalletId: basics.cash.id, type: 'EXPENSE', amount: 1, occurredAt: '2026-09-06' }, 'INVALID_DESTINATION'],
      [{ walletId: basics.bank.id, categoryId: basics.salary.id, type: 'EXPENSE', amount: 1, occurredAt: '2026-09-06' }, 'CATEGORY_TYPE_MISMATCH'],
      [{ walletId: randomUUID(), type: 'EXPENSE', amount: 1, occurredAt: '2026-09-06' }, 'NOT_FOUND'],
      [{ walletId: basics.bank.id, destinationWalletId: randomUUID(), type: 'TRANSFER', amount: 1, occurredAt: '2026-09-06' }, 'NOT_FOUND'],
      [{ walletId: basics.bank.id, categoryId: randomUUID(), type: 'EXPENSE', amount: 1, occurredAt: '2026-09-06' }, 'NOT_FOUND'],
      [{ walletId: basics.bank.id, type: 'EXPENSE', amount: -5, occurredAt: '2026-09-06' }, 'VALIDATION_ERROR']
    ];
    for (const [body, code] of cases) expect((await user.api.post('/transactions').send(body)).body.error.code).toBe(code);
    const usd = (await user.api.post('/wallets').send({ name: 'USD', currency: 'USD' })).body.data;
    expect((await user.api.post('/transactions').send({ walletId: basics.bank.id, destinationWalletId: usd.id, type: 'TRANSFER', amount: 1, occurredAt: '2026-09-06' })).body.error.code).toBe('CURRENCY_MISMATCH');
  });

  it('Idempotency-Key chặn ghi trùng khi gửi lại', async () => {
    const body = { walletId: basics.cash.id, type: 'EXPENSE', amount: 12_000, occurredAt: '2026-09-07' };
    const first = await user.api.post('/transactions').set('Idempotency-Key', 'tx-key-1').send(body);
    const second = await user.api.post('/transactions').set('Idempotency-Key', 'tx-key-1').send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it('lọc, tìm kiếm, phân trang và xuất CSV', async () => {
    await user.api.post('/transactions').send({ walletId: basics.cash.id, categoryId: basics.food.id, type: 'EXPENSE', amount: 45_000, occurredAt: '2026-08-15', note: 'Phở bò', payee: 'Quán Phở' });
    const list = await user.api.get('/transactions?limit=2&page=1');
    expect(list.body.meta).toMatchObject({ page: 1, limit: 2 });
    expect(list.body.data).toHaveLength(2);
    const search = await user.api.get(`/transactions?keyword=phở&type=EXPENSE&categoryId=${basics.food.id}&walletId=${basics.cash.id}&from=2026-08-01&to=2026-08-31`);
    expect(search.body.data.map((item: { note: string }) => item.note)).toEqual(['Phở bò']);
    expect((await user.api.get('/transactions?from=2026-09-10&to=2026-09-01')).body.error.code).toBe('INVALID_DATE_RANGE');
    const csv = await user.api.get('/transactions/export.csv?type=EXPENSE');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    expect(csv.text).toContain('Phở bò');
  });

  it('sửa, chia nhỏ, xóa vào thùng rác và khôi phục', async () => {
    const tx = (await user.api.post('/transactions').send({ walletId: basics.cash.id, categoryId: basics.food.id, type: 'EXPENSE', amount: 300_000, occurredAt: '2026-09-08' })).body.data;
    expect((await user.api.patch(`/transactions/${tx.id}`).send({ amount: 350_000, note: 'Đi chợ' })).body.data.note).toBe('Đi chợ');
    expect((await user.api.patch(`/transactions/${tx.id}`).send({})).status).toBe(422);
    expect((await user.api.put(`/transactions/${tx.id}/splits`).send({ splits: [{ amount: 100_000 }, { amount: 100_000 }] })).body.error.code).toBe('SPLIT_TOTAL_MISMATCH');
    const split = await user.api.put(`/transactions/${tx.id}/splits`).send({ splits: [{ amount: 200_000, categoryId: basics.food.id }, { amount: 150_000, note: 'Khác' }] });
    expect(split.body.data).toHaveLength(2);
    expect((await user.api.delete(`/transactions/${tx.id}`)).status).toBe(200);
    expect((await user.api.get('/transactions/trash/list')).body.data.some((item: { id: string }) => item.id === tx.id)).toBe(true);
    expect((await user.api.post(`/transactions/${tx.id}/restore`)).body.data.deletedAt).toBeNull();
    for (const response of [await other.api.get(`/transactions/${tx.id}`), await other.api.patch(`/transactions/${tx.id}`).send({ note: 'x' }), await other.api.delete(`/transactions/${tx.id}`), await other.api.post(`/transactions/${tx.id}/restore`), await other.api.put(`/transactions/${tx.id}/splits`).send({ splits: [] })]) {
      expect(response.status).toBe(404);
    }
  });

  it('thao tác hàng loạt và nhập nhiều giao dịch', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({ walletId: basics.cash.id, type: 'EXPENSE', amount: 1_000 * (index + 1), occurredAt: '2026-09-09', note: `Nhập ${index}` }));
    const imported = await user.api.post('/transactions/import').send({ rows });
    expect(imported.body.data.imported).toBe(3);
    const ids = (await user.api.get('/transactions?keyword=Nhập')).body.data.map((item: { id: string }) => item.id);
    expect((await user.api.post('/transactions/bulk').send({ ids, action: 'RECONCILE', categoryId: basics.food.id })).body.data.updated).toBe(3);
    expect((await user.api.post('/transactions/bulk').send({ ids, action: 'DELETE' })).body.data.updated).toBe(3);
    expect((await user.api.post('/transactions/bulk').send({ ids, action: 'RESTORE' })).body.data.updated).toBe(3);
    expect((await user.api.post('/transactions/import').send({ rows: [] })).status).toBe(422);
  });

  it('quy tắc tự động gán danh mục và nhãn khi ghi giao dịch', async () => {
    await user.api.post('/productivity/automation-rules').send({ name: 'Grab', field: 'payee', operator: 'contains', value: 'grab', categoryId: basics.food.id, tagName: 'Đi lại' });
    await user.api.post('/productivity/automation-rules').send({ name: 'Lớn', field: 'amount', operator: 'gte', value: '9000000', tagName: 'Khoản lớn' });
    for (const [operator, value] of [['equals', 'x'], ['startsWith', 'y'], ['lte', '1']]) await user.api.post('/productivity/automation-rules').send({ name: operator, field: 'note', operator, value });
    const tx = await user.api.post('/transactions').send({ walletId: basics.cash.id, type: 'EXPENSE', amount: 9_500_000, occurredAt: '2026-09-10', payee: 'GRAB Việt Nam' });
    expect(tx.body.data.categoryId).toBe(basics.food.id);
    expect(tx.body.data.tags.map((item: { name: string }) => item.name).sort()).toEqual(['Khoản lớn', 'Đi lại']);
  });

  it('hóa đơn đính kèm: kiểm tra chữ ký tệp, giới hạn số lượng, tải về và xóa theo quyền sở hữu', async () => {
    const tx = (await user.api.post('/transactions').send({ walletId: basics.cash.id, type: 'EXPENSE', amount: 99_000, occurredAt: '2026-09-11' })).body.data;
    expect((await user.api.post(`/transactions/${tx.id}/receipts`)).body.error.code).toBe('FILE_REQUIRED');
    expect((await user.api.post(`/transactions/${tx.id}/receipts`).attach('file', Buffer.from('not an image'), { filename: 'gia.png', contentType: 'image/png' })).body.error.code).toBe('INVALID_FILE_SIGNATURE');
    const uploaded = await user.api.post(`/transactions/${tx.id}/receipts`).attach('file', PNG, { filename: 'hoa-don.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    expect((await user.api.post(`/transactions/${tx.id}/receipts`).attach('file', PDF, { filename: 'hd.pdf', contentType: 'application/pdf' })).status).toBe(201);
    const receiptId = uploaded.body.data.id;
    const download = await user.api.get(`/transactions/${tx.id}/receipts/${receiptId}`);
    expect(download.headers['content-disposition']).toContain('hoa-don.png');
    expect((await other.api.get(`/transactions/${tx.id}/receipts/${receiptId}`)).status).toBe(404);
    expect((await other.api.post(`/transactions/${tx.id}/receipts`).attach('file', PNG, { filename: 'x.png', contentType: 'image/png' })).status).toBe(404);
    await prisma.receipt.update({ where: { id: receiptId }, data: { content: null } });
    expect((await user.api.get(`/transactions/${tx.id}/receipts/${receiptId}`)).body.error.code).toBe('RECEIPT_CONTENT_UNAVAILABLE');
    expect((await user.api.delete(`/transactions/${tx.id}/receipts/${receiptId}`)).status).toBe(200);
    expect((await user.api.delete(`/transactions/${tx.id}/receipts/${receiptId}`)).status).toBe(404);
    for (let index = 0; index < 9; index += 1) await user.api.post(`/transactions/${tx.id}/receipts`).attach('file', PNG, { filename: `${index}.png`, contentType: 'image/png' });
    expect((await user.api.post(`/transactions/${tx.id}/receipts`).attach('file', PNG, { filename: 'thua.png', contentType: 'image/png' })).body.error.code).toBe('RECEIPT_LIMIT_REACHED');
    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    expect((await user.api.post(`/transactions/${tx.id}/receipts`).attach('file', big, { filename: 'to.png', contentType: 'image/png' })).body.error.code).toBe('UPLOAD_ERROR');
  });
});
