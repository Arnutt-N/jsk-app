import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'
import { gotoAdmin } from '../utils/nav'
import { captureCsrf, createRequestFixture } from '../utils/request-fixture'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000, retries: 0 })

test.describe('NET-01 latest query wins the race', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a stale response that lands last does not repaint the list', async ({ page }) => {
    captureCsrf(page)
    await loginAsAdmin(page)

    const token = `Net${Date.now()}`
    await createRequestFixture(page, `${token}Alpha`)
    await createRequestFixture(page, `${token}Beta`)

    let firstSearchInFlight!: () => void
    const firstSearchStarted = new Promise<void>((resolve) => {
      firstSearchInFlight = resolve
    })
    let releaseStale!: () => void
    const staleGate = new Promise<void>((resolve) => {
      releaseStale = resolve
    })
    let searchCalls = 0

    await page.route('**/admin/requests*', async (route) => {
      const request = route.request()
      if (request.method() === 'GET' && request.url().includes('search=')) {
        searchCalls += 1
        if (searchCalls === 1) {
          firstSearchInFlight()
          await staleGate
        }
      }
      await route.continue()
    })

    await gotoAdmin(page, '/admin/requests')
    const search = page.getByPlaceholder(/ค้นหาชื่อ/)
    await expect(search).toBeVisible({ timeout: 60_000 })

    await search.fill(`${token}Alpha`)
    await firstSearchStarted

    await search.fill(`${token}Beta`)
    await expect(page.locator('tbody')).toContainText(`${token}Beta`, { timeout: 60_000 })

    // The stale response now arrives after the winning one.
    releaseStale()
    await page.waitForTimeout(1500)

    const bodyText = await page.locator('tbody').innerText()
    expect(bodyText).toContain(`${token}Beta`)
    expect(bodyText).not.toContain(`${token}Alpha`)
    await expect(page.getByText(/โหลดข้อมูลไม่สำเร็จ|เกิดข้อผิดพลาด/)).toHaveCount(0)
    await page.screenshot({ path: `${EVIDENCE}/net-01-latest-wins.png` })
  })
})
