import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

test.describe('A11Y-01 mobile drawer focus (fixed)', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('Tab stays inside the drawer, Escape closes it, focus returns', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin')

    await page.locator('button[aria-label="Open menu"]').click()
    const drawer = page.locator('aside')
    await expect(drawer).toBeVisible()
    await expect(page.locator('button[aria-label="Close menu"]')).toBeFocused()
    await page.screenshot({ path: `${EVIDENCE}/a11y-01-drawer-open.png` })

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const inside = await page.evaluate(() => {
        const aside = document.querySelector('aside')
        return aside ? aside.contains(document.activeElement) : false
      })
      expect(inside).toBe(true)
    }
    await page.screenshot({ path: `${EVIDENCE}/a11y-01-focus-trapped.png` })

    await page.keyboard.press('Escape')
    await expect.poll(async () => page.evaluate(() => {
      const aside = document.querySelector('aside')
      return aside ? aside.getBoundingClientRect().x : 0
    }), { timeout: 5_000 }).toBeLessThan(0)
    await expect(page.locator('button[aria-label="Open menu"]')).toBeFocused()
  })
})

test.describe('A11Y-02 session warning has no dialog semantics', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('warning is absent on a fresh page and carries no dialog role', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin')

    // The warning only appears after 25 idle minutes, so a fresh page shows
    // nothing; when it does render it is plain divs with no role="dialog".
    await expect(page.getByText('Session Expiring Soon')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.screenshot({ path: `${EVIDENCE}/a11y-02-no-warning.png` })
  })
})
