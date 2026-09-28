import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { asyncHandler } from '../lib/async-handler';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { success } from '../lib/response';
import { authenticate } from '../middleware/auth';

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

async function openAiAnswer(question: string, context: unknown) {
  if (config.AI_PROVIDER !== 'openai' || !config.OPENAI_API_KEY) return null;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.OPENAI_MODEL, input: [{ role: 'system', content: 'Bạn là trợ lý tài chính cá nhân. Chỉ phân tích dữ liệu được cung cấp, không đưa ra cam kết đầu tư. Trả lời ngắn gọn bằng tiếng Việt.' }, { role: 'user', content: `${question}\nDữ liệu tổng hợp: ${JSON.stringify(context)}` }] }) });
  if (!response.ok) throw new AppError(502, 'AI_PROVIDER_ERROR', 'Dịch vụ trợ lý thông minh tạm thời không khả dụng.');
  const data = await response.json() as { output_text?: string };
  return data.output_text ?? null;
}

insightRouter.post('/assistant', asyncHandler(async (req, res) => {
  const { question } = z.object({ question: z.string().trim().min(3).max(1000) }).parse(req.body);
  const context = await financialContext(req.user!.id);
  const summary = { transactionCount: context.transactions.length, budgets: context.budgets.length, goals: context.goals.length, upcomingBills: context.bills.length, totalIncome: context.transactions.filter((item) => item.type === 'INCOME').reduce((sum, item) => sum + Number(item.amount), 0), totalExpense: context.transactions.filter((item) => item.type === 'EXPENSE').reduce((sum, item) => sum + Number(item.amount), 0) };
  const ai = await openAiAnswer(question, summary);
  const local = `Trong 6 tháng gần nhất bạn có ${summary.transactionCount} giao dịch, tổng thu ${summary.totalIncome.toLocaleString('vi-VN')} và tổng chi ${summary.totalExpense.toLocaleString('vi-VN')} ${context.user.currency}. Bạn có ${summary.upcomingBills} hóa đơn sắp đến hạn. Đây là phân tích hỗ trợ, không phải tư vấn đầu tư.`;
  return success(res, { answer: ai ?? local, provider: ai ? 'openai' : 'local', dataScope: '6-month-summary', disclaimer: 'Kết quả chỉ mang tính tham khảo và luôn cần người dùng xác nhận.' });
}));
