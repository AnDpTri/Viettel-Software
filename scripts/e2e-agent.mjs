import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL ||= 'postgresql://finance:finance_secret@localhost:5432/personal_finance?schema=public';
const prisma = new PrismaClient();
const base = process.env.BASE_URL || 'http://localhost:3000/api/v1';

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(globalThis.accessToken ? { authorization: `Bearer ${globalThis.accessToken}` } : {}), ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body.data;
}

const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: 'demo', password: 'Demo@123' }) });
globalThis.accessToken = login.accessToken;
const greeting = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Bạn là ai?' }) });
if (greeting.provider !== 'deepseek' || !/(trợ lý|Sổ Mộc)/i.test(greeting.answer) || greeting.actions.length) throw new Error('Hội thoại trực tiếp qua AI chưa hoạt động.');
const capabilities = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'bạn có thể làm gì', conversationId: greeting.conversationId }) });
if (!/giao dịch/i.test(capabilities.answer) || capabilities.actions.length) throw new Error('Giới thiệu năng lực agent chưa đúng.');
const remembered = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Hãy nhớ rằng tôi thích xem số liệu theo tháng', conversationId: greeting.conversationId }) });
if (!remembered.answer?.trim()) throw new Error('Agent không trả lời sau khi lưu ghi nhớ.');
const memories = await request('/insights/memories');
const matchingMemories = memories.filter((item) => /theo tháng/i.test(item.content));
if (!matchingMemories.length) throw new Error('Không đọc được ghi nhớ dài hạn vừa tạo.');
const recall = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'tôi vừa nói gì trong cuộc trò chuyện này?', conversationId: greeting.conversationId }) });
if (!/bạn có thể làm gì|thích xem số liệu/i.test(recall.answer)) throw new Error('Agent không nhắc lại đúng lịch sử SQL.');
for (const memory of matchingMemories) await request(`/insights/memories/${memory.id}`, { method: 'DELETE' });
const sensitiveNote = 'chi phí sức khỏe tình dục riêng tư';
const agent = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: `Đây là giao dịch mới. Hãy tạo bản nháp chi 76.329đ hôm nay bằng ví Tiền mặt, giữ nguyên ghi chú: ${sensitiveNote}` }) });
if (agent.actions.length !== 1) throw new Error('Agent không tạo đúng một hành động chờ duyệt.');
if (agent.actions[0].preview?.note !== sensitiveNote) throw new Error('Agent không giữ nguyên ghi chú nhạy cảm.');
const actionId = agent.actions[0].id;
const confirmed = await request(`/insights/actions/${actionId}/confirm`, { method: 'POST', body: '{}' });
if (confirmed.status !== 'EXECUTED') throw new Error('Agent không thực thi hành động.');
const conversation = await request(`/insights/conversations/${agent.conversationId}/messages`);
if (conversation.messages.length < 3) throw new Error('Lịch sử hội thoại chưa được lưu.');
const undone = await request(`/insights/actions/${actionId}/undo`, { method: 'POST', body: '{}' });
if (undone.status !== 'UNDONE') throw new Error('Không hoàn tác được hành động.');
console.log('Agent E2E đạt: hội thoại tự nhiên -> bộ nhớ -> nhắc lịch sử -> draft -> confirm -> lưu hội thoại -> undo');

// AGT-F01: trạng thái hiện tại phải được mô hình ưu tiên hơn lịch sử hội thoại cũ, kể cả khi Agent từng
// nói sai (ví dụ "chưa có giao dịch" trước khi người dùng ghi giao dịch đầu tiên trong CÙNG hội thoại).
const staleSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const staleUsername = `e2e_stale_${staleSuffix}`;
const demoAccessToken = globalThis.accessToken;
let staleUserId;
try {
  const registered = await request('/auth/register', { method: 'POST', body: JSON.stringify({ username: staleUsername, email: `${staleUsername}@example.com`, password: 'E2eStale1!', fullName: 'Người dùng E2E lỗi thời' }) });
  staleUserId = registered.user.id;
  globalThis.accessToken = registered.accessToken;
  await request('/insights/settings', { method: 'PUT', body: JSON.stringify({ consent: true }) });
  const wallet = await request('/wallets', { method: 'POST', body: JSON.stringify({ name: 'Tiền mặt', type: 'CASH', currency: 'VND', openingBalance: 0 }) });
  await request('/categories', { method: 'POST', body: JSON.stringify({ name: 'Ăn uống', type: 'EXPENSE', color: '#db7042' }) });
  const before = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Tôi nên làm gì tiếp?' }) });
  if (!/giao dịch/i.test(before.answer)) throw new Error(`Agent chưa gợi ý đúng bước còn thiếu (ghi giao dịch): "${before.answer}"`);
  await request('/transactions', { method: 'POST', body: JSON.stringify({ type: 'EXPENSE', amount: 45000, walletId: wallet.id, occurredAt: new Date().toISOString(), note: 'Ăn sáng' }) });
  const after = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'chào bạn', conversationId: before.conversationId }) });
  const stalePhrases = /chưa có giao dịch|giao dịch đầu tiên|còn thiếu[^.]*giao dịch/i;
  if (stalePhrases.test(after.answer)) throw new Error(`Agent vẫn dùng dữ liệu lỗi thời sau khi đã ghi giao dịch: "${after.answer}"`);
  if (after.onboarding?.completed !== true) throw new Error('Onboarding chưa được ghi nhận hoàn thành sau khi tạo đủ dữ liệu (hồ sơ, ví, danh mục, giao dịch).');
  console.log('Agent E2E (AGT-F01) đạt: trạng thái hiện tại được ưu tiên hơn lịch sử hội thoại cũ.');
} finally {
  globalThis.accessToken = demoAccessToken;
  if (staleUserId) {
    await prisma.transaction.deleteMany({ where: { userId: staleUserId } });
    await prisma.assistantMessage.deleteMany({ where: { conversation: { userId: staleUserId } } });
    await prisma.assistantConversation.deleteMany({ where: { userId: staleUserId } });
    await prisma.category.deleteMany({ where: { userId: staleUserId } });
    await prisma.wallet.deleteMany({ where: { userId: staleUserId } });
    await prisma.refreshToken.deleteMany({ where: { userId: staleUserId } });
    await prisma.user.deleteMany({ where: { id: staleUserId } });
  }
  await prisma.$disconnect();
}
