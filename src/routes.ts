import { config, type AppConfig } from './core/config/env';
import type { Container } from './container';
import type { ApiMount } from './docs/openapi';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createBudgetRouter } from './modules/budgets/budget.routes';
import { createCategoryRouter } from './modules/categories/category.routes';
import { createGoalRouter } from './modules/goals/goal.routes';
import { createInsightRouter } from './modules/insights/insight.routes';
import { createProductivityRouter } from './modules/productivity/productivity.routes';
import { createProfileRouter } from './modules/profile/profile.routes';
import { createReportRouter } from './modules/reports/report.routes';
import { createTransactionRouter } from './modules/transactions/transaction.routes';
import { createWalletRouter } from './modules/wallets/wallet.routes';

/** Bảng gắn router vào /api/v1; app.ts và bộ sinh tài liệu OpenAPI cùng đọc bảng này. */
export function createApiMounts(container: Container, appConfig: AppConfig = config): ApiMount[] {
  const { controllers } = container;
  return [
    { prefix: '/auth', tag: 'Auth', router: createAuthRouter(controllers.auth) },
    { prefix: '/profile', tag: 'Profile', router: createProfileRouter(controllers.profiles) },
    { prefix: '/wallets', tag: 'Wallets', router: createWalletRouter(controllers.wallets) },
    { prefix: '/categories', tag: 'Categories', router: createCategoryRouter(controllers.categories) },
    { prefix: '/transactions', tag: 'Transactions', router: createTransactionRouter(controllers.transactions) },
    { prefix: '/budgets', tag: 'Budgets', router: createBudgetRouter(controllers.budgets) },
    { prefix: '/goals', tag: 'Goals', router: createGoalRouter(controllers.goals) },
    { prefix: '/reports', tag: 'Reports', router: createReportRouter(controllers.reports) },
    { prefix: '/productivity', tag: 'Productivity', router: createProductivityRouter(controllers.productivity) },
    {
      prefix: '/insights',
      tag: 'Insights',
      router: createInsightRouter(controllers.insights, controllers.agent, appConfig)
    }
  ];
}
