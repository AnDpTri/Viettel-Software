import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { audit } from '../lib/audit';
import { assertNotProtectedDemo } from '../lib/demo-account';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { nextOccurrence } from '../lib/recurrence';
import { success } from '../lib/response';
import { money, uuid } from '../lib/validation';
import { documentRoutes } from '../docs/route-docs';
import { authenticate } from '../middleware/auth';

export const productivityRouter = Router();
productivityRouter.use(authenticate);
const recurrence = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);
const transactionType = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const merchantInput = z.object({
  name: z.string().trim().min(1).max(160),
  defaultCategoryId: uuid.nullable().optional()
});
const tagInput = z.object({ name: z.string().trim().min(1).max(50), color: hexColor.nullable().optional() });
const billPayInput = z.object({
  walletId: uuid.optional().openapi({ description: 'Bỏ trống thì dùng ví gắn với hóa đơn' }),
  categoryId: uuid.nullable().optional()
});
const templateUseInput = z.object({
  amount: money.optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
  note: z.string().max(500).optional()
});
const exchangeRateInput = z.object({
  baseCurrency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase()),
  quoteCurrency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase()),
  rate: z.coerce.number().positive(),
  effectiveAt: z.coerce.date().default(() => new Date()),
  source: z.string().max(30).default('MANUAL')
});
const householdInput = z.object({ name: z.string().trim().min(1).max(120) });
const joinInput = z.object({ inviteCode: z.string().min(8).max(32) });
const deleteAccountInput = z.object({ confirmation: z.literal('XOA TAI KHOAN') });
const notificationQuery = z.object({ unread: z.enum(['true', 'false']).optional() });

productivityRouter.get(
  '/merchants',
  asyncHandler(async (req, res) =>
    success(res, await prisma.merchant.findMany({ where: { userId: req.user!.id }, orderBy: { name: 'asc' } }))
  )
);
productivityRouter.post(
  '/merchants',
  asyncHandler(async (req, res) => {
    const input = merchantInput.parse(req.body);
    return success(
      res,
      await prisma.merchant.create({ data: { userId: req.user!.id, ...input } }),
      'Đã tạo đơn vị giao dịch.',
      201
    );
  })
);
productivityRouter.patch(
  '/merchants/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    if (!(await prisma.merchant.findFirst({ where: { id, userId: req.user!.id } }))) throw notFound('Đơn vị giao dịch');
    const input = merchantInput.partial().parse(req.body);
    return success(res, await prisma.merchant.update({ where: { id }, data: input }), 'Đã cập nhật đơn vị giao dịch.');
  })
);
productivityRouter.delete(
  '/merchants/:id',
  asyncHandler(async (req, res) => {
    const result = await prisma.merchant.deleteMany({ where: { id: uuid.parse(req.params.id), userId: req.user!.id } });
    if (!result.count) throw notFound('Đơn vị giao dịch');
    return success(res, null, 'Đã xóa đơn vị giao dịch.');
  })
);

productivityRouter.get(
  '/tags',
  asyncHandler(async (req, res) =>
    success(res, await prisma.tag.findMany({ where: { userId: req.user!.id }, orderBy: { name: 'asc' } }))
  )
);
productivityRouter.post(
  '/tags',
  asyncHandler(async (req, res) => {
    const input = tagInput.parse(req.body);
    return success(res, await prisma.tag.create({ data: { userId: req.user!.id, ...input } }), 'Đã tạo nhãn.', 201);
  })
);
productivityRouter.patch(
  '/tags/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = tagInput.partial().parse(req.body);
    if (!(await prisma.tag.findFirst({ where: { id, userId: req.user!.id } }))) throw notFound('Nhãn');
    return success(res, await prisma.tag.update({ where: { id }, data: input }), 'Đã cập nhật nhãn.');
  })
);
productivityRouter.delete(
  '/tags/:id',
  asyncHandler(async (req, res) => {
    const result = await prisma.tag.deleteMany({ where: { id: uuid.parse(req.params.id), userId: req.user!.id } });
    if (!result.count) throw notFound('Nhãn');
    return success(res, null, 'Đã xóa nhãn.');
  })
);

