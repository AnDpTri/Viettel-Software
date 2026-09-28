import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL ||= 'postgresql://finance:finance_secret@localhost:5432/personal_finance?schema=public';
const prisma = new PrismaClient();
const base = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const createdUserIds = [];

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(globalThis.accessToken ? { authorization: `Bearer ${globalThis.accessToken}` } : {}), ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body.data;
}

/** Tạo tài khoản test riêng cho từng kịch bản (không bao giờ dùng tài khoản demo), bật đồng ý AI và đăng nhập bằng nó. */
async function createTestUser(label) {
  const username = `e2e_agent_${label}_${suffix}`;
  globalThis.accessToken = '';
  const registered = await request('/auth/register', { method: 'POST', body: JSON.stringify({ username, email: `${username}@example.com`, password: 'E2eAgent1!', fullName: 'Người dùng E2E Agent' }) });
  createdUserIds.push(registered.user.id);
  globalThis.accessToken = registered.accessToken;
  await request('/insights/settings', { method: 'PUT', body: JSON.stringify({ consent: true }) });
  return registered.user;
}

async function cleanup() {
  if (!createdUserIds.length) return;
  const where = { userId: { in: createdUserIds } };
  await prisma.transaction.deleteMany({ where });
  await prisma.category.deleteMany({ where: { ...where, parentId: { not: null } } });
  await prisma.category.deleteMany({ where });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
}

async function conversationScenario() {
  await createTestUser('chat');
  await request('/wallets', { method: 'POST', body: JSON.stringify({ name: 'Tiền mặt', type: 'CASH', currency: 'VND', openingBalance: 0 }) });
  const greeting = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Bạn là ai?' }) });
  if (greeting.provider !== 'deepseek' || !/(trợ lý|Sổ Mộc)/i.test(greeting.answer) || greeting.actions.length) throw new Error('Hội thoại trực tiếp qua AI chưa hoạt động.');
  const capabilities = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'bạn có thể làm gì', conversationId: greeting.conversationId }) });
  if (!/giao dịch|khoản (thu|chi)|ghi chép|chi tiêu/i.test(capabilities.answer) || capabilities.actions.length) throw new Error(`Giới thiệu năng lực agent chưa đúng (actions=${capabilities.actions.length}): "${capabilities.answer}"`);
  const remembered = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Hãy nhớ rằng tôi thích xem số liệu theo tháng', conversationId: greeting.conversationId }) });
  if (!remembered.answer?.trim()) throw new Error('Agent không trả lời sau khi lưu ghi nhớ.');
  const memories = await request('/insights/memories');
  if (!memories.some((item) => /theo tháng/i.test(item.content))) throw new Error('Không đọc được ghi nhớ dài hạn vừa tạo.');
  const recall = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'tôi vừa nói gì trong cuộc trò chuyện này?', conversationId: greeting.conversationId }) });
  if (!/bạn có thể làm gì|thích xem số liệu/i.test(recall.answer)) throw new Error('Agent không nhắc lại đúng lịch sử SQL.');
  const sensitiveNote = 'chi phí sức khỏe tình dục riêng tư';
  const agent = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: `Đây là giao dịch mới. Hãy tạo bản nháp chi 76.329đ hôm nay bằng ví Tiền mặt, giữ nguyên ghi chú: ${sensitiveNote}` }) });
  if (agent.actions.length !== 1) throw new Error('Agent không tạo đúng một hành động chờ duyệt.');
  if (agent.actions[0].preview?.note !== sensitiveNote) throw new Error('Agent không giữ nguyên ghi chú nhạy cảm.');
  const actionId = agent.actions[0].id;
  const confirmed = await request(`/insights/actions/${actionId}/confirm`, { method: 'POST', body: '{}' });
  if (confirmed.status !== 'EXECUTED') throw new Error('Agent không thực thi hành động.');
  const conversation = await request(`/insights/conversations/${agent.conversationId}/messages`);
  if (conversation.messages.length < 2) throw new Error('Lịch sử hội thoại chưa được lưu.');
  if (conversation.messages.some((item) => item.provider === 'system')) throw new Error('Xác nhận hành động vẫn sinh tin nhắn hệ thống thừa.');
  const undone = await request(`/insights/actions/${actionId}/undo`, { method: 'POST', body: '{}' });
  if (undone.status !== 'UNDONE') throw new Error('Không hoàn tác được hành động.');
  console.log('Agent E2E đạt: hội thoại tự nhiên -> bộ nhớ -> nhắc lịch sử -> draft -> confirm -> lưu hội thoại -> undo');
}

