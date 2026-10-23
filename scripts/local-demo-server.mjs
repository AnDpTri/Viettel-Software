import express from 'express';
import path from 'node:path';

const app = express();
const HOST = '127.0.0.1';
const PORT = Number(process.env.DEMO_PORT || 3000);
const WEB_DIST = path.resolve('web', 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

const mockUser = {
  id: 'demo-u1',
  username: 'demo',
  fullName: 'Người dùng Demo',
  email: 'demo@example.com',
  theme: 'LIGHT',
  isVip: true
};

const mockWallets = [
  { id: 'w1', name: 'Tiền mặt', type: 'CASH', balance: 1503000, currency: 'VND', isDefault: false },
  { id: 'w2', name: 'Vietcombank', type: 'BANK', balance: 35660000, currency: 'VND', isDefault: true },
  { id: 'w3', name: 'MoMo', type: 'E_WALLET', balance: 1470000, currency: 'VND', isDefault: false }
];

const mockCategories = [
  { id: 'c1', name: 'Ăn uống', color: '#ec4899', type: 'EXPENSE' },
  { id: 'c2', name: 'Di chuyển', color: '#f59e0b', type: 'EXPENSE' },
  { id: 'c3', name: 'Nhà ở', color: '#6366f1', type: 'EXPENSE' },
  { id: 'c4', name: 'Lương', color: '#22c55e', type: 'INCOME' },
  { id: 'c5', name: 'Giải trí', color: '#8b5cf6', type: 'EXPENSE' },
  { id: 'c6', name: 'Sức khỏe', color: '#06b6d4', type: 'EXPENSE' },
  { id: 'c7', name: 'Mua sắm', color: '#10b981', type: 'EXPENSE' }
];

let mockTransactions = [
  {
    id: 't1',
    note: 'Bún chả',
    amount: 210000,
    type: 'EXPENSE',
    occurredAt: '2026-10-20T12:00:00.000Z',
    walletId: 'w3',
    wallet: mockWallets[2],
    categoryId: 'c1',
    category: mockCategories[0]
  },
  {
    id: 't2',
    note: 'Nhận tiền dự án nhỏ',
    amount: 1500000,
    type: 'INCOME',
    occurredAt: '2026-10-19T12:00:00.000Z',
    walletId: 'w3',
    wallet: mockWallets[2],
    categoryId: 'c4',
    category: mockCategories[3]
  },
  {
    id: 't3',
    note: 'Đổ xăng',
    amount: 200000,
    type: 'EXPENSE',
    occurredAt: '2026-10-18T12:00:00.000Z',
    walletId: 'w1',
    wallet: mockWallets[0],
    categoryId: 'c2',
    category: mockCategories[1]
  },
  {
    id: 't4',
    note: 'Đi chợ tuần',
    amount: 1240000,
    type: 'EXPENSE',
    occurredAt: '2026-10-16T12:00:00.000Z',
    walletId: 'w2',
    wallet: mockWallets[1],
    categoryId: 'c1',
    category: mockCategories[0]
  },
  {
    id: 't5',
    note: 'Khám răng',
    amount: 450000,
    type: 'EXPENSE',
    occurredAt: '2026-10-14T12:00:00.000Z',
    walletId: 'w2',
    wallet: mockWallets[1],
    categoryId: 'c6',
    category: mockCategories[5]
  },
  {
    id: 't6',
    note: 'Cà phê và bánh',
    amount: 62000,
    type: 'EXPENSE',
    occurredAt: '2026-10-12T12:00:00.000Z',
    walletId: 'w1',
    wallet: mockWallets[0],
    categoryId: 'c1',
    category: mockCategories[0]
  },
  {
    id: 't7',
    note: 'Vé xem phim',
    amount: 260000,
    type: 'EXPENSE',
    occurredAt: '2026-10-10T12:00:00.000Z',
    walletId: 'w2',
    wallet: mockWallets[1],
    categoryId: 'c5',
    category: mockCategories[4]
  },
  {
    id: 't8',
    note: 'Giày chạy bộ',
    amount: 1290000,
    type: 'EXPENSE',
    occurredAt: '2026-10-08T12:00:00.000Z',
    walletId: 'w2',
    wallet: mockWallets[1],
    categoryId: 'c7',
    category: mockCategories[6]
  },
  {
    id: 't9',
    note: 'Ăn tối cùng bạn',
    amount: 340000,
    type: 'EXPENSE',
    occurredAt: '2026-10-06T12:00:00.000Z',
    walletId: 'w3',
    wallet: mockWallets[2],
    categoryId: 'c1',
    category: mockCategories[0]
  },
  {
    id: 't10',
    note: 'Grab đi làm',
    amount: 120000,
    type: 'EXPENSE',
    occurredAt: '2026-10-04T12:00:00.000Z',
    walletId: 'w3',
    wallet: mockWallets[2],
    categoryId: 'c2',
    category: mockCategories[1]
  },
  {
    id: 't11',
    note: 'Phở bò',
    amount: 85000,
    type: 'EXPENSE',
    occurredAt: '2026-10-03T12:00:00.000Z',
    walletId: 'w1',
    wallet: mockWallets[0],
    categoryId: 'c1',
    category: mockCategories[0]
  },
  {
    id: 't12',
    note: 'Tiền nhà',
    amount: 5500000,
    type: 'EXPENSE',
    occurredAt: '2026-10-02T12:00:00.000Z',
    walletId: 'w2',
    wallet: mockWallets[1],
    categoryId: 'c3',
    category: mockCategories[2]
  },
  {
    id: 't13',
    note: 'Lương tháng 10',
    amount: 18000000,
    type: 'INCOME',
    occurredAt: '2026-10-01T12:00:00.000Z',
    walletId: 'w2',
    wallet: mockWallets[1],
    categoryId: 'c4',
    category: mockCategories[3]
  }
];

const mockBudgets = [
  {
    id: 'b1',
    name: 'Ăn uống tháng 10',
    amount: 3000000,
    spent: 1937000,
    percentage: 65,
    categoryId: 'c1',
    category: mockCategories[0],
    startDate: '2026-10-01',
    endDate: '2026-10-31'
  },
  {
    id: 'b2',
    name: 'Mua sắm tháng 10',
    amount: 1000000,
    spent: 1290000,
    percentage: 129,
    categoryId: 'c7',
    category: mockCategories[6],
    startDate: '2026-10-01',
    endDate: '2026-10-31'
  },
  {
    id: 'b3',
    name: 'Giải trí tháng 10',
    amount: 800000,
    spent: 260000,
    percentage: 33,
    categoryId: 'c5',
    category: mockCategories[4],
    startDate: '2026-10-01',
    endDate: '2026-10-31'
  },
  {
    id: 'b4',
    name: 'Tổng chi tháng 10',
    amount: 12000000,
    spent: 9757000,
    percentage: 81,
    categoryId: null,
    category: null,
    startDate: '2026-10-01',
    endDate: '2026-10-31'
  }
];

const mockGoals = [
  { id: 'g1', name: 'Quỹ dự phòng khẩn cấp', targetAmount: 50000000, currentAmount: 38633000, targetDate: '2026-12-31' }
];

const mockOnboarding = {
  completed: true,
  dismissed: true,
  welcomeSeen: true,
  completedCount: 4,
  totalSteps: 4,
  progressPercent: 100,
  steps: []
};

// API endpoints
app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'UP' } }));

