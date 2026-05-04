import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

test.describe('Authentication', () => {
  test('unauthenticated request to /admin redirects to /login', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page renders the username and password inputs', async ({ page }) => {
    await page.goto('/login')
    // Form is the most stable signal that the login screen mounted -- we
    // intentionally do not assert specific copy here so a marketing
    // rewrite does not break the smoke suite.
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    await expect(
      page.locator('button[type="submit"], button:has-text("เข้าสู่ระบบ"), button:has-text("Log in")').first(),
    ).toBeVisible()
  })

  test('admin can sign in and reach the dashboard', async ({ page }) => {
    await loginAsAdmin(page)
    // The dashboard layout always carries the admin sidebar; presence
    // of any link to /admin/requests is a reliable post-login marker.
    await expect(page.locator('a[href*="/admin/requests"]').first()).toBeVisible()
  })
})
