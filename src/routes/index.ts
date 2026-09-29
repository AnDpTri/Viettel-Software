import type { ApiMount } from '../docs/openapi';
import { authRouter } from './auth.routes';
import { budgetRouter } from './budget.routes';
import { categoryRouter } from './category.routes';
import { goalRouter } from './goal.routes';
import { insightRouter } from './insight.routes';
import { productivityRouter } from './productivity.routes';
import { profileRouter } from './profile.routes';
import { reportRouter } from './report.routes';
import { transactionRouter } from './transaction.routes';
import { walletRouter } from './wallet.routes';

/** Bảng gắn router vào /api/v1; app.ts và bộ sinh tài liệu OpenAPI cùng đọc bảng này. */
export const apiMounts: ApiMount[] = [
  { prefix: '/auth', tag: 'Auth', router: authRouter },
  { prefix: '/profile', tag: 'Profile', router: profileRouter },
  { prefix: '/wallets', tag: 'Wallets', router: walletRouter },
  { prefix: '/categories', tag: 'Categories', router: categoryRouter },
  { prefix: '/transactions', tag: 'Transactions', router: transactionRouter },
  { prefix: '/budgets', tag: 'Budgets', router: budgetRouter },
  { prefix: '/goals', tag: 'Goals', router: goalRouter },
  { prefix: '/reports', tag: 'Reports', router: reportRouter },
  { prefix: '/productivity', tag: 'Productivity', router: productivityRouter },
  { prefix: '/insights', tag: 'Insights', router: insightRouter }
];
