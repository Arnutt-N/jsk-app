import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for the JSK admin smoke suite.
 *
 * The suite is intentionally narrow -- it boots a Next.js dev server and
 * exercises the most critical screens (login -> /admin/requests with the
 * new workflow filter -> /admin/settings/permissions matrix). It is NOT
 * a comprehensive end-to-end coverage; it catches build regressions,
 * route wiring breaks, and obvious rendering failures in CI.
 *
 * To extend:
 *   - Add specs under `e2e/` -- they are auto-discovered.
 *   - Each spec receives a fresh browser context (no auth state shared).
 *   - Use the helpers in `e2e/utils/` (login etc.).
 *
 * Required env vars (CI passes these via the e2e workflow):
 *   BASE_URL                  -- frontend URL, defaults to http://localhost:3000
 *   E2E_ADMIN_USERNAME        -- defaults to "admin"
 *   E2E_ADMIN_PASSWORD        -- the password seeded into the test DB
 */
export default defineConfig({
  testDir: './e2e',
  // Catch hangs early -- the slowest screens render in <5s on cold start.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // CI gets retries because of cold-start flakiness on the dev server;
  // local runs fail loudly so developers fix bugs instead of papering
  // over them.
  retries: process.env.CI ? 1 : 0,

  // Sequential locally for easier debugging; parallel in CI for speed.
  workers: process.env.CI ? 2 : 1,
  fullyParallel: false,

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No webServer block: CI starts the frontend itself so it can also
  // start the backend in parallel. For local runs developers should
  // already have `npm run dev` running.
})
