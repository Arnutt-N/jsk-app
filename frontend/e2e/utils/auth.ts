import { expect, type Page } from '@playwright/test'

/**
 * Log in as an arbitrary seeded user (generic primitive).
 *
 * Parameterized by `username`/`password` so multi-operator specs can sign in
 * as different roles in separate browser contexts (e.g. Phase 6's 2-client
 * claim-contention / transfer tests log in as both `admin` and `staff`).
 * `loginAsAdmin` is a thin env-driven wrapper over this.
 *
 * Form-targeting strategy is identical to the original admin login: native
 * <input>/<input>/<button>, matched by name/type attribute so it survives
 * label rewording.
 *
 * Cold-server hardening: on a slow/first-hit /login the route is still
 * compiling when the page resolves, so the inputs and submit button can mount
 * a beat late. We make each element's readiness explicit -- wait for the field
 * to be visible before filling, assert the value actually landed before
 * submitting, and wait for the button to be visible before clicking -- so a
 * dropped keystroke surfaces as a clear field-level failure instead of a
 * confusing post-login navigation timeout. This matters most when two browser
 * contexts log in back-to-back against a cold WSL/9p dev server.
 */
export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login')

  // The login form is a basic <input>/<input>/<button>. We target by
  // input name attribute since the page uses native form elements --
  // resilient against label rewording.
  const usernameInput = page.locator('input[name="username"], input[type="text"]').first()
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first()

  // Wait for each input to actually be mounted+visible before typing. On a
  // cold-compiled /login, fill() can otherwise fire before the field exists
  // and the keystrokes get dropped, which only shows up later as a baffling
  // login timeout. The explicit wait makes the real cause visible.
  await usernameInput.waitFor({ state: 'visible' })
  await usernameInput.fill(username)
  await passwordInput.waitFor({ state: 'visible' })
  await passwordInput.fill(password)

  // Confirm the fields really received their values before we submit. If a
  // cold-compile race dropped a keystroke, this fails here (pointing at the
  // exact field) instead of as a post-login navigation timeout.
  await expect(usernameInput).toHaveValue(username)
  await expect(passwordInput).toHaveValue(password)

  // Some toolkits render submit buttons as <button type="submit"> while
  // others use a styled <button>. Prefer name then text fallback.
  const submitButton = page.locator(
    'button[type="submit"], button:has-text("เข้าสู่ระบบ"), button:has-text("Log in")',
  ).first()
  // Make the visible-precondition explicit so the click can't fire before the
  // button has mounted on a first-hit /login compile. (click() also auto-waits
  // for actionability; this just gives a clearer failure if it never appears.)
  await submitButton.waitFor({ state: 'visible' })
  await submitButton.click()

  // The login flow ends on /admin (or /admin/something). Be lenient
  // about exactly where we land -- different roles might redirect
  // elsewhere via PageAccessGuard, but admin stays on /admin/*.
  // 45s (not 15s): the post-login full navigation triggers a first-hit route
  // compile that can exceed 15s on a cold/loaded dev server (esp. WSL/9p with
  // multiple browser contexts). A longer cap only changes how long we wait
  // before failing -- on a warm server login still completes in ~1-2s.
  await page.waitForURL(/\/admin(\/.*)?$/, { timeout: 45_000 })
}

/**
 * Log in as the seeded admin user.
 *
 * Reads credentials from env so the same helper works locally (where
 * the dev DB has whatever password you seeded) and in CI (where the
 * e2e workflow seeds with `E2E_ADMIN_PASSWORD`). Falls back to the
 * default username `"admin"` because seed_admin.py hardcodes it.
 *
 * Throws if the password env var is missing -- explicit failure beats a
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

  await loginAs(page, username, password)
}
