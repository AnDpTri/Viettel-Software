import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config, isAiConfigured } from '../core/config/env';
import { isVipAccount } from '../shared/account-tier';
import { asyncHandler } from '../core/http/async-handler';
import { audit } from '../core/audit/audit';
import { AppError, notFound } from '../core/errors/app-error';
import { prisma } from '../core/database/prisma';
import { success } from '../core/http/response';
import { documentRoutes } from '../docs/route-docs';
import { authenticate } from '../core/security/authenticate';
import { createRateLimiter } from '../core/observability/http';
import {
  cancelAgentAction,
  executeAgentAction,
  executeImmediateAgentTool,
  executeReadAgentTools,
  IMMEDIATE_AGENT_TOOLS,
  PendingEntity,
  prepareAgentActions,
  publicAgentAction,
  READ_AGENT_TOOLS,
  undoAgentAction
} from '../services/agent.service';
import {
  AGENT_MAX_ROUNDS,
  AGENT_MAX_TOOL_CALLS_PER_TURN,
  AgentChatMessage,
  AgentProposal,
  analyzeReceiptImage,
  buildAgentMessages,
  claimsDownloadLink,
  claimsPendingPreview,
  containsStaleOnboardingClaim,
  containsUnexpectedChinese,
  requestAgentTurn
} from '../services/ai.service';
import { getAgentMemoryContext, refreshConversationSummary } from '../services/agent-memory.service';
import { compactOnboarding } from '../modules/onboarding/onboarding.domain';
import { OnboardingRepository } from '../modules/onboarding/onboarding.repository';
import { OnboardingService } from '../modules/onboarding/onboarding.service';

// TẠM THỜI tới khi Agent được tách thành module nhận phụ thuộc qua container.
const onboardingService = new OnboardingService(new OnboardingRepository(prisma));
const getOnboardingStatus = (userId: string) => onboardingService.status(userId);

export const insightRouter = Router();
insightRouter.use(authenticate);
const aiLimiter = createRateLimiter({
  windowMs: 60_000,
  max: config.AI_RATE_LIMIT_PER_MINUTE,
  keyPrefix: 'ai-agent',
  key: (req) => req.user!.id
});
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: config.AI_IMAGE_MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png'].includes(file.mimetype))
});

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}
function normalizedText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
function preferences(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function financialContext(userId: string) {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 6);
  const [user, wallets, categories, transactions, budgets, goals, bills, recurring] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { currency: true, preferences: true, fullName: true }
    }),
    prisma.wallet.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } }),
    prisma.transaction.findMany({
      where: { userId, deletedAt: null, occurredAt: { gte: since }, status: { not: 'CANCELLED' } },
      include: { category: true, wallet: true },
      orderBy: { occurredAt: 'asc' }
    }),
    prisma.budget.findMany({ where: { userId, deletedAt: null } }),
    prisma.goal.findMany({ where: { userId, deletedAt: null }, include: { wallet: { select: { currency: true } } } }),
    prisma.bill.findMany({
      where: { userId, status: { in: ['UPCOMING', 'OVERDUE'] } },
      include: { wallet: { select: { currency: true } } }
    }),
    prisma.recurringRule.findMany({
      where: { userId, active: true },
      include: { wallet: { select: { currency: true } } }
    })
  ]);
  return { user, wallets, categories, transactions, budgets, goals, bills, recurring };
}

function buildAssistantSnapshot(context: Awaited<ReturnType<typeof financialContext>>) {
  const eligible = context.transactions.filter(
    (item) => item.wallet.currency === context.user.currency && item.type !== 'TRANSFER'
  );
  const months = new Map<string, { income: number; expense: number }>();
  const categories = new Map<string, number>();
  for (const item of eligible) {
    const current = months.get(monthKey(item.occurredAt)) ?? { income: 0, expense: 0 };
    current[item.type === 'INCOME' ? 'income' : 'expense'] += Number(item.amount);
    months.set(monthKey(item.occurredAt), current);
    if (item.type === 'EXPENSE')
      categories.set(
        item.category?.name ?? 'Chưa phân loại',
        (categories.get(item.category?.name ?? 'Chưa phân loại') ?? 0) + Number(item.amount)
      );
  }
  const totalIncome = eligible
    .filter((item) => item.type === 'INCOME')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpense = eligible
    .filter((item) => item.type === 'EXPENSE')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const openingBalance = context.wallets
    .filter((wallet) => wallet.currency === context.user.currency)
    .reduce((sum, wallet) => sum + Number(wallet.openingBalance), 0);
  return {
    generatedAt: new Date().toISOString(),
    period: '6 tháng gần nhất',
    currency: context.user.currency,
    userName: context.user.fullName,
    overview: {
      transactionCount: eligible.length,
      totalIncome,
      totalExpense,
      netCashFlow: totalIncome - totalExpense,
      estimatedBalance: openingBalance + totalIncome - totalExpense
    },
    monthly: [...months.entries()].map(([month, value]) => ({ month, ...value, net: value.income - value.expense })),
    topExpenseCategories: [...categories.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    recentTransactions: [...context.transactions]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        type: item.type,
        amount: Number(item.amount),
        occurredAt: item.occurredAt.toISOString(),
        walletId: item.walletId,
        wallet: item.wallet.name,
        categoryId: item.categoryId,
        category: item.category?.name ?? null,
        note: item.note,
        payee: item.payee
      })),
    wallets: context.wallets.map((item) => ({
      id: item.id,
      name: item.name,
      currency: item.currency,
      type: item.type
    })),
    categories: context.categories.map((item) => ({ id: item.id, name: item.name, type: item.type })),
    budgets: context.budgets.map((item) => ({
      id: item.id,
      name: item.name,
      amount: Number(item.amount),
      startDate: item.startDate.toISOString().slice(0, 10),
      endDate: item.endDate.toISOString().slice(0, 10)
    })),
    goals: context.goals.map((item) => ({
      id: item.id,
      name: item.name,
      target: Number(item.targetAmount),
      current: Number(item.currentAmount),
      currency: item.wallet?.currency ?? context.user.currency,
      targetDate: item.targetDate?.toISOString().slice(0, 10) ?? null,
      status: item.status
    })),
    upcomingBills: context.bills
      .filter((item) => !item.wallet || item.wallet.currency === context.user.currency)
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: Number(item.amount),
        currency: item.wallet?.currency ?? context.user.currency,
        dueAt: item.dueAt.toISOString(),
        status: item.status
      })),
    recurringExpenses: context.recurring
      .filter((item) => item.type === 'EXPENSE' && item.wallet.currency === context.user.currency)
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: Number(item.amount),
        currency: item.wallet.currency,
        frequency: item.frequency,
        nextRunAt: item.nextRunAt.toISOString()
      }))
  };
}

