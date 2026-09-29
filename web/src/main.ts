import { renderMarkdown } from './core/markdown';
import { setupModals } from './core/modal';
import { state } from './core/state';
import { setupAgent } from './features/agent/agent';
import { streamAgentText } from './features/agent/agent-view';
import { setupBudgets } from './features/budgets';
import { setupCategories } from './features/categories';
import { setupDashboard } from './features/dashboard';
import { setupGoals } from './features/goals';
import { setupInsights } from './features/insights';
import { setSidebar, setupNavigation } from './features/navigation';
import { setupNotifications } from './features/notifications';
import { setupOnboarding } from './features/onboarding';
import { setupPlanning, setupPlanningTabs } from './features/planning';
import { setupProfile } from './features/profile';
import { setupReports } from './features/reports';
import { initializeApp, setupAuthForms, setupLogin } from './features/session';
import { setupTours } from './features/tour';
import { setupTransactions } from './features/transactions';
import { setupWallets } from './features/wallets';
import { setupWelcome } from './features/welcome';

// Thứ tự gắn listener giữ đúng như bản trước: vài phần tử (document, #goal-list, #transaction-form) có nhiều
// listener và chúng chạy theo thứ tự đăng ký.
setupLogin();
setupNavigation();
setupTransactions();
setupModals(() => setSidebar(false));
setupWallets();
setupCategories();
setupBudgets();
setupGoals();
setupPlanning();
setupInsights();
setupNotifications();
setupProfile();
setupAuthForms();
setupAgent();
setupOnboarding();
setupPlanningTabs();
setupReports();
setupDashboard();
setupWelcome();
setupTours();

void initializeApp();

// Kiểm thử giao diện (scripts/ui-e2e.mjs) gọi các hàm này trong trang để kiểm tra hiển thị Markdown và phiên hết hạn.
Object.assign(window, { state, renderMarkdown, streamAgentText });