const recurringInput = z.object({
  walletId: uuid,
  categoryId: uuid.nullable().optional(),
  name: z.string().trim().min(1).max(120),
  type: transactionType,
  amount: money,
  frequency: recurrence,
  interval: z.coerce.number().int().min(1).max(365).default(1),
  nextRunAt: z.coerce.date(),
  endAt: z.coerce.date().nullable().optional(),
  autoPost: z.boolean().default(false),
  active: z.boolean().default(true),
  note: z.string().max(500).nullable().optional()
});
productivityRouter.get(
  '/recurring',
  asyncHandler(async (req, res) =>
    success(
      res,
      await prisma.recurringRule.findMany({
        where: { userId: req.user!.id },
        include: { wallet: true, category: true },
        orderBy: { nextRunAt: 'asc' }
      })
    )
  )
);
productivityRouter.post(
  '/recurring',
  asyncHandler(async (req, res) => {
    const input = recurringInput.parse(req.body);
    if (!(await prisma.wallet.findFirst({ where: { id: input.walletId, userId: req.user!.id } }))) throw notFound('Ví');
    const item = await prisma.recurringRule.create({
      data: { userId: req.user!.id, ...input },
      include: { wallet: true, category: true }
    });
    return success(res, item, 'Đã tạo giao dịch định kỳ.', 201);
  })
);
productivityRouter.patch(
  '/recurring/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    if (!(await prisma.recurringRule.findFirst({ where: { id, userId: req.user!.id } })))
      throw notFound('Lịch định kỳ');
    return success(
      res,
      await prisma.recurringRule.update({ where: { id }, data: recurringInput.partial().parse(req.body) }),
      'Đã cập nhật lịch định kỳ.'
    );
  })
);
productivityRouter.delete(
  '/recurring/:id',
  asyncHandler(async (req, res) => {
    const result = await prisma.recurringRule.deleteMany({
      where: { id: uuid.parse(req.params.id), userId: req.user!.id }
    });
    if (!result.count) throw notFound('Lịch định kỳ');
    return success(res, null, 'Đã xóa lịch định kỳ.');
  })
);
productivityRouter.post(
  '/recurring/run-due',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const rules = await prisma.recurringRule.findMany({
      where: {
        userId: req.user!.id,
        active: true,
        autoPost: true,
        nextRunAt: { lte: now },
        OR: [{ endAt: null }, { endAt: { gte: now } }]
      }
    });
    const created = [];
    for (const rule of rules) {
      if (rule.type === 'TRANSFER') continue;
      const item = await prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.create({
          data: {
            userId: rule.userId,
            walletId: rule.walletId,
            categoryId: rule.categoryId,
            type: rule.type,
            amount: rule.amount,
            occurredAt: rule.nextRunAt,
            note: rule.note,
            recurringRuleId: rule.id,
            status: 'CLEARED'
          }
        });
        await tx.recurringRule.update({
          where: { id: rule.id },
          data: { nextRunAt: nextOccurrence(rule.nextRunAt, rule.frequency, rule.interval) }
        });
        return transaction;
      });
      created.push(item);
    }
    return success(res, { processed: created.length, transactions: created }, 'Đã xử lý các giao dịch đến hạn.');
  })
);

const billInput = z.object({
  name: z.string().trim().min(1).max(120),
  amount: money,
  dueAt: z.coerce.date(),
  walletId: uuid.nullable().optional(),
  recurrence: recurrence.nullable().optional(),
  reminderDays: z.array(z.number().int().min(0).max(90)).max(10).default([1, 3, 7])
});
// Một schema gộp: trước đây là union mà nhánh đầu (billInput.partial) luôn khớp và bỏ qua `status`, nên không đổi được trạng thái.
const billPatchInput = billInput
  .partial()
  .extend({ status: z.enum(['UPCOMING', 'PAID', 'OVERDUE', 'SKIPPED']).optional() });
