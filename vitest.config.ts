import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/__tests__/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'apps/*/__tests__/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 15_000,
    setupFiles: ['./packages/engine/__tests__/setup.ts'],
  },
});
