import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts', 'src/middleware/**/*.ts'],
      exclude: ['src/lib/prisma.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
    }
  }
});
