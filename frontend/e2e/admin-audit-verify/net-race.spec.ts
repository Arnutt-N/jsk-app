import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

test.describe('NET-01 latest query wins the race', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('final list matches the last query typed, stale response dropped', async ({ page }) => {
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
    // Fixed: the slow first request is aborted/superseded, so the list
    // shows the newest query's rows and no fetch-error flashes.
    expect(bodyText).toContain('NetraceBeta')
    expect(bodyText).not.toContain('NetraceAlpha')
    await expect(page.getByText(/โหลดข้อมูลไม่สำเร็จ|เกิดข้อผิดพลาด/)).toHaveCount(0)
    await page.screenshot({ path: `${EVIDENCE}/net-01-latest-wins.png` })
  })
})
