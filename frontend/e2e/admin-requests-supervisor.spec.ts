import { expect, test } from '@playwright/test'
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
 *   - Navigate to /admin/requests, pick the first row, follow it to the
 *     detail page. If the test DB has zero requests, skip (the list-page
 *     spec already covers empty-state regressions).
 *   - Assert hero card structure, override kebab, and mobile pill grid.
 *
 * Why no full lifecycle test (PENDING -> COMPLETED): each click triggers
 * a real PATCH against the test backend, and chaining 4 transitions in
 * one test couples the spec to seed-data state and to other specs that
 * may run in parallel. Cover individual button visibility + override
 * menu open/close instead -- behavior contract, not workflow integration.
 */
test.describe('Request detail page -- supervisor view', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
  })

  test('hero card renders supervisor-tier workflow buttons', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    const rowCount = await firstRow.count()
    test.skip(rowCount === 0, 'no requests in test DB; supervisor view nothing to render')

    // Click the first row -- the row itself is the link in this list,
    // but rendering can use either <a> wrapping or onClick. Try both.
    const rowLink = firstRow.locator('a[href*="/admin/requests/"]').first()
    if (await rowLink.count() > 0) {
      await rowLink.click()
    } else {
      await firstRow.click()
    }

    // Land on detail. URL pattern is /admin/requests/<id>.
    await page.waitForURL(/\/admin\/requests\/\d+$/, { timeout: 10_000 })

    // Hero card: title with topic_category + back button + workflow row
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible()

    // Status pill (one of the lifecycle labels) -- spot-check that any
    // pill renders so we know the hero card mounted with valid data.
    const anyStatusPill = page.locator('text=/รอมอบหมาย|รอรับเรื่อง|รอดำเนินการ|กำลังดำเนินการ|รออนุมัติ|เสร็จสิ้น|ปฏิเสธ/').first()
    await expect(anyStatusPill).toBeVisible()

    // Supervisor (admin role, canApprove=true) sees at minimum:
    //   - "มอบหมาย" or "เปลี่ยนผู้รับผิดชอบ" (open states)
    //   - "ปฏิเสธ" (open states), or "เปิดเรื่องใหม่" (REJECTED)
    // We don't assert which one specifically because the row's status
    // varies; assert that at least one supervisor primary button is
    // visible, ignoring the status the request happened to be in.
    const supervisorButton = page.locator('button').filter({
      hasText: /มอบหมาย|เปลี่ยนผู้รับผิดชอบ|ปฏิเสธ|เปิดเรื่องใหม่|รับเรื่อง|เริ่มดำเนินการ|ส่งอนุมัติ|อนุมัติ/,
    }).first()
    await expect(supervisorButton).toBeVisible()
  })

  test('override kebab menu opens and contains escape-hatch items', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    const rowCount = await firstRow.count()
    test.skip(rowCount === 0, 'no requests in test DB')

    const rowLink = firstRow.locator('a[href*="/admin/requests/"]').first()
    if (await rowLink.count() > 0) {
      await rowLink.click()
    } else {
      await firstRow.click()
    }
    await page.waitForURL(/\/admin\/requests\/\d+$/, { timeout: 10_000 })

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

    const firstRow = page.locator('table tbody tr').first()
    const rowCount = await firstRow.count()
    test.skip(rowCount === 0, 'no requests in test DB')

    const rowLink = firstRow.locator('a[href*="/admin/requests/"]').first()
    if (await rowLink.count() > 0) {
      await rowLink.click()
    } else {
      await firstRow.click()
    }
    await page.waitForURL(/\/admin\/requests\/\d+$/, { timeout: 10_000 })

    // Switch to manage tab where the pills live.
    const manageTab = page.getByRole('button', { name: /จัดการคำร้อง/ })
    await manageTab.click()

    // Status pills container -- the grid should have 6 buttons that
    // collectively don't exceed the card width. Pick the first pill
    // and assert its bounding box stays within viewport.
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

    const firstRow = page.locator('table tbody tr').first()
    const rowCount = await firstRow.count()
    test.skip(rowCount === 0, 'no requests in test DB')

    const rowLink = firstRow.locator('a[href*="/admin/requests/"]').first()
    if (await rowLink.count() > 0) {
      await rowLink.click()
    } else {
      await firstRow.click()
    }
    await page.waitForURL(/\/admin\/requests\/\d+$/, { timeout: 10_000 })

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
