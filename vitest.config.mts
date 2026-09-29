import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Test giao diện nằm trong web/ và có cấu hình riêng (web/vitest.config.mts, môi trường jsdom).
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Đo toàn bộ mã nguồn backend; chỉ bỏ điểm khởi động tiến trình (listen cổng, bắt tín hiệu tắt).
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/types/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
    }
  }
});
