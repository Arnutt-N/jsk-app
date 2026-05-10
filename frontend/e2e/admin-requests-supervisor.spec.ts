import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * /admin/requests/[id] -- supervisor workflow + override menu.
 *
 * Covers PR #50 (supervisor-aware workflow buttons + reopen + grid pills)
 * and PR #51 (defensive hardening: viewport-clamped dropdown + in-flight
 * guard + caught rejections).
 *
 * Strategy:
 *   - Login as the seeded admin (canApprove === true).
 *   - Navigate to /admin/requests, find the first row's link, and goto
 *     it directly. We don't click the row because the table row's link
 *     is on a nested cell and `<tr>.click()` doesn't reliably bubble to
 *     a navigation in the test runner.
 *   - If the test DB has zero requests, skip (the list-page spec
 *     already covers empty-state regressions).
 */

/**
 * Resolve the URL of the first request detail page from the list view.
 * Returns null if no request row is present (test DB is empty).
 *
 * The list page renders `<Link href="/admin/requests/{id}">` inside each
 * table row, plus a separate `/admin/requests/create` button at the top.
 * We exclude the `create` link by filtering on the numeric id pattern.
 */
async function getFirstRequestDetailUrl(page: Page): Promise<string | null> {
  const links = page.locator('a[href*="/admin/requests/"]')
  const count = await links.count()
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href')
    if (href && /\/admin\/requests\/\d+$/.test(href)) return href
  }
  return null
}

test.describe('Request detail page -- supervisor view', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
  })

  test('hero card renders supervisor-tier workflow buttons', async ({ page }) => {
    const detailUrl = await getFirstRequestDetailUrl(page)
    test.skip(!detailUrl, 'no requests in test DB; supervisor view nothing to render')
    await page.goto(detailUrl!)

    // Hero card: title with topic_category + back button + workflow row
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // Status pill (one of the lifecycle labels) -- spot-check that any
    // pill renders so we know the hero card mounted with valid data.
    const anyStatusPill = page
      .locator('text=/รอมอบหมาย|รอรับเรื่อง|รอดำเนินการ|กำลังดำเนินการ|รออนุมัติ|เสร็จสิ้น|ปฏิเสธ/')
      .first()
    await expect(anyStatusPill).toBeVisible()

    // Supervisor (admin role, canApprove=true) sees at minimum one of:
    //   - "มอบหมาย" / "เปลี่ยนผู้รับผิดชอบ" (open states)
    //   - "ปฏิเสธ" (open states)
    //   - "เปิดเรื่องใหม่" (REJECTED)
    //   - or one of the advance buttons (รับเรื่อง / เริ่ม / ส่ง / อนุมัติ)
    // We don't care which specifically because the row's status varies.
    const supervisorButton = page
      .locator('button')
      .filter({
        hasText: /มอบหมาย|เปลี่ยนผู้รับผิดชอบ|ปฏิเสธ|เปิดเรื่องใหม่|รับเรื่อง|เริ่มดำเนินการ|ส่งอนุมัติ|^อนุมัติ$/,
      })
      .first()
    await expect(supervisorButton).toBeVisible()
  })

  test('override kebab menu opens and contains escape-hatch items', async ({ page }) => {
    const detailUrl = await getFirstRequestDetailUrl(page)
    test.skip(!detailUrl, 'no requests in test DB')
    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // The kebab is hidden on terminal-state requests (COMPLETED/REJECTED).
    // If it isn't there, skip the menu test rather than fail.
    const kebab = page.getByRole('button', { name: 'การจัดการพิเศษ' })
    const kebabVisible = await kebab.isVisible().catch(() => false)
    test.skip(!kebabVisible, 'request is in a terminal state; override kebab is hidden by design')

    await kebab.click()

    // Menu opens via aria role=menu.
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()

    // The "บังคับเสร็จสิ้น" item is unconditional inside the menu when
    // the outer guard passes. Always present.
    await expect(page.getByRole('menuitem', { name: /บังคับเสร็จสิ้น/ })).toBeVisible()

    // Close on Escape (DropdownMenu listens for this).
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })

  test('mobile viewport: status/priority pills grid does not overflow card', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })

    const detailUrl = await getFirstRequestDetailUrl(page)
    test.skip(!detailUrl, 'no requests in test DB')
    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // Switch to manage tab where the pills live.
    const manageTab = page.getByRole('button', { name: /จัดการคำร้อง/ })
    await manageTab.click()

    // Status pills container -- the grid should have 6 buttons that
    // collectively don't exceed the viewport width. Pick any pill and
    // assert its bounding box stays within viewport.
    const firstStatusPill = page.locator('button', { hasText: 'รอรับเรื่อง' }).last()
    await expect(firstStatusPill).toBeVisible()

    const box = await firstStatusPill.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(375)
    }
  })

  test('console stays clean -- no unhandled promise rejections on hero card', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message)
    })

    const detailUrl = await getFirstRequestDetailUrl(page)
    test.skip(!detailUrl, 'no requests in test DB')
    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // Wait briefly for any deferred network calls (fetchDetail, fetchComments).
    await page.waitForTimeout(1500)

    // Filter out known-noisy benign messages (Next.js dev warnings,
    // hydration mismatch notices that don't affect functionality).
    const significant = consoleErrors.filter((msg) => {
      const lower = msg.toLowerCase()
      return !lower.includes('hydrat') && !lower.includes('fast refresh')
    })
    expect(significant, `Unexpected console errors:\n${significant.join('\n')}`).toEqual([])
  })
})
