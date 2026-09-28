import { prisma } from '../lib/prisma';

export type DeterministicReply = { answer: string; intent: string };

function plain(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
}

export async function getAgentMemoryContext(userId: string, conversationId: string) {
  const [conversation, messages, memories] = await Promise.all([
    prisma.assistantConversation.findFirstOrThrow({ where: { id: conversationId, userId }, select: { summary: true } }),
    prisma.assistantMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 }),
    prisma.assistantMemory.findMany({ where: { userId, confirmed: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { updatedAt: 'desc' }, take: 20 })
  ]);
  return {
    summary: conversation.summary,
    history: messages.reverse().map((item) => ({ role: item.role === 'USER' ? 'user' as const : 'assistant' as const, content: item.content })),
    memories: memories.map((item) => ({ id: item.id, kind: item.kind, content: item.content, confidence: item.confidence }))
  };
}

export async function handleDeterministicConversation(userId: string, conversationId: string, question: string): Promise<DeterministicReply | null> {
  const text = plain(question);
  if (/^(alo+|a lo|hello|hi|hey|chao|xin chao)[!.?\s]*$/.test(text)) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    const name = user?.fullName?.trim().split(/\s+/).at(-1);
    return { intent: 'GREETING', answer: `Chào${name ? ` ${name}` : ' bạn'} 😊 Tôi đây. Bạn muốn ghi nhanh một khoản thu chi, kiểm tra tình hình tài chính hay chỉ trò chuyện một chút?` };
  }
  if (/^(\?|giup|help)[!.?\s]*$/.test(text) || /(ban|agent|tro ly).*(lam duoc gi|co the lam gi|chuc nang gi)/.test(text)) {
    return { intent: 'CAPABILITIES', answer: 'Tôi có thể trò chuyện và nhớ ngữ cảnh; tìm, tạo, sửa, xóa, phân loại hàng loạt giao dịch; chuyển tiền giữa ví; quản lý ví, danh mục, ngân sách, mục tiêu, hóa đơn và khoản định kỳ; tạo quy tắc tự động; phân tích dòng tiền, đối soát và chuẩn bị file CSV. Các thay đổi dữ liệu luôn hiện bản xem trước để bạn xác nhận, và phần lớn có thể hoàn tác.' };
  }
  if (/(toi|minh).*(da noi|vua noi|da hoi|vua hoi)|lich su.*(tro chuyen|hoi thoai)|nho.*(cuoc tro chuyen|toi noi)/.test(text)) {
    const rows = await prisma.assistantMessage.findMany({
      where: { conversationId, role: 'USER', content: { not: question } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 8
    });
    if (!rows.length) return { intent: 'RECALL', answer: 'Trong cuộc trò chuyện này chưa có câu nào trước đó của bạn để tôi nhắc lại.' };
    const list = rows.reverse().map((item, index) => `${index + 1}. “${item.content}”`).join('\n');
    return { intent: 'RECALL', answer: `Trong cuộc trò chuyện này, các câu gần nhất bạn đã nói là:\n${list}` };
  }
  const remember = question.match(/(?:hãy\s+)?nhớ\s+(?:rằng|là|giúp(?:\s+tôi)?|cho\s+tôi)?\s*[:,-]?\s*(.+)$/i);
  if (remember?.[1]?.trim() && !/(toi da noi|toi vua noi|cuoc tro chuyen)/.test(text)) {
    const content = remember[1].trim().slice(0, 500);
    await prisma.assistantMemory.create({ data: { userId, kind: 'PREFERENCE', content, confirmed: true } });
    return { intent: 'REMEMBER', answer: `Được, tôi sẽ nhớ: “${content}”. Bạn có thể bảo tôi quên điều này bất cứ lúc nào.` };
  }
  if (/^(xoa|quen|hay quen)/.test(text) && /(ghi nho|dieu nay|thong tin|so thich|memory|bo nho)/.test(text)) {
    const result = await prisma.assistantMemory.deleteMany({ where: { userId } });
    return { intent: 'FORGET', answer: result.count ? `Tôi đã xóa ${result.count} ghi nhớ dài hạn của bạn.` : 'Hiện tôi không có ghi nhớ dài hạn nào để xóa.' };
  }
  return null;
}

export async function refreshConversationSummary(conversationId: string) {
  const count = await prisma.assistantMessage.count({ where: { conversationId } });
  if (count < 20 || count % 10 !== 0) return;
  const messages = await prisma.assistantMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30 });
  const userTopics = messages.filter((item) => item.role === 'USER').slice(0, 12).map((item) => item.content.replace(/\s+/g, ' ').slice(0, 140));
  const summary = `Các chủ đề/yêu cầu gần đây của người dùng: ${userTopics.reverse().join(' | ')}`.slice(0, 1800);
  await prisma.assistantConversation.update({ where: { id: conversationId }, data: { summary, summaryUpdatedAt: new Date() } });
}
