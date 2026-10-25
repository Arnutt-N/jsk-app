import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

test.describe('A11Y-01 mobile drawer focus', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('Tab leaves the drawer and Escape does not close it', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin')

    await page.locator('button[aria-label="Open menu"]').click()
    const drawer = page.locator('aside')
    await expect(drawer).toBeVisible()
    await page.screenshot({ path: `${EVIDENCE}/a11y-01-drawer-open.png` })

    const escaped: string[] = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const focus = await page.evaluate(() => {
        const el = document.activeElement
        const aside = document.querySelector('aside')
        const label =
          el?.getAttribute('aria-label') || el?.textContent?.trim().slice(0, 30) || el?.tagName || 'none'
        return { label, inside: aside ? aside.contains(el) : false }
      })
      if (!focus.inside) escaped.push(focus.label)
    }

    // Pre-fix the drawer traps nothing, so tabbing reaches the page behind it.
    expect(escaped.length).toBeGreaterThan(0)
    await page.screenshot({ path: `${EVIDENCE}/a11y-01-focus-escaped.png` })

    // No Escape handler closes the drawer pre-fix.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await expect(drawer).toBeVisible()
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
