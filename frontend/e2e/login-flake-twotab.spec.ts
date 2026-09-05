import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

// TEMPORARY repro: prove the receiver link of the login-flake chain (E5) —
// a logout broadcast on the 'jsk:auth' channel evicts ANOTHER tab's valid
// session without any server-side verification. This is what a stale tab's
// bootstrap chain (401 -> failed silent refresh -> logout()) emits, and what
// the freshly logged-in tab then obeys.
test.describe('login flake repro (two tabs)', () => {
  test('a logout broadcast from a second tab evicts the freshly logged-in tab', async ({ browser }) => {
    const context = await browser.newContext()
    const adminTab = await context.newPage()
    await loginAsAdmin(adminTab)
    await expect(adminTab).toHaveURL(/\/admin/)

    const otherTab = await context.newPage()
    await otherTab.goto('/login')

    // Exactly what a stale tab's AuthContext.logout() does:
    await otherTab.evaluate(() => {
      const bc = new BroadcastChannel('jsk:auth')
      bc.postMessage({ type: 'logout' })
      bc.close()
    })

    // Pre-fix expectation: adminTab is unconditionally logged out -> /login.
    await adminTab.waitForURL(/\/login/, { timeout: 10_000 })
    console.log('BOUNCE CONFIRMED: admin tab ended on', adminTab.url())
  })
})
