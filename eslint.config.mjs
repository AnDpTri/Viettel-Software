// Cấu hình ESLint dùng chung cho backend, test và script. Frontend có cấu hình riêng trong web/.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'test-results/**', 'public/**', 'web/dist/**', 'uploads/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,mts,js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error'
    }
  },
  {
    // Code trong page.evaluate chạy trên trình duyệt, dùng biến toàn cục của giao diện.
    files: ['scripts/ui-e2e.mjs'],
    languageOptions: {
      globals: { ...globals.browser, renderMarkdown: 'readonly', streamAgentText: 'readonly', state: 'readonly' }
    }
  },
  prettier
);