// AGT-F01: trạng thái hiện tại phải được mô hình ưu tiên hơn lịch sử hội thoại cũ, kể cả khi Agent từng
// nói sai (ví dụ "chưa có giao dịch" trước khi người dùng ghi giao dịch đầu tiên trong CÙNG hội thoại).
async function staleOnboardingScenario() {
  await createTestUser('stale');
  const wallet = await request('/wallets', { method: 'POST', body: JSON.stringify({ name: 'Tiền mặt', type: 'CASH', currency: 'VND', openingBalance: 0 }) });
  await request('/categories', { method: 'POST', body: JSON.stringify({ name: 'Ăn uống', type: 'EXPENSE', color: '#db7042' }) });
  const before = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Tôi nên làm gì tiếp?' }) });
  if (!/giao dịch|khoản (thu|chi)/i.test(before.answer)) throw new Error(`Agent chưa gợi ý đúng bước còn thiếu (ghi giao dịch): "${before.answer}"`);
  await request('/transactions', { method: 'POST', body: JSON.stringify({ type: 'EXPENSE', amount: 45000, walletId: wallet.id, occurredAt: new Date().toISOString(), note: 'Ăn sáng' }) });
  const after = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'chào bạn', conversationId: before.conversationId }) });
  // Cùng logic với containsStaleOnboardingClaim ở server: "đã có cả giao dịch đầu tiên" là câu ĐÚNG, chỉ tính là
  // lỗi thời khi đi kèm "chưa/còn/cần" (ví dụ "chỉ còn thiếu giao dịch đầu tiên").
  const stalePhrases = /chưa có giao dịch|(chưa|còn|cần)[^.\n]{0,40}giao dịch đầu tiên|còn thiếu[^.\n]{0,40}(giao dịch|bước)/i;
  if (stalePhrases.test(after.answer)) throw new Error(`Agent vẫn dùng dữ liệu lỗi thời sau khi đã ghi giao dịch: "${after.answer}"`);
  if (after.onboarding?.completed !== true) throw new Error('Onboarding chưa được ghi nhận hoàn thành sau khi tạo đủ dữ liệu (hồ sơ, ví, danh mục, giao dịch).');
  console.log('Agent E2E (AGT-F01) đạt: trạng thái hiện tại được ưu tiên hơn lịch sử hội thoại cũ.');
}

// AGT-F09/F10: một yêu cầu cần nhiều bản ghi phụ thuộc nhau phải xong trong MỘT lượt, MỘT nhóm, MỘT lần xác nhận.
async function batchScenario() {
  await createTestUser('batch');
  await request('/wallets', { method: 'POST', body: JSON.stringify({ name: 'Ngân hàng', type: 'BANK', currency: 'VND', openingBalance: 0 }) });
  await request('/categories', { method: 'POST', body: JSON.stringify({ name: 'Ăn uống', type: 'EXPENSE', color: '#db7042' }) });
  const turn = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Tạo danh mục chi "Dịch vụ", thêm danh mục con "Đăng ký phần mềm" bên trong nó, rồi ghi khoản chi 500k mua Claude hôm nay bằng ví Ngân hàng vào danh mục con đó.' }) });
  const types = turn.actions.map((item) => item.type);
  if (turn.actions.length < 3 || types.filter((type) => type === 'CREATE_CATEGORY').length < 2 || !types.includes('CREATE_TRANSACTION')) throw new Error(`Agent chưa tạo đủ các thay đổi trong một lượt: ${JSON.stringify(types)} — "${turn.answer}"`);
  if (new Set(turn.actions.map((item) => item.batchId)).size !== 1) throw new Error('Các thay đổi trong cùng lượt không chung một nhóm.');
  const confirmed = await request(`/insights/actions/${turn.actions[0].id}/confirm`, { method: 'POST', body: '{}' });
  if (confirmed.actions.some((item) => item.status !== 'EXECUTED')) throw new Error('Xác nhận một lần chưa thực thi cả nhóm.');
  const categories = await request('/categories?tree=false');
  const parent = categories.find((item) => item.name === 'Dịch vụ');
  const child = categories.find((item) => item.name === 'Đăng ký phần mềm');
  if (!parent || child?.parentId !== parent.id) throw new Error('Danh mục con chưa nằm trong danh mục cha vừa tạo.');
  const transactions = await request('/transactions?limit=20');
  const items = transactions.items ?? transactions;
  if (!items.some((item) => Number(item.amount) === 500000 && item.categoryId === child.id)) throw new Error('Khoản chi 500k chưa nằm trong danh mục con.');
  const undone = await request(`/insights/actions/${turn.actions[0].id}/undo`, { method: 'POST', body: '{}' });
  if (undone.actions.some((item) => item.status !== 'UNDONE')) throw new Error('Chưa hoàn tác được cả nhóm.');

  const many = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Ghi giúp mình 3 khoản chi hôm nay bằng ví Ngân hàng: cà phê 30k, cà phê 30k nữa, gửi xe 5k.' }) });
  const expenses = many.actions.filter((item) => item.type === 'CREATE_TRANSACTION');
  if (expenses.length !== 3) throw new Error(`Cần 3 bản xem trước khoản chi (kể cả hai khoản cà phê giống nhau), nhận ${expenses.length}: "${many.answer}"`);
  if (new Set(many.actions.map((item) => item.batchId)).size !== 1) throw new Error('Ba khoản chi không chung một nhóm.');
  await request(`/insights/actions/${expenses[0].id}/cancel`, { method: 'POST', body: '{}' });
  console.log('Agent E2E (nhóm thay đổi) đạt: danh mục cha + con + khoản chi trong một lượt, một lần xác nhận, hoàn tác cả nhóm; 3 khoản chi trong một nhóm.');
}

