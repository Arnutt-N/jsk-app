import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * The admin shell landmark. The layout renders this `<aside>` on every admin
 * page, so waiting for it proves the app actually rendered the console — not
 * merely that the URL changed to something that is not /login.
 */
const ADMIN_SHELL = '[data-testid="admin-drawer"]'

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

      // F-020: assert the POSITIVE landing. The old check here was
      // `not.toHaveURL(/\/login/)` after a fixed sleep, which any non-login URL
      // satisfies — including an error page, a 404, or a redirect target that
      // never finished rendering. Await the admin shell instead: it only exists
      // when the console actually mounted.
      await expect(
        page,
        `iteration ${i} must land on /admin`,
      ).toHaveURL(/\/admin(\/.*)?$/)
      await expect(
        page.locator(ADMIN_SHELL),
        `iteration ${i} must render the admin shell`,
      ).toBeVisible()

      // Late guards and cross-tab broadcasts fire after the URL settles; this
      // window is what the original flake hid behind.
      await page.waitForTimeout(1_500)
      await expect(
        page,
        `iteration ${i} must still be on /admin after settling`,
      ).toHaveURL(/\/admin(\/.*)?$/)
      await expect(page.locator(ADMIN_SHELL)).toBeVisible()
    }
  })

  test('a wrong password stays on /login and shows an error', async ({ page }) => {
    // The other half of the same contract: a failed login must NOT be
    // indistinguishable from a successful one, which is exactly what a bare
    // `not.toHaveURL(/login/)` could not detect.
    const password = process.env.E2E_ADMIN_PASSWORD
    test.skip(!password, 'E2E_ADMIN_PASSWORD is required')

    await page.goto('/login')
    await page.locator('input[name="username"]').first().waitFor({ state: 'visible' })
    await page.locator('input[name="username"]').first().fill(
      process.env.E2E_ADMIN_USERNAME ?? 'admin',
    )
    await page.locator('input[name="password"]').first().fill('definitely-not-the-password')
    await page
      .locator('button[type="submit"], button:has-text("เข้าสู่ระบบ")')
      .first()
      .click()

    await expect(page).toHaveURL(/\/login/)
    await expect(
      page.getByText('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่อีกครั้ง'),
    ).toBeVisible()
    await expect(page.locator(ADMIN_SHELL)).toHaveCount(0)
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
