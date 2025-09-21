import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup-env.ts', './test/frontend-setup.ts'],
    environment: 'jsdom',
    globals: true,
    testTimeout: 30000,
    pool: 'threads',
    include: ['test/**/*.test.ts', 'tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['test/**/*.disabled.ts', '**/*.disabled.test.ts']
  },
});