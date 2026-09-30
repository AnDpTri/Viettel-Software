import { appendFile, mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright-core';

process.env.DATABASE_URL ||= 'postgresql://finance:finance_secret@localhost:5432/personal_finance?schema=public';
const prisma = new PrismaClient();
const ROOT = process.env.E2E_BASE_URL || 'http://localhost:3000';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const username = `ui_${suffix}`;
const email = `${username}@example.com`;
const initialPassword = 'UiTest@123';
const changedPassword = 'UiChanged@456';
const screenshots = 'test-results/ui';
let passed = 0;
let failed = 0;
let browser;
/** Kết quả từng bước, ghi ra trang tóm tắt của GitHub Actions để xem nhanh bước lỗi mà không cần mở log. */
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function step(name, operation) {
  try {
    const result = await operation();
    console.log(`✓ ${name}`);
    passed += 1;
    results.push({ name, ok: true });
    return result;
  } catch (error) {
    console.error(`✗ ${name}: ${error.message}`);
    failed += 1;
    results.push({ name, ok: false, message: error.message });
    throw error;
  }
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { username }, select: { id: true } });
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

async function waitToast(page, text) {
  try {
    await page.waitForFunction((expected) => document.querySelector('#toast')?.textContent?.includes(expected), text, {
      timeout: 5000
    });
  } catch {
    const actual = await page.locator('#toast').textContent();
    throw new Error(`Cần toast “${text}”, thực tế “${actual}”`);
  }
}

// Menu chính chỉ có Tổng quan, Giao dịch, Kế hoạch, Trợ lý (+ Ví, Danh mục trong Thiết lập); các màn còn lại mở bằng tab con.
const HUB_TABS = { reports: ['dashboard', 'reports'], goals: ['budgets', 'goals'], planning: ['budgets', 'recurring'] };
async function nav(page, label, viewId) {
  const hub = HUB_TABS[label];
  await page.locator(`.nav-item[data-view="${hub ? hub[0] : label}"]`).click();
  if (hub) await page.locator(`#hub-tabs [data-hub-tab="${hub[1]}"]`).click();
  await page.locator(`#view-${viewId || label}.active`).waitFor({ state: 'visible' });
}

async function noHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  assert(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} tràn ngang: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`
  );
}

async function run() {
  await cleanup();
  await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  // Tắt hướng dẫn tại chỗ tự bật để lớp phủ không che các nút cần bấm; luồng hướng dẫn được kiểm riêng ở bước dưới.
  await context.addInitScript(() => localStorage.setItem('somoc_tours_off', '1'));
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) =>
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`)
  );

  await step('Mở màn hình đăng nhập', async () => {
    const response = await page.goto(ROOT, { waitUntil: 'networkidle' });
    assert(response?.status() === 200, `Trang chủ HTTP ${response?.status()}`);
    await page.locator('#login-form').waitFor({ state: 'visible' });
    assert(
      await page.locator('#login-screen').getByText('Sổ Mộc', { exact: true }).isVisible(),
      'Thiếu nhận diện Sổ Mộc trên màn hình đăng nhập'
    );
    await page.screenshot({ path: `${screenshots}/01-login-desktop.png`, fullPage: true });
    await noHorizontalOverflow(page, 'Trang đăng nhập desktop');
  });

  await step('Mở các luồng đăng ký và quên mật khẩu', async () => {
    await page.locator('#open-register').click();
    await page.locator('#register-modal:not(.hidden)').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('#open-forgot-password').click();
    await page.locator('#forgot-password-modal:not(.hidden)').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
  });

  await step('Mở liên kết đặt lại mật khẩu', async () => {
    const response = await page.goto(`${ROOT}/reset-password?token=ui-test-reset-token-placeholder`, {
      waitUntil: 'networkidle'
    });
    assert(response?.status() === 200, `Trang đặt lại mật khẩu HTTP ${response?.status()}`);
    await page.locator('#reset-password-modal:not(.hidden)').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.goto(ROOT, { waitUntil: 'networkidle' });
  });

  await step('Tạo tài khoản qua giao diện', async () => {
    await page.locator('#open-register').click();
    await page.locator('#register-username').fill(username);
    await page.locator('#register-full-name').fill('Người dùng UI Test');
    await page.locator('#register-email').fill(email);
    await page.locator('#register-password').fill(initialPassword);
    await page.locator('#register-confirm-password').fill(initialPassword);
    await page.locator('#register-form button[type="submit"]').click();
    await page.locator('#app:not(.hidden)').waitFor({ state: 'visible' });
    // Slide chào mừng thay cho thông báo "Tài khoản đã được tạo" để hai thứ không đè lên nhau.
    await page.locator('#welcome-modal:not(.hidden)').waitFor({ state: 'visible' });
    assert(!(await page.locator('#toast.show').count()), 'Thông báo đè lên slide chào mừng');
    assert(
      (await page.locator('#welcome-slide').textContent())?.includes('Bạn muốn Sổ Mộc giúp gì'),
      'Slide chào mừng không mở đúng màn đầu'
    );
    await page.screenshot({ path: `${screenshots}/01b-onboarding-desktop.png`, fullPage: true });
    await page.locator('#welcome-skip').click();
    await page.locator('#welcome-modal.hidden').waitFor({ state: 'attached' });
    await page.locator('#logout-btn').click();
    await page.locator('#login-screen:not(.hidden)').waitFor({ state: 'visible' });
  });

  await step('Đăng nhập qua giao diện', async () => {
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(initialPassword);
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/v1/reports/summary?') && response.ok()),
      page.locator('#login-form button[type="submit"]').click()
    ]);
    await page.locator('#app:not(.hidden)').waitFor({ state: 'visible' });
    await page.locator('#view-dashboard.active').waitFor({ state: 'visible' });
    assert((await page.locator('#user-name').textContent())?.includes('Test'), 'Tên người dùng không hiển thị đúng');
  });

  await step('Kiểm tra dashboard desktop', async () => {
    // Người chưa có ví và giao dịch: Tổng quan ẩn các khối 0 ₫, chỉ còn thẻ thiết lập.
    await page.locator('#view-dashboard.is-new').waitFor({ state: 'attached' });
    assert(
      (await page.locator('#onboarding-card').isVisible()) && !(await page.locator('#total-balance').isVisible()),
      'Tổng quan người mới vẫn hiện khối số liệu trống'
    );
    assert(
      (await page.locator('#recent-transactions').count()) === 1 &&
        (await page.locator('#wallet-preview').count()) === 1,
      'Thiếu vùng dữ liệu dashboard'
    );
    await page.screenshot({ path: `${screenshots}/02-dashboard-desktop.png`, fullPage: true });
    await noHorizontalOverflow(page, 'Dashboard desktop');
  });

  await step('Tạo, xem, sửa, lưu trữ và khôi phục ví', async () => {
    await nav(page, 'wallets');
    await page.locator('#open-wallet').click();
    await page.locator('#wallet-name').fill('Ví UI Test');
    await page.locator('#wallet-type').selectOption('E_WALLET');
    await page.locator('#wallet-currency').fill('VND');
    await page.locator('#wallet-opening-balance').fill('500000');
    const missingRenderTargets = await page.evaluate(() =>
      [
        'open-profile',
        'today',
        'total-balance',
        'income',
        'expense',
        'net',
        'transaction-wallet-filter',
        'wallet-preview',
        'show-archived-wallets',
        'all-wallets',
        'income-category-count',
        'expense-category-count',
        'income-categories',
        'expense-categories',
        'spending-categories',
        'budget-list',
        'goal-list',
        'tx-wallet',
        'tx-destination',
        'tx-category',
        'tx-date'
      ].filter((id) => !document.getElementById(id))
    );
    assert(missingRenderTargets.length === 0, `Thiếu phần tử render: ${missingRenderTargets.join(', ')}`);
    await page.locator('#wallet-form button[type="submit"]').click();
    await waitToast(page, 'Đã tạo ví mới');
    let card = page.locator('#all-wallets .wallet-card').filter({ hasText: 'Ví UI Test' });
    await card.waitFor({ state: 'visible' });
    await card.getByRole('button', { name: 'Chi tiết' }).click();
    await page.locator('#wallet-detail-modal:not(.hidden)').waitFor({ state: 'visible' });
    assert(
      (await page.locator('#wallet-detail').textContent())?.includes('500.000'),
      'Chi tiết ví không hiển thị số dư'
    );
    await page.locator('[data-close-modal="wallet-detail-modal"]').click();
    await card.getByRole('button', { name: 'Sửa' }).click();
    await page.locator('#wallet-name').fill('Ví UI Test cập nhật');
    await page.locator('#wallet-form button[type="submit"]').click();
    await waitToast(page, 'Đã cập nhật ví');
    card = page.locator('#all-wallets .wallet-card').filter({ hasText: 'Ví UI Test cập nhật' });
    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Lưu trữ' }).click();
    await waitToast(page, 'Đã lưu trữ ví');
    await page.locator('#show-archived-wallets').check();
    card = page.locator('#all-wallets .wallet-card').filter({ hasText: 'Ví UI Test cập nhật' });
    await card.waitFor({ state: 'visible' });
    await card.getByRole('button', { name: 'Khôi phục' }).click();
    await waitToast(page, 'Đã khôi phục ví');
    await page.locator('#open-wallet').click();
    await page.locator('#wallet-name').fill('Ví UI Đích');
    await page.locator('#wallet-type').selectOption('BANK');
    await page.locator('#wallet-currency').fill('VND');
    await page.locator('#wallet-opening-balance').fill('1000000');
    await page.locator('#wallet-form button[type="submit"]').click();
    await waitToast(page, 'Đã tạo ví mới');
  });

  await step('Tạo, sửa và đổi chế độ hiển thị danh mục', async () => {
    await nav(page, 'categories');
    await page.locator('#open-category').click();
    await page.locator('#category-name').fill('Chi tiêu UI Test');
    await page.locator('#category-type').selectOption('EXPENSE');
    await page.locator('#category-form button[type="submit"]').click();
    await waitToast(page, 'Đã tạo danh mục mới');
    const item = page.locator('.category-item').filter({ hasText: 'Chi tiêu UI Test' });
    await item.waitFor({ state: 'visible' });
    await item.getByRole('button', { name: 'Sửa' }).click();
    await page.locator('#category-name').fill('Chi tiêu UI cập nhật');
    await page.locator('#category-form button[type="submit"]').click();
    await waitToast(page, 'Đã cập nhật danh mục');
    await page.locator('[data-category-mode="flat"]').click();
    assert(await page.locator('[data-category-mode="flat"].active').isVisible(), 'Không chuyển được dạng danh sách');
    await page.locator('[data-category-mode="tree"]').click();
  });

  await step('Ghi khoản chi kèm hóa đơn', async () => {
    await nav(page, 'transactions');
    await page.locator('#open-transaction').click();
    await page.locator('#tx-amount').fill('120000');
    await page.locator('#tx-category').selectOption({ label: 'Chi tiêu UI cập nhật' });
    await page.locator('#tx-note').fill('Giao dịch UI Test');
    await page.locator('#tx-receipt').setInputFiles({
      name: 'hoa-don-ui.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%ui-test\n')
    });
    await page.locator('#transaction-form button[type="submit"]').click();
    await waitToast(page, 'Đã lưu giao dịch mới');
    await page
      .locator('#all-transactions .transaction-row')
      .filter({ hasText: 'Giao dịch UI Test' })
      .waitFor({ state: 'visible' });
  });

  await step('Xem, xóa hóa đơn và sửa giao dịch', async () => {
    let row = page.locator('#all-transactions .transaction-row').filter({ hasText: 'Giao dịch UI Test' });
    await row.getByRole('button', { name: 'Sửa' }).click();
    await page
      .locator('#tx-receipts-list .receipt-item')
      .filter({ hasText: 'hoa-don-ui.pdf' })
      .waitFor({ state: 'visible' });
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#tx-receipts-list [data-receipt-action="delete"]').click();
    await waitToast(page, 'Đã xóa hóa đơn');
    await page.locator('#tx-note').fill('Giao dịch UI đã sửa');
    await page.locator('#transaction-form button[type="submit"]').click();
    await waitToast(page, 'Đã cập nhật giao dịch');
    row = page.locator('#all-transactions .transaction-row').filter({ hasText: 'Giao dịch UI đã sửa' });
    await row.waitFor({ state: 'visible' });
  });

  await step('Ghi khoản thu và chuyển ví hợp lệ', async () => {
    await page.locator('#open-transaction').click();
    await page.locator('.type-switch label').filter({ hasText: 'Khoản thu' }).click();
    await page.locator('#tx-amount').fill('300000');
    await page.locator('#tx-note').fill('Thu nhập UI Test');
    await page.locator('#transaction-form button[type="submit"]').click();
    await waitToast(page, 'Đã lưu giao dịch mới');
    await page.locator('#open-transaction').click();
    await page.locator('.type-switch label').filter({ hasText: 'Chuyển ví' }).click();
    const source = await page.locator('#tx-wallet').inputValue();
    const destination = await page.locator('#tx-destination').inputValue();
    assert(source && destination && source !== destination, 'Form chuyển ví chưa tự chọn ví đích hợp lệ');
    await page.locator('#tx-amount').fill('50000');
    await page.locator('#tx-note').fill('Chuyển ví UI Test');
    await page.locator('#transaction-form button[type="submit"]').click();
    await waitToast(page, 'Đã lưu giao dịch mới');
  });

  await step('Lọc giao dịch và tải CSV', async () => {
    await page.locator('#transaction-keyword-filter').fill('Giao dịch UI đã sửa');
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/transactions?') && response.url().includes('keyword=') && response.ok()
      ),
      page.locator('#apply-transaction-filter').click()
    ]);
    await page
      .locator('#all-transactions .transaction-row')
      .filter({ hasText: 'Giao dịch UI đã sửa' })
      .waitFor({ state: 'visible' });
    assert((await page.locator('#all-transactions .transaction-row').count()) === 1, 'Bộ lọc từ khóa trả thừa dữ liệu');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-csv').click();
    const download = await downloadPromise;
    assert(download.suggestedFilename().endsWith('.csv'), 'Tệp xuất không phải CSV');
    await page.locator('#transaction-keyword-filter').fill('');
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/transactions?') && !response.url().includes('keyword=') && response.ok()
      ),
      page.locator('#apply-transaction-filter').click()
    ]);
  });

  await step('Tạo và sửa ngân sách', async () => {
    await nav(page, 'budgets');
    await page.locator('#open-budget').click();
    await page.locator('#budget-name').fill('Ngân sách UI Test');
    await page.locator('#budget-amount').fill('1000000');
    await page.locator('#budget-category').selectOption({ label: 'Chi tiêu UI cập nhật' });
    await page.locator('#budget-form button[type="submit"]').click();
    await waitToast(page, 'Đã tạo ngân sách');
    const card = page.locator('#budget-list .plan-card').filter({ hasText: 'Ngân sách UI Test' });
    await card.getByRole('button', { name: 'Sửa' }).click();
    await page.locator('#budget-name').fill('Ngân sách UI cập nhật');
    await page.locator('#budget-form button[type="submit"]').click();
    await waitToast(page, 'Đã cập nhật ngân sách');
  });

  await step('Tạo, đóng góp và sửa mục tiêu', async () => {
    await nav(page, 'goals');
    await page.locator('#open-goal').click();
    await page.locator('#goal-name').fill('Mục tiêu UI Test');
    await page.locator('#goal-target').fill('2000000');
    await page.locator('#goal-form button[type="submit"]').click();
    await waitToast(page, 'Đã tạo mục tiêu');
    let card = page.locator('#goal-list .plan-card').filter({ hasText: 'Mục tiêu UI Test' });
    await card.getByRole('button', { name: 'Góp tiền' }).click();
    await page.locator('#contribution-amount').fill('500000');
    await page.locator('#contribution-note').fill('Đóng góp UI');
    await page.locator('#contribution-form button[type="submit"]').click();
    await waitToast(page, 'Đã cập nhật tiến độ mục tiêu');
    card = page.locator('#goal-list .plan-card').filter({ hasText: 'Mục tiêu UI Test' });
    assert((await card.textContent())?.includes('25%'), 'Tiến độ mục tiêu không hiển thị 25%');
    await card.getByRole('button', { name: 'Sửa' }).click();
    await page.locator('#goal-name').fill('Mục tiêu UI cập nhật');
    await page.locator('#goal-form button[type="submit"]').click();
    await waitToast(page, 'Đã cập nhật mục tiêu');
  });

  await step('Kiểm tra báo cáo và đối soát', async () => {
    await nav(page, 'reports');
    await page.locator('#reconciliation-list .reconciliation-row').nth(1).waitFor({ state: 'visible' });
    assert((await page.locator('#report-currencies .metric-card').count()) >= 1, 'Báo cáo không có thẻ tiền tệ');
    const reportText = await page.locator('#report-currencies').textContent();
    assert(
      reportText?.includes('300.000') && reportText?.includes('120.000'),
      'Báo cáo trong ngày chưa phản ánh đúng khoản thu/chi vừa tạo'
    );
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/v1/reports/summary?') && response.ok()),
      page.locator('[data-report-range="year"]').click()
    ]);
    assert(
      (await page.locator('[data-report-range="year"].active').count()) === 1,
      'Chọn nhanh kỳ báo cáo không đổi trạng thái'
    );
    await page.screenshot({ path: `${screenshots}/03-reports-desktop.png`, fullPage: true });
  });

  await step('Tự động hóa, hóa đơn, nhãn và nhóm gia đình', async () => {
    await nav(page, 'planning');
    await page.locator('#recurring-wallet option').nth(1).waitFor({ state: 'attached' });
    await page.locator('#recurring-name').fill('Internet UI Test');
    await page.locator('#recurring-amount').fill('250000');
    await page.locator('#recurring-wallet').selectOption({ index: 1 });
    await page.locator('#recurring-date').fill(new Date().toISOString().slice(0, 10));
    await page.locator('#recurring-form button[type="submit"]').click();
    await page.locator('#recurring-list').getByText('Internet UI Test').waitFor();
    await page.locator('[data-planning-tab="bills"]').click();
    await page.locator('#bill-name').fill('Tiền điện UI Test');
    await page.locator('#bill-amount').fill('350000');
    await page.locator('#bill-wallet').selectOption({ index: 1 });
    await page.locator('#bill-date').fill(new Date().toISOString().slice(0, 10));
    await page.locator('#bill-form button[type="submit"]').click();
    await page.locator('#bill-list').getByText('Tiền điện UI Test').waitFor();
    await page.locator('[data-planning-tab="tags"]').click();
    await page.locator('#tag-name').fill('Cần xem');
    await page.locator('#tag-form button[type="submit"]').click();
    await page
      .locator('#tag-list')
      .getByText(/Cần xem/)
      .waitFor();
    await page.locator('[data-planning-tab="household"]').click();
    await page.locator('#household-name').fill('Gia đình UI Test');
    await page.locator('#household-form button[type="submit"]').click();
    await page.locator('#household-list').getByText('Gia đình UI Test').waitFor();
    await page.screenshot({ path: `${screenshots}/03b-planning-desktop.png`, fullPage: true });
  });

  await step('Trợ lý thông minh và nhập giao dịch tự nhiên', async () => {
    await nav(page, 'insights');
    await page.locator('#agent-toolbar').waitFor();
    const markdown = await page.evaluate(() =>
      renderMarkdown(
        '## Tổng quan\n\n- **Thu:** 1.000đ\n- `Chi`: 500đ\n\n| Mục | Số tiền |\n|---|---:|\n| Ăn uống | 500đ |\n\n<script>alert(1)</script>'
      )
    );
    assert(markdown.includes('<h4>Tổng quan</h4>'), 'Không render tiêu đề Markdown');
    assert(
      markdown.includes('<ul>') && markdown.includes('<strong>Thu:</strong>'),
      'Không render danh sách hoặc chữ đậm Markdown'
    );
    assert(
      markdown.includes('<table>') && markdown.includes('<code>Chi</code>'),
      'Không render bảng hoặc inline code Markdown'
    );
    assert(
      !markdown.includes('<script>') && markdown.includes('&lt;script&gt;'),
      'Markdown renderer không chặn HTML nguy hiểm'
    );
    const streamingMarkdown = await page.evaluate(async () => {
      const element = document.createElement('div');
      element.id = 'streaming-markdown-test';
      document.body.appendChild(element);
      const task = streamAgentText(
        element,
        '**Formatted while streaming**\n\n' + 'Streaming Markdown test content. '.repeat(16)
      );
      let formattedWhileStreaming = false;
      for (let attempt = 0; attempt < 40 && !formattedWhileStreaming; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        formattedWhileStreaming = element.classList.contains('streaming') && Boolean(element.querySelector('strong'));
      }
      await task;
      const result = {
        formattedWhileStreaming,
        stillStreaming: element.classList.contains('streaming'),
        finalStrong: Boolean(element.querySelector('strong'))
      };
      element.remove();
      return result;
    });
    assert(streamingMarkdown.formattedWhileStreaming, 'Markdown was only rendered after streaming finished');
    assert(
      !streamingMarkdown.stillStreaming && streamingMarkdown.finalStrong,
      'Streaming Markdown did not finish in the expected state'
    );
    // Máy chủ không có khóa AI (như CI): giao diện phải báo rõ Trợ lý chưa cấu hình, phần hỏi đáp với AI thật bỏ qua
    // (giống test:agent). Có khóa AI thì chạy đủ luồng đồng ý, tạo bản xem trước, xác nhận và hoàn tác.
    await page.locator('#agent-consent:not(.hidden)').waitFor();
    if (await page.locator('#agent-consent').getByText('chưa được cấu hình').count()) {
      assert(
        !(await page.locator('#agent-consent-toggle').count()),
        'Máy chủ chưa có AI nhưng vẫn hiện nút đồng ý dùng AI'
      );
      console.log('  (bỏ qua hỏi đáp với AI: máy chủ chưa cấu hình khóa nhà cung cấp AI)');
      await page.screenshot({ path: `${screenshots}/03c-agent-desktop.png`, fullPage: true });
      return;
    }
    await page.locator('#agent-consent-toggle').waitFor();
    await page.locator('#agent-consent-toggle').click();
    await page
      .locator('#agent-consent')
      .getByText(/Đã cho phép/)
      .waitFor();
    // Ô nhập được dựng khi màn Trợ lý còn ẩn: mở ra phải cao bình thường, không bị bẹp.
    const inputBox = await page.locator('#assistant-question').boundingBox();
    assert(inputBox && inputBox.height >= 40, `Ô nhập khung chat bị bẹp (cao ${inputBox?.height}px)`);
    // Shift+Enter xuống dòng trong ô nhập, không gửi tin nhắn.
    const question = page.locator('#assistant-question');
    const sentBefore = await page.locator('#assistant-history .assistant-message.user').count();
    await question.fill('');
    await question.pressSequentially('dòng một');
    await question.press('Shift+Enter');
    await question.pressSequentially('dòng hai');
    assert((await question.inputValue()) === 'dòng một\ndòng hai', 'Shift+Enter phải xuống dòng trong ô nhập');
    assert(
      (await page.locator('#assistant-history .assistant-message.user').count()) === sentBefore,
      'Shift+Enter không được gửi tin nhắn'
    );
    await page
      .locator('#assistant-question')
      .fill(
        'Đây là giao dịch mới. Hãy tạo bản nháp ghi 76.543đ tiền ăn trưa hôm nay bằng ví Ví UI Test cập nhật để tôi xác nhận'
      );
    await page.locator('#assistant-form button[type="submit"]').click();
    await page.locator('#assistant-history .agent-action.pending').waitFor();
    await page.locator('#assistant-history [data-agent-confirm]').click();
    await page.locator('#assistant-history .agent-action.executed').waitFor();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#assistant-history [data-agent-undo]').click();
    await page.locator('#assistant-history .agent-action.undone').waitFor();
    await page.locator('#assistant-question').fill('Tình hình chi tiêu của tôi thế nào?');
    // Enter gửi tin nhắn như bấm nút Gửi.
    await page.locator('#assistant-question').press('Enter');
    await page.locator('#assistant-history .assistant-message.bot').last().waitFor();
    assert((await page.locator('#agent-conversation').inputValue()).length > 0, 'Hội thoại agent chưa được lưu');
    await page.screenshot({ path: `${screenshots}/03c-agent-desktop.png`, fullPage: true });
  });

  await step('Thông báo và giao diện tối', async () => {
    await page.locator('#notification-btn').click();
    await page.locator('#notification-drawer:not(.hidden)').waitFor();
    await page.locator('#read-all-notifications').click();
    await page.locator('#close-notifications').click();
    await page.locator('#theme-btn').click();
    assert(await page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'Dark mode chưa được áp dụng');
    await page.locator('#theme-btn').click();
  });

  await step('Cập nhật hồ sơ', async () => {
    await page.locator('#open-profile').click();
    await page.locator('#profile-modal:not(.hidden)').waitFor({ state: 'visible' });
    assert((await page.locator('#session-list .feature-row').count()) >= 1, 'Không hiển thị phiên đăng nhập');
    await page.locator('#profile-full-name').fill('UI Test Đã Cập Nhật');
    await page.locator('#profile-phone').fill(`09${String(Date.now()).slice(-8)}`);
    await page.locator('#profile-form button[type="submit"]').click();
    await waitToast(page, 'Đã cập nhật hồ sơ');
    await page.locator('[data-close-modal="profile-modal"]').click();
    await nav(page, 'dashboard');
    assert((await page.locator('#user-name').textContent())?.includes('Nhật'), 'Tên hồ sơ chưa phản ánh lên header');
  });

  await step('Kiểm tra UX trên màn hình mobile', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#view-dashboard.active').waitFor({ state: 'visible' });
    await noHorizontalOverflow(page, 'Dashboard mobile');
    assert(await page.locator('#mobile-add-transaction').isVisible(), 'Thiếu nút ghi giao dịch nhanh trên mobile');
    await page.locator('#menu-btn').click();
    assert(await page.locator('.sidebar.open').isVisible(), 'Menu mobile không mở');
    assert(await page.locator('#sidebar-backdrop.show').isVisible(), 'Menu mobile thiếu lớp nền');
    await page.waitForTimeout(300);
    const sidebarBox = await page.locator('.sidebar.open').boundingBox();
    assert(
      sidebarBox && sidebarBox.x >= -1 && sidebarBox.width >= 200,
      'Menu mobile chưa trượt hoàn toàn vào viewport'
    );
    await page.screenshot({ path: `${screenshots}/04-dashboard-mobile-menu.png` });
    await page.locator('.nav-item[data-view="transactions"]').click();
    await page.locator('#mobile-add-transaction').click();
    const modalBox = await page.locator('#transaction-modal .modal-card').boundingBox();
    assert(modalBox && modalBox.width <= 390, 'Modal giao dịch rộng hơn viewport mobile');
    await noHorizontalOverflow(page, 'Modal giao dịch mobile');
    await page.screenshot({ path: `${screenshots}/05-transaction-mobile.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.locator('#transaction-modal.hidden').waitFor({ state: 'attached' });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await step('Xem thử hướng dẫn người mới khi tài khoản đã có dữ liệu', async () => {
    const counts = () =>
      page.evaluate(async () => {
        const headers = { Authorization: `Bearer ${window.state.token}` };
        const get = (path) =>
          fetch(`/api/v1${path}`, { headers })
            .then((response) => response.json())
            .then((body) => body.data);
        const [wallets, categories, transactions] = await Promise.all([
          get('/wallets'),
          get('/categories?tree=false'),
          get('/transactions?limit=100')
        ]);
        return `${wallets.length}/${categories.length}/${transactions.length}`;
      });
    const before = await counts();
    await page.locator('#open-profile').click();
    await page.locator('#profile-modal:not(.hidden)').waitFor({ state: 'visible' });
    await page.locator('#restart-welcome').click();
    await page.locator('#welcome-modal:not(.hidden)').waitFor({ state: 'visible' });
    await page.locator('#welcome-preview-note').waitFor({ state: 'visible' });
    assert((await page.locator('#welcome-dots span').count()) === 5, 'Xem thử phải đi đủ 5 bước');
    for (const title of ['Tiền của bạn đang ở đâu?', 'Bạn hay tiêu vào đâu?', 'Ghi khoản chi đầu tiên']) {
      await page.locator('#welcome-next').click();
      await page.locator('#welcome-title', { hasText: title }).waitFor();
    }
    await page.locator('#welcome-next').click();
    await page.locator('#welcome-title', { hasText: 'thiết lập xong' }).waitFor();
    await page.locator('#welcome-skip').click();
    await page.locator('#welcome-modal.hidden').waitFor({ state: 'attached' });
    assert((await counts()) === before, 'Xem thử hướng dẫn không được tạo thêm ví, danh mục hay giao dịch');
  });

  await step('Hướng dẫn nhanh chỉ từng nút', async () => {
    await page.locator('#open-help').click();
    await page.locator('#coach:not(.hidden)').waitFor({ state: 'visible' });
    // Bong bóng được điền sau một nhịp (chờ menu mobile trượt ra), nên chờ nội dung thay vì đọc ngay.
    await page
      .waitForFunction(() => document.querySelector('#coach-count')?.textContent === '1/7', null, { timeout: 5000 })
      .catch(() => {
        throw new Error('Hướng dẫn nhanh không bắt đầu từ bước đầu');
      });
    await page.locator('#coach-next').click();
    await page
      .waitForFunction(() => document.querySelector('#coach-title')?.textContent === 'Tổng quan', null, {
        timeout: 5000
      })
      .catch(() => {
        throw new Error('Hướng dẫn nhanh không sang bước tiếp theo');
      });
    await page.keyboard.press('Escape');
    await page.locator('#coach.hidden').waitFor({ state: 'attached' });
  });

  await step('Xóa dữ liệu qua giao diện', async () => {
    await nav(page, 'budgets');
    let card = page.locator('#budget-list .plan-card').filter({ hasText: 'Ngân sách UI cập nhật' });
    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Xóa' }).click();
    await waitToast(page, 'Đã xóa ngân sách');
    await nav(page, 'goals');
    card = page.locator('#goal-list .plan-card').filter({ hasText: 'Mục tiêu UI cập nhật' });
    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Xóa' }).click();
    await waitToast(page, 'Đã xóa mục tiêu');
    await nav(page, 'transactions');
    for (const note of ['Giao dịch UI đã sửa', 'Thu nhập UI Test', 'Chuyển ví UI Test']) {
      const row = page.locator('#all-transactions .transaction-row').filter({ hasText: note });
      page.once('dialog', (dialog) => dialog.accept());
      await row.getByRole('button', { name: 'Xóa' }).click();
      await waitToast(page, 'Đã xóa giao dịch');
    }
    await nav(page, 'categories');
    const category = page.locator('.category-item').filter({ hasText: 'Chi tiêu UI cập nhật' });
    page.once('dialog', (dialog) => dialog.accept());
    await category.getByRole('button', { name: 'Xóa' }).click();
    await waitToast(page, 'Đã xóa danh mục');
  });

  await step('Đổi mật khẩu và đăng nhập lại', async () => {
    await page.locator('#open-profile').click();
    await page.locator('#current-password').fill(initialPassword);
    await page.locator('#new-password').fill(changedPassword);
    await page.locator('#password-form button[type="submit"]').click();
    await waitToast(page, 'Đã đổi mật khẩu');
    await page.locator('#login-screen:not(.hidden)').waitFor({ state: 'visible' });
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(changedPassword);
    await page.locator('#login-form button[type="submit"]').click();
    await page.locator('#app:not(.hidden)').waitFor({ state: 'visible' });
  });

  await step('Tự khôi phục phiên, làm mới và đăng xuất', async () => {
    const errorsBeforeRefresh = consoleErrors.length;
    await page.evaluate(() => {
      state.token = 'access-token-het-han-gia-lap';
    });
    await nav(page, 'reports');
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/v1/reports/summary?') && response.ok()),
      page.locator('[data-report-range="month"]').click()
    ]);
    const expectedUnauthorizedLogs = consoleErrors.splice(errorsBeforeRefresh);
    assert(
      expectedUnauthorizedLogs.length > 0 && expectedUnauthorizedLogs.every((message) => message.includes('401')),
      `Log ngoài dự kiến khi khôi phục phiên: ${expectedUnauthorizedLogs.join(' | ')}`
    );
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/logout') && response.ok()),
      page.locator('#logout-btn').click()
    ]);
    await page.locator('#login-screen:not(.hidden)').waitFor({ state: 'visible' });
    await waitToast(page, 'Đã đăng xuất');
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    const activeSessions = user
      ? await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } } })
      : -1;
    assert(activeSessions === 0, `Còn ${activeSessions} refresh token hoạt động sau đăng xuất`);
  });

  await step('Không có lỗi JavaScript hoặc request trình duyệt', async () => {
    assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);
    assert(failedRequests.length === 0, `Request failures: ${failedRequests.join(' | ')}`);
  });

  await context.close();
}

try {
  await run();
} catch (error) {
  // Lỗi ngoài các bước (ví dụ không mở được trình duyệt) vẫn phải được ghi nhận, không được nuốt im lặng.
  if (!results.some((item) => !item.ok)) {
    console.error(`✗ Khởi động kiểm thử: ${error.message}`);
    failed += 1;
    results.push({ name: 'Khởi động kiểm thử', ok: false, message: error.message });
  }
  if (browser) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    if (pages[0])
      await pages[0].screenshot({ path: `${screenshots}/failure.png`, fullPage: true }).catch(() => undefined);
  }
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await cleanup().catch((error) => {
    console.error(`Không thể dọn dữ liệu UI test: ${error.message}`);
    failed += 1;
  });
  await prisma.$disconnect();
}

console.log(`\nKết quả UI E2E: ${passed} đạt, ${failed} lỗi.`);
console.log(`Ảnh kiểm tra: ${screenshots}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const escape = (text) => String(text).replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 500);
  const rows = results.map(
    (item) => `| ${item.ok ? '✅' : '❌'} | ${escape(item.name)} | ${item.ok ? '' : escape(item.message)} |`
  );
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    [
      `### Kiểm thử giao diện: ${passed} đạt, ${failed} lỗi`,
      '',
      '| | Bước | Lỗi |',
      '| --- | --- | --- |',
      ...rows,
      ''
    ].join('\n')
  );
}
if (failed) process.exitCode = 1;
