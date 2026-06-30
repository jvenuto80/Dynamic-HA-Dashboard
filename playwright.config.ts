import { defineConfig, devices } from 'playwright/test';

/**
 * Playwright e2e config.
 *
 * Requires a production build in dist/ before running:
 *   npm run build && npm run test:e2e
 *
 * The webServer block spins up `vite preview` automatically so you don't
 * need to start it manually. On CI it always waits for a fresh server;
 * locally it reuses an existing one on port 4173 if present.
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Run test files in parallel but keep tests within a file sequential
  // so localStorage mutations don't race.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    // Reuse a running server locally to keep iteration fast.
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
