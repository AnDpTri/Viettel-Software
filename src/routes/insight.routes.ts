import { Prisma } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config';
import { asyncHandler } from '../lib/async-handler';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { authenticate } from '../middleware/auth';
import { createRateLimiter } from '../middleware/request-observability';
import { cancelAgentAction, executeAgentAction, prepareAgentActions, publicAgentAction, undoAgentAction } from '../services/agent.service';
import { analyzeReceiptImage, AssistantHistoryItem, generateAgentDecision } from '../services/ai.service';

export const insightRouter = Router();
insightRouter.use(authenticate);
const aiLimiter = createRateLimiter({ windowMs: 60_000, max: config.AI_RATE_LIMIT_PER_MINUTE, keyPrefix: 'ai-agent', key: (req) => req.user!.id });
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: config.AI_IMAGE_MAX_MB * 1024 * 1024 }, fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png'].includes(file.mimetype)) });

function monthKey(date: Date) { return date.toISOString().slice(0, 7); }
function normalizedText(value?: string | null) { return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function preferences(value: Prisma.JsonValue | null) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

async function financialContext(userId: string) {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 6);
  const [user, wallets, categories, transactions, budgets, goals, bills, recurring] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true, preferences: true, fullName: true } }),
    prisma.wallet.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } }),
    prisma.transaction.findMany({ where: { userId, deletedAt: null, occurredAt: { gte: since }, status: { not: 'CANCELLED' } }, include: { category: true, wallet: true }, orderBy: { occurredAt: 'asc' } }),
    prisma.budget.findMany({ where: { userId, deletedAt: null } }),
    prisma.goal.findMany({ where: { userId, deletedAt: null }, include: { wallet: { select: { currency: true } } } }),
    prisma.bill.findMany({ where: { userId, status: { in: ['UPCOMING', 'OVERDUE'] } }, include: { wallet: { select: { currency: true } } } }),
    prisma.recurringRule.findMany({ where: { userId, active: true }, include: { wallet: { select: { currency: true } } } })
  ]);
  return { user, wallets, categories, transactions, budgets, goals, bills, recurring };
}

