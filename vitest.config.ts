import { defineConfig } from 'vitest/config';

// Isolated config for unit/regression tests. Deliberately does NOT load the
// app's Vite config or environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'vite-layout-plugin.test.ts'],
  },
});
