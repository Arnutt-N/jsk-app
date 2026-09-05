import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

// TEMPORARY repro for the P1 login flake — deleted after findings are recorded.
// Loop: fresh cookies -> login -> land on /admin -> settle window -> must NOT
// be back on /login. The 1.5s settle window after landing is what CI lacks:
// late guards / cross-tab broadcasts fire after the URL already reads /admin.
test.describe('login flake repro (single tab)', () => {
  test('10 consecutive login -> /admin transitions, zero retries', async ({ page }) => {
    test.setTimeout(180_000)
    const authConsole: string[] = []
    const authResponses: string[] = []

    page.on('console', (msg) => {
      if (/auth|bootstrap|Cookie auth/i.test(msg.text())) authConsole.push(msg.text())
    })
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('/api/v1/auth/')) authResponses.push(`${res.status()} ${url}`)
    })

    for (let i = 1; i <= 10; i++) {
      await page.context().clearCookies()
      await page.goto('/login')
      await page.locator('input[name="username"], input[type="text"]').first().waitFor({ state: 'visible' })
      await loginAsAdmin(page)

      // The flake: URL flips back to /login after the success toast.
      await page.waitForTimeout(1_500)
      const urlAfterSettle = page.url()
      if (/\/login/.test(urlAfterSettle)) {
        console.log(`BOUNCE at iteration ${i}: ${urlAfterSettle}`)
        console.log('AUTH_RESPONSES:', authResponses.join('\n'))
        console.log('AUTH_CONSOLE:', authConsole.join('\n'))
      }
      expect(urlAfterSettle, `iteration ${i} must stay on /admin`).not.toMatch(/\/login/)
    }
    console.log('AUTH_RESPONSES:', authResponses.join('\n'))
    if (authConsole.length) console.log('AUTH_CONSOLE:', authConsole.join('\n'))
  })
})
