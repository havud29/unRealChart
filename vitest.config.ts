import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Both extensions on both sides: an app test that needs no JSX was being
    // written as .ts and silently never run.
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/*/test/**/*.test.{ts,tsx}'],
    testTimeout: 20000,
    environment: 'node',
    reporters: ['default'],
  },
});
