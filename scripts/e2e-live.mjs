import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL ||= 'postgresql://finance:finance_secret@localhost:5432/personal_finance?schema=public';
const prisma = new PrismaClient();
const ROOT = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API = `${ROOT}/api/v1`;
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const usernames = [`e2e_${suffix}`, `e2e_other_${suffix}`];
let accessToken = '';
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, operation) {
  try {
    const result = await operation();
    console.log(`✓ ${name}`);
    passed += 1;
    return result;
  } catch (error) {
    console.error(`✗ ${name}: ${error.message}`);
    failed += 1;
    throw error;
  }
}

async function api(path, { method = 'GET', token = accessToken, body, form, expected = 200 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined)
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  const statuses = Array.isArray(expected) ? expected : [expected];
  assert(statuses.includes(response.status), `${method} ${path}: cần HTTP ${statuses.join('/')}, nhận ${response.status}: ${text.slice(0, 300)}`);
  return { response, payload, text };
}

async function ok(path, options) {
  const result = await api(path, options);
  assert(result.payload?.success === true, `${path}: response thành công không đúng envelope`);
  return result.payload.data;
}

async function error(path, options, code) {
  const result = await api(path, options);
  assert(result.payload?.success === false, `${path}: response lỗi không đúng envelope`);
  if (code) assert(result.payload.error?.code === code, `${path}: cần code ${code}, nhận ${result.payload.error?.code}`);
  return result.payload.error;
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  if (!userIds.length) return;
  await prisma.receipt.deleteMany({ where: { transaction: { userId: { in: userIds } } } });
  await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.goalContribution.deleteMany({ where: { goal: { userId: { in: userIds } } } });
  await prisma.goal.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.budget.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.category.deleteMany({ where: { userId: { in: userIds }, parentId: { not: null } } });
  await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function run() {
  await cleanup();
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const occurredAt = new Date().toISOString();

  await check('Health check', async () => {
    const response = await fetch(`${ROOT}/health`);
    const body = await response.json();
    assert(response.status === 200 && body.data?.status === 'UP', 'Health endpoint không UP');
  });
  await check('Dashboard web', async () => {
    const response = await fetch(ROOT);
    const html = await response.text();
    assert(response.status === 200 && html.includes('Sổ Mộc'), 'Dashboard không render');
  });
  await check('Swagger/OpenAPI UI', async () => {
    const response = await fetch(`${ROOT}/api-docs/`);
    const html = await response.text();
    assert(response.status === 200 && html.includes('Sổ thu chi API') && html.includes('swagger-ui.css'), 'Swagger UI không render');
  });
  await check('Lỗi route 404 theo envelope', () => error('/khong-ton-tai', { expected: 404 }, 'ROUTE_NOT_FOUND'));
  await check('Từ chối API chưa đăng nhập', () => error('/wallets', { token: '', expected: 401 }, 'UNAUTHORIZED'));

  const registered = await check('Đăng ký và tạo dữ liệu mặc định', () => ok('/auth/register', {
    method: 'POST', expected: 201,
    body: { username: usernames[0], email: `${usernames[0]}@example.com`, password: 'E2eStart1', fullName: 'Người dùng E2E' }
  }));
  assert(registered.user.username === usernames[0] && registered.accessToken && registered.refreshToken, 'Đăng ký thiếu user/token');

  await check('Từ chối đăng nhập sai mật khẩu', () => error('/auth/login', { method: 'POST', token: '', expected: 401, body: { identifier: usernames[0], password: 'SaiMatKhau1' } }, 'INVALID_CREDENTIALS'));
  const login = await check('Đăng nhập bằng username', () => ok('/auth/login', { method: 'POST', token: '', body: { identifier: usernames[0], password: 'E2eStart1' } }));
  accessToken = login.accessToken;
  let refreshToken = login.refreshToken;

  const profile = await check('Xem hồ sơ cá nhân', () => ok('/profile'));
  assert(profile.email === `${usernames[0]}@example.com`, 'Email hồ sơ không đúng');
  const updatedProfile = await check('Cập nhật hồ sơ cá nhân', () => ok('/profile', { method: 'PATCH', body: { fullName: 'E2E Đã Cập Nhật', currency: 'vnd', timezone: 'Asia/Ho_Chi_Minh' } }));
  assert(updatedProfile.fullName === 'E2E Đã Cập Nhật' && updatedProfile.currency === 'VND', 'Hồ sơ chưa cập nhật');

  const refreshed = await check('Xoay vòng refresh token', () => ok('/auth/refresh', { method: 'POST', token: '', body: { refreshToken } }));
  accessToken = refreshed.accessToken;
  refreshToken = refreshed.refreshToken;
  await check('Refresh token cũ bị thu hồi', () => error('/auth/refresh', { method: 'POST', token: '', expected: 401, body: { refreshToken: login.refreshToken } }, 'INVALID_REFRESH_TOKEN'));

  await check('Đổi mật khẩu', () => ok('/auth/change-password', { method: 'POST', body: { currentPassword: 'E2eStart1', newPassword: 'E2eChanged2' } }));
  await check('Đổi mật khẩu thu hồi phiên cũ', () => error('/auth/refresh', { method: 'POST', token: '', expected: 401, body: { refreshToken } }, 'INVALID_REFRESH_TOKEN'));
  const changedLogin = await check('Đăng nhập bằng mật khẩu mới', () => ok('/auth/login', { method: 'POST', token: '', body: { identifier: usernames[0], password: 'E2eChanged2' } }));
  accessToken = changedLogin.accessToken;

  await check('Quên mật khẩu không làm lộ tài khoản', () => ok('/auth/forgot-password', { method: 'POST', token: '', body: { identifier: usernames[0] } }));
  const resetRawToken = `e2e-reset-token-${suffix}-secure`;
  await prisma.passwordResetToken.create({ data: {
    userId: registered.user.id,
    tokenHash: createHash('sha256').update(resetRawToken).digest('hex'),
    expiresAt: new Date(Date.now() + 15 * 60000)
  } });
  await check('Đặt lại mật khẩu bằng token hợp lệ', () => ok('/auth/reset-password', { method: 'POST', token: '', body: { token: resetRawToken, newPassword: 'E2eReset3' } }));
  const resetLogin = await check('Đăng nhập sau reset mật khẩu', () => ok('/auth/login', { method: 'POST', token: '', body: { identifier: usernames[0], password: 'E2eReset3' } }));
  accessToken = resetLogin.accessToken;
  refreshToken = resetLogin.refreshToken;

  const other = await check('Tạo người dùng thứ hai để kiểm tra phân quyền', () => ok('/auth/register', {
    method: 'POST', token: '', expected: 201,
    body: { username: usernames[1], phone: `+849${Date.now().toString().slice(-8)}`, password: 'OtherUser4' }
  }));

  const initialWallets = await check('Danh sách ví mặc định', () => ok('/wallets'));
  assert(initialWallets.length === 1 && initialWallets[0].name === 'Tiền mặt', 'Ví mặc định không đúng');
  const cashWallet = initialWallets[0];
  const bankWallet = await check('Tạo ví mới', () => ok('/wallets', { method: 'POST', expected: 201, body: { name: 'Ngân hàng E2E', type: 'BANK', currency: 'VND', openingBalance: 1000000 } }));
  const bankDetail = await check('Xem chi tiết ví', () => ok(`/wallets/${bankWallet.id}`));
  assert(Number(bankDetail.balance) === 1000000, 'Số dư ban đầu của ví sai');
  const bankUpdated = await check('Chỉnh sửa ví', () => ok(`/wallets/${bankWallet.id}`, { method: 'PATCH', body: { name: 'Ngân hàng E2E Updated' } }));
  assert(bankUpdated.name.endsWith('Updated'), 'Tên ví chưa cập nhật');
  await check('Người khác không xem được ví', () => error(`/wallets/${bankWallet.id}`, { token: other.accessToken, expected: 404 }, 'NOT_FOUND'));
  await check('Lưu trữ ví', () => ok(`/wallets/${bankWallet.id}`, { method: 'DELETE' }));
  const activeWallets = await check('Danh sách mặc định ẩn ví lưu trữ', () => ok('/wallets'));
  assert(!activeWallets.some((wallet) => wallet.id === bankWallet.id), 'Ví lưu trữ vẫn hiện trong danh sách active');
  const allWallets = await check('Danh sách có ví lưu trữ', () => ok('/wallets?includeArchived=true'));
  assert(allWallets.some((wallet) => wallet.id === bankWallet.id && wallet.archivedAt), 'Không tìm thấy ví lưu trữ');
  await check('Khôi phục ví', () => ok(`/wallets/${bankWallet.id}/restore`, { method: 'POST' }));

  const expenseParent = await check('Tạo danh mục cha', () => ok('/categories', { method: 'POST', expected: 201, body: { name: 'Sinh hoạt E2E', type: 'EXPENSE', color: '#336699', icon: '⌂' } }));
  const expenseChild = await check('Tạo danh mục con', () => ok('/categories', { method: 'POST', expected: 201, body: { name: 'Điện nước E2E', type: 'EXPENSE', parentId: expenseParent.id, color: '#336699' } }));
  const incomeCategory = await check('Tạo danh mục thu', () => ok('/categories', { method: 'POST', expected: 201, body: { name: 'Thưởng E2E', type: 'INCOME', color: '#228844' } }));
  const categoryTree = await check('Danh sách danh mục dạng cây', () => ok('/categories'));
  const parentNode = categoryTree.find((item) => item.id === expenseParent.id);
  assert(parentNode?.children?.some((item) => item.id === expenseChild.id), 'Cây danh mục thiếu quan hệ cha con');
  const categoryFlat = await check('Danh sách danh mục phẳng', () => ok('/categories?tree=false'));
  assert(categoryFlat.some((item) => item.id === expenseChild.id), 'Danh sách phẳng thiếu danh mục con');
  await check('Xem chi tiết danh mục', () => ok(`/categories/${expenseParent.id}`));
  const childUpdated = await check('Chỉnh sửa danh mục', () => ok(`/categories/${expenseChild.id}`, { method: 'PATCH', body: { name: 'Hóa đơn E2E' } }));
  assert(childUpdated.name === 'Hóa đơn E2E', 'Danh mục chưa cập nhật');
  await check('Ngăn vòng lặp danh mục', () => error(`/categories/${expenseParent.id}`, { method: 'PATCH', expected: 422, body: { parentId: expenseChild.id } }, 'CATEGORY_CYCLE'));
  await check('Ngăn cha/con khác loại', () => error('/categories', { method: 'POST', expected: 422, body: { name: 'Sai loại', type: 'EXPENSE', parentId: incomeCategory.id } }, 'CATEGORY_TYPE_MISMATCH'));

  const incomeTx = await check('Ghi giao dịch thu', () => ok('/transactions', { method: 'POST', expected: 201, body: { walletId: cashWallet.id, categoryId: incomeCategory.id, type: 'INCOME', amount: 10000000, occurredAt, note: 'Thu nhập E2E' } }));
  const expenseTx = await check('Ghi giao dịch chi', () => ok('/transactions', { method: 'POST', expected: 201, body: { walletId: cashWallet.id, categoryId: expenseChild.id, type: 'EXPENSE', amount: 200000, occurredAt, note: 'Chi phí E2E' } }));
  const transferTx = await check('Ghi giao dịch chuyển khoản', () => ok('/transactions', { method: 'POST', expected: 201, body: { walletId: cashWallet.id, destinationWalletId: bankWallet.id, type: 'TRANSFER', amount: 500000, occurredAt, note: 'Chuyển tiền E2E' } }));
  await check('Ngăn chuyển khoản cùng một ví', () => error('/transactions', { method: 'POST', expected: 422, body: { walletId: cashWallet.id, destinationWalletId: cashWallet.id, type: 'TRANSFER', amount: 1000, occurredAt } }, 'INVALID_TRANSFER'));
  const transactionPage = await check('Danh sách giao dịch phân trang', () => ok('/transactions?page=1&limit=2'));
  assert(transactionPage.length === 2, 'Phân trang không đúng kích thước');
  const filteredTransactions = await check('Lọc giao dịch theo loại và ví', () => ok(`/transactions?type=EXPENSE&walletId=${cashWallet.id}`));
  assert(filteredTransactions.some((item) => item.id === expenseTx.id), 'Bộ lọc giao dịch sai');
  await check('Xem chi tiết giao dịch', () => ok(`/transactions/${expenseTx.id}`));
  const updatedTx = await check('Chỉnh sửa giao dịch', () => ok(`/transactions/${expenseTx.id}`, { method: 'PATCH', body: { note: 'Chi phí E2E đã sửa' } }));
  assert(updatedTx.note.endsWith('đã sửa'), 'Giao dịch chưa cập nhật');
  await check('Validation UUID trả lỗi rõ ràng', () => error('/transactions/not-a-uuid', { expected: 422 }, 'VALIDATION_ERROR'));

  await check('Xuất báo cáo CSV', async () => {
    const result = await api('/transactions/export.csv', { expected: 200 });
    assert(result.response.headers.get('content-type')?.includes('text/csv'), 'Content-Type CSV không đúng');
    assert(result.text.includes('Thời gian,Loại,Số tiền') && result.text.includes('Chi phí E2E'), 'Nội dung CSV thiếu dữ liệu');
  });
  let receipt;
  await check('Từ chối hóa đơn sai định dạng', async () => {
    const form = new FormData();
    form.append('file', new Blob(['not allowed'], { type: 'text/plain' }), 'note.txt');
    await error(`/transactions/${expenseTx.id}/receipts`, { method: 'POST', form, expected: 422 }, 'FILE_REQUIRED');
  });
  receipt = await check('Upload hóa đơn PDF', async () => {
    const form = new FormData();
    form.append('file', new Blob(['%PDF-1.4\n%e2e\n'], { type: 'application/pdf' }), 'hoa-don-e2e.pdf');
    return ok(`/transactions/${expenseTx.id}/receipts`, { method: 'POST', form, expected: 201 });
  });
  await check('Tải hóa đơn có phân quyền', async () => {
    const result = await api(`/transactions/${expenseTx.id}/receipts/${receipt.id}`, { expected: 200 });
    assert(result.response.headers.get('content-disposition')?.includes('hoa-don-e2e.pdf'), 'Tên file tải xuống không đúng');
  });
  await check('Người khác không tải được hóa đơn', () => error(`/transactions/${expenseTx.id}/receipts/${receipt.id}`, { token: other.accessToken, expected: 404 }, 'NOT_FOUND'));

  const budget = await check('Tạo ngân sách', () => ok('/budgets', { method: 'POST', expected: 201, body: { name: 'Ngân sách E2E', categoryId: expenseChild.id, amount: 1000000, startDate: today, endDate: future } }));
  assert(Number(budget.spent) === 200000 && Number(budget.remaining) === 800000, 'Tiến độ ngân sách sai');
  const budgets = await check('Danh sách ngân sách kèm tiến độ', () => ok('/budgets'));
  assert(budgets.some((item) => item.id === budget.id), 'Danh sách thiếu ngân sách');
  await check('Xem chi tiết ngân sách', () => ok(`/budgets/${budget.id}`));
  const budgetUpdated = await check('Chỉnh sửa ngân sách', () => ok(`/budgets/${budget.id}`, { method: 'PATCH', body: { name: 'Ngân sách E2E Updated' } }));
  assert(budgetUpdated.name.endsWith('Updated'), 'Ngân sách chưa cập nhật');

  const goal = await check('Tạo mục tiêu tài chính', () => ok('/goals', { method: 'POST', expected: 201, body: { name: 'Quỹ E2E', targetAmount: 1000000, walletId: bankWallet.id, targetDate: future } }));
  await check('Đóng góp vào mục tiêu', async () => {
    const result = await ok(`/goals/${goal.id}/contributions`, { method: 'POST', expected: 201, body: { amount: 400000, note: 'Đợt 1' } });
    assert(Number(result.currentAmount) === 400000 && result.status === 'ACTIVE', 'Tiến độ mục tiêu đợt 1 sai');
  });
  await check('Tự hoàn thành mục tiêu khi đạt đích', async () => {
    const result = await ok(`/goals/${goal.id}/contributions`, { method: 'POST', expected: 201, body: { amount: 600000, note: 'Đợt 2' } });
    assert(result.status === 'COMPLETED' && result.percentCompleted === 100, 'Mục tiêu chưa tự hoàn thành');
  });
  await check('Điều chỉnh giảm mục tiêu', async () => {
    const result = await ok(`/goals/${goal.id}/contributions`, { method: 'POST', expected: 201, body: { amount: -100000, note: 'Điều chỉnh' } });
    assert(result.status === 'ACTIVE' && Number(result.currentAmount) === 900000, 'Điều chỉnh mục tiêu sai');
  });
  const goalDetail = await check('Chi tiết mục tiêu và lịch sử đóng góp', () => ok(`/goals/${goal.id}`));
  assert(goalDetail.contributions.length === 3, 'Lịch sử đóng góp không đủ');
  const activeGoals = await check('Lọc mục tiêu theo trạng thái', () => ok('/goals?status=ACTIVE'));
  assert(activeGoals.some((item) => item.id === goal.id), 'Bộ lọc mục tiêu sai');
  await check('Chỉnh sửa mục tiêu', () => ok(`/goals/${goal.id}`, { method: 'PATCH', body: { name: 'Quỹ E2E Updated' } }));

  const summary = await check('Báo cáo tổng hợp thu chi', () => ok(`/reports/summary?from=${today}&to=${future}`));
  assert(Number(summary.income) === 10000000 && Number(summary.expense) === 200000 && Number(summary.net) === 9800000, 'Báo cáo tổng hợp sai');
  const reconciliation = await check('Báo cáo đối soát ví', () => ok('/reports/reconciliation'));
  const cashReconciliation = reconciliation.wallets.find((wallet) => wallet.walletId === cashWallet.id);
  const bankReconciliation = reconciliation.wallets.find((wallet) => wallet.walletId === bankWallet.id);
  assert(cashReconciliation?.calculatedBalance === 9300000 && bankReconciliation?.calculatedBalance === 1500000, 'Số dư đối soát sai');

  await check('Không xóa danh mục đang được sử dụng', () => error(`/categories/${expenseChild.id}`, { method: 'DELETE', expected: 409 }, 'CATEGORY_IN_USE'));
  await check('Xóa ngân sách', () => ok(`/budgets/${budget.id}`, { method: 'DELETE' }));
  await check('Xóa mục tiêu', () => ok(`/goals/${goal.id}`, { method: 'DELETE' }));
  await check('Xóa giao dịch và hóa đơn liên quan', () => ok(`/transactions/${expenseTx.id}`, { method: 'DELETE' }));
  await check('Hóa đơn đã bị xóa cùng giao dịch', () => error(`/transactions/${expenseTx.id}/receipts/${receipt.id}`, { expected: 404 }, 'NOT_FOUND'));
  await check('Xóa các giao dịch còn lại', async () => {
    await ok(`/transactions/${incomeTx.id}`, { method: 'DELETE' });
    await ok(`/transactions/${transferTx.id}`, { method: 'DELETE' });
  });
  await check('Xóa danh mục con', () => ok(`/categories/${expenseChild.id}`, { method: 'DELETE' }));
  await check('Xóa danh mục cha', () => ok(`/categories/${expenseParent.id}`, { method: 'DELETE' }));
  await check('Xóa danh mục thu', () => ok(`/categories/${incomeCategory.id}`, { method: 'DELETE' }));

  await check('Đăng xuất', () => ok('/auth/logout', { method: 'POST', body: { refreshToken } }));
  await check('Refresh token bị từ chối sau đăng xuất', () => error('/auth/refresh', { method: 'POST', token: '', expected: 401, body: { refreshToken } }, 'INVALID_REFRESH_TOKEN'));
}

try {
  await run();
} catch {
  // Lỗi đã được ghi ở từng bước; tiếp tục vào finally để dọn dữ liệu.
} finally {
  try {
    await cleanup();
    console.log(`\nĐã dọn dữ liệu kiểm thử: ${usernames.join(', ')}`);
  } catch (cleanupError) {
    console.error(`Không thể dọn dữ liệu kiểm thử: ${cleanupError.message}`);
    failed += 1;
  }
  await prisma.$disconnect();
}

console.log(`\nKết quả E2E: ${passed} đạt, ${failed} lỗi.`);
if (failed) process.exitCode = 1;