function parseAmount(raw: string, unit?: string) {
  const compact = raw.replace(/\s/g, '');
  const multiplier =
    unit === 'ty' || unit === 'ti'
      ? 1_000_000_000
      : unit === 'trieu' || unit === 'tr'
        ? 1_000_000
        : unit === 'nghin' || unit === 'ngan' || unit === 'k'
          ? 1_000
          : 1;
  let normalized = compact;
  if (multiplier > 1 && /^[0-9]+[.,][0-9]{1,2}$/.test(compact)) normalized = compact.replace(',', '.');
  else if (/[.,]/.test(compact)) {
    const parts = compact.split(/[.,]/);
    normalized =
      parts.length > 1 && parts.slice(1).every((part) => part.length === 3)
        ? parts.join('')
        : compact.replace(',', '.');
  }
  return Number(normalized) * multiplier;
}

export function parseVietnameseTransaction(text: string) {
  const plain = normalizedText(text).replace(/đ/g, 'd');
  const match =
    plain.match(/(\d[\d\s.,]*?)\s*(ty|ti|trieu|tr|nghin|ngan|k|vnd|d)(?=\s|$|[^a-z])/i) ??
    plain.match(/\b(\d[\d.,]*)\b/);
  const amount = match ? parseAmount(match[1]!, match[2]) : 0;
  const type = ['nhan', 'luong', 'thu nhap', 'duoc tra', 'hoan tien', 'thu '].some((word) => plain.includes(word))
    ? ('INCOME' as const)
    : ('EXPENSE' as const);
  const date = new Date();
  if (plain.includes('hom qua')) date.setDate(date.getDate() - 1);
  if (plain.includes('hom kia')) date.setDate(date.getDate() - 2);
  const exact = plain.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (exact)
    date.setFullYear(
      exact[3] ? Number(exact[3]!.length === 2 ? `20${exact[3]}` : exact[3]) : date.getFullYear(),
      Number(exact[2]) - 1,
      Number(exact[1])
    );
  const note = text
    .replace(match?.[0] ?? '', '')
    .replace(/\b(hôm nay|hom nay|hôm qua|hom qua|hôm kia|hom kia)\b/gi, '')
    .trim();
  return {
    type,
    amount,
    occurredAt: date.toISOString(),
    note,
    confidence: amount > 0 ? 0.88 : 0.4,
    requiresConfirmation: true
  };
}

async function getDailyQuota(userId: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [account, used] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { accountTier: true, vipExpiresAt: true } }),
    prisma.auditLog.count({
      where: { userId, action: { in: ['AI_AGENT_REQUEST', 'AI_AGENT_FAILURE'] }, createdAt: { gte: start } }
    })
  ]);
  const isVip = isVipAccount(account);
  return {
    accountTier: isVip ? ('VIP' as const) : ('FREE' as const),
    isVip,
    unlimited: isVip,
    dailyLimit: isVip ? null : config.AI_DAILY_LIMIT,
    usedToday: used,
    remainingToday: isVip ? null : Math.max(0, config.AI_DAILY_LIMIT - used)
  };
}

async function enforceDailyQuota(userId: string) {
  const quota = await getDailyQuota(userId);
  if (!quota.isVip && quota.usedToday >= config.AI_DAILY_LIMIT)
    throw new AppError(429, 'AI_DAILY_LIMIT_REACHED', `Bạn đã dùng hết ${config.AI_DAILY_LIMIT} lượt AI hôm nay.`);
  return quota;
}

