// Font đóng gói cùng ứng dụng (không tải từ máy chủ ngoài); mỗi tệp chia theo bảng mã nên trình duyệt chỉ tải phần cần.
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/700-italic.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { session } from './api/client';
import { App } from './app/App';
import { AuthProvider } from './app/auth';
import { renderMarkdown, streamAgentText } from './lib/markdown';
import './styles/index.css';
import { applyTheme, storedTheme } from './ui/theme';
import { ToastProvider } from './ui/Toast';

// Áp dụng giao diện sáng/tối trước lần vẽ đầu tiên để không nháy màu.
applyTheme(storedTheme());

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>
);

// Kiểm thử giao diện (scripts/ui-e2e.mjs) gọi các hàm này trong trang: kiểm tra hiển thị Markdown, hiện chữ dần và tự
// làm mới phiên khi access token hết hạn.
Object.assign(window, { state: session, renderMarkdown, streamAgentText });
