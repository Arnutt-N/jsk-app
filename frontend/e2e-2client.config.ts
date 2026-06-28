import { defineConfig, devices } from '@playwright/test'

/**
 * Dedicated Playwright config for the 2-client (Phase 6 multi-operator)
 * live-chat acceptance test.
 *
 * Why this is separate from the main `playwright.config.ts` smoke suite:
 *   - This spec drives TWO browser contexts (operator A + operator B) that
 *     coordinate over a live WebSocket against a single shared, seeded
 *     WAITING conversation row. It is slow, stateful, and order-sensitive.
 *   - The smoke config uses a tight 30s timeout and may run workers in
 *     parallel — both of which are wrong here. So the smoke config now
 *     IGNORES this spec (see `testIgnore` in playwright.config.ts) and we run
 *     it only via this config: `npm run test:e2e:2client`.
 *   - Generous timeouts (cold 9p WSL dev server + two contexts), strictly
 *     serial single-worker execution (the two tests mutate one DB row, never
 *     parallel), and `trace: 'on'` because these cross-context WS runs are
 *     hard to reproduce after the fact.
 *
 * Preconditions (the stack is started EXTERNALLY — there is no `webServer`
 * block, matching the main config):
 *   1. Backend + frontend dev servers are already running.
 *   2. The acceptance seed is present: the WAITING conversation and the test
 *      operators must exist
 *      (`python backend/scripts/seed_live_chat_e2e.py` and
 *       `python backend/scripts/create_test_users.py`).
 *   3. To make the spec retry-safe, set `E2E_SEED_CMD` to the shell command
 *      that re-creates the WAITING session; the spec runs it before each test
 *      so a claimed/closed row from a prior test (or retry) is reset back to
 *      WAITING. Example:
 *        E2E_SEED_CMD="python backend/scripts/seed_live_chat_e2e.py"
 *
 * Required / honored env vars:
 *   BASE_URL              -- frontend URL, defaults to http://localhost:3000
 *   E2E_SEED_CMD          -- per-test reseed command (see above)
 *   E2E_ADMIN_USERNAME    -- operator A login (spec default: "admin")
 *   E2E_ADMIN_PASSWORD    -- operator A password (spec default)
 *   E2E_STAFF_USERNAME    -- operator B login (spec default: "staff")
 *   E2E_STAFF_PASSWORD    -- operator B password (spec default)
 */
export default defineConfig({
  testDir: './e2e',
  // Run ONLY the 2-client acceptance spec — nothing else under ./e2e.
  testMatch: '**/live-chat-2client.spec.ts',

  // Per-test budget covers the whole test lifecycle: a heavy beforeEach
  // (E2E_SEED_CMD reseed + TWO sequential cold-server logins + room selects)
  // PLUS the test body PLUS afterEach. On the 9p/WSL box that beforeEach alone
  // can run ~90s, so 120s left almost no headroom and a slightly busier machine
  // tipped beforeEach/afterEach over the limit. 240s gives reliable headroom.
  timeout: 240_000,
  // Cross-context WebSocket propagation (A acts -> B observes) is not instant.
  expect: { timeout: 20_000 },

  // A transient timing miss should auto-retry; the spec is made retry-safe via
  // E2E_SEED_CMD. CI gets one extra retry for noisier shared runners.
  retries: process.env.CI ? 2 : 1,

  // Strictly serial, single worker: both tests hit one shared seeded DB row,
  // so they must never run in parallel.
  fullyParallel: false,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-2client' }],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    navigationTimeout: 90_000,
    actionTimeout: 45_000,
    // Always capture — these cross-context WS runs are hard to reproduce.
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      // Mirror the main config: CI uses the runner's preinstalled Google
      // Chrome (channel) so it never downloads a browser bundle; local runs
      // use the bundled chromium.
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.CI ? { channel: 'chrome' as const } : {}),
      },
    },
  ],

  // No webServer block: the stack is started externally (same as the main
  // config) so the backend can be brought up alongside the frontend.
})
