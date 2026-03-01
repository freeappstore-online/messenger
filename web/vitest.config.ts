import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/unit/vitest-setup.ts'],
    include: ['./tests/unit/**/*.test.ts'],
    deps: {
      inline: ['simple-peer']
    }
  }
});