// Tái hiện lỗi thấy trong log 28/09/2026: số dư ví lấy nhầm số dư đầu kỳ; lần sao lưu thứ hai chép lại câu cũ mà
// không có nút tải; lời chào mở đầu bằng "Bạn đang ở màn Trợ lý thông minh".
async function backupAndBalanceScenario() {
  await createTestUser('backup');
  const wallet = await request('/wallets', { method: 'POST', body: JSON.stringify({ name: 'Tiền mặt', type: 'CASH', currency: 'VND', openingBalance: 2000000 }) });
  await request('/categories', { method: 'POST', body: JSON.stringify({ name: 'Ăn uống', type: 'EXPENSE', color: '#db7042' }) });
  await request('/transactions', { method: 'POST', body: JSON.stringify({ type: 'EXPENSE', amount: 110000, walletId: wallet.id, occurredAt: new Date().toISOString(), note: 'Ăn trưa' }) });
  const balance = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Ví Tiền mặt của mình còn bao nhiêu tiền?' }) });
  if (!/1[.,]890[.,]000|1,89 triệu|1\.89 triệu/i.test(balance.answer) || /2[.,]000[.,]000đ? *(là số dư|còn)/i.test(balance.answer)) throw new Error(`Số dư ví sai (đúng là 1.890.000đ): "${balance.answer}"`);
  const greeting = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'chào bạn', conversationId: balance.conversationId, uiContext: { currentView: 'insights' } }) });
  if (/đang ở (màn|mục|trang)/i.test(greeting.answer)) throw new Error(`Lời chào vẫn thuật lại màn hình đang mở: "${greeting.answer}"`);
  for (const attempt of [1, 2]) {
    const backup = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'sao lưu dữ liệu giúp tôi', conversationId: balance.conversationId }) });
    if (!backup.attachments?.length) throw new Error(`Lần sao lưu ${attempt} không có nút tải: "${backup.answer}"`);
  }
  console.log('Agent E2E (số dư, sao lưu lặp lại, lời chào) đạt: số dư hiện tại đúng, cả hai lần sao lưu đều có nút tải, không thuật lại màn hình.');
}

let failed = false;
try {
  // Kịch bản Agent cần nhà cung cấp AI thật. Máy chủ không có khóa (ví dụ CI, bản đóng gói) thì bỏ qua thay vì báo lỗi giả.
  await createTestUser('probe');
  const aiEnabled = (await request('/insights/settings')).externalAiEnabled;
  if (!aiEnabled) console.log('Bỏ qua Agent E2E: máy chủ chưa cấu hình khóa nhà cung cấp AI.');
  else {
    // E2E_AGENT_ONLY=backup,batch… để chạy riêng vài kịch bản (mỗi kịch bản tốn nhiều lượt gọi nhà cung cấp AI).
    const scenarios = { backup: backupAndBalanceScenario, chat: conversationScenario, stale: staleOnboardingScenario, batch: batchScenario };
    const only = (process.env.E2E_AGENT_ONLY || '').split(',').filter(Boolean);
    for (const [name, run] of Object.entries(scenarios)) if (!only.length || only.includes(name)) await run();
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  globalThis.accessToken = '';
  try { await cleanup(); } catch (cleanupError) { failed = true; console.error(`Không thể dọn dữ liệu kiểm thử: ${cleanupError.message}`); }
  await prisma.$disconnect();
}
if (failed) process.exitCode = 1;
