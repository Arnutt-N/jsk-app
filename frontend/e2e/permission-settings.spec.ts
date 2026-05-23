import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * /admin/settings/permissions -- Stage 2 editable matrix.
 *
 * Verifies the page mounts, the matrix renders all 6 role columns, and
 * the 3 default rules are present. Does NOT mutate the policy -- those
 * mutations would persist in the shared dev DB and pollute later runs.
 */
test.describe('Permission settings page (Stage 2)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/settings/permissions')
  })

  test('renders the page header', async ({ page }) => {
    await expect(page.getByText('การกำหนดสิทธิ์').first()).toBeVisible()
  })

  test('matrix shows all six role columns', async ({ page }) => {
    // Wait for the table to mount -- the page fetches rules from
    // /admin/settings/permissions which can take a moment on cold start.
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    const headers = await page.locator('table thead th').allInnerTexts()
    // Headers contain "ROLE / Thai label" stacked, so use substring check.
    const flat = headers.join(' | ')
    expect(flat).toContain('SUPER_ADMIN')
    expect(flat).toContain('ADMIN')
    expect(flat).toContain('DIRECTOR') // new in Stage 1
    expect(flat).toContain('HEAD') // new in Stage 1
    expect(flat).toContain('AGENT')
    expect(flat).toContain('USER')
  })

  test('matrix renders at least four rule rows', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    // Wait for any tbody row to appear (rules load via fetch on mount).
    // The backend's lifespan ensure_seed_rows() hook guarantees the
    // 4 DEFAULT_POLICY keys exist on every startup (PRD C added revert_approval).
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    expect(await rows.count()).toBeGreaterThanOrEqual(4)
  })

  test('matrix shows revert_approval row with Thai label', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 })
    // Assert the Thai description for revert_approval is rendered.
    const rowTexts = await page.locator('table tbody tr').allInnerTexts()
    const flat = rowTexts.join(' | ')
    expect(flat).toContain('ยกเลิกการอนุมัติ')
  })

  test('at least one disabled checkbox exists (SUPER_ADMIN lockout)', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 })
    // The SUPER_ADMIN cell on the edit_permission_settings row is the
    // ONLY disabled checkbox in the matrix (server-side lockout safeguard
    // mirrored on the client). Asserting count >= 1 is enough -- if the
    // safeguard is removed, count drops to 0 and this test fires.
    const disabledChecks = page.locator('table input[type="checkbox"]:disabled')
    expect(await disabledChecks.count()).toBeGreaterThanOrEqual(1)
  })
})
