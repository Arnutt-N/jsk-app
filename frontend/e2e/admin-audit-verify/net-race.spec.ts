import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

test.describe('NET-01 slow first search overwrites the fresh results', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('final list matches the stale query, not the last one typed', async ({ page }) => {
    await loginAsAdmin(page)

    // Only the search fetches race: the first one crawls, later ones fly.
    let searchCalls = 0
    await page.route('**/admin/requests*', async (route) => {
      const req = route.request()
      if (req.method() === 'GET' && req.url().includes('search=')) {
        searchCalls += 1
        if (searchCalls === 1) {
          await new Promise((r) => setTimeout(r, 1500))
        }
      }
      await route.continue()
    })

    await page.goto('/admin/requests', { waitUntil: 'domcontentloaded' })
    const search = page.getByPlaceholder(/ค้นหาชื่อ/)
    await expect(search).toBeVisible({ timeout: 20_000 })

    await search.fill('NetraceAlpha')
    await page.waitForTimeout(700)
    await search.fill('NetraceBeta')
    await page.waitForTimeout(2500)

    const bodyText = await page.locator('tbody').innerText()
    // Pre-fix no request is aborted, so the slow first response lands last
    // and the list shows its rows instead of the newest query.
    expect(bodyText).toContain('NetraceAlpha')
    expect(bodyText).not.toContain('NetraceBeta')
    await page.screenshot({ path: `${EVIDENCE}/net-01-stale-wins.png` })
  })
})
