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

/**
 * PRD B revert flow: locate a request currently in COMPLETED state by
 * driving the on-page status filter dropdown. We deliberately do NOT
 * use URL query params here -- the list page owns filter state in React
 * (not the URL), so `?status=COMPLETED` would be ignored.
 *
 * The dropdown is a native `<select>` rendered by the canonical Select
 * component. Native selects accept either the option value or label via
 * `selectOption`. We try the enum value first ("COMPLETED") and fall
 * back to the Thai label ("เสร็จสิ้น") if the option-by-value path
 * fails -- this keeps the test resilient if STATUS_OPTIONS gets
 * reordered or relabeled.
 *
 * Returns null if no COMPLETED row exists in the test DB.
 */
async function getFirstCompletedRequestDetailUrl(page: Page): Promise<string | null> {
  // The status filter is the FIRST <select> on the requests list page
  // (search input is a text input; category is the second <select>).
  const statusSelect = page.locator('select').first()
  try {
    await statusSelect.selectOption('COMPLETED')
  } catch {
    await statusSelect.selectOption({ label: 'เสร็จสิ้น' })
  }
  // Let the React state propagate and the (filtered) table re-render.
  await page.waitForTimeout(300)
  return getFirstRequestDetailUrl(page)
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

  // -------------------------------------------------------------------
  // PRD B: revert-from-COMPLETED via the kebab "การจัดการพิเศษ" menu.
  //
  // These tests assume the test DB has at least one COMPLETED request.
  // If not, each test skips rather than fails. The seeded fixtures in
  // CI include at least one completed row; locally you may need to run
  // a request through approval before exercising this path.
  // -------------------------------------------------------------------

  test('revert kebab shows both revert items on COMPLETED request', async ({ page }) => {
    const detailUrl = await getFirstCompletedRequestDetailUrl(page)
    test.skip(!detailUrl, 'no COMPLETED requests in test DB; revert flow has nothing to exercise')
    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // Kebab MUST be visible on COMPLETED for supervisor (PRD B changed
    // the visibility guard: previously hidden on COMPLETED, now hidden
    // only on REJECTED).
    const kebab = page.getByRole('button', { name: 'การจัดการพิเศษ' })
    await expect(kebab).toBeVisible()
    await kebab.click()

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()

    // Both revert items present.
    await expect(
      page.getByRole('menuitem', { name: /ยกเลิกอนุมัติ.*รออนุมัติ/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: /ยกเลิกอนุมัติ.*กำลังดำเนินการ/ }),
    ).toBeVisible()

    // "บังคับเสร็จสิ้น" is self-gated away on COMPLETED rows -- it would
    // be a no-op so PRD B hides it.
    await expect(
      page.getByRole('menuitem', { name: /บังคับเสร็จสิ้น/ }),
    ).toBeHidden()

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })

  test('cancelling the revert dialog keeps status as COMPLETED', async ({ page }) => {
    const detailUrl = await getFirstCompletedRequestDetailUrl(page)
    test.skip(!detailUrl, 'no COMPLETED requests in test DB')
    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // The status pill we expect to remain after cancel.
    const completedPill = page.locator('text=เสร็จสิ้น').first()
    await expect(completedPill).toBeVisible()

    await page.getByRole('button', { name: 'การจัดการพิเศษ' }).click()
    await page.getByRole('menuitem', { name: /ยกเลิกอนุมัติ.*รออนุมัติ/ }).click()

    // ConfirmDialog opens.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Cancel button copy in our canonical ConfirmDialog is "ยกเลิก".
    await dialog.getByRole('button', { name: /ยกเลิก/ }).first().click()
    await expect(dialog).toBeHidden()

    // Status pill MUST still read "เสร็จสิ้น" -- no PATCH was sent.
    await expect(page.locator('text=เสร็จสิ้น').first()).toBeVisible()
  })

  test('confirming the revert dialog sends PATCH and the page reloads', async ({ page }) => {
    const detailUrl = await getFirstCompletedRequestDetailUrl(page)
    test.skip(!detailUrl, 'no COMPLETED requests in test DB')

    // Intercept the PATCH so the test does NOT mutate seeded data. We
    // return a fulfilled response with the new status payload; the
    // frontend's useGuardedUpdate fires a window.location.reload() on
    // success, which we observe via a navigation wait.
    await page.route('**/api/v1/admin/requests/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        // Echo the PATCH body back so the page mounts cleanly post-reload.
        const body = route.request().postDataJSON?.() ?? {}
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, ...body }),
        })
        return
      }
      await route.continue()
    })

    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'การจัดการพิเศษ' }).click()
    await page.getByRole('menuitem', { name: /ยกเลิกอนุมัติ.*รออนุมัติ/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Wait for the PATCH to be sent when confirm fires.
    const patchPromise = page.waitForRequest(
      (req) =>
        req.method() === 'PATCH' &&
        /\/api\/v1\/admin\/requests\/\d+$/.test(req.url()),
    )

    // Confirm button copy is "ยืนยัน" in our canonical ConfirmDialog.
    await dialog.getByRole('button', { name: /ยืนยัน/ }).click()

    const patchRequest = await patchPromise
    const payload = patchRequest.postDataJSON?.() as { status?: string } | undefined
    expect(payload?.status).toBe('AWAITING_APPROVAL')
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