productivityRouter.get(
  '/bills',
  asyncHandler(async (req, res) => {
    await prisma.bill.updateMany({
      where: { userId: req.user!.id, status: 'UPCOMING', dueAt: { lt: new Date() } },
      data: { status: 'OVERDUE' }
    });
    return success(
      res,
      await prisma.bill.findMany({
        where: { userId: req.user!.id },
        include: { wallet: true },
        orderBy: { dueAt: 'asc' }
      })
    );
  })
);
productivityRouter.post(
  '/bills',
  asyncHandler(async (req, res) =>
    success(
      res,
      await prisma.bill.create({ data: { userId: req.user!.id, ...billInput.parse(req.body) } }),
      'Đã tạo hóa đơn nhắc việc.',
      201
    )
  )
);
productivityRouter.patch(
  '/bills/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    if (!(await prisma.bill.findFirst({ where: { id, userId: req.user!.id } }))) throw notFound('Hóa đơn');
    const data = billPatchInput.parse(req.body);
    return success(res, await prisma.bill.update({ where: { id }, data }), 'Đã cập nhật hóa đơn.');
  })
);
productivityRouter.post(
  '/bills/:id/pay',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const bill = await prisma.bill.findFirst({ where: { id, userId: req.user!.id } });
    if (!bill) throw notFound('Hóa đơn');
    const walletId = billPayInput.parse(req.body).walletId ?? bill.walletId;
    if (!walletId) throw new AppError(422, 'WALLET_REQUIRED', 'Cần chọn ví để thanh toán.');
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId: req.user!.id,
          walletId,
          categoryId: req.body.categoryId ?? null,
          type: 'EXPENSE',
          amount: bill.amount,
          occurredAt: new Date(),
          note: `Thanh toán: ${bill.name}`
        }
      });
      const nextDue = bill.recurrence ? nextOccurrence(bill.dueAt, bill.recurrence) : bill.dueAt;
      const updated = await tx.bill.update({
        where: { id },
        data: bill.recurrence ? { dueAt: nextDue, status: 'UPCOMING' } : { status: 'PAID' }
      });
      return { bill: updated, transaction };
    });
    return success(res, result, 'Đã thanh toán hóa đơn.');
  })
);
productivityRouter.delete(
  '/bills/:id',
  asyncHandler(async (req, res) => {
    const result = await prisma.bill.deleteMany({ where: { id: uuid.parse(req.params.id), userId: req.user!.id } });
    if (!result.count) throw notFound('Hóa đơn');
    return success(res, null, 'Đã xóa hóa đơn.');
  })
);

const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  walletId: uuid,
  categoryId: uuid.nullable().optional(),
  type: transactionType,
  amount: money.nullable().optional(),
  note: z.string().max(500).nullable().optional()
});
productivityRouter.get(
  '/templates',
  asyncHandler(async (req, res) =>
    success(
      res,
      await prisma.transactionTemplate.findMany({
        where: { userId: req.user!.id },
        include: { wallet: true, category: true },
        orderBy: { name: 'asc' }
      })
    )
  )
);
productivityRouter.post(
  '/templates',
  asyncHandler(async (req, res) =>
    success(
      res,
      await prisma.transactionTemplate.create({ data: { userId: req.user!.id, ...templateInput.parse(req.body) } }),
      'Đã tạo mẫu giao dịch.',
      201
    )
  )
);
productivityRouter.post(
  '/templates/:id/use',
  asyncHandler(async (req, res) => {
    const template = await prisma.transactionTemplate.findFirst({
      where: { id: uuid.parse(req.params.id), userId: req.user!.id }
    });
    if (!template) throw notFound('Mẫu giao dịch');
    if (template.type === 'TRANSFER')
      throw new AppError(422, 'TRANSFER_TEMPLATE_UNSUPPORTED', 'Vui lòng chọn ví đích khi dùng mẫu chuyển khoản.');
    const override = templateUseInput.parse(req.body);
    const amount = override.amount ?? template.amount;
    if (!amount) throw new AppError(422, 'AMOUNT_REQUIRED', 'Cần nhập số tiền.');
    return success(
      res,
      await prisma.transaction.create({
        data: {
          userId: req.user!.id,
          walletId: template.walletId,
          categoryId: template.categoryId,
          type: template.type,
          amount,
          occurredAt: override.occurredAt,
          note: override.note ?? template.note
        }
      }),
      'Đã tạo giao dịch từ mẫu.',
      201
    );
  })
);
productivityRouter.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const result = await prisma.transactionTemplate.deleteMany({
      where: { id: uuid.parse(req.params.id), userId: req.user!.id }
    });
    if (!result.count) throw notFound('Mẫu giao dịch');
    return success(res, null, 'Đã xóa mẫu giao dịch.');
  })
);

