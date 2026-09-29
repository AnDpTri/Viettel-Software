import type { PrismaClient } from '@prisma/client';
import { config } from './core/config/env';
import { prisma } from './core/database/prisma';
import { mailer } from './core/mail/mail.service';
import { AgentActionRepository } from './modules/agent/agent-action.repository';
import { AgentActionService } from './modules/agent/agent-action.service';
import { AgentChatService } from './modules/agent/agent-chat.service';
import { AgentMemoryService } from './modules/agent/agent-memory.service';
import { AgentController } from './modules/agent/agent.controller';
import { AiAccessService } from './modules/agent/ai-access.service';
import { AiProvider } from './modules/agent/ai-provider';
import { AssistantRepository } from './modules/agent/assistant.repository';
import { ConversationService } from './modules/agent/conversation.service';
import { InsightController } from './modules/insights/insight.controller';
import { InsightRepository } from './modules/insights/insight.repository';
import { InsightService } from './modules/insights/insight.service';
import { AccountController } from './modules/account/account.controller';
import { AccountRepository } from './modules/account/account.repository';
import { AccountService } from './modules/account/account.service';
import { CatalogController } from './modules/catalog/catalog.controller';
import { CatalogRepository } from './modules/catalog/catalog.repository';
import { CatalogService } from './modules/catalog/catalog.service';
import { HouseholdController } from './modules/households/household.controller';
import { HouseholdRepository } from './modules/households/household.repository';
import { HouseholdService } from './modules/households/household.service';
import { NotificationController } from './modules/notifications/notification.controller';
import { NotificationRepository } from './modules/notifications/notification.repository';
import { NotificationService } from './modules/notifications/notification.service';
import { SchedulingController } from './modules/scheduling/scheduling.controller';
import { SchedulingRepository } from './modules/scheduling/scheduling.repository';
import { SchedulingService } from './modules/scheduling/scheduling.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { EmailVerificationService } from './modules/auth/email-verification.service';
import { OAuthService } from './modules/auth/oauth.service';
import { PasswordService } from './modules/auth/password.service';
import { SessionService } from './modules/auth/session.service';
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
  const authRepository = new AuthRepository(db);
  const sessions = new SessionService(authRepository);
  const verification = new EmailVerificationService(authRepository, mailer);
  const authServices = {
    auth: new AuthService(authRepository, sessions, verification),
    sessions,
    passwords: new PasswordService(authRepository, mailer, config.RESET_TOKEN_EXPIRES_MINUTES),
    verification,
    oauth: new OAuthService(authRepository, sessions, config)
  };
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
  const catalog = new CatalogService(new CatalogRepository(db));
  const scheduling = new SchedulingService(new SchedulingRepository(db));
  const notifications = new NotificationService(new NotificationRepository(db));
  const households = new HouseholdService(new HouseholdRepository(db));
  const accounts = new AccountService(new AccountRepository(db));
  const insights = new InsightService(new InsightRepository(db));

  const assistant = new AssistantRepository(db);
  const ai = new AiProvider(config);
  const aiAccess = new AiAccessService(assistant, config);
  const agentActions = new AgentActionService(db, new AgentActionRepository(db), onboarding);
  const agentMemory = new AgentMemoryService(db);
  const agentServices = {
    access: aiAccess,
    conversations: new ConversationService(assistant),
    chat: new AgentChatService(assistant, aiAccess, agentActions, agentMemory, onboarding, ai, config),
    actions: agentActions,
    ai
  };

  return {
    repositories: { users },
    services: {
      ...authServices,
      onboarding,
      profiles,
      wallets,
      categories,
      budgets,
      goals,
      reports,
      transactions,
      receipts,
      catalog,
      scheduling,
      notifications,
      households,
      accounts,
      insights,
      agent: { ...agentServices, memory: agentMemory }
    },
    controllers: {
      auth: new AuthController(authServices, config),
      profiles: new ProfileController(profiles, onboarding),
      wallets: new WalletController(wallets),
      categories: new CategoryController(categories),
      budgets: new BudgetController(budgets),
      goals: new GoalController(goals),
      reports: new ReportController(reports),
      transactions: new TransactionController(transactions, receipts),
      productivity: {
        catalog: new CatalogController(catalog),
        scheduling: new SchedulingController(scheduling),
        notifications: new NotificationController(notifications),
        households: new HouseholdController(households),
        account: new AccountController(accounts)
      },
      insights: new InsightController(insights),
      agent: new AgentController(agentServices, config)
    }
  };
}

export type Container = ReturnType<typeof createContainer>;