app.get('/api/v1/auth/oauth/providers', (_req, res) =>
  res.json({ success: true, data: { demoEnabled: true, google: false, github: false } })
);
app.get('/api/v1/auth/session-status', (_req, res) => res.json({ success: true, data: { authenticated: false } }));
app.post('/api/v1/auth/login', (_req, res) =>
  res.json({ success: true, data: { accessToken: 'demo-token', refreshToken: 'demo-refresh', user: mockUser } })
);
app.post('/api/v1/auth/logout', (_req, res) => res.json({ success: true, data: {} }));

app.get('/api/v1/profile', (_req, res) => res.json({ success: true, data: mockUser }));
app.patch('/api/v1/profile', (req, res) => {
  Object.assign(mockUser, req.body);
  res.json({ success: true, data: mockUser });
});
app.get('/api/v1/profile/onboarding', (_req, res) => res.json({ success: true, data: mockOnboarding }));
app.patch('/api/v1/profile/onboarding', (_req, res) => res.json({ success: true, data: mockOnboarding }));
app.get('/api/v1/profile/sessions', (_req, res) => res.json({ success: true, data: [] }));

app.get('/api/v1/wallets', (_req, res) => res.json({ success: true, data: mockWallets }));
app.post('/api/v1/wallets', (req, res) => {
  const item = { id: `w${Date.now()}`, ...req.body, balance: Number(req.body.balance) || 0 };
  mockWallets.push(item);
  res.json({ success: true, data: item });
});