const ruleInput = z.object({
  name: z.string().min(1).max(120),
  field: z.enum(['note', 'payee', 'reference', 'amount']),
  operator: z.enum(['contains', 'equals', 'startsWith', 'gte', 'lte']),
  value: z.string().min(1).max(255),
  categoryId: uuid.nullable().optional(),
  tagName: z.string().max(50).nullable().optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true)
});
productivityRouter.get(
  '/automation-rules',
  asyncHandler(async (req, res) =>
    success(
      res,
      await prisma.automationRule.findMany({
        where: { userId: req.user!.id },
        include: { category: true },
        orderBy: { priority: 'desc' }
      })
    )
  )
);
productivityRouter.post(
  '/automation-rules',
  asyncHandler(async (req, res) =>
    success(
      res,
      await prisma.automationRule.create({ data: { userId: req.user!.id, ...ruleInput.parse(req.body) } }),
      'Đã tạo quy tắc tự động.',
      201
    )
  )
);
productivityRouter.patch(
  '/automation-rules/:id',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    if (!(await prisma.automationRule.findFirst({ where: { id, userId: req.user!.id } }))) throw notFound('Quy tắc');
    return success(
      res,
      await prisma.automationRule.update({ where: { id }, data: ruleInput.partial().parse(req.body) }),
      'Đã cập nhật quy tắc.'
    );
  })
);
productivityRouter.delete(
  '/automation-rules/:id',
  asyncHandler(async (req, res) => {
    const result = await prisma.automationRule.deleteMany({
      where: { id: uuid.parse(req.params.id), userId: req.user!.id }
    });
    if (!result.count) throw notFound('Quy tắc');
    return success(res, null, 'Đã xóa quy tắc.');
  })
);

productivityRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unread === 'true';
    return success(
      res,
      await prisma.notification.findMany({
        where: { userId: req.user!.id, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    );
  })
);
productivityRouter.post(
  '/notifications/generate',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
    const [bills, budgets] = await Promise.all([
      prisma.bill.findMany({ where: { userId, status: { in: ['UPCOMING', 'OVERDUE'] }, dueAt: { lte: inSevenDays } } }),
      prisma.budget.findMany({ where: { userId, deletedAt: null, startDate: { lte: now }, endDate: { gte: now } } })
    ]);
    let created = 0;
    for (const bill of bills) {
      const title = bill.status === 'OVERDUE' ? 'Hóa đơn quá hạn' : 'Hóa đơn sắp đến hạn';
      const exists = await prisma.notification.findFirst({
        where: { userId, type: `BILL_${bill.id}`, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } }
      });
      if (!exists) {
        await prisma.notification.create({
          data: {
            userId,
            type: `BILL_${bill.id}`,
            title,
            message: `${bill.name}: ${Number(bill.amount).toLocaleString('vi-VN')}`,
            actionUrl: '/#bills'
          }
        });
        created += 1;
      }
    }
    for (const budget of budgets) {
      const spent = await prisma.transaction.aggregate({
        where: {
          userId,
          deletedAt: null,
          type: 'EXPENSE',
          occurredAt: { gte: budget.startDate, lte: budget.endDate },
          ...(budget.categoryId ? { categoryId: budget.categoryId } : {})
        },
        _sum: { amount: true }
      });
      const percent = (Number(spent._sum.amount ?? 0) / Number(budget.amount)) * 100;
      if (percent >= 80) {
        const exists = await prisma.notification.findFirst({
          where: { userId, type: `BUDGET_${budget.id}_${Math.floor(percent / 10)}` }
        });
        if (!exists) {
          await prisma.notification.create({
            data: {
              userId,
              type: `BUDGET_${budget.id}_${Math.floor(percent / 10)}`,
              title: percent >= 100 ? 'Ngân sách đã vượt mức' : 'Ngân sách sắp chạm giới hạn',
              message: `${budget.name} đã dùng ${Math.round(percent)}%.`,
              actionUrl: '/#budgets'
            }
          });
          created += 1;
        }
      }
    }
    return success(res, { created }, 'Đã cập nhật thông báo.');
  })
);
productivityRouter.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() }
    });
    return success(res, null, 'Đã đọc tất cả thông báo.');
  })
);
productivityRouter.patch(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    if (!(await prisma.notification.findFirst({ where: { id, userId: req.user!.id } }))) throw notFound('Thông báo');
    return success(res, await prisma.notification.update({ where: { id }, data: { readAt: new Date() } }));
  })
);

productivityRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) =>
    success(
      res,
      await prisma.auditLog.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 200 })
    )
  )
);

