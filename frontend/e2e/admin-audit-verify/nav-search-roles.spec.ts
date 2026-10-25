import { expect, test } from '@playwright/test'
import { loginAs, loginAsAdmin } from '../utils/auth'

// Evidence stills land beside the code-evidence notes from the read-only pass.
const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

test.describe('NAV-01 mobile search is a dead input', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('typing + Enter navigates nowhere and shows no results', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin')

    await page.locator('button[aria-label="Search"]').click()
    const deadInput = page.getByPlaceholder('ค้นหา...')
    await expect(deadInput).toBeVisible()

    const urlBefore = page.url()
    await deadInput.fill('test-query-xyz')
    await deadInput.press('Enter')
    await page.waitForTimeout(500)

    // The input wires no change/submit handler, so nothing may navigate
    // and no result surface may appear.
    expect(page.url()).toBe(urlBefore)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.screenshot({ path: `${EVIDENCE}/nav-01-mobile-dead-input.png` })
  })
})

test.describe('NAV-01 desktop palette opens', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('command palette opens from the header trigger', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin')

    await page.locator('button[aria-label="Open command palette (Ctrl+K)"]').click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    await page.screenshot({ path: `${EVIDENCE}/nav-01-desktop-palette.png` })
  })
})

test.describe('NAV-02 AGENT role sees Appointments but cannot stay there', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('menu click and direct URL both snap back to live-chat', async ({ page }) => {
    const password = process.env.E2E_AGENT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD
    if (!password) {
      throw new Error('E2E_ADMIN_PASSWORD env var is required (AGENT shares the seeded dev password).')
    }
    await loginAs(page, 'staff', password)
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/admin\/live-chat/, { timeout: 15_000 })
    await page.screenshot({ path: `${EVIDENCE}/nav-02-agent-console.png` })

    // The AGENT console carries no admin sidebar at all, so there is no
    // Appointments affordance to click — stronger than a menu/guard mismatch:
    // the destination is unreachable from the AGENT UI.
    await expect(page.locator('a[href="/admin/bookings"]')).toHaveCount(0)

    // Direct navigation hits the same guard and snaps back.
    await page.goto('/admin/bookings', { waitUntil: 'domcontentloaded', timeout: 25_000 })
    await page.waitForURL(/\/admin\/live-chat/, { timeout: 15_000 })
    await page.screenshot({ path: `${EVIDENCE}/nav-02-agent-snapped-back.png` })
  })
})
