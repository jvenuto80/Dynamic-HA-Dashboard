import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from 'playwright/test';

// Tests PUT /layout; keep that (and settings/connection) away from the repo's real files.
const E2E_PORT = 4179;
const e2eFile = (name: string) => join(tmpdir(), `glance-e2e-${name}.json`);

/**
 * Playwright e2e config.
 *
 * Requires a production build in dist/ before running:
 *   npm run build && npm run test:e2e
 *
 * The webServer block spins up `vite preview` automatically so you don't
 * need to start it manually, on a dedicated port with its layout, settings
 * and connection files in the OS temp dir (tests overwrite the layout).
 * Locally it reuses an existing server on that port if present.
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
    baseURL: `http://localhost:${E2E_PORT}`,
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
    command: `npm run preview -- --port ${E2E_PORT} --strictPort`,
    url: `http://localhost:${E2E_PORT}`,
    env: {
      LAYOUT_FILE: e2eFile('layouts'),
      SETTINGS_FILE: e2eFile('settings'),
      CONNECTION_FILE: e2eFile('connection'),
    },
    // Reuse a running server locally to keep iteration fast.
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
