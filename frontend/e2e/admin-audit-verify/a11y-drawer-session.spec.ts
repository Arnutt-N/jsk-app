import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'
import { gotoAdmin } from '../utils/nav'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000, retries: 0 })

test.describe('A11Y-01 mobile drawer', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('Tab stays inside the drawer, Escape closes it, focus returns', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAdmin(page, '/admin')

    await page.locator('button[aria-label="Open menu"]').click()
    const drawer = page.getByTestId('admin-drawer')
    await expect(drawer).toBeVisible()
    await expect(page.locator('button[aria-label="Close menu"]')).toBeFocused()
    await page.screenshot({ path: `${EVIDENCE}/a11y-01-drawer-open.png` })

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const inside = await page.evaluate(() => {
        const aside = document.querySelector('aside')
        return aside ? aside.contains(document.activeElement) : false
      })
      expect(inside, `Tab ${i + 1} left the drawer`).toBe(true)
    }
    await page.screenshot({ path: `${EVIDENCE}/a11y-01-focus-trapped.png` })

    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeInViewport({ timeout: 5_000 })
    await expect(page.locator('button[aria-label="Open menu"]')).toBeFocused()
  })
})

test.describe('A11Y-02 idle-session warning', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('stays hidden while the session is active', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAdmin(page, '/admin')

    // Regression this catches: a wrong initial state that pops the warning at once.
    // The dialog's own semantics and its dismiss policy are covered by
    // components/admin/__tests__/session-timeout-warning.test.tsx, because the
    // 25-minute idle window cannot be reached reliably in this suite.
    await expect(page.getByText('Session Expiring Soon')).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Session Expiring Soon' })).toHaveCount(0)
    await page.screenshot({ path: `${EVIDENCE}/a11y-02-no-warning.png` })
  })
})
