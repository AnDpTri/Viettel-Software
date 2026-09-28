import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { authenticate } from '../middleware/auth';
import { AssistantHistoryItem, generateAiAnswer } from '../services/ai.service';

export const insightRouter = Router();
insightRouter.use(authenticate);

function monthKey(date: Date) { return date.toISOString().slice(0, 7); }
function normalizedText(value?: string | null) { return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

async function financialContext(userId: string) {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 6);
  const [user, wallets, transactions, budgets, goals, bills, recurring] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } }),
    prisma.wallet.findMany({ where: { userId, archivedAt: null } }),
    prisma.transaction.findMany({ where: { userId, deletedAt: null, occurredAt: { gte: since }, status: { not: 'CANCELLED' } }, include: { category: true, wallet: true }, orderBy: { occurredAt: 'asc' } }),
    prisma.budget.findMany({ where: { userId, deletedAt: null } }), prisma.goal.findMany({ where: { userId, deletedAt: null } }),
    prisma.bill.findMany({ where: { userId, status: { in: ['UPCOMING', 'OVERDUE'] } } }), prisma.recurringRule.findMany({ where: { userId, active: true } })
  ]);
  return { user, wallets, transactions, budgets, goals, bills, recurring };
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
  const monthly = [...months.entries()].map(([month, value]) => ({ month, ...value, net: value.income - value.expense }));
  const totalIncome = eligible.filter((item) => item.type === 'INCOME').reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpense = eligible.filter((item) => item.type === 'EXPENSE').reduce((sum, item) => sum + Number(item.amount), 0);
  const openingBalance = context.wallets.filter((wallet) => wallet.currency === context.user.currency).reduce((sum, wallet) => sum + Number(wallet.openingBalance), 0);
  const budgetProgress = context.budgets.map((budget) => {
    const spent = eligible.filter((item) => item.type === 'EXPENSE' && item.occurredAt >= budget.startDate && item.occurredAt <= budget.endDate && (!budget.categoryId || item.categoryId === budget.categoryId)).reduce((sum, item) => sum + Number(item.amount), 0);
    return { name: budget.name, limit: Number(budget.amount), spent, remaining: Number(budget.amount) - spent, percentUsed: Number(budget.amount) ? Math.round(spent / Number(budget.amount) * 100) : 0, endDate: budget.endDate.toISOString().slice(0, 10) };
  });
  return {
    generatedAt: new Date().toISOString(),
    period: '6 tháng gần nhất',
    currency: context.user.currency,
    overview: { transactionCount: eligible.length, totalIncome, totalExpense, netCashFlow: totalIncome - totalExpense, estimatedBalance: openingBalance + totalIncome - totalExpense },
    monthly,
    topExpenseCategories: [...categories.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
    budgets: budgetProgress,
    goals: context.goals.map((goal) => ({ name: goal.name, target: Number(goal.targetAmount), current: Number(goal.currentAmount), progressPercent: Number(goal.targetAmount) ? Math.round(Number(goal.currentAmount) / Number(goal.targetAmount) * 100) : 0, targetDate: goal.targetDate?.toISOString().slice(0, 10) ?? null, status: goal.status })),
    upcomingBills: context.bills.map((bill) => ({ name: bill.name, amount: Number(bill.amount), dueAt: bill.dueAt.toISOString(), status: bill.status })),
    recurringExpenses: context.recurring.filter((item) => item.type === 'EXPENSE').map((item) => ({ name: item.name, amount: Number(item.amount), frequency: item.frequency, nextRunAt: item.nextRunAt.toISOString() }))
  };
}

