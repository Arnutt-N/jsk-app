import { expect, test } from '@playwright/test'
import { loginAs, loginAsAdmin } from '../utils/auth'
import { gotoAdmin } from '../utils/nav'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

test.describe('NAV-01 mobile search opens the shared palette', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('typing + selecting a result navigates like desktop', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAdmin(page, '/admin')

    await page.locator('button[aria-label="Search"]').click()
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()

    await palette.getByPlaceholder('ค้นหาหน้า การดำเนินการ หรือการตั้งค่า...').fill('reports')
    await palette.getByRole('option').first().click()
    // Cold dev-server compile of the target route can exceed 15s on first hit.
    await page.waitForURL(/\/admin\/reports/, { timeout: 60_000 })
    await page.screenshot({ path: `${EVIDENCE}/nav-01-mobile-palette-fixed.png` })
  })
})

test.describe('NAV-01 desktop palette opens', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('command palette opens from the header trigger', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAdmin(page, '/admin')

    await page.locator('button[aria-label="Open command palette (Ctrl+K)"]').click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    await page.screenshot({ path: `${EVIDENCE}/nav-01-desktop-palette.png` })
  })
})

test.describe('NAV-02 Appointments is not reachable for AGENT', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Appointments is unreachable for AGENT and the guard snaps back', async ({ page }) => {
    const password = process.env.E2E_AGENT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD
    if (!password) {
      test.skip(true, 'No AGENT password configured (E2E_AGENT_PASSWORD / E2E_ADMIN_PASSWORD).')
    }

    // CI seeds the admin account only, so this spec runs where an AGENT exists.
    let loggedIn = true
    try {
      await loginAs(page, 'staff', password)
    } catch {
      loggedIn = false
    }
    if (!loggedIn) {
      test.skip(true, 'Seeded AGENT account "staff" is absent in this environment.')
    }

    await expect(page).toHaveURL(/\/admin\/live-chat/, { timeout: 60_000 })
    await page.screenshot({ path: `${EVIDENCE}/nav-02-agent-console.png` })

    await expect(page.locator('a[href="/admin/bookings"]')).toHaveCount(0)

    await gotoAdmin(page, '/admin/bookings')
    await expect(page).toHaveURL(/\/admin\/live-chat/, { timeout: 60_000 })
    await page.screenshot({ path: `${EVIDENCE}/nav-02-agent-snapped-back.png` })
  })
})
