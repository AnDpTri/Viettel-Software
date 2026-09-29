import type { PrismaClient } from '@prisma/client';
import { prisma } from './core/database/prisma';
import { BudgetController } from './modules/budgets/budget.controller';
import { BudgetRepository } from './modules/budgets/budget.repository';
import { BudgetService } from './modules/budgets/budget.service';
import { CategoryController } from './modules/categories/category.controller';
import { CategoryRepository } from './modules/categories/category.repository';
import { CategoryService } from './modules/categories/category.service';
import { GoalController } from './modules/goals/goal.controller';
import { GoalRepository } from './modules/goals/goal.repository';
import { GoalService } from './modules/goals/goal.service';
import { OnboardingRepository } from './modules/onboarding/onboarding.repository';
import { OnboardingService } from './modules/onboarding/onboarding.service';
import { ProfileController } from './modules/profile/profile.controller';
import { ProfileService } from './modules/profile/profile.service';
import { UserRepository } from './modules/profile/user.repository';
import { ReceiptRepository } from './modules/transactions/receipt.repository';
import { ReceiptService } from './modules/transactions/receipt.service';
import { TransactionController } from './modules/transactions/transaction.controller';
import { TransactionRepository } from './modules/transactions/transaction.repository';
import { TransactionService } from './modules/transactions/transaction.service';
import { ReportController } from './modules/reports/report.controller';
import { ReportRepository } from './modules/reports/report.repository';
import { ReportService } from './modules/reports/report.service';
import { WalletController } from './modules/wallets/wallet.controller';
import { WalletRepository } from './modules/wallets/wallet.repository';
import { WalletService } from './modules/wallets/wallet.service';

/** Composition root: nơi duy nhất khởi tạo repository, service, controller và nối phụ thuộc qua constructor.
 * Test có thể truyền PrismaClient khác (ví dụ trỏ tới schema test). */
export function createContainer(db: PrismaClient = prisma) {
  const users = new UserRepository(db);
  const onboarding = new OnboardingService(new OnboardingRepository(db));
  const profiles = new ProfileService(users);

  const wallets = new WalletService(new WalletRepository(db));
  const categories = new CategoryService(new CategoryRepository(db));
  const budgets = new BudgetService(new BudgetRepository(db), users);
  const goals = new GoalService(new GoalRepository(db));
  const reports = new ReportService(new ReportRepository(db), users);
  const transactionRepository = new TransactionRepository(db);
  const transactions = new TransactionService(transactionRepository);
  const receipts = new ReceiptService(new ReceiptRepository(db), transactionRepository);

  return {
    repositories: { users },
    services: { onboarding, profiles, wallets, categories, budgets, goals, reports, transactions, receipts },
    controllers: {
      profiles: new ProfileController(profiles, onboarding),
      wallets: new WalletController(wallets),
      categories: new CategoryController(categories),
      budgets: new BudgetController(budgets),
      goals: new GoalController(goals),
      reports: new ReportController(reports),
      transactions: new TransactionController(transactions, receipts)
    }
  };
}

export type Container = ReturnType<typeof createContainer>;
