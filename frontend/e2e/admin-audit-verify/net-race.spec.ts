import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'
import { gotoAdmin } from '../utils/nav'
import { captureCsrf, createRequestFixture } from '../utils/request-fixture'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

test.describe('NET-01 latest query wins the race', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('final list matches the last query typed, stale response dropped', async ({ page }) => {
    captureCsrf(page)
    await loginAsAdmin(page)

    const token = `Net${Date.now()}`
    await createRequestFixture(page, `${token}Alpha`)
    await createRequestFixture(page, `${token}Beta`)

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

    await gotoAdmin(page, '/admin/requests')
    const search = page.getByPlaceholder(/ค้นหาชื่อ/)
    await expect(search).toBeVisible({ timeout: 20_000 })

    await search.fill(`${token}Alpha`)
    await page.waitForTimeout(700)
    await search.fill(`${token}Beta`)
    await page.waitForTimeout(2500)

    const bodyText = await page.locator('tbody').innerText()
    expect(bodyText).toContain(`${token}Beta`)
    expect(bodyText).not.toContain(`${token}Alpha`)
    await expect(page.getByText(/โหลดข้อมูลไม่สำเร็จ|เกิดข้อผิดพลาด/)).toHaveCount(0)
    await page.screenshot({ path: `${EVIDENCE}/net-01-latest-wins.png` })
  })
})