const consentInput = z.object({ consent: z.boolean() });
const parseTextInput = z.object({
  text: z.string().trim().min(3).max(500).openapi({ example: 'Ăn trưa 75k hôm qua' })
});
const receiptTextInput = z.object({ text: z.string().min(3).max(20_000) });
const conversationInput = z.object({ title: z.string().trim().min(1).max(120).default('Cuộc trò chuyện mới') });
const assistantInput = z.object({
  question: z.string().trim().min(1).max(1500),
  conversationId: z.string().uuid().optional(),
  retryMessageId: z
    .string()
    .uuid()
    .optional()
    .openapi({ description: 'Tin nhắn người dùng đang FAILED cần gửi lại trong cùng hội thoại' }),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1500) }))
    .max(8)
    .default([]),
  uiContext: z
    .object({
      currentView: z
        .enum([
          'dashboard',
          'transactions',
          'wallets',
          'categories',
          'budgets',
          'goals',
          'reports',
          'planning',
          'insights'
        ])
        .optional()
    })
    .optional()
    .openapi({ description: 'Màn hình người dùng đang mở, để trợ lý hướng dẫn đúng chỗ' })
});

insightRouter.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { preferences: true } });
    const prefs = preferences(user.preferences);
    const quota = await getDailyQuota(req.user!.id);
    return success(res, {
      provider: config.AI_PROVIDER,
      externalAiEnabled: isAiConfigured(),
      consent: prefs.aiConsent === true,
      ...quota,
      disclosure: [
        'Nội dung chat và ghi chú, kể cả dữ liệu nhạy cảm bạn chủ động cung cấp',
        'Dữ liệu tài chính cần thiết khi agent dùng công cụ',
        'Tên ví, danh mục, ngân sách, mục tiêu và hóa đơn liên quan'
      ]
    });
  })
);

insightRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const { consent } = consentInput.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { preferences: true } });
    const next = {
      ...preferences(user.preferences),
      aiConsent: consent,
      aiConsentAt: consent ? new Date().toISOString() : null
    };
    await prisma.user.update({ where: { id: req.user!.id }, data: { preferences: next as Prisma.InputJsonValue } });
    await audit(req, consent ? 'AI_CONSENT_GRANTED' : 'AI_CONSENT_REVOKED', 'User', req.user!.id);
    return success(res, { consent });
  })
);

insightRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const context = await financialContext(req.user!.id);
    const snapshot = buildAssistantSnapshot(context);
    const monthly = snapshot.monthly;
    const latest = monthly.at(-1) ?? { income: 0, expense: 0, net: 0 };
    const prior = monthly.slice(0, -1);
    const averageExpense = prior.length
      ? prior.reduce((sum, item) => sum + item.expense, 0) / prior.length
      : latest.expense;
    const baseExpenses = context.transactions.filter(
      (item) => item.wallet.currency === context.user.currency && item.type === 'EXPENSE'
    );
    const anomalies = baseExpenses
      .filter((item) => Number(item.amount) > Math.max(500_000, averageExpense * 0.35))
      .slice(-10)
      .map((item) => ({
        transactionId: item.id,
        amount: Number(item.amount),
        date: item.occurredAt,
        reason: 'Khoản chi lớn hơn đáng kể so với mức chi trung bình.'
      }));
    const upcomingExpense =
      snapshot.upcomingBills.reduce((sum, item) => sum + item.amount, 0) +
      snapshot.recurringExpenses.reduce((sum, item) => sum + item.amount, 0);
    const safeToSpend = Math.max(0, snapshot.overview.estimatedBalance - upcomingExpense - averageExpense);
    const recommendations: Array<{ level: string; title: string; message: string }> = [];
    if (latest.expense > averageExpense * 1.2 && averageExpense > 0)
      recommendations.push({
        level: 'warning',
        title: 'Chi tiêu đang tăng',
        message: `Chi tháng này cao hơn ${Math.round((latest.expense / averageExpense - 1) * 100)}% so với trung bình.`
      });
    if (!context.budgets.length)
      recommendations.push({
        level: 'info',
        title: 'Lập ngân sách đầu tiên',
        message: 'Bạn có thể nhờ agent tạo ngân sách ngay trong khung chat.'
      });
    return success(res, {
      monthly,
      expenseByCategory: snapshot.topExpenseCategories,
      anomalies,
      subscriptions: [],
      forecast: {
        currency: context.user.currency,
        currentBalance: snapshot.overview.estimatedBalance,
        upcomingExpense,
        averageMonthlyExpense: averageExpense,
        safeToSpend
      },
      recommendations,
      generatedBy: 'deterministic-finance-engine'
    });
  })
);

insightRouter.post(
  '/parse-transaction',
  asyncHandler(async (req, res) => {
    const { text } = parseTextInput.parse(req.body);
    const context = await financialContext(req.user!.id);
    const parsed = parseVietnameseTransaction(text);
    const plain = normalizedText(text);
    const wallet =
      context.wallets.find((item) => plain.includes(normalizedText(item.name))) ??
      (context.wallets.length === 1 ? context.wallets[0] : null);
    const category =
      context.categories.find((item) => item.type === parsed.type && plain.includes(normalizedText(item.name))) ?? null;
    return success(
      res,
      {
        ...parsed,
        suggestedWalletId: wallet?.id ?? null,
        suggestedWalletName: wallet?.name ?? null,
        suggestedCategoryId: category?.id ?? null,
        suggestedCategoryName: category?.name ?? null
      },
      'Đã phân tích câu nhập. Vui lòng xác nhận trước khi lưu.'
    );
  })
);