function localAssistantAnswer(question: string, snapshot: ReturnType<typeof buildAssistantSnapshot>) {
  const topic = normalizedText(question);
  const currency = snapshot.currency;
  if (topic.includes('ngan sach') && snapshot.budgets.length) {
    const urgent = [...snapshot.budgets].sort((a, b) => b.percentUsed - a.percentUsed)[0]!;
    return `Ngân sách cần chú ý nhất là “${urgent.name}”: đã dùng ${urgent.percentUsed}% (${urgent.spent.toLocaleString('vi-VN')}/${urgent.limit.toLocaleString('vi-VN')} ${currency}), còn ${urgent.remaining.toLocaleString('vi-VN')} ${currency}. Hãy rà soát các khoản chi lớn và đặt cảnh báo trước khi vượt 80–90%.`;
  }
  if ((topic.includes('muc tieu') || topic.includes('tiet kiem')) && snapshot.goals.length) {
    const goal = [...snapshot.goals].sort((a, b) => a.progressPercent - b.progressPercent)[0]!;
    return `Mục tiêu “${goal.name}” đang đạt ${goal.progressPercent}% (${goal.current.toLocaleString('vi-VN')}/${goal.target.toLocaleString('vi-VN')} ${currency}). Bạn nên chia phần còn thiếu thành khoản đóng góp định kỳ phù hợp với dòng tiền ròng.`;
  }
  if ((topic.includes('hoa don') || topic.includes('sap toi')) && snapshot.upcomingBills.length) {
    const total = snapshot.upcomingBills.reduce((sum, item) => sum + item.amount, 0);
    return `Bạn có ${snapshot.upcomingBills.length} hóa đơn sắp đến hạn hoặc quá hạn, tổng ${total.toLocaleString('vi-VN')} ${currency}. Hãy ưu tiên hóa đơn quá hạn, sau đó giữ riêng số tiền này trước khi chi tiêu tùy ý.`;
  }
  const top = snapshot.topExpenseCategories[0];
  const topText = top ? ` Nhóm chi lớn nhất là ${top.name}, khoảng ${top.amount.toLocaleString('vi-VN')} ${currency}.` : '';
  return `Trong ${snapshot.period}, tổng thu là ${snapshot.overview.totalIncome.toLocaleString('vi-VN')} và tổng chi là ${snapshot.overview.totalExpense.toLocaleString('vi-VN')} ${currency}; dòng tiền ròng ${snapshot.overview.netCashFlow.toLocaleString('vi-VN')} ${currency}.${topText} Đây là phân tích hỗ trợ, không phải tư vấn đầu tư.`;
}

insightRouter.get('/overview', asyncHandler(async (req, res) => {
  const context = await financialContext(req.user!.id);
  const monthly = new Map<string, { income: number; expense: number }>();
  const categorySpend = new Map<string, number>();
  const payeeGroups = new Map<string, Array<{ amount: number; date: Date }>>();
  for (const item of context.transactions) {
    if (item.wallet.currency !== context.user.currency || item.type === 'TRANSFER') continue;
    const row = monthly.get(monthKey(item.occurredAt)) ?? { income: 0, expense: 0 };
    row[item.type === 'INCOME' ? 'income' : 'expense'] += Number(item.amount);
    monthly.set(monthKey(item.occurredAt), row);
    if (item.type === 'EXPENSE') {
      const category = item.category?.name ?? 'Chưa phân loại';
      categorySpend.set(category, (categorySpend.get(category) ?? 0) + Number(item.amount));
      const key = normalizedText(item.payee || item.note);
      if (key) payeeGroups.set(key, [...(payeeGroups.get(key) ?? []), { amount: Number(item.amount), date: item.occurredAt }]);
    }
  }
  const series = [...monthly.entries()].map(([month, values]) => ({ month, ...values, net: values.income - values.expense }));
  const latest = series.at(-1) ?? { income: 0, expense: 0, net: 0 };
  const prior = series.slice(0, -1);
  const averageExpense = prior.length ? prior.reduce((sum, item) => sum + item.expense, 0) / prior.length : latest.expense;
  const anomalies = context.transactions.filter((item) => item.type === 'EXPENSE' && Number(item.amount) > Math.max(500_000, averageExpense * 0.35)).slice(-10).map((item) => ({ transactionId: item.id, amount: Number(item.amount), date: item.occurredAt, reason: 'Khoản chi lớn hơn đáng kể so với mức chi trung bình.' }));
  const subscriptions = [...payeeGroups.entries()].filter(([, values]) => values.length >= 3).map(([name, values]) => ({ name, occurrences: values.length, averageAmount: values.reduce((sum, item) => sum + item.amount, 0) / values.length, confidence: Math.min(0.95, 0.5 + values.length * 0.1) }));
  const upcomingExpense = context.bills.reduce((sum, item) => sum + Number(item.amount), 0) + context.recurring.filter((item) => item.type === 'EXPENSE').reduce((sum, item) => sum + Number(item.amount), 0);
  const currentBalance = context.wallets.reduce((sum, wallet) => sum + Number(wallet.openingBalance), 0) + context.transactions.reduce((sum, item) => sum + (item.type === 'INCOME' ? Number(item.amount) : item.type === 'EXPENSE' ? -Number(item.amount) : 0), 0);
  const safeToSpend = Math.max(0, currentBalance - upcomingExpense - averageExpense);
  const recommendations = [];
  if (latest.expense > averageExpense * 1.2 && averageExpense > 0) recommendations.push({ level: 'warning', title: 'Chi tiêu đang tăng', message: `Chi tháng này cao hơn ${Math.round((latest.expense / averageExpense - 1) * 100)}% so với trung bình.` });
  if (!context.budgets.length) recommendations.push({ level: 'info', title: 'Lập ngân sách đầu tiên', message: 'Tạo ngân sách theo nhóm chi lớn nhất để kiểm soát dòng tiền.' });
  if (!context.goals.length) recommendations.push({ level: 'info', title: 'Tạo quỹ dự phòng', message: 'Một mục tiêu tương đương 3–6 tháng chi tiêu giúp tăng khả năng chống chịu.' });
  return success(res, { monthly: series, expenseByCategory: [...categorySpend.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount), anomalies, subscriptions, forecast: { currentBalance, upcomingExpense, averageMonthlyExpense: averageExpense, safeToSpend }, recommendations, generatedBy: 'local-explainable-engine' });
}));

