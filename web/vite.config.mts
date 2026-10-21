import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webDir = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(webDir, '..');
let modulesDir = rootDir;
try {
  modulesDir = realpathSync(resolve(rootDir, 'node_modules'));
} catch {
  // Bỏ qua nếu node_modules chưa được tạo.
}

// Giao diện được build vào web/dist và Express phục vụ như tệp tĩnh. Khi chạy `npm run dev:web`, Vite chuyển các
// request /api và /health sang API ở cổng 3000.
export default defineConfig({
  root: webDir,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
  server: {
    port: 5173,
    fs: {
      allow: [webDir, rootDir, modulesDir]
    },
    proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' }
  }
});
