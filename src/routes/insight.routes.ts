import { Prisma } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config';
import { isVipAccount } from '../lib/account-tier';
import { asyncHandler } from '../lib/async-handler';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { authenticate } from '../middleware/auth';
import { createRateLimiter } from '../middleware/request-observability';
import { cancelAgentAction, executeAgentAction, executeImmediateAgentTool, executeReadAgentTools, IMMEDIATE_AGENT_TOOLS, prepareAgentActions, publicAgentAction, READ_AGENT_TOOLS, undoAgentAction } from '../services/agent.service';
import { AgentChatMessage, AgentProposal, analyzeReceiptImage, buildAgentMessages, containsUnexpectedChinese, requestAgentTurn } from '../services/ai.service';
import { getAgentMemoryContext, refreshConversationSummary } from '../services/agent-memory.service';
import { getOnboardingStatus } from '../services/onboarding.service';

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
    recentTransactions: [...context.transactions].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 20).map((item) => ({ id: item.id, type: item.type, amount: Number(item.amount), occurredAt: item.occurredAt.toISOString(), walletId: item.walletId, wallet: item.wallet.name, categoryId: item.categoryId, category: item.category?.name ?? null, note: item.note, payee: item.payee })),
    wallets: context.wallets.map((item) => ({ id: item.id, name: item.name, currency: item.currency, type: item.type })),
    categories: context.categories.map((item) => ({ id: item.id, name: item.name, type: item.type })),
    budgets: context.budgets.map((item) => ({ id: item.id, name: item.name, amount: Number(item.amount), startDate: item.startDate.toISOString().slice(0, 10), endDate: item.endDate.toISOString().slice(0, 10) })),
    goals: context.goals.map((item) => ({ id: item.id, name: item.name, target: Number(item.targetAmount), current: Number(item.currentAmount), currency: item.wallet?.currency ?? context.user.currency, targetDate: item.targetDate?.toISOString().slice(0, 10) ?? null, status: item.status })),
    upcomingBills: context.bills.filter((item) => !item.wallet || item.wallet.currency === context.user.currency).map((item) => ({ id: item.id, name: item.name, amount: Number(item.amount), currency: item.wallet?.currency ?? context.user.currency, dueAt: item.dueAt.toISOString(), status: item.status })),
    recurringExpenses: context.recurring.filter((item) => item.type === 'EXPENSE' && item.wallet.currency === context.user.currency).map((item) => ({ id: item.id, name: item.name, amount: Number(item.amount), currency: item.wallet.currency, frequency: item.frequency, nextRunAt: item.nextRunAt.toISOString() }))
  };
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

async function getDailyQuota(userId: string) {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const [account, used] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { accountTier: true, vipExpiresAt: true } }),
    prisma.auditLog.count({ where: { userId, action: { in: ['AI_AGENT_REQUEST', 'AI_AGENT_FAILURE'] }, createdAt: { gte: start } } })
  ]);
  const isVip = isVipAccount(account);
  return { accountTier: isVip ? 'VIP' as const : 'FREE' as const, isVip, unlimited: isVip, dailyLimit: isVip ? null : config.AI_DAILY_LIMIT, usedToday: used, remainingToday: isVip ? null : Math.max(0, config.AI_DAILY_LIMIT - used) };
}

async function enforceDailyQuota(userId: string) {
  const quota = await getDailyQuota(userId);
  if (!quota.isVip && quota.usedToday >= config.AI_DAILY_LIMIT) throw new AppError(429, 'AI_DAILY_LIMIT_REACHED', `Bạn đã dùng hết ${config.AI_DAILY_LIMIT} lượt AI hôm nay.`);
  return quota;
}

