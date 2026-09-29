import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts: no PWA / git plugins needed for unit tests
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
  },
});
