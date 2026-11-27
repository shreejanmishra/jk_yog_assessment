import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'api/**', 'node_modules/**', '.vercel/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react*', 'express*', 'drizzle-orm*', 'pg*', 'axios*', '@server/*', '@web/*'],
              message: 'src/domain must remain pure TypeScript with zero framework or I/O imports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@server/*', 'express*', 'pg*', 'drizzle-orm*', 'pdfkit*'],
              message: 'Frontend code must never import server modules.',
            },
          ],
        },
      ],
    },
  },
);
