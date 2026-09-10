import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
    // node:sqlite is stable enough for this prototype; silence its "experimental" banner.
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
});
