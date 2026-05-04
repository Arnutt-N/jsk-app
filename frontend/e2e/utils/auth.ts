import type { Page } from '@playwright/test'

/**
 * Log in as the seeded admin user.
 *
 * Reads credentials from env so the same helper works locally (where
 * the dev DB has whatever password you seeded) and in CI (where the
 * e2e workflow seeds with `E2E_ADMIN_PASSWORD`). Falls back to the
 * default username `"admin"` because seed_admin.py hardcodes it.
 *
 * Throws if either env var is missing -- explicit failure beats a
 * confusing "submit button not clickable" timeout further down.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const username = process.env.E2E_ADMIN_USERNAME ?? 'admin'
  const password = process.env.E2E_ADMIN_PASSWORD

  if (!password) {
    throw new Error(
      'E2E_ADMIN_PASSWORD env var is required. Set it to the password seeded by backend/scripts/seed_admin.py.',
    )
  }

  await page.goto('/login')

  // The login form is a basic <input>/<input>/<button>. We target by
  // input name attribute since the page uses native form elements --
  // resilient against label rewording.
  await page.locator('input[name="username"], input[type="text"]').first().fill(username)
  await page.locator('input[name="password"], input[type="password"]').first().fill(password)

  // Some toolkits render submit buttons as <button type="submit"> while
  // others use a styled <button>. Prefer name then text fallback.
  const submitButton = page.locator(
    'button[type="submit"], button:has-text("เข้าสู่ระบบ"), button:has-text("Log in")',
  ).first()
  await submitButton.click()

  // The login flow ends on /admin (or /admin/something). Be lenient
  // about exactly where we land -- different roles might redirect
  // elsewhere via PageAccessGuard, but admin stays on /admin/*.
  await page.waitForURL(/\/admin(\/.*)?$/, { timeout: 15_000 })
}