insightRouter.post(
  '/extract-receipt',
  asyncHandler(async (req, res) => {
    const { text } = receiptTextInput.parse(req.body);
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const amounts = [...text.matchAll(/(?:TOTAL|TỔNG|THANH TOÁN)?\s*[: ]*([\d.,]{3,})\s*(?:VND|đ|₫)?/gi)]
      .map((match) => parseAmount(match[1]!))
      .filter(Number.isFinite);
    const dateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
    const occurredAt = dateMatch
      ? new Date(
          `${dateMatch[3]!.length === 2 ? `20${dateMatch[3]}` : dateMatch[3]}-${dateMatch[2]!.padStart(2, '0')}-${dateMatch[1]!.padStart(2, '0')}T12:00:00Z`
        )
      : null;
    return success(res, {
      merchant: lines[0] ?? null,
      amount: amounts.length ? Math.max(...amounts) : null,
      occurredAt,
      rawText: text,
      confidence: amounts.length ? 0.75 : 0.35,
      requiresConfirmation: true
    });
  })
);

insightRouter.post(
  '/extract-receipt-image',
  aiLimiter,
  imageUpload.single('receipt'),
  asyncHandler(async (req, res) => {
    if (!isAiConfigured())
      throw new AppError(
        503,
        'AI_PROVIDER_NOT_CONFIGURED',
        'Trợ lý AI chưa được cấu hình trên máy chủ này (thiếu khóa nhà cung cấp AI). Các chức năng khác vẫn dùng bình thường.'
      );
    if (!req.file) throw new AppError(422, 'IMAGE_REQUIRED', 'Vui lòng chọn ảnh hóa đơn JPG hoặc PNG.');
    const prefs = preferences(
      (await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { preferences: true } })).preferences
    );
    if (config.AI_PROVIDER !== 'deepseek' || prefs.aiConsent !== true)
      throw new AppError(428, 'AI_CONSENT_REQUIRED', 'Hãy đồng ý sử dụng AI bên ngoài trước khi đọc ảnh hóa đơn.');
    await enforceDailyQuota(req.user!.id);
    const result = await analyzeReceiptImage(req.file.buffer, req.file.mimetype as 'image/jpeg' | 'image/png');
    await audit(req, 'AI_AGENT_REQUEST', 'ReceiptImage', undefined, {
      provider: config.AI_PROVIDER,
      success: Boolean(result)
    });
    if (!result) throw new AppError(503, 'AI_OCR_UNAVAILABLE', 'Chưa thể đọc ảnh hóa đơn lúc này.');
    return success(res, { ...result, requiresConfirmation: true });
  })
);

insightRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const rows = await prisma.assistantConversation.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: { _count: { select: { messages: true } } }
    });
    return success(
      res,
      rows.map((item) => ({
        id: item.id,
        title: item.title,
        messageCount: item._count.messages,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    );
  })
);

insightRouter.get(
  '/memories',
  asyncHandler(async (req, res) => {
    const rows = await prisma.assistantMemory.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
      take: 100
    });
    return success(
      res,
      rows.map((item) => ({
        id: item.id,
        kind: item.kind,
        content: item.content,
        confidence: item.confidence,
        confirmed: item.confirmed,
        expiresAt: item.expiresAt,
        updatedAt: item.updatedAt
      }))
    );
  })
);

insightRouter.delete(
  '/memories/:id',
  asyncHandler(async (req, res) => {
    const result = await prisma.assistantMemory.deleteMany({
      where: { id: String(req.params.id), userId: req.user!.id }
    });
    if (!result.count) throw notFound('Ghi nhớ');
    return success(res, null, 'Đã xóa ghi nhớ.');
  })
);

insightRouter.post(
  '/conversations',
  asyncHandler(async (req, res) => {
    const { title } = conversationInput.parse(req.body ?? {});
    return success(
      res,
      await prisma.assistantConversation.create({ data: { userId: req.user!.id, title } }),
      'Đã tạo cuộc trò chuyện.',
      201
    );
  })
);

insightRouter.get(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const conversation = await prisma.assistantConversation.findFirst({
      where: { id: String(req.params.id), userId: req.user!.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 }, actions: { orderBy: { createdAt: 'asc' } } }
    });
    if (!conversation) throw notFound('Cuộc trò chuyện');
    return success(res, {
      conversation: { id: conversation.id, title: conversation.title },
      messages: conversation.messages.map((item) => ({
        id: item.id,
        role: item.role.toLowerCase(),
        content: item.content,
        provider: item.provider,
        model: item.model,
        status: item.status.toLowerCase(),
        errorCode: item.errorCode,
        finishReason: item.finishReason,
        attemptCount: item.attemptCount,
        createdAt: item.createdAt
      })),
      actions: conversation.actions.map(publicAgentAction)
    });
  })
);

insightRouter.delete(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const deleted = await prisma.assistantConversation.deleteMany({
      where: { id: String(req.params.id), userId: req.user!.id }
    });
    if (!deleted.count) throw notFound('Cuộc trò chuyện');
    return success(res, null, 'Đã xóa cuộc trò chuyện.');
  })
);