function parseVietnameseTransaction(text: string) {
  const plain = normalizedText(text);
  const amountMatch = plain.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(trieu|tr|nghin|ngan|k|đ|d|vnd)?/);
  let amount = amountMatch ? Number(amountMatch[1]!.replace(',', '.')) : 0;
  const unit = amountMatch?.[2];
  if (unit === 'trieu' || unit === 'tr') amount *= 1_000_000;
  if (unit === 'nghin' || unit === 'ngan' || unit === 'k') amount *= 1_000;
  const incomeWords = ['nhan', 'luong', 'thu nhap', 'duoc tra', 'hoan tien'];
  const type = incomeWords.some((word) => plain.includes(word)) ? 'INCOME' : 'EXPENSE';
  const date = new Date();
  if (plain.includes('hom qua')) date.setDate(date.getDate() - 1);
  const note = text.replace(amountMatch?.[0] ?? '', '').replace(/\b(hom nay|hôm nay|hom qua|hôm qua)\b/gi, '').trim();
  return { type, amount, occurredAt: date.toISOString(), note, confidence: amount > 0 ? 0.82 : 0.45, requiresConfirmation: true };
}

insightRouter.post('/parse-transaction', asyncHandler(async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(3).max(500) }).parse(req.body);
  return success(res, parseVietnameseTransaction(text), 'Đã phân tích câu nhập. Vui lòng xác nhận trước khi lưu.');
}));

insightRouter.post('/extract-receipt', asyncHandler(async (req, res) => {
  const { text } = z.object({ text: z.string().min(3).max(20_000) }).parse(req.body);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const amounts = [...text.matchAll(/(?:TOTAL|TỔNG|THANH TOÁN)?\s*[: ]*([\d.,]{3,})\s*(?:VND|đ|₫)?/gi)].map((match) => Number(match[1]!.replace(/[.,](?=\d{3}(?:\D|$))/g, '').replace(',', '.'))).filter(Number.isFinite);
  const dateMatch = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  const occurredAt = dateMatch ? new Date(`${dateMatch[3]!.length === 2 ? `20${dateMatch[3]}` : dateMatch[3]}-${dateMatch[2]!.padStart(2, '0')}-${dateMatch[1]!.padStart(2, '0')}T12:00:00Z`) : null;
  return success(res, { merchant: lines[0] ?? null, amount: amounts.length ? Math.max(...amounts) : null, occurredAt, rawText: text, confidence: amounts.length ? 0.75 : 0.35, requiresConfirmation: true }, 'Đã trích xuất thông tin hóa đơn.');
}));

insightRouter.post('/assistant', asyncHandler(async (req, res) => {
  const { question, history } = z.object({
    question: z.string().trim().min(3).max(1000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1500) })).max(6).default([])
  }).parse(req.body);
  const context = await financialContext(req.user!.id);
  const snapshot = buildAssistantSnapshot(context);
  const ai = await generateAiAnswer(question, snapshot, history as AssistantHistoryItem[]);
  return success(res, {
    answer: ai?.answer ?? localAssistantAnswer(question, snapshot), provider: ai?.provider ?? 'local', model: ai?.model ?? 'local-explainable-engine', latencyMs: ai?.latencyMs ?? 0,
    dataScope: '6-month-aggregated-summary', disclaimer: 'Kết quả chỉ mang tính tham khảo và luôn cần người dùng xác nhận.'
  });
}));
