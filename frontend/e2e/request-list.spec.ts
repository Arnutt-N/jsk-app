import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * /admin/requests -- the list page.
 *
 * Stage 1 (PR #43) replaced an inline 4-status filter with a shared
 * 8-option dropdown that distinguishes "รอมอบหมาย" (PENDING + no
 * assignee) from "รอรับเรื่อง" (PENDING + has assignee), and exposes
 * "รอดำเนินการ" (ACKNOWLEDGED) / "รออนุมัติ" (AWAITING_APPROVAL).
 *
 * These smoke checks catch regressions that would silently revert the
 * filter back to the lowercase 4-option list (which was the original
 * bug -- the filter never actually queried backend correctly).
 */
test.describe('Request list page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/requests')
  })

  test('renders the page header and create-request link', async ({ page }) => {
    await expect(page.getByText('รายการคำร้องขอรับบริการ')).toBeVisible()
    await expect(page.locator('a[href="/admin/requests/create"]').first()).toBeVisible()
  })

  test('status filter dropdown contains all six lifecycle phases', async ({ page }) => {
    // The filter is a native <select>. Use the option count + a sample
    // of labels to verify shape without coupling to exact ordering.
    const statusSelect = page.locator('select').first()
    await expect(statusSelect).toBeVisible()

    const options = await statusSelect.locator('option').allInnerTexts()
    // 8 entries: ทุกสถานะ + 6 lifecycle phases + AWAITING_ASSIGNMENT pseudo
    expect(options.length).toBeGreaterThanOrEqual(7)

    // Spot-check the labels added in Stage 1 -- if any of these go
    // missing, the filter has reverted or someone removed shared module
    // wiring.
    expect(options).toContain('ทุกสถานะ')
    expect(options).toContain('รอรับเรื่อง')
    expect(options).toContain('รอดำเนินการ') // ACKNOWLEDGED -- new in Stage 1
    expect(options).toContain('กำลังดำเนินการ')
    expect(options).toContain('รออนุมัติ')
    expect(options).toContain('เสร็จสิ้น')
    expect(options).toContain('ปฏิเสธ')
  })

  test('table header includes the status column', async ({ page }) => {
    // The table loads asynchronously after fetch -- wait for the
    // table to render at all before asserting headers.
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('th', { hasText: 'สถานะ' })).toBeVisible()
  })
})