function buildAssistantSnapshot(context: Awaited<ReturnType<typeof financialContext>>) {
  const eligible = context.transactions.filter((item) => item.wallet.currency === context.user.currency && item.type !== 'TRANSFER');
  const months = new Map<string, { income: number; expense: number }>();
  const categories = new Map<string, number>();
  for (const item of eligible) {
    const current = months.get(monthKey(item.occurredAt)) ?? { income: 0, expense: 0 };
    current[item.type === 'INCOME' ? 'income' : 'expense'] += Number(item.amount);
    months.set(monthKey(item.occurredAt), current);
    if (item.type === 'EXPENSE') categories.set(item.category?.name ?? 'Chưa phân loại', (categories.get(item.category?.name ?? 'Chưa phân loại') ?? 0) + Number(item.amount));
  }
  const totalIncome = eligible.filter((item) => item.type === 'INCOME').reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpense = eligible.filter((item) => item.type === 'EXPENSE').reduce((sum, item) => sum + Number(item.amount), 0);
  const openingBalance = context.wallets.filter((wallet) => wallet.currency === context.user.currency).reduce((sum, wallet) => sum + Number(wallet.openingBalance), 0);
  return {
    generatedAt: new Date().toISOString(), period: '6 tháng gần nhất', currency: context.user.currency,
    userName: context.user.fullName,
    overview: { transactionCount: eligible.length, totalIncome, totalExpense, netCashFlow: totalIncome - totalExpense, estimatedBalance: openingBalance + totalIncome - totalExpense },
    monthly: [...months.entries()].map(([month, value]) => ({ month, ...value, net: value.income - value.expense })),
    topExpenseCategories: [...categories.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
    wallets: context.wallets.map((item) => ({ id: item.id, name: item.name, currency: item.currency, type: item.type })),
    categories: context.categories.map((item) => ({ id: item.id, name: item.name, type: item.type })),
    budgets: context.budgets.map((item) => ({ name: item.name, amount: Number(item.amount), startDate: item.startDate.toISOString().slice(0, 10), endDate: item.endDate.toISOString().slice(0, 10) })),
    goals: context.goals.map((item) => ({ name: item.name, target: Number(item.targetAmount), current: Number(item.currentAmount), currency: item.wallet?.currency ?? context.user.currency, targetDate: item.targetDate?.toISOString().slice(0, 10) ?? null, status: item.status })),
    upcomingBills: context.bills.filter((item) => !item.wallet || item.wallet.currency === context.user.currency).map((item) => ({ name: item.name, amount: Number(item.amount), currency: item.wallet?.currency ?? context.user.currency, dueAt: item.dueAt.toISOString(), status: item.status })),
    recurringExpenses: context.recurring.filter((item) => item.type === 'EXPENSE' && item.wallet.currency === context.user.currency).map((item) => ({ name: item.name, amount: Number(item.amount), currency: item.wallet.currency, frequency: item.frequency, nextRunAt: item.nextRunAt.toISOString() }))
  };
}

function localAssistantAnswer(question: string, snapshot: ReturnType<typeof buildAssistantSnapshot>) {
  const topic = normalizedText(question);
  if (/^(xin chao|chao|hello|hi)\b/.test(topic)) return `Chào bạn${snapshot.userName ? ` ${snapshot.userName.split(' ').at(-1)}` : ''} 😊 Hôm nay tôi có thể giúp bạn ghi giao dịch, lập ngân sách, tạo mục tiêu hoặc xem tình hình chi tiêu.`;
  const top = snapshot.topExpenseCategories[0];
  if (topic.includes('ngan sach') && snapshot.budgets.length) return `Bạn đang có ${snapshot.budgets.length} ngân sách. Tôi có thể xem từng ngân sách hoặc giúp bạn tạo một ngân sách mới.`;
  if ((topic.includes('muc tieu') || topic.includes('tiet kiem')) && snapshot.goals.length) return `Bạn đang theo dõi ${snapshot.goals.length} mục tiêu. Muốn tôi phân tích mục tiêu nào trước?`;
  const topText = top ? ` Nhóm chi lớn nhất là ${top.name}, khoảng ${top.amount.toLocaleString('vi-VN')} ${snapshot.currency}.` : '';
  return `Trong 6 tháng gần nhất, tổng thu là ${snapshot.overview.totalIncome.toLocaleString('vi-VN')} và tổng chi là ${snapshot.overview.totalExpense.toLocaleString('vi-VN')} ${snapshot.currency}; dòng tiền ròng ${snapshot.overview.netCashFlow.toLocaleString('vi-VN')} ${snapshot.currency}.${topText}`;
}

function parseAmount(raw: string, unit?: string) {
  const compact = raw.replace(/\s/g, '');
  const multiplier = unit === 'ty' || unit === 'ti' ? 1_000_000_000 : unit === 'trieu' || unit === 'tr' ? 1_000_000 : unit === 'nghin' || unit === 'ngan' || unit === 'k' ? 1_000 : 1;
  let normalized = compact;
  if (multiplier > 1 && /^[0-9]+[.,][0-9]{1,2}$/.test(compact)) normalized = compact.replace(',', '.');
  else if (/[.,]/.test(compact)) {
    const parts = compact.split(/[.,]/);
    normalized = parts.length > 1 && parts.slice(1).every((part) => part.length === 3) ? parts.join('') : compact.replace(',', '.');
  }
  return Number(normalized) * multiplier;
}

export function parseVietnameseTransaction(text: string) {
  const plain = normalizedText(text).replace(/đ/g, 'd');
  const match = plain.match(/(\d[\d\s.,]*?)\s*(ty|ti|trieu|tr|nghin|ngan|k|vnd|d)(?=\s|$|[^a-z])/i) ?? plain.match(/\b(\d[\d.,]*)\b/);
  const amount = match ? parseAmount(match[1]!, match[2]) : 0;
  const type = ['nhan', 'luong', 'thu nhap', 'duoc tra', 'hoan tien', 'thu '].some((word) => plain.includes(word)) ? 'INCOME' as const : 'EXPENSE' as const;
  const date = new Date();
  if (plain.includes('hom qua')) date.setDate(date.getDate() - 1);
  if (plain.includes('hom kia')) date.setDate(date.getDate() - 2);
  const exact = plain.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (exact) date.setFullYear(exact[3] ? Number(exact[3]!.length === 2 ? `20${exact[3]}` : exact[3]) : date.getFullYear(), Number(exact[2]) - 1, Number(exact[1]));
  const note = text.replace(match?.[0] ?? '', '').replace(/\b(hôm nay|hom nay|hôm qua|hom qua|hôm kia|hom kia)\b/gi, '').trim();
  return { type, amount, occurredAt: date.toISOString(), note, confidence: amount > 0 ? 0.88 : 0.4, requiresConfirmation: true };
}

function inferLocalProposal(question: string, context: Awaited<ReturnType<typeof financialContext>>) {
  const plain = normalizedText(question);
  const parsed = parseVietnameseTransaction(question);
  if (!/(ghi|them|tao|chi|mua|nhan|luong)/.test(plain) || parsed.amount <= 0) return [];
  const wallet = context.wallets.find((item) => plain.includes(normalizedText(item.name))) ?? (context.wallets.length === 1 ? context.wallets[0] : undefined);
  const category = context.categories.find((item) => item.type === parsed.type && plain.includes(normalizedText(item.name)));
  return [{ tool: 'CREATE_TRANSACTION' as const, arguments: { ...parsed, walletId: wallet?.id, categoryId: category?.id } }];
}

async function enforceDailyQuota(userId: string) {
  if (config.AI_PROVIDER === 'local') return;
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const used = await prisma.auditLog.count({ where: { userId, action: 'AI_AGENT_REQUEST', createdAt: { gte: start } } });
  if (used >= config.AI_DAILY_LIMIT) throw new AppError(429, 'AI_DAILY_LIMIT_REACHED', `Bạn đã dùng hết ${config.AI_DAILY_LIMIT} lượt AI hôm nay.`);
}

insightRouter.get('/settings', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { preferences: true } });
  const prefs = preferences(user.preferences);
  return success(res, { provider: config.AI_PROVIDER, externalAiEnabled: config.AI_PROVIDER !== 'local', consent: prefs.aiConsent === true, dailyLimit: config.AI_DAILY_LIMIT, disclosure: ['Tổng hợp thu chi', 'Tên ví và danh mục', 'Ngân sách, mục tiêu và hóa đơn'] });
}));

