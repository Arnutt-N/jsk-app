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
 *   - API-seed one normal + one COMPLETED request per test (beforeEach)
 *     with unique per-run topic markers; delete them in afterEach.
 *   - Navigate to /admin/requests, find the first row's link, and goto
 *     it directly. We don't click the row because the table row's link
 *     is on a nested cell and `<tr>.click()` doesn't reliably bubble to
 *     a navigation in the test runner.
 *   - Seeded rows guarantee at least one normal + one COMPLETED request,
 *     so no test skips on an empty DB (empty state stays covered by the
 *     list-page spec).
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
  // Wait for row links to render: the table skeleton mounts before the
  // list API responds, so an immediate scan would see zero rows and
  // wrongly report an empty DB (cold-start skip flake).
  try {
    await page.waitForFunction(
      () => {
        const anchors = document.querySelectorAll('a[href*="/admin/requests/"]')
        return Array.from(anchors).some((a) =>
          /\/admin\/requests\/\d+$/.test(a.getAttribute('href') || ''),
        )
      },
      null,
      { timeout: 10_000 },
    )
  } catch {
    return null
  }
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
  // A5 seed: one normal + one COMPLETED request via the admin API so the
  // journey tests below never skip on an empty DB. The topic marker is
  // unique per worker process, keeping parallel CI shards from colliding.
  const runMarker = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const seededIds: number[] = []

  async function seedRequest(page: Page, status: 'PENDING' | 'COMPLETED'): Promise<void> {
    const topic = `E2E-A5-${runMarker}-${status}`
    const createResp = await page.request.post('/api/v1/admin/requests', {
      data: {
        topic_category: topic,
        description: `Seeded by admin-requests-supervisor.spec.ts (${runMarker})`,
        firstname: 'E2E',
        lastname: status,
      },
    })
    if (!createResp.ok()) {
      throw new Error(`seed POST failed: ${createResp.status()} ${await createResp.text()}`)
    }
    const created = await createResp.json()
    if (status === 'COMPLETED') {
      // Admin holds the override grant, so the direct PENDING -> COMPLETED
      // jump is accepted and recorded as a forced transition.
      const patchResp = await page.request.patch(`/api/v1/admin/requests/${created.id}`, {
        data: { status: 'COMPLETED' },
      })
      if (!patchResp.ok()) {
        throw new Error(`seed PATCH failed: ${patchResp.status()} ${await patchResp.text()}`)
      }
    }
    seededIds.push(created.id)
  }

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    await seedRequest(page, 'PENDING')
    await seedRequest(page, 'COMPLETED')
  })

  test.afterEach(async ({ page }) => {
    for (const id of seededIds.splice(0)) {
      try {
        await page.request.delete(`/api/v1/admin/requests/${id}`)
      } catch {
        // Best-effort cleanup; a failed delete must not fail the test.
      }
    }
  })

  test('hero card renders supervisor-tier workflow buttons', async ({ page }) => {
    const detailUrl = await getFirstRequestDetailUrl(page)
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
    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // The kebab is hidden on terminal-state requests (COMPLETED/REJECTED).
    // If it isn't there, skip the menu test rather than fail.
    const kebab = page.getByRole('button', { name: 'ตัวเลือกเพิ่มเติม' })
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
    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // Switch to manage tab where the pills live (tabs use role="tab").
    const manageTab = page.getByRole('tab', { name: /จัดการคำร้อง/ })
    await manageTab.click()

    // Status chips must fit inside the manage card (no horizontal
    // overflow). Assert against the CARD box, not raw viewport
    // coordinates: the tab click's scrollIntoView can leave the document
    // scrolled, which shifts viewport-relative boxes without any real
    // overflow.
    const panel = page.locator('#panel-manage')
    await expect(panel).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    const panelBox = await panel.boundingBox()
    expect(panelBox).not.toBeNull()
    const chips = panel.locator('div.flex.flex-wrap').first().locator('button')
    await expect(chips.first()).toBeVisible()
    expect(await chips.count()).toBe(6)
    for (let i = 0; i < 6; i++) {
      const box = await chips.nth(i).boundingBox()
      expect(box).not.toBeNull()
      if (box && panelBox) {
        expect(box.x).toBeGreaterThanOrEqual(panelBox.x - 1)
        expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1)
      }
    }
  })

  // -------------------------------------------------------------------
  // PRD B: revert-from-COMPLETED via the kebab "ตัวเลือกเพิ่มเติม" menu.
  //
  // beforeEach seeds a COMPLETED row, so these tests always execute.
  // -------------------------------------------------------------------

  test('revert kebab shows both revert items on COMPLETED request', async ({ page }) => {
    const detailUrl = await getFirstCompletedRequestDetailUrl(page)
    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // Kebab MUST be visible on COMPLETED for supervisor (PRD B changed
    // the visibility guard: previously hidden on COMPLETED, now hidden
    // only on REJECTED).
    const kebab = page.getByRole('button', { name: 'ตัวเลือกเพิ่มเติม' })
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
    await page.goto(detailUrl!)
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    // The status pill we expect to remain after cancel.
    const completedPill = page.locator('text=เสร็จสิ้น').first()
    await expect(completedPill).toBeVisible()

    await page.getByRole('button', { name: 'ตัวเลือกเพิ่มเติม' }).click()
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

  test('confirming the revert dialog sends PATCH and flips the status pill', async ({ page }) => {
    const detailUrl = await getFirstCompletedRequestDetailUrl(page)
    const id = detailUrl!.split('/').pop()!

    // Baseline: real backend GET on page load; capture BEFORE installing fulfills.
    const [detailResp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'GET' && r.url().endsWith(`/api/v1/admin/requests/${id}`)),
      page.goto(detailUrl!),
    ])
    const baseline = await detailResp.json()
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=เสร็จสิ้น').first()).toBeVisible()

    // Fulfill PATCH (no backend mutation) + the follow-up GET refetch with reverted state.
    await page.route(`**/api/v1/admin/requests/${id}`, async (route) => {
      const req = route.request()
      if (req.method() === 'PATCH') {
        const body = req.postDataJSON?.() ?? {}
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true, ...body }) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...baseline, status: 'AWAITING_APPROVAL' }) })
    })

    await page.getByRole('button', { name: 'ตัวเลือกเพิ่มเติม' }).click()
    await page.getByRole('menuitem', { name: /ยกเลิกอนุมัติ.*รออนุมัติ/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const patchReqPromise = page.waitForRequest((r) =>
      r.method() === 'PATCH' && r.url().endsWith(`/api/v1/admin/requests/${id}`))
    const patchRespPromise = page.waitForResponse((r) =>
      r.request().method() === 'PATCH' && r.url().endsWith(`/api/v1/admin/requests/${id}`))
    await dialog.getByRole('button', { name: /ยืนยัน/ }).click()
    const patchReq = await patchReqPromise
    const patchResp = await patchRespPromise
    const payload = patchReq.postDataJSON?.() as { status?: string } | undefined
    expect(payload?.status).toBe('AWAITING_APPROVAL')
    expect(patchResp.ok()).toBe(true)
    await expect(page.locator('text=รออนุมัติ').first()).toBeVisible({ timeout: 10_000 })
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