insightRouter.get('/settings', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { preferences: true } });
  const prefs = preferences(user.preferences);
  const quota = await getDailyQuota(req.user!.id);
  return success(res, { provider: config.AI_PROVIDER, externalAiEnabled: true, consent: prefs.aiConsent === true, ...quota, disclosure: ['Nội dung chat và ghi chú, kể cả dữ liệu nhạy cảm bạn chủ động cung cấp', 'Dữ liệu tài chính cần thiết khi agent dùng công cụ', 'Tên ví, danh mục, ngân sách, mục tiêu và hóa đơn liên quan'] });
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
  return success(res, { monthly, expenseByCategory: snapshot.topExpenseCategories, anomalies, subscriptions: [], forecast: { currency: context.user.currency, currentBalance: snapshot.overview.estimatedBalance, upcomingExpense, averageMonthlyExpense: averageExpense, safeToSpend }, recommendations, generatedBy: 'deterministic-finance-engine' });
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

insightRouter.get('/memories', asyncHandler(async (req, res) => {
  const rows = await prisma.assistantMemory.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' }, take: 100 });
  return success(res, rows.map((item) => ({ id: item.id, kind: item.kind, content: item.content, confidence: item.confidence, confirmed: item.confirmed, expiresAt: item.expiresAt, updatedAt: item.updatedAt })));
}));

insightRouter.delete('/memories/:id', asyncHandler(async (req, res) => {
  const result = await prisma.assistantMemory.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!result.count) throw notFound('Ghi nhớ');
  return success(res, null, 'Đã xóa ghi nhớ.');
}));

insightRouter.post('/conversations', asyncHandler(async (req, res) => {
  const { title } = z.object({ title: z.string().trim().min(1).max(120).default('Cuộc trò chuyện mới') }).parse(req.body ?? {});
  return success(res, await prisma.assistantConversation.create({ data: { userId: req.user!.id, title } }), 'Đã tạo cuộc trò chuyện.', 201);
}));

insightRouter.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const conversation = await prisma.assistantConversation.findFirst({ where: { id: String(req.params.id), userId: req.user!.id }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 }, actions: { orderBy: { createdAt: 'asc' } } } });
  if (!conversation) throw notFound('Cuộc trò chuyện');
  return success(res, { conversation: { id: conversation.id, title: conversation.title }, messages: conversation.messages.map((item) => ({ id: item.id, role: item.role.toLowerCase(), content: item.content, provider: item.provider, model: item.model, status: item.status.toLowerCase(), errorCode: item.errorCode, finishReason: item.finishReason, attemptCount: item.attemptCount, createdAt: item.createdAt })), actions: conversation.actions.map(publicAgentAction) });
}));

insightRouter.delete('/conversations/:id', asyncHandler(async (req, res) => {
  const deleted = await prisma.assistantConversation.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!deleted.count) throw notFound('Cuộc trò chuyện');
  return success(res, null, 'Đã xóa cuộc trò chuyện.');
}));