insightRouter.post(
  '/assistant',
  aiLimiter,
  asyncHandler(async (req, res) => {
    if (!isAiConfigured())
      throw new AppError(
        503,
        'AI_PROVIDER_NOT_CONFIGURED',
        'Trợ lý AI chưa được cấu hình trên máy chủ này (thiếu khóa nhà cung cấp AI). Các chức năng khác vẫn dùng bình thường.'
      );
    const input = assistantInput.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { preferences: true, fullName: true, currency: true, locale: true }
    });
    if (preferences(user.preferences).aiConsent !== true)
      throw new AppError(
        428,
        'AI_CONSENT_REQUIRED',
        'Hãy đồng ý sử dụng AI bên ngoài trước khi trò chuyện với trợ lý.'
      );
    await enforceDailyQuota(req.user!.id);
    let conversation = input.conversationId
      ? await prisma.assistantConversation.findFirst({ where: { id: input.conversationId, userId: req.user!.id } })
      : null;
    if (input.conversationId && !conversation) throw notFound('Cuộc trò chuyện');
    conversation ??= await prisma.assistantConversation.create({
      data: { userId: req.user!.id, title: input.question.slice(0, 120) }
    });
    const failedMessage = input.retryMessageId
      ? await prisma.assistantMessage.findFirst({
          where: { id: input.retryMessageId, conversationId: conversation.id, role: 'USER', status: 'FAILED' }
        })
      : null;
    if (input.retryMessageId && !failedMessage)
      throw new AppError(409, 'MESSAGE_NOT_RETRYABLE', 'Tin nhắn này không còn ở trạng thái có thể thử lại.');
    const userMessage = failedMessage
      ? await prisma.assistantMessage.update({
          where: { id: failedMessage.id },
          data: { status: 'PROCESSING', errorCode: null }
        })
      : await prisma.assistantMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'USER',
            content: input.question,
            status: 'PROCESSING',
            attemptCount: 0
          }
        });
    const previousAttempts = userMessage.attemptCount;
    const actions: Awaited<ReturnType<typeof prepareAgentActions>> = [];
    const toolResults: Array<{
      tool: string;
      summary: string;
      data?: unknown;
      attachment?: { label: string; url: string; filename?: string };
    }> = [];
    const toolCache = new Map<string, unknown>();
    // Mọi thay đổi Agent đề xuất trong lượt này thành một nhóm xác nhận chung; `pending` cho phép tool ghi sau tham
    // chiếu ví/danh mục mà tool trước vừa đề xuất (xem PendingEntity trong agent.service).
    const batchId = randomUUID();
    const pendingEntities: PendingEntity[] = [];
    let totalLatencyMs = 0;
    let totalAttempts = 0;
    let toolCallCount = 0;
    try {
      const [memoryContext, onboarding] = await Promise.all([
        getAgentMemoryContext(req.user!.id, conversation.id),
        getOnboardingStatus(req.user!.id)
      ]);
      const history = memoryContext.history.length
        ? memoryContext.history
        : [...input.history, { role: 'user' as const, content: input.question }];
      const messages: AgentChatMessage[] = buildAgentMessages(history, {
        now: new Date().toISOString(),
        userName: user.fullName,
        currency: user.currency,
        currentView: input.uiContext?.currentView,
        onboarding: compactOnboarding(onboarding),
        summary: memoryContext.summary,
        memories: memoryContext.memories,
        recentActions: memoryContext.recentActions
      });
      let finalTurn: Awaited<ReturnType<typeof requestAgentTurn>> | null = null;
      let previewClaimRetried = false;
      for (let pass = 0; pass < 2; pass += 1) {
        for (let round = 0; round < (pass ? 2 : AGENT_MAX_ROUNDS); round += 1) {
          const turn = await requestAgentTurn(messages, true);
          totalLatencyMs += turn.latencyMs;
          totalAttempts += turn.attemptCount;
          if (!turn.toolCalls.length) {
            finalTurn = turn;
            break;
          }
          toolCallCount += turn.toolCalls.length;
          if (toolCallCount > AGENT_MAX_TOOL_CALLS_PER_TURN)
            throw new AppError(502, 'AGENT_TOOL_LIMIT', 'Agent đã gọi quá nhiều công cụ trong một lượt.');
          messages.push({
            role: 'assistant',
            content: turn.answer || null,
            tool_calls: turn.toolCalls.map((call) => ({
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: call.argumentsText }
            }))
          });
          for (const call of turn.toolCalls) {
            // Chỉ cache tool đọc và tool chạy ngay. Tool ghi luôn chạy riêng từng lời gọi, để hai khoản chi giống hệt
            // nhau người dùng yêu cầu vẫn thành hai bản ghi.
            const cacheable = READ_AGENT_TOOLS.has(call.name) || IMMEDIATE_AGENT_TOOLS.has(call.name);
            const signature = cacheable ? `${call.name}:${call.argumentsText}` : `write:${call.id}`;
            let result = toolCache.get(signature);
            if (!result) {
              try {
                const parsed = JSON.parse(call.argumentsText || '{}') as unknown;
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                  throw new Error('Arguments must be an object');
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
                  const prepared = await prepareAgentActions(req.user!.id, conversation.id, [proposal], {
                    batchId,
                    pending: pendingEntities
                  });
                  const action = prepared[0];
                  if (!action)
                    throw new AppError(422, 'UNSUPPORTED_AGENT_ACTION', 'Công cụ chưa thể tạo bản xem trước.');
                  actions.push(action);
                  result = {
                    ok: true,
                    tool: call.name,
                    summary:
                      'Đã thêm bản xem trước vào nhóm thay đổi của lượt này. Người dùng sẽ xác nhận cả nhóm bằng một lần bấm; chưa có gì được lưu.',
                    data: { actionId: action.id, status: action.status, preview: action.preview }
                  };
                }
              } catch (error) {
                const message =
                  error instanceof z.ZodError
                    ? (error.issues[0]?.message ?? 'Dữ liệu công cụ không hợp lệ.')
                    : error instanceof Error
                      ? error.message
                      : 'Dữ liệu công cụ không hợp lệ.';
                const code =
                  error instanceof AppError
                    ? error.code
                    : error instanceof z.ZodError
                      ? 'TOOL_VALIDATION_ERROR'
                      : 'TOOL_ARGUMENTS_INVALID';
                result = {
                  ok: false,
                  error: { code, message },
                  instruction:
                    'Hãy sửa lời gọi công cụ hoặc hỏi người dùng phần thông tin còn thiếu. Không khẳng định thao tác đã hoàn tất.'
                };
              }
              toolCache.set(signature, result);
            }
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
          }
        }
        // Mô hình nói đã tạo bản xem trước nhưng không gọi công cụ ghi nào, nên người dùng không có gì để xác nhận
        // (đã gặp với DeepSeek khi được nhờ ghi nhiều khoản một lúc). Nhắc nó gọi công cụ thật và cho chạy thêm vòng.
        if (finalTurn?.answer && !actions.length && !previewClaimRetried && claimsPendingPreview(finalTurn.answer)) {
          previewClaimRetried = true;
          messages.push(
            { role: 'assistant', content: finalTurn.answer },
            {
              role: 'system',
              content:
                'Câu trả lời vừa rồi nói đã có bản xem trước, nhưng bạn chưa gọi công cụ nào nên người dùng không có gì để xác nhận. Hãy gọi ngay các công cụ cần thiết (mỗi khoản một lời gọi riêng) rồi trả lời lại. Nếu còn thiếu thông tin bắt buộc thì hỏi lại, không được nói là đã tạo bản xem trước.'
            }
          );
          finalTurn = null;
          continue;
        }
        // Tương tự với nút tải: mô hình từng chép lại "Bản sao dữ liệu đã sẵn sàng" từ lượt trước mà không gọi công cụ,
        // nên không có nút tải nào và người dùng phải hỏi lại "link đâu".
        if (
          finalTurn?.answer &&
          !previewClaimRetried &&
          !toolResults.some((item) => item.attachment) &&
          claimsDownloadLink(finalTurn.answer)
        ) {
          previewClaimRetried = true;
          messages.push(
            { role: 'assistant', content: finalTurn.answer },
            {
              role: 'system',
              content:
                'Câu trả lời vừa rồi nói đã có liên kết tải, nhưng trong lượt này bạn chưa gọi công cụ nên người dùng không thấy nút tải nào. Hãy gọi ngay công cụ tương ứng (EXPORT_DATA_BACKUP cho bản sao dữ liệu, EXPORT_TRANSACTIONS_CSV cho CSV) rồi trả lời lại. Không được bịa nơi chứa tệp.'
            }
          );
          finalTurn = null;
          continue;
        }
        break;
      }
      // Hết vòng khi Agent đang làm tuần tự từng bước (tra danh mục, tạo cha, tạo con, ghi khoản chi…) nhưng đã có bản
      // xem trước: xin một câu tóm tắt không kèm công cụ thay vì báo lỗi và bỏ cả nhóm thay đổi đã chuẩn bị.
      if (!finalTurn?.answer && actions.length) {
        const summary = await requestAgentTurn(
          [
            ...messages,
            {
              role: 'system',
              content:
                'Bạn đã chuẩn bị xong các bản xem trước ở trên. Không gọi thêm công cụ. Hãy trả lời người dùng ngắn gọn: nhóm gồm những thay đổi nào và nhắc họ bấm xác nhận một lần cho cả nhóm.'
            }
          ],
          false
        );
        totalLatencyMs += summary.latencyMs;
        totalAttempts += summary.attemptCount;
        finalTurn = summary;
      }
      if (finalTurn?.answer && !actions.length && claimsPendingPreview(finalTurn.answer))
        throw new AppError(
          502,
          'AGENT_PREVIEW_MISSING',
          'Agent chưa tạo được bản xem trước cho yêu cầu này. Vui lòng thử lại.'
        );
      if (finalTurn?.answer && !toolResults.some((item) => item.attachment) && claimsDownloadLink(finalTurn.answer))
        throw new AppError(502, 'AGENT_ATTACHMENT_MISSING', 'Agent chưa tạo được liên kết tải. Vui lòng thử lại.');
      if (!finalTurn?.answer)
        throw new AppError(502, 'AGENT_LOOP_LIMIT', 'Agent chưa hoàn tất câu trả lời sau nhiều lần dùng công cụ.');
      let languageRewritten = false;
      if (user.locale.toLowerCase().startsWith('vi') && containsUnexpectedChinese(finalTurn.answer)) {
        const rewritten = await requestAgentTurn(
          [
            ...messages,
            { role: 'assistant', content: finalTurn.answer },
            {
              role: 'system',
              content:
                'Câu trả lời vừa rồi dùng sai ngôn ngữ. Hãy viết lại toàn bộ bằng tiếng Việt tự nhiên, giữ nguyên dữ kiện và trạng thái thực tế của công cụ. Không gọi thêm công cụ và không thêm tuyên bố chưa được kết quả công cụ xác nhận.'
            }
          ],
          false
        );
        totalLatencyMs += rewritten.latencyMs;
        totalAttempts += rewritten.attemptCount;
        if (!rewritten.answer || containsUnexpectedChinese(rewritten.answer))
          throw new AppError(502, 'AI_LANGUAGE_MISMATCH', 'Agent chưa thể trả lời đúng tiếng Việt. Vui lòng thử lại.');
        finalTurn = rewritten;
        languageRewritten = true;
      }
      let onboardingClaimRewritten = false;
      if (onboarding.completed && containsStaleOnboardingClaim(finalTurn.answer)) {
        const rewritten = await requestAgentTurn(
          [
            ...messages,
            { role: 'assistant', content: finalTurn.answer },
            {
              role: 'system',
              content:
                'Câu trả lời vừa rồi nói sai: người dùng ĐÃ hoàn thành đủ 4 bước thiết lập ban đầu (hồ sơ, ví, danh mục, giao dịch đầu tiên), không còn thiếu bước nào. Hãy viết lại toàn bộ câu trả lời, không nhắc tới việc còn thiếu thiết lập hay cần ghi giao dịch đầu tiên, chỉ trả lời đúng trọng tâm câu hỏi gốc của người dùng.'
            }
          ],
          false
        );
        totalLatencyMs += rewritten.latencyMs;
        totalAttempts += rewritten.attemptCount;
        if (rewritten.answer && !containsStaleOnboardingClaim(rewritten.answer)) {
          finalTurn = rewritten;
          onboardingClaimRewritten = true;
        }
      }
      await prisma.$transaction([
        prisma.assistantMessage.update({
          where: { id: userMessage.id },
          data: { status: 'COMPLETED', attemptCount: previousAttempts + (totalAttempts || 1) }
        }),
        prisma.assistantMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'ASSISTANT',
            content: finalTurn.answer,
            provider: finalTurn.provider,
            model: finalTurn.model,
            status: 'COMPLETED',
            finishReason: finalTurn.finishReason,
            providerRequestId: finalTurn.requestId,
            attemptCount: finalTurn.attemptCount
          }
        }),
        prisma.assistantConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })
      ]);
      await audit(req, 'AI_AGENT_REQUEST', 'AssistantConversation', conversation.id, {
        provider: finalTurn.provider,
        model: finalTurn.model,
        latencyMs: totalLatencyMs,
        actionCount: actions.length,
        toolCount: toolCallCount,
        languageRewritten,
        onboardingClaimRewritten,
        previewClaimRetried,
        success: true
      });
      void refreshConversationSummary(conversation.id);
      // Khi lượt này đã tạo nhóm thay đổi, thẻ xác nhận là việc chính; bỏ các nút điều hướng phụ ("Xem các ví") sinh ra từ
      // tool đọc mà Agent gọi để tra tên ví/danh mục, tránh làm rối câu trả lời.
      const uiActions = actions.length
        ? []
        : toolResults.flatMap((item) => {
            const data = item.data as { uiActions?: unknown[] } | undefined;
            return Array.isArray(data?.uiActions) ? data.uiActions : [];
          });
      return success(res, {
        conversationId: conversation.id,
        answer: finalTurn.answer,
        provider: finalTurn.provider,
        model: finalTurn.model,
        latencyMs: totalLatencyMs,
        intent: actions.length ? 'ACTION' : toolCallCount ? 'TOOL' : 'GENERAL',
        actions: actions.map(publicAgentAction),
        toolResults,
        uiActions,
        onboarding,
        attachments: toolResults.flatMap((item) => (item.attachment ? [item.attachment] : [])),
        consentRequired: false
      });
    } catch (error) {
      const errorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      if (actions.length)
        await prisma.agentAction.updateMany({
          where: { id: { in: actions.map((item) => item.id) }, status: 'PENDING' },
          data: { status: 'FAILED' }
        });
      await prisma.$transaction([
        prisma.assistantMessage.update({
          where: { id: userMessage.id },
          data: { status: 'FAILED', errorCode, attemptCount: previousAttempts + (totalAttempts || 1) }
        }),
        prisma.assistantConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })
      ]);
      try {
        await audit(req, 'AI_AGENT_FAILURE', 'AssistantConversation', conversation.id, {
          provider: config.AI_PROVIDER,
          errorCode,
          toolCount: toolCallCount,
          actionCount: actions.length,
          success: false
        });
      } catch {}
      if (error instanceof AppError)
        throw new AppError(error.statusCode, error.code, error.message, {
          ...(error.details && typeof error.details === 'object' ? (error.details as Record<string, unknown>) : {}),
          conversationId: conversation.id,
          messageId: userMessage.id
        });
      throw error;
    }
  })
);

