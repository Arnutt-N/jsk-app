import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

// Regression guard for the P1 login flake (PRD: .claude/PRPs/prds/2026-09-05-login-flake.prd.md):
// the success toast must be followed by the dashboard, every single time, with
// no retry — and a cross-tab logout broadcast must never evict a valid session.
// The 1.5s settle window after landing is deliberate: late guards/broadcasts
// fire after the URL already reads /admin, which is exactly what CI's old
// specs never exercised.
test.describe('login stability', () => {
  test('10 consecutive login -> /admin transitions, zero bounces', async ({ page }) => {
    test.setTimeout(180_000)
    for (let i = 1; i <= 10; i++) {
      await page.context().clearCookies()
      await page.goto('/login')
      await page
        .locator('input[name="username"], input[type="text"]')
        .first()
        .waitFor({ state: 'visible' })
      await loginAsAdmin(page)
      await page.waitForTimeout(1_500)
      expect(page, `iteration ${i} must stay on /admin`).not.toHaveURL(/\/login/)
    }
  })

  test('logged-in tab keeps its session when another tab broadcasts logout', async ({ browser }) => {
    const context = await browser.newContext()
    const adminTab = await context.newPage()
    await loginAsAdmin(adminTab)
    await expect(adminTab).toHaveURL(/\/admin/)

    const otherTab = await context.newPage()
    await otherTab.goto('/login')

    // What a stale tab's AuthContext.logout() emits:
    await otherTab.evaluate(() => {
      const bc = new BroadcastChannel('jsk:auth')
      bc.postMessage({ type: 'logout' })
      bc.close()
    })

    await adminTab.waitForTimeout(3_000)
    await expect(adminTab).toHaveURL(/\/admin/)
  })
})
