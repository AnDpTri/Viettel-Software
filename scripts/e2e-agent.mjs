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
const greeting = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'alo' }) });
if (greeting.provider !== 'system' || !/chào/i.test(greeting.answer)) throw new Error('Chào hỏi tự nhiên chưa hoạt động.');
const capabilities = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'bạn có thể làm gì', conversationId: greeting.conversationId }) });
if (!/giao dịch/i.test(capabilities.answer) || capabilities.actions.length) throw new Error('Giới thiệu năng lực agent chưa đúng.');
const remembered = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Hãy nhớ rằng tôi thích xem số liệu theo tháng', conversationId: greeting.conversationId }) });
if (!/sẽ nhớ/i.test(remembered.answer)) throw new Error('Bộ nhớ dài hạn chưa ghi nhận yêu cầu.');
const memories = await request('/insights/memories');
const memory = memories.find((item) => /theo tháng/i.test(item.content));
if (!memory) throw new Error('Không đọc được ghi nhớ dài hạn vừa tạo.');
const recall = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'tôi vừa nói gì trong cuộc trò chuyện này?', conversationId: greeting.conversationId }) });
if (!/bạn có thể làm gì|thích xem số liệu/i.test(recall.answer)) throw new Error('Agent không nhắc lại đúng lịch sử SQL.');
await request(`/insights/memories/${memory.id}`, { method: 'DELETE' });
const agent = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Đây là giao dịch mới. Hãy tạo bản nháp ghi 76.321đ tiền ăn trưa hôm nay bằng ví Tiền mặt để tôi xác nhận' }) });
if (agent.actions.length !== 1) throw new Error('Agent không tạo đúng một hành động chờ duyệt.');
const actionId = agent.actions[0].id;
const confirmed = await request(`/insights/actions/${actionId}/confirm`, { method: 'POST', body: '{}' });
if (confirmed.status !== 'EXECUTED') throw new Error('Agent không thực thi hành động.');
const conversation = await request(`/insights/conversations/${agent.conversationId}/messages`);
if (conversation.messages.length < 3) throw new Error('Lịch sử hội thoại chưa được lưu.');
const undone = await request(`/insights/actions/${actionId}/undo`, { method: 'POST', body: '{}' });
if (undone.status !== 'UNDONE') throw new Error('Không hoàn tác được hành động.');
console.log('Agent E2E đạt: hội thoại tự nhiên -> bộ nhớ -> nhắc lịch sử -> draft -> confirm -> lưu hội thoại -> undo');
