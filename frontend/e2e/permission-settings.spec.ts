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

  test('matrix lists the three default rules', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    // Each rule row shows description text + the literal key in
    // monospace below it. We assert against the Thai descriptions
    // because they are the user-facing labels.
    await expect(page.getByText('มอบหมายงานให้ผู้อื่น').first()).toBeVisible()
    await expect(page.getByText('รับเรื่องเอง (self-assign)').first()).toBeVisible()
    await expect(page.getByText('แก้ไขการตั้งค่าสิทธิ์').first()).toBeVisible()
  })

  test('SUPER_ADMIN cell on edit_permission_settings is locked', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    // Find the row whose key field reads 'edit_permission_settings'.
    const editRow = page.locator('tr', { has: page.getByText('edit_permission_settings') })
    // The first checkbox in that row corresponds to SUPER_ADMIN (since
    // role columns are in privilege order). It must be disabled to
    // mirror the lockout safeguard enforced server-side.
    const superAdminCheckbox = editRow.locator('input[type="checkbox"]').first()
    await expect(superAdminCheckbox).toBeDisabled()
    await expect(superAdminCheckbox).toBeChecked()
  })
})
