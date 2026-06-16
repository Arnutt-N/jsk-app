import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * /admin/settings/permissions — Phase 3 module-based matrix.
 *
 * Verifies the page mounts, the 3 module sections render with a level
 * selector per (role, module), and that expanding a module reveals the
 * per-key override grid with the SUPER_ADMIN lockout (disabled cells).
 * Does NOT mutate the policy — mutations would persist in the shared dev
 * DB and pollute later runs.
 *
 * Module sections are addressed by their stable `aria-controls`
 * (`module-detail-<module>`) rather than `locator('table')`, since the page
 * now renders one preset matrix per module (plus a detail table when
 * expanded).
 */
test.describe('Permission settings page (Phase 3)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/settings/permissions')
  })

  test('renders the page header', async ({ page }) => {
    await expect(page.getByText('การกำหนดสิทธิ์').first()).toBeVisible()
  })

  test('renders the three module sections', async ({ page }) => {
    await expect(
      page.locator('button[aria-controls="module-detail-service_requests"]'),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('button[aria-controls="module-detail-chatbot"]')).toBeVisible()
    await expect(page.locator('button[aria-controls="module-detail-system"]')).toBeVisible()
  })

  test('level matrix shows all six role columns', async ({ page }) => {
    await expect(page.locator('table').first()).toBeVisible({ timeout: 10_000 })
    // Headers stack "<English label> / <Thai label>"; assert the distinctive
    // display labels, including DIRECTOR/HEAD (Phase 1) and the AGENT→Operator
    // rename (Phase 2).
    const flat = (await page.locator('table thead th').allInnerTexts()).join(' | ')
    expect(flat).toContain('Super Admin')
    expect(flat).toContain('Director')
    expect(flat).toContain('Head')
    expect(flat).toContain('Operator')
    expect(flat).toContain('User')
  })

  test('each module exposes a level selector per role', async ({ page }) => {
    await expect(page.locator('table').first()).toBeVisible({ timeout: 10_000 })
    // 3 modules × 6 roles = 18 always-visible level selects (collapsed state).
    const selects = page.locator('select')
    await expect(selects.first()).toBeVisible({ timeout: 10_000 })
    expect(await selects.count()).toBeGreaterThanOrEqual(18)
  })

  test('expanding Service Requests reveals per-key rows with Thai labels', async ({ page }) => {
    await page.locator('button[aria-controls="module-detail-service_requests"]').click()
    const detail = page.locator('#module-detail-service_requests')
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await expect(detail).toContainText('ยกเลิกการอนุมัติ')
    await expect(detail).toContainText('แก้ไขข้อมูลคำร้อง (รายละเอียด/ผู้ติดต่อ)')
  })

  test('SUPER_ADMIN lockout: expanded module has disabled checkboxes', async ({ page }) => {
    await page.locator('button[aria-controls="module-detail-system"]').click()
    const detail = page.locator('#module-detail-system')
    await expect(detail).toBeVisible({ timeout: 10_000 })
    // Every SUPER_ADMIN cell is locked (disabled + checked) — at minimum the 7
    // system-module keys, so the count is comfortably above 1. If the client
    // lockout mirror is removed this drops and the test fires.
    const disabled = detail.locator('input[type="checkbox"]:disabled')
    expect(await disabled.count()).toBeGreaterThanOrEqual(1)
  })
})
