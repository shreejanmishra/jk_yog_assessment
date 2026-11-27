import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@contract': path.resolve(__dirname, 'src/contract'),
      '@server': path.resolve(__dirname, 'src/server'),
      '@web': path.resolve(__dirname, 'src/web'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
  },
});