productivityRouter.get(
  '/exchange-rates',
  asyncHandler(async (req, res) =>
    success(
      res,
      await prisma.exchangeRate.findMany({ where: { userId: req.user!.id }, orderBy: { effectiveAt: 'desc' } })
    )
  )
);
productivityRouter.post(
  '/exchange-rates',
  asyncHandler(async (req, res) => {
    const input = exchangeRateInput.parse(req.body);
    return success(
      res,
      await prisma.exchangeRate.create({ data: { userId: req.user!.id, ...input } }),
      'Đã lưu tỷ giá.',
      201
    );
  })
);

productivityRouter.get(
  '/households',
  asyncHandler(async (req, res) =>
    success(
      res,
      await prisma.household.findMany({
        where: { members: { some: { userId: req.user!.id } } },
        include: {
          members: { include: { user: { select: { id: true, username: true, fullName: true } } } },
          wallets: true
        }
      })
    )
  )
);
productivityRouter.post(
  '/households',
  asyncHandler(async (req, res) => {
    const name = householdInput.parse(req.body).name;
    const household = await prisma.household.create({
      data: {
        name,
        ownerId: req.user!.id,
        inviteCode: randomBytes(8).toString('hex'),
        members: { create: { userId: req.user!.id, role: 'OWNER' } }
      },
      include: { members: true }
    });
    return success(res, household, 'Đã tạo nhóm gia đình.', 201);
  })
);
productivityRouter.post(
  '/households/join',
  asyncHandler(async (req, res) => {
    const inviteCode = joinInput.parse(req.body).inviteCode;
    const household = await prisma.household.findUnique({ where: { inviteCode } });
    if (!household) throw notFound('Mã mời');
    await prisma.householdMember.upsert({
      where: { householdId_userId: { householdId: household.id, userId: req.user!.id } },
      create: { householdId: household.id, userId: req.user!.id },
      update: {}
    });
    return success(res, household, 'Đã tham gia nhóm gia đình.');
  })
);

productivityRouter.get(
  '/data-export',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [user, wallets, categories, transactions, budgets, goals, tags, rules, bills] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          ...{
            id: true,
            username: true,
            email: true,
            phone: true,
            fullName: true,
            timezone: true,
            currency: true,
            locale: true,
            createdAt: true
          }
        }
      }),
      prisma.wallet.findMany({ where: { userId } }),
      prisma.category.findMany({ where: { userId } }),
      prisma.transaction.findMany({
        where: { userId },
        include: {
          tags: true,
          receipts: {
            select: {
              id: true,
              transactionId: true,
              originalName: true,
              storedName: true,
              mimeType: true,
              size: true,
              createdAt: true
            }
          }
        }
      }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.goal.findMany({ where: { userId }, include: { contributions: true } }),
      prisma.tag.findMany({ where: { userId } }),
      prisma.recurringRule.findMany({ where: { userId } }),
      prisma.bill.findMany({ where: { userId } })
    ]);
    await audit(req, 'DATA_EXPORT', 'User', userId);
    res.setHeader('Content-Disposition', 'attachment; filename="so-moc-data.json"');
    return success(res, {
      exportedAt: new Date(),
      user,
      wallets,
      categories,
      transactions,
      budgets,
      goals,
      tags,
      recurringRules: rules,
      bills
    });
  })
);

productivityRouter.delete(
  '/account',
  asyncHandler(async (req, res) => {
    assertNotProtectedDemo(req.user!.username, 'xóa tài khoản');
    const { confirmation } = deleteAccountInput.parse(req.body);
    void confirmation;
    await audit(req, 'ACCOUNT_DELETE_REQUESTED', 'User', req.user!.id);
    await prisma.$transaction([
      prisma.refreshToken.updateMany({ where: { userId: req.user!.id }, data: { revokedAt: new Date() } }),
      prisma.user.update({
        where: { id: req.user!.id },
        data: { deletedAt: new Date(), email: null, phone: null, fullName: 'Tài khoản đã xóa' }
      })
    ]);
    return success(res, null, 'Tài khoản đã được vô hiệu hóa và đăng xuất.');
  })
);