insightRouter.post('/assistant', aiLimiter, asyncHandler(async (req, res) => {
  const input = z.object({ question: z.string().trim().min(1).max(1500), conversationId: z.string().uuid().optional(), retryMessageId: z.string().uuid().optional(), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1500) })).max(8).default([]), uiContext: z.object({ currentView: z.enum(['dashboard', 'transactions', 'wallets', 'categories', 'budgets', 'goals', 'reports', 'planning', 'insights']).optional() }).optional() }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { preferences: true, fullName: true, currency: true, locale: true } });
  if (preferences(user.preferences).aiConsent !== true) throw new AppError(428, 'AI_CONSENT_REQUIRED', 'Hãy đồng ý sử dụng AI bên ngoài trước khi trò chuyện với trợ lý.');
  await enforceDailyQuota(req.user!.id);
  let conversation = input.conversationId ? await prisma.assistantConversation.findFirst({ where: { id: input.conversationId, userId: req.user!.id } }) : null;
  if (input.conversationId && !conversation) throw notFound('Cuộc trò chuyện');
  conversation ??= await prisma.assistantConversation.create({ data: { userId: req.user!.id, title: input.question.slice(0, 120) } });
  const failedMessage = input.retryMessageId ? await prisma.assistantMessage.findFirst({ where: { id: input.retryMessageId, conversationId: conversation.id, role: 'USER', status: 'FAILED' } }) : null;
  if (input.retryMessageId && !failedMessage) throw new AppError(409, 'MESSAGE_NOT_RETRYABLE', 'Tin nhắn này không còn ở trạng thái có thể thử lại.');
  const userMessage = failedMessage
    ? await prisma.assistantMessage.update({ where: { id: failedMessage.id }, data: { status: 'PROCESSING', errorCode: null } })
    : await prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'USER', content: input.question, status: 'PROCESSING', attemptCount: 0 } });
  const previousAttempts = userMessage.attemptCount;
  const actions: Awaited<ReturnType<typeof prepareAgentActions>> = [];
  const toolResults: Array<{ tool: string; summary: string; data?: unknown; attachment?: { label: string; url: string; filename?: string } }> = [];
  const toolCache = new Map<string, unknown>();
  let totalLatencyMs = 0;
  let totalAttempts = 0;
  let toolCallCount = 0;
  try {
    const [memoryContext, onboarding] = await Promise.all([getAgentMemoryContext(req.user!.id, conversation.id), getOnboardingStatus(req.user!.id)]);
    const history = memoryContext.history.length ? memoryContext.history : [...input.history, { role: 'user' as const, content: input.question }];
    const messages: AgentChatMessage[] = buildAgentMessages(history, { now: new Date().toISOString(), userName: user.fullName, currency: user.currency, currentView: input.uiContext?.currentView, onboarding, summary: memoryContext.summary, memories: memoryContext.memories });
    let finalTurn: Awaited<ReturnType<typeof requestAgentTurn>> | null = null;
    for (let round = 0; round < 4; round += 1) {
      const turn = await requestAgentTurn(messages, true);
      totalLatencyMs += turn.latencyMs;
      totalAttempts += turn.attemptCount;
      if (!turn.toolCalls.length) { finalTurn = turn; break; }
      toolCallCount += turn.toolCalls.length;
      if (toolCallCount > 10) throw new AppError(502, 'AGENT_TOOL_LIMIT', 'Agent đã gọi quá nhiều công cụ trong một lượt.');
      messages.push({ role: 'assistant', content: turn.answer || null, tool_calls: turn.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.argumentsText } })) });
      for (const call of turn.toolCalls) {
        const signature = `${call.name}:${call.argumentsText}`;
        let result = toolCache.get(signature);
        if (!result) {
          try {
            const parsed = JSON.parse(call.argumentsText || '{}') as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Arguments must be an object');
            const proposal: AgentProposal = { tool: call.name, arguments: parsed as Record<string, unknown> };
            if (READ_AGENT_TOOLS.has(call.name)) {
              const readResult = (await executeReadAgentTools(req.user!.id, [proposal]))[0];
              if (!readResult) throw new AppError(422, 'AGENT_TOOL_EMPTY_RESULT', 'Công cụ không trả kết quả.');
              result = { ok: true, ...readResult };
              toolResults.push(readResult);
            } else if (IMMEDIATE_AGENT_TOOLS.has(call.name)) {
              const immediateResult = await executeImmediateAgentTool(req.user!.id, conversation.id, proposal);
              result = { ok: true, ...immediateResult };
              toolResults.push(immediateResult);
            } else {
              const prepared = await prepareAgentActions(req.user!.id, conversation.id, [proposal]);
              const action = prepared[0];
              if (!action) throw new AppError(422, 'UNSUPPORTED_AGENT_ACTION', 'Công cụ chưa thể tạo bản xem trước.');
              actions.push(action);
              result = { ok: true, tool: call.name, summary: 'Đã tạo bản xem trước và đang chờ người dùng xác nhận.', data: { actionId: action.id, status: action.status, preview: action.preview } };
            }
          } catch (error) {
            const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'Dữ liệu công cụ không hợp lệ.' : error instanceof Error ? error.message : 'Dữ liệu công cụ không hợp lệ.';
            const code = error instanceof AppError ? error.code : error instanceof z.ZodError ? 'TOOL_VALIDATION_ERROR' : 'TOOL_ARGUMENTS_INVALID';
            result = { ok: false, error: { code, message }, instruction: 'Hãy sửa lời gọi công cụ hoặc hỏi người dùng phần thông tin còn thiếu. Không khẳng định thao tác đã hoàn tất.' };
          }
          toolCache.set(signature, result);
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    if (!finalTurn?.answer) throw new AppError(502, 'AGENT_LOOP_LIMIT', 'Agent chưa hoàn tất câu trả lời sau nhiều lần dùng công cụ.');
    let languageRewritten = false;
    if (user.locale.toLowerCase().startsWith('vi') && containsUnexpectedChinese(finalTurn.answer)) {
      const rewritten = await requestAgentTurn([...messages, { role: 'assistant', content: finalTurn.answer }, { role: 'system', content: 'Câu trả lời vừa rồi dùng sai ngôn ngữ. Hãy viết lại toàn bộ bằng tiếng Việt tự nhiên, giữ nguyên dữ kiện và trạng thái thực tế của công cụ. Không gọi thêm công cụ và không thêm tuyên bố chưa được kết quả công cụ xác nhận.' }], false);
      totalLatencyMs += rewritten.latencyMs;
      totalAttempts += rewritten.attemptCount;
      if (!rewritten.answer || containsUnexpectedChinese(rewritten.answer)) throw new AppError(502, 'AI_LANGUAGE_MISMATCH', 'Agent chưa thể trả lời đúng tiếng Việt. Vui lòng thử lại.');
      finalTurn = rewritten;
      languageRewritten = true;
    }
    await prisma.$transaction([
      prisma.assistantMessage.update({ where: { id: userMessage.id }, data: { status: 'COMPLETED', attemptCount: previousAttempts + (totalAttempts || 1) } }),
      prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'ASSISTANT', content: finalTurn.answer, provider: finalTurn.provider, model: finalTurn.model, status: 'COMPLETED', finishReason: finalTurn.finishReason, providerRequestId: finalTurn.requestId, attemptCount: finalTurn.attemptCount } }),
      prisma.assistantConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })
    ]);
    await audit(req, 'AI_AGENT_REQUEST', 'AssistantConversation', conversation.id, { provider: finalTurn.provider, model: finalTurn.model, latencyMs: totalLatencyMs, actionCount: actions.length, toolCount: toolCallCount, languageRewritten, success: true });
    void refreshConversationSummary(conversation.id);
    const uiActions = toolResults.flatMap((item) => { const data = item.data as { uiActions?: unknown[] } | undefined; return Array.isArray(data?.uiActions) ? data.uiActions : []; });
    return success(res, { conversationId: conversation.id, answer: finalTurn.answer, provider: finalTurn.provider, model: finalTurn.model, latencyMs: totalLatencyMs, intent: actions.length ? 'ACTION' : toolCallCount ? 'TOOL' : 'GENERAL', actions: actions.map(publicAgentAction), toolResults, uiActions, onboarding, attachments: toolResults.flatMap((item) => item.attachment ? [item.attachment] : []), consentRequired: false });
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
    if (actions.length) await prisma.agentAction.updateMany({ where: { id: { in: actions.map((item) => item.id) }, status: 'PENDING' }, data: { status: 'FAILED' } });
    await prisma.$transaction([
      prisma.assistantMessage.update({ where: { id: userMessage.id }, data: { status: 'FAILED', errorCode, attemptCount: previousAttempts + (totalAttempts || 1) } }),
      prisma.assistantConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })
    ]);
    try { await audit(req, 'AI_AGENT_FAILURE', 'AssistantConversation', conversation.id, { provider: config.AI_PROVIDER, errorCode, toolCount: toolCallCount, actionCount: actions.length, success: false }); } catch {}
    if (error instanceof AppError) throw new AppError(error.statusCode, error.code, error.message, { ...(error.details && typeof error.details === 'object' ? error.details as Record<string, unknown> : {}), conversationId: conversation.id, messageId: userMessage.id });
    throw error;
  }
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