/** Xác nhận/hủy/hoàn tác áp dụng cho CẢ NHÓM chứa action được chọn. Response giữ các trường của chính action đó
 * (tương thích client cũ) và thêm `actions` là toàn bộ nhóm. Không còn ghi tin nhắn hệ thống vào hội thoại: trạng
 * thái đã nằm trên thẻ hành động, và Agent đọc trạng thái nhóm qua ngữ cảnh `recentActions` ở lượt sau. */
function groupResponse(group: Awaited<ReturnType<typeof executeAgentAction>>, actionId: string) {
  const selected = group.find((item) => item.id === actionId) ?? group[0]!;
  return { ...publicAgentAction(selected), actions: group.map(publicAgentAction) };
}

insightRouter.post(
  '/actions/:id/confirm',
  asyncHandler(async (req, res) => {
    const actionId = String(req.params.id);
    const group = await executeAgentAction(req.user!.id, actionId);
    for (const action of group.filter((item) => item.status === 'EXECUTED'))
      await audit(req, 'AGENT_ACTION_EXECUTED', 'AgentAction', action.id, {
        type: action.type,
        batchId: action.batchId
      });
    return success(
      res,
      groupResponse(group, actionId),
      group.length > 1 ? `Đã thực hiện ${group.length} thay đổi.` : 'Đã thực hiện hành động.'
    );
  })
);