documentRoutes(productivityRouter, {
  'GET /merchants': { summary: 'Danh sách đơn vị giao dịch (cửa hàng, người nhận)' },
  'POST /merchants': { summary: 'Tạo đơn vị giao dịch', body: merchantInput, status: 201 },
  'PATCH /merchants/:id': { summary: 'Sửa đơn vị giao dịch', body: merchantInput.partial() },
  'DELETE /merchants/:id': { summary: 'Xóa đơn vị giao dịch' },
  'GET /tags': { summary: 'Danh sách nhãn' },
  'POST /tags': { summary: 'Tạo nhãn', body: tagInput, status: 201 },
  'PATCH /tags/:id': { summary: 'Sửa nhãn', body: tagInput.partial() },
  'DELETE /tags/:id': { summary: 'Xóa nhãn' },
  'GET /recurring': { summary: 'Danh sách khoản thu chi định kỳ' },
  'POST /recurring': {
    summary: 'Tạo khoản thu chi định kỳ',
    description: 'autoPost=true: tự ghi giao dịch khi đến hạn; false: chỉ nhắc.',
    body: recurringInput,
    status: 201
  },
  'PATCH /recurring/:id': { summary: 'Sửa khoản định kỳ', body: recurringInput.partial() },
  'DELETE /recurring/:id': { summary: 'Xóa khoản định kỳ' },
  'POST /recurring/run-due': { summary: 'Ghi các khoản định kỳ tự động đã đến hạn' },
  'GET /bills': { summary: 'Danh sách hóa đơn nhắc việc (tự chuyển trạng thái quá hạn)' },
  'POST /bills': { summary: 'Tạo hóa đơn nhắc việc', body: billInput, status: 201 },
  'PATCH /bills/:id': { summary: 'Sửa hóa đơn hoặc đổi trạng thái', body: billPatchInput },
  'POST /bills/:id/pay': {
    summary: 'Thanh toán hóa đơn: ghi khoản chi và dời hạn kỳ sau',
    body: billPayInput,
    errors: { 422: 'WALLET_REQUIRED – cần chọn ví thanh toán.' }
  },
  'DELETE /bills/:id': { summary: 'Xóa hóa đơn nhắc việc' },
  'GET /templates': { summary: 'Danh sách mẫu giao dịch' },
  'POST /templates': { summary: 'Tạo mẫu giao dịch', body: templateInput, status: 201 },
  'POST /templates/:id/use': { summary: 'Ghi giao dịch từ mẫu', body: templateUseInput, status: 201 },
  'DELETE /templates/:id': { summary: 'Xóa mẫu giao dịch' },
  'GET /automation-rules': { summary: 'Danh sách quy tắc tự phân loại giao dịch' },
  'POST /automation-rules': { summary: 'Tạo quy tắc tự phân loại', body: ruleInput, status: 201 },
  'PATCH /automation-rules/:id': { summary: 'Sửa quy tắc tự phân loại', body: ruleInput.partial() },
  'DELETE /automation-rules/:id': { summary: 'Xóa quy tắc tự phân loại' },
  'GET /notifications': { summary: 'Danh sách thông báo', query: notificationQuery },
  'POST /notifications/generate': { summary: 'Sinh cảnh báo hóa đơn sắp đến hạn và ngân sách sắp vượt' },
  'POST /notifications/read-all': { summary: 'Đánh dấu đã đọc mọi thông báo' },
  'PATCH /notifications/:id/read': { summary: 'Đánh dấu đã đọc một thông báo' },
  'GET /audit-logs': { summary: 'Nhật ký hoạt động của tài khoản (200 bản ghi gần nhất)' },
  'GET /exchange-rates': { summary: 'Danh sách tỷ giá đã lưu' },
  'POST /exchange-rates': { summary: 'Lưu tỷ giá', body: exchangeRateInput, status: 201 },
  'GET /households': { tag: 'Collaboration', summary: 'Danh sách nhóm gia đình của tôi' },
  'POST /households': { tag: 'Collaboration', summary: 'Tạo nhóm gia đình', body: householdInput, status: 201 },
  'POST /households/join': { tag: 'Collaboration', summary: 'Tham gia nhóm gia đình bằng mã mời', body: joinInput },
  'GET /data-export': { tag: 'Profile', summary: 'Xuất toàn bộ dữ liệu cá nhân (JSON)' },
  'DELETE /account': {
    tag: 'Profile',
    summary: 'Xóa tài khoản: vô hiệu hóa, ẩn danh và đăng xuất mọi thiết bị',
    body: deleteAccountInput
  }
});
