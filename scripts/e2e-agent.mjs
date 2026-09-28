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
const agent = await request('/insights/assistant', { method: 'POST', body: JSON.stringify({ question: 'Ghi 75k tiền ăn trưa hôm nay bằng ví Tiền mặt' }) });
if (agent.actions.length !== 1) throw new Error('Agent không tạo đúng một hành động chờ duyệt.');
const actionId = agent.actions[0].id;
const confirmed = await request(`/insights/actions/${actionId}/confirm`, { method: 'POST', body: '{}' });
if (confirmed.status !== 'EXECUTED') throw new Error('Agent không thực thi hành động.');
const conversation = await request(`/insights/conversations/${agent.conversationId}/messages`);
if (conversation.messages.length < 3) throw new Error('Lịch sử hội thoại chưa được lưu.');
const undone = await request(`/insights/actions/${actionId}/undo`, { method: 'POST', body: '{}' });
if (undone.status !== 'UNDONE') throw new Error('Không hoàn tác được hành động.');
console.log('Agent E2E đạt: draft -> confirm -> lưu hội thoại -> undo');