insightRouter.put('/settings', asyncHandler(async (req, res) => {
  const { consent } = z.object({ consent: z.boolean() }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { preferences: true } });
  const next = { ...preferences(user.preferences), aiConsent: consent, aiConsentAt: consent ? new Date().toISOString() : null };
  await prisma.user.update({ where: { id: req.user!.id }, data: { preferences: next as Prisma.InputJsonValue } });
  await audit(req, consent ? 'AI_CONSENT_GRANTED' : 'AI_CONSENT_REVOKED', 'User', req.user!.id);
  return success(res, { consent });
}));

insightRouter.get('/overview', asyncHandler(async (req, res) => {
  const context = await financialContext(req.user!.id);
  const snapshot = buildAssistantSnapshot(context);
  const monthly = snapshot.monthly;
  const latest = monthly.at(-1) ?? { income: 0, expense: 0, net: 0 };
  const prior = monthly.slice(0, -1);
  const averageExpense = prior.length ? prior.reduce((sum, item) => sum + item.expense, 0) / prior.length : latest.expense;
  const baseExpenses = context.transactions.filter((item) => item.wallet.currency === context.user.currency && item.type === 'EXPENSE');
  const anomalies = baseExpenses.filter((item) => Number(item.amount) > Math.max(500_000, averageExpense * 0.35)).slice(-10).map((item) => ({ transactionId: item.id, amount: Number(item.amount), date: item.occurredAt, reason: 'Khoản chi lớn hơn đáng kể so với mức chi trung bình.' }));
  const upcomingExpense = snapshot.upcomingBills.reduce((sum, item) => sum + item.amount, 0) + snapshot.recurringExpenses.reduce((sum, item) => sum + item.amount, 0);
  const safeToSpend = Math.max(0, snapshot.overview.estimatedBalance - upcomingExpense - averageExpense);
  const recommendations: Array<{ level: string; title: string; message: string }> = [];
  if (latest.expense > averageExpense * 1.2 && averageExpense > 0) recommendations.push({ level: 'warning', title: 'Chi tiêu đang tăng', message: `Chi tháng này cao hơn ${Math.round((latest.expense / averageExpense - 1) * 100)}% so với trung bình.` });
  if (!context.budgets.length) recommendations.push({ level: 'info', title: 'Lập ngân sách đầu tiên', message: 'Bạn có thể nhờ agent tạo ngân sách ngay trong khung chat.' });
  return success(res, { monthly, expenseByCategory: snapshot.topExpenseCategories, anomalies, subscriptions: [], forecast: { currency: context.user.currency, currentBalance: snapshot.overview.estimatedBalance, upcomingExpense, averageMonthlyExpense: averageExpense, safeToSpend }, recommendations, generatedBy: 'local-explainable-engine' });
}));

