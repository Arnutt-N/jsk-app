import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'
import { gotoAdmin } from '../utils/nav'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

test.describe('A11Y-01 mobile drawer focus (fixed)', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('Tab stays inside the drawer, Escape closes it, focus returns', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAdmin(page, '/admin')

    await page.locator('button[aria-label="Open menu"]').click()
    const drawer = page.locator('aside')
    await expect(drawer).toBeVisible()
    await expect(page.locator('button[aria-label="Close menu"]')).toBeFocused()
    await page.screenshot({ path: `${EVIDENCE}/a11y-01-drawer-open.png` })

    // The page behind the drawer is inert while it is open, which is what keeps
    // Tab inside; the loop below proves the observable consequence.
    const contentInert = await page.evaluate(() => {
      const aside = document.querySelector('aside')
      const content = aside?.parentElement?.children[2] as HTMLElement | undefined
      return content ? content.hasAttribute('inert') : null
    })
    expect(contentInert, 'page content behind the drawer is inert').toBe(true)

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

test.describe('A11Y-02 session warning stays hidden until idle', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('warning is absent on a fresh page (unit test covers dialog semantics)', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAdmin(page, '/admin')

    // The warning needs 25 idle minutes to appear, so a fresh page renders none.
    await expect(page.getByText('Session Expiring Soon')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.screenshot({ path: `${EVIDENCE}/a11y-02-no-warning.png` })
  })
})
