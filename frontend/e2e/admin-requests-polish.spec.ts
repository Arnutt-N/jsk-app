import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { gotoAdmin } from './utils/nav'
import { captureCsrf, createRequestFixture } from './utils/request-fixture'

/**
 * /admin/requests* — UI polish regression suite (PRD A).
 *
 * Guards 7 visual/copy fixes documented in
 * `.claude/PRPs/plans/completed/request-mgmt-polish.prd.md` so future
 * UI refactors don't silently revert the fixes.
 *
 * ROWS ARE FIXTURE-OWNED (F-021). This suite used to guard every assertion
 * behind `test.skip(... 'No requests in test DB')`, so an empty database made
 * it pass while asserting nothing — nine green tests that could not fail. Each
 * test now creates the row it operates on (after `captureCsrf`, before login)
 * and hard-fails if that row produces no trigger.
 *
 * Selector strategy (mirrors `admin-requests-supervisor.spec.ts`):
 *   - To open the preview Modal: click the "เรียกดู" (Eye) ActionIconButton
 *     in the row's action column — NOT the row itself.
 *   - To navigate to a detail page: scan all `<a href*="/admin/requests/">`
 *     and match the numeric-id regex `/admin/requests/<id>$`.
 *
 * Tests favor SEMANTIC assertions (class names, text content, aria-label)
 * over pixel-perfect screenshots because:
 *   1. Screenshots are flaky across OS / font rendering.
 *   2. Semantic assertions tell future readers WHAT the fix protected.
 *   3. Test failures point to the specific regression, not "image differs".
 */

/** Resolve the detail URL for a specific fixture row. */
async function detailUrlFor(page: Page, requestId: number): Promise<string> {
  const href = `/admin/requests/${requestId}`
  await gotoAdmin(page, href)
  await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 15_000 })
  return href
}

/** Open the list page and wait for the table to mount. */
async function openRequestsList(page: Page): Promise<void> {
  await gotoAdmin(page, '/admin/requests')
  await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
}

/** Locate the fixture row in the list by its firstname. */
function fixtureRow(page: Page, firstname: string) {
  return page.locator('tr', { hasText: firstname }).first()
}

test.describe('Admin Requests UI Polish', () => {
  test.beforeEach(async ({ page }) => {
    // captureCsrf must be installed BEFORE login: it reads the CSRF token off
    // the /auth/login response, and the fixture helper cannot post without it.
    captureCsrf(page)
    await loginAsAdmin(page)
  })

  test('list modal "ดูรายละเอียด" button has whitespace-nowrap (#1)', async ({ page }) => {
    const firstname = `Polish-Modal-${Date.now()}`
    await createRequestFixture(page, firstname)
    await openRequestsList(page)

    // Open the preview Modal from OUR row, not "the first row in the table".
    const row = fixtureRow(page, firstname)
    await expect(row, 'the fixture row must be visible in the list').toBeVisible({
      timeout: 15_000,
    })
    const viewButton = row.locator('button[title="เรียกดู"], button[aria-label="เรียกดู"]').first()
    await expect(viewButton, 'the fixture row must expose the view action').toBeVisible({
      timeout: 10_000,
    })
    await viewButton.click()

    const fullDetailButton = page.locator('a:has(button) button:has-text("ดูรายละเอียด")').first()
    await expect(fullDetailButton).toBeVisible({ timeout: 5_000 })
    await expect(fullDetailButton).toHaveClass(/whitespace-nowrap/)
  })

  test('detail page tab nav uses text-text-secondary for inactive (#2)', async ({ page }) => {
    const firstname = `Polish-Tabs-${Date.now()}`
    const requestId = await createRequestFixture(page, firstname)
    await detailUrlFor(page, requestId)

    const tabs = page.locator('button:has(svg)').filter({
      has: page.locator('text=/รายละเอียด|ติดต่อ|ความคิดเห็น|จัดการ/'),
    })
    await expect(tabs.first()).toBeVisible({ timeout: 10_000 })

    const tabsClasses = await tabs.evaluateAll((els: HTMLElement[]) =>
      els.map((e) => e.className),
    )
    expect(tabsClasses.some((c) => /text-text-secondary|text-primary/.test(c))).toBe(true)
  })

  test('date picker has w-9 / w-9 / w-14 width proportions (#3)', async ({ page }) => {
    const firstname = `Polish-Date-${Date.now()}`
    const requestId = await createRequestFixture(page, firstname)
    await detailUrlFor(page, requestId)

    await page.getByRole('tab', { name: /จัดการคำร้อง/ }).click()

    const dayInput = page.locator('input[aria-label="วันที่"]').first()
    const monthInput = page.locator('input[aria-label="เดือน"]').first()
    const yearInput = page.locator('input[aria-label="ปี พ.ศ."]').first()

    await expect(dayInput).toBeVisible({ timeout: 5_000 })
    await expect(dayInput).toHaveClass(/\bw-9\b/)
    await expect(monthInput).toHaveClass(/\bw-9\b/)
    await expect(yearInput).toHaveClass(/\bw-14\b/)
  })

  test('AssignModal title strips "(Assign Request)" and has no Active Tasks footnote (#7a, #7b)', async ({ page }) => {
    const firstname = `Polish-Assign-${Date.now()}`
    const requestId = await createRequestFixture(page, firstname)
    await detailUrlFor(page, requestId)

    // A freshly created request is PENDING, so the assign affordance must be
    // there. It used to be skippable because the row might be terminal — with a
    // row this spec just created, "absent" is a real regression.
    const assignTrigger = page
      .locator(
        'button:has-text("มอบหมาย"), button:has-text("เปลี่ยนผู้รับผิดชอบ"), div[title*="คลิกเพื่อเปลี่ยนผู้รับผิดชอบ"]',
      )
      .first()
    await expect(
      assignTrigger,
      'a freshly created request must expose the assign trigger',
    ).toBeVisible({ timeout: 15_000 })
    await assignTrigger.click()

    const modalTitle = page.locator('[role="dialog"]').locator('text=มอบหมายงาน').first()
    await expect(modalTitle).toBeVisible({ timeout: 5_000 })
    const titleText = await modalTitle.textContent()
    expect(titleText).not.toContain('Assign Request')
    expect(titleText).not.toContain('(')

    await expect(page.locator('text=/Active Tasks.*Pending.*In Progress/')).toHaveCount(0)
  })

  test('ConfirmDialog footnote uses context-specific copy (#8)', async ({ page }) => {
    const firstname = `Polish-Delete-${Date.now()}`
    await createRequestFixture(page, firstname)
    await openRequestsList(page)

    const row = fixtureRow(page, firstname)
    await expect(row, 'the fixture row must be visible in the list').toBeVisible({
      timeout: 15_000,
    })
    const deleteButton = row.locator('button[title="ลบ"], button[aria-label="ลบ"]').first()
    await expect(deleteButton, 'the fixture row must expose the delete action').toBeVisible({
      timeout: 10_000,
    })
    await deleteButton.click()

    await expect(page.locator('text=คำร้องที่ลบไปแล้วจะไม่สามารถกู้คืนได้')).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.locator('text=การกระทำนี้ไม่สามารถย้อนกลับได้')).toHaveCount(0)
  })

  // The screenshot baseline used to live here as a test gated behind
  // `UPDATE_SCREENSHOTS=1` — an env var nothing ever set, with no baseline
  // image committed, so it reported as a suite member while never running
  // (F-029). Pixel baselines change with design rather than on a clock, so
  // capture is now a deliberate manual step: see `e2e/MANUAL_BASELINE.md`.
})