insightRouter.post('/parse-transaction', asyncHandler(async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(3).max(500) }).parse(req.body);
  const context = await financialContext(req.user!.id);
  const parsed = parseVietnameseTransaction(text);
  const plain = normalizedText(text);
  const wallet = context.wallets.find((item) => plain.includes(normalizedText(item.name))) ?? (context.wallets.length === 1 ? context.wallets[0] : null);
  const category = context.categories.find((item) => item.type === parsed.type && plain.includes(normalizedText(item.name))) ?? null;
  return success(res, { ...parsed, suggestedWalletId: wallet?.id ?? null, suggestedWalletName: wallet?.name ?? null, suggestedCategoryId: category?.id ?? null, suggestedCategoryName: category?.name ?? null }, 'Đã phân tích câu nhập. Vui lòng xác nhận trước khi lưu.');
}));

insightRouter.post('/extract-receipt', asyncHandler(async (req, res) => {
  const { text } = z.object({ text: z.string().min(3).max(20_000) }).parse(req.body);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const amounts = [...text.matchAll(/(?:TOTAL|TỔNG|THANH TOÁN)?\s*[: ]*([\d.,]{3,})\s*(?:VND|đ|₫)?/gi)].map((match) => parseAmount(match[1]!)).filter(Number.isFinite);
  const dateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  const occurredAt = dateMatch ? new Date(`${dateMatch[3]!.length === 2 ? `20${dateMatch[3]}` : dateMatch[3]}-${dateMatch[2]!.padStart(2, '0')}-${dateMatch[1]!.padStart(2, '0')}T12:00:00Z`) : null;
  return success(res, { merchant: lines[0] ?? null, amount: amounts.length ? Math.max(...amounts) : null, occurredAt, rawText: text, confidence: amounts.length ? 0.75 : 0.35, requiresConfirmation: true });
}));

insightRouter.post('/extract-receipt-image', aiLimiter, imageUpload.single('receipt'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(422, 'IMAGE_REQUIRED', 'Vui lòng chọn ảnh hóa đơn JPG hoặc PNG.');
  const prefs = preferences((await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { preferences: true } })).preferences);
  if (config.AI_PROVIDER !== 'deepseek' || prefs.aiConsent !== true) throw new AppError(428, 'AI_CONSENT_REQUIRED', 'Hãy đồng ý sử dụng AI bên ngoài trước khi đọc ảnh hóa đơn.');
  await enforceDailyQuota(req.user!.id);
  const result = await analyzeReceiptImage(req.file.buffer, req.file.mimetype as 'image/jpeg' | 'image/png');
  await audit(req, 'AI_AGENT_REQUEST', 'ReceiptImage', undefined, { provider: config.AI_PROVIDER, success: Boolean(result) });
  if (!result) throw new AppError(503, 'AI_OCR_UNAVAILABLE', 'Chưa thể đọc ảnh hóa đơn lúc này.');
  return success(res, { ...result, requiresConfirmation: true });
}));

insightRouter.get('/conversations', asyncHandler(async (req, res) => {
  const rows = await prisma.assistantConversation.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' }, take: 30, include: { _count: { select: { messages: true } } } });
  return success(res, rows.map((item) => ({ id: item.id, title: item.title, messageCount: item._count.messages, createdAt: item.createdAt, updatedAt: item.updatedAt })));
}));

insightRouter.post('/conversations', asyncHandler(async (req, res) => {
  const { title } = z.object({ title: z.string().trim().min(1).max(120).default('Cuộc trò chuyện mới') }).parse(req.body ?? {});
  return success(res, await prisma.assistantConversation.create({ data: { userId: req.user!.id, title } }), 'Đã tạo cuộc trò chuyện.', 201);
}));

insightRouter.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const conversation = await prisma.assistantConversation.findFirst({ where: { id: String(req.params.id), userId: req.user!.id }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 }, actions: { orderBy: { createdAt: 'asc' } } } });
  if (!conversation) throw notFound('Cuộc trò chuyện');
  return success(res, { conversation: { id: conversation.id, title: conversation.title }, messages: conversation.messages.map((item) => ({ id: item.id, role: item.role.toLowerCase(), content: item.content, provider: item.provider, model: item.model, createdAt: item.createdAt })), actions: conversation.actions.map(publicAgentAction) });
}));

insightRouter.delete('/conversations/:id', asyncHandler(async (req, res) => {
  const deleted = await prisma.assistantConversation.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!deleted.count) throw notFound('Cuộc trò chuyện');
  return success(res, null, 'Đã xóa cuộc trò chuyện.');
}));