app.get('/api/v1/categories', (_req, res) => res.json({ success: true, data: mockCategories }));
app.post('/api/v1/categories', (req, res) => {
  const item = { id: `c${Date.now()}`, ...req.body };
  mockCategories.push(item);
  res.json({ success: true, data: item });
});

app.get('/api/v1/transactions', (_req, res) => {
  res.json({
    success: true,
    data: mockTransactions,
    meta: { page: 1, limit: 20, total: mockTransactions.length, totalPages: 1 }
  });
});

app.post('/api/v1/transactions', (req, res) => {
  const wallet = mockWallets.find((w) => w.id === req.body.walletId) || mockWallets[0];
  const category = mockCategories.find((c) => c.id === req.body.categoryId) || null;
  const item = {
    id: `t${Date.now()}`,
    ...req.body,
    occurredAt: req.body.occurredAt || new Date().toISOString(),
    amount: Number(req.body.amount) || 0,
    wallet,
    category
  };
  mockTransactions.unshift(item);
  res.json({ success: true, data: item });
});

app.delete('/api/v1/transactions/:id', (req, res) => {
  mockTransactions = mockTransactions.filter((t) => t.id !== req.params.id);
  res.json({ success: true, data: {} });
});

app.get('/api/v1/budgets', (_req, res) => res.json({ success: true, data: mockBudgets }));
app.get('/api/v1/goals', (_req, res) => res.json({ success: true, data: mockGoals }));
app.get('/api/v1/goals/:id', (req, res) => res.json({ success: true, data: mockGoals[0] }));
app.get('/api/v1/goals/:id/contributions', (_req, res) => res.json({ success: true, data: [] }));

app.get('/api/v1/productivity/bills', (_req, res) =>
  res.json({
    success: true,
    data: [
      {
        id: 'bill1',
        name: 'Tiền điện',
        amount: 800000,
        walletId: 'w2',
        dueAt: '2026-10-24T12:00:00.000Z',
        isPaid: false
      }
    ]
  })
);

app.get('/api/v1/productivity/recurring', (_req, res) =>
  res.json({
    success: true,
    data: [
      {
        id: 'rec1',
        name: 'Internet',
        amount: 250000,
        walletId: 'w2',
        type: 'EXPENSE',
        frequency: 'MONTHLY',
        nextRunAt: '2026-10-28T12:00:00.000Z',
        autoPost: false
      }
    ]
  })
);

app.get('/api/v1/productivity/notifications', (_req, res) => res.json({ success: true, data: [] }));
app.post('/api/v1/productivity/notifications/generate', (_req, res) => res.json({ success: true, data: [] }));

app.get('/api/v1/tags', (_req, res) => res.json({ success: true, data: [] }));
app.get('/api/v1/household', (_req, res) => res.json({ success: true, data: { members: [] } }));

app.get(['/api/v1/reports/summary', '/api/v1/summary*'], (_req, res) => {
  res.json({
    success: true,
    data: {
      income: 19500000,
      expense: 9757000,
      net: 9743000,
      savingsRate: 50,
      byCategory: [
        { categoryId: 'c3', categoryName: 'Nhà ở', amount: 5500000, percentage: 56.4, color: '#6366f1' },
        { categoryId: 'c1', categoryName: 'Ăn uống', amount: 1937000, percentage: 19.8, color: '#ec4899' },
        { categoryId: 'c7', categoryName: 'Mua sắm', amount: 1290000, percentage: 13.2, color: '#10b981' },
        { categoryId: 'c6', categoryName: 'Sức khỏe', amount: 450000, percentage: 4.6, color: '#06b6d4' },
        { categoryId: 'c2', categoryName: 'Di chuyển', amount: 320000, percentage: 3.3, color: '#f59e0b' },
        { categoryId: 'c5', categoryName: 'Giải trí', amount: 260000, percentage: 2.7, color: '#8b5cf6' }
      ]
    }
  });
});

app.get('/api/v1/reports/reconciliation', (_req, res) => res.json({ success: true, data: { wallets: [] } }));

// Serve built frontend assets directly
app.use(express.static(WEB_DIST));
app.get('*', (_req, res) => res.sendFile(path.resolve(WEB_DIST, 'index.html')));

app.listen(PORT, HOST, () => {
  console.log(`Demo local chỉ chạy trên máy này: http://localhost:${PORT}`);
});
