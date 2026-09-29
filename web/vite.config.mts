import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Giao diện được build vào web/dist và Express phục vụ như tệp tĩnh. Khi chạy `npm run dev:web`, Vite chuyển các
// request /api và /health sang API ở cổng 3000.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' }
  }
});