insightRouter.post('/assistant', aiLimiter, asyncHandler(async (req, res) => {
  const input = z.object({ question: z.string().trim().min(1).max(1500), conversationId: z.string().uuid().optional(), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1500) })).max(8).default([]) }).parse(req.body);
  let conversation = input.conversationId ? await prisma.assistantConversation.findFirst({ where: { id: input.conversationId, userId: req.user!.id } }) : null;
  if (input.conversationId && !conversation) throw notFound('Cuộc trò chuyện');
  conversation ??= await prisma.assistantConversation.create({ data: { userId: req.user!.id, title: input.question.slice(0, 120) } });
  const stored = await prisma.assistantMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, take: 8 });
  const history: AssistantHistoryItem[] = stored.reverse().map((item) => ({ role: item.role === 'USER' ? 'user' : 'assistant', content: item.content }));
  const context = await financialContext(req.user!.id);
  const snapshot = buildAssistantSnapshot(context);
  const prefs = preferences(context.user.preferences);
  let decision = null;
  if (config.AI_PROVIDER === 'local' || prefs.aiConsent === true) {
    await enforceDailyQuota(req.user!.id);
    decision = await generateAgentDecision(input.question, snapshot, history.length ? history : input.history);
  }
  const inferredWallet = context.wallets.find((item) => normalizedText(input.question).includes(normalizedText(item.name)));
  const inferredCategory = context.categories.find((item) => normalizedText(input.question).includes(normalizedText(item.name)));
  const proposals = (decision?.actions?.length ? decision.actions : inferLocalProposal(input.question, context)).map((proposal) => proposal.tool === 'CREATE_TRANSACTION' ? { ...proposal, arguments: { ...proposal.arguments, ...(!proposal.arguments.walletId && inferredWallet ? { walletId: inferredWallet.id } : {}), ...(!proposal.arguments.categoryId && inferredCategory ? { categoryId: inferredCategory.id } : {}) } } : proposal);
  const actions = await prepareAgentActions(req.user!.id, conversation.id, proposals);
  const answer = decision?.answer ?? (actions.length ? `Tôi đã chuẩn bị ${actions.length} hành động. Bạn xem lại thông tin bên dưới rồi xác nhận nhé.` : localAssistantAnswer(input.question, snapshot));
  await prisma.$transaction([
    prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'USER', content: input.question } }),
    prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'ASSISTANT', content: answer, provider: decision?.provider ?? 'local', model: decision?.model ?? 'local-agent' } }),
    prisma.assistantConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })
  ]);
  if (actions.length) await prisma.agentAction.updateMany({ where: { id: { in: actions.map((item) => item.id) } }, data: { createdAt: new Date() } });
  if (decision) await audit(req, 'AI_AGENT_REQUEST', 'AssistantConversation', conversation.id, { provider: decision.provider, model: decision.model, latencyMs: decision.latencyMs, actionCount: actions.length });
  return success(res, { conversationId: conversation.id, answer, provider: decision?.provider ?? 'local', model: decision?.model ?? 'local-agent', latencyMs: decision?.latencyMs ?? 0, actions: actions.map(publicAgentAction), consentRequired: config.AI_PROVIDER !== 'local' && prefs.aiConsent !== true, evidence: { currency: snapshot.currency, period: snapshot.period, transactionCount: snapshot.overview.transactionCount, generatedAt: snapshot.generatedAt } });
}));

insightRouter.post('/actions/:id/confirm', asyncHandler(async (req, res) => {
  const action = await executeAgentAction(req.user!.id, String(req.params.id));
  await audit(req, 'AGENT_ACTION_EXECUTED', 'AgentAction', action.id, { type: action.type });
  await prisma.assistantMessage.create({ data: { conversationId: action.conversationId, role: 'ASSISTANT', content: 'Đã thực hiện hành động thành công. Bạn có thể hoàn tác nếu cần.', provider: 'system', model: 'agent-tools' } });
  return success(res, publicAgentAction(action), 'Đã thực hiện hành động.');
}));

insightRouter.post('/actions/:id/cancel', asyncHandler(async (req, res) => {
  await cancelAgentAction(req.user!.id, String(req.params.id));
  await audit(req, 'AGENT_ACTION_CANCELLED', 'AgentAction', String(req.params.id));
  return success(res, null, 'Đã hủy hành động.');
}));

insightRouter.post('/actions/:id/undo', asyncHandler(async (req, res) => {
  const action = await undoAgentAction(req.user!.id, String(req.params.id));
  await audit(req, 'AGENT_ACTION_UNDONE', 'AgentAction', action.id, { type: action.type });
  return success(res, publicAgentAction(action), 'Đã hoàn tác hành động.');
}));