insightRouter.post(
  '/actions/:id/cancel',
  asyncHandler(async (req, res) => {
    const actionId = String(req.params.id);
    const group = await cancelAgentAction(req.user!.id, actionId);
    for (const action of group.filter((item) => item.status === 'CANCELLED'))
      await audit(req, 'AGENT_ACTION_CANCELLED', 'AgentAction', action.id, { batchId: action.batchId });
    return success(res, groupResponse(group, actionId), 'Đã hủy hành động.');
  })
);

insightRouter.post(
  '/actions/:id/undo',
  asyncHandler(async (req, res) => {
    const actionId = String(req.params.id);
    const group = await undoAgentAction(req.user!.id, actionId);
    for (const action of group.filter((item) => item.status === 'UNDONE'))
      await audit(req, 'AGENT_ACTION_UNDONE', 'AgentAction', action.id, { type: action.type, batchId: action.batchId });
    return success(res, groupResponse(group, actionId), 'Đã hoàn tác hành động.');
  })
);

const aiErrors = {
  428: 'AI_CONSENT_REQUIRED – người dùng chưa đồng ý dùng AI bên ngoài.',
  429: 'AI_DAILY_LIMIT_REACHED / RATE_LIMITED – hết lượt AI trong ngày hoặc gửi quá nhanh.',
  503: 'AI_PROVIDER_NOT_CONFIGURED – máy chủ chưa cấu hình khóa AI.'
};
documentRoutes(insightRouter, {
  'GET /settings': { summary: 'Quyền riêng tư AI, hạng tài khoản và lượt AI còn lại trong ngày' },
  'PUT /settings': { summary: 'Đồng ý hoặc thu hồi đồng ý dùng AI bên ngoài', body: consentInput },
  'GET /overview': { summary: 'Phân tích chi tiêu, khoản bất thường, thuê bao và dự báo cuối tháng' },
  'POST /parse-transaction': { summary: 'Hiểu câu tiếng Việt thành giao dịch nháp', body: parseTextInput },
  'POST /extract-receipt': { summary: 'Trích số tiền, ngày, cửa hàng từ văn bản OCR hóa đơn', body: receiptTextInput },
  'POST /extract-receipt-image': { summary: 'Đọc ảnh hóa đơn bằng AI (JPG/PNG)', file: 'receipt', errors: aiErrors },
  'GET /conversations': { summary: 'Danh sách hội thoại với trợ lý' },
  'GET /memories': { summary: 'Các ghi nhớ dài hạn trợ lý đã lưu về người dùng' },
  'DELETE /memories/:id': { summary: 'Xóa một ghi nhớ dài hạn' },
  'POST /conversations': { summary: 'Tạo hội thoại mới', body: conversationInput, status: 201 },
  'GET /conversations/:id/messages': { summary: 'Tin nhắn và hành động của một hội thoại' },
  'DELETE /conversations/:id': { summary: 'Xóa hội thoại' },
  'POST /assistant': {
    summary: 'Hỏi trợ lý tài chính (Agent đa lượt dùng công cụ đọc/ghi dữ liệu)',
    description:
      'Thay đổi dữ liệu chỉ được đề xuất dưới dạng hành động chờ xác nhận; người dùng xác nhận, hủy hoặc hoàn tác qua /actions/{id}/*.',
    body: assistantInput,
    errors: aiErrors
  },
  'POST /actions/:id/confirm': { summary: 'Xác nhận và thực hiện nhóm hành động của trợ lý' },
  'POST /actions/:id/cancel': { summary: 'Hủy hành động đang chờ xác nhận' },
  'POST /actions/:id/undo': { summary: 'Hoàn tác hành động đã thực hiện' }
});
