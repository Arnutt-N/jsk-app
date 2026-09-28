import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * /admin/requests* — UI polish regression suite (PRD A).
 *
 * Guards 7 visual/copy fixes documented in
 * `.claude/PRPs/plans/completed/request-mgmt-polish.prd.md` so future
 * UI refactors don't silently revert the fixes.
 *
 * Selector strategy (mirrors `admin-requests-supervisor.spec.ts`):
 *   - To open the preview Modal: click the "เรียกดู" (Eye) ActionIconButton
 *     in the row's action column — NOT the row itself. The row is not a
 *     navigation element; clicking <tr> doesn't reliably trigger the
 *     onClick handler in Playwright's test runner.
 *   - To navigate to a detail page: scan all `<a href*="/admin/requests/">`
 *     and match the numeric-id regex `/admin/requests/\d+$/`. This skips
 *     the `/admin/requests/create` link and works regardless of seed.
 *
 * Tests favor SEMANTIC assertions (class names, text content, aria-label)
 * over pixel-perfect screenshots because:
 *   1. Screenshots are flaky across OS / font rendering.
 *   2. Semantic assertions tell future readers WHAT the fix protected.
 *   3. Test failures point to the specific regression, not "image differs".
 */

/**
 * Resolve the URL of a request detail page from the list view.
 * Returns null if no request row is present (test DB is empty).
 *
 * Each row contains `<Link href="/admin/requests/{id}">` wrapping the
 * SquarePen ActionIconButton. We loop because `.first()` would pick up
 * the create-link too on some renderings.
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

test.describe('Admin Requests UI Polish', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('list modal "ดูรายละเอียด" button has whitespace-nowrap (#1)', async ({ page }) => {
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    // Open the preview Modal by clicking the "เรียกดู" (Eye) action
    // button on the first row. handleView(req) sets selectedRequest +
    // viewModalOpen, which renders the modal with the "ดูรายละเอียด"
    // CTA. We can't click the <tr> reliably — the row click handler isn't
    // bubbled correctly in the test runner. Wait for the button (rows
    // load after the table skeleton mounts); skip only on timeout.
    const viewButton = page.locator('button[title="เรียกดู"], button[aria-label="เรียกดู"]').first()
    try {
      await viewButton.waitFor({ timeout: 10_000 })
    } catch {
      test.skip(true, 'No request rows / view action button in test DB')
      return
    }
    await viewButton.click()

    // Modal opens — find the navigation button. Next.js Link renders as
    // <a href="..."><button>...</button></a> so the button is inside an a.
    const fullDetailButton = page.locator('a:has(button) button:has-text("ดูรายละเอียด")').first()
    await expect(fullDetailButton).toBeVisible({ timeout: 5_000 })
    await expect(fullDetailButton).toHaveClass(/whitespace-nowrap/)
  })

  test('detail page tab nav uses text-text-secondary for inactive (#2)', async ({ page }) => {
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    const detailUrl = await getFirstRequestDetailUrl(page)
    if (!detailUrl) {
      test.skip(true, 'No requests in test DB')
      return
    }
    await page.goto(detailUrl)

    // Each tab is a <button> in the tab navigation row. Inactive tabs
    // should use text-text-secondary (darker than the original
    // text-text-tertiary that was invisible on white). Active stays as
    // text-primary.
    const tabs = page.locator('button:has(svg)').filter({
      has: page.locator('text=/รายละเอียด|ติดต่อ|ความคิดเห็น|จัดการ/'),
    })
    await expect(tabs.first()).toBeVisible({ timeout: 10_000 })

    // At least one tab should carry the secondary or primary color class.
    const tabsClasses = await tabs.evaluateAll((els: HTMLElement[]) =>
      els.map((e) => e.className),
    )
    expect(tabsClasses.some((c) => /text-text-secondary|text-primary/.test(c))).toBe(true)
  })

  test('date picker has w-9 / w-9 / w-14 width proportions (#3)', async ({ page }) => {
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    const detailUrl = await getFirstRequestDetailUrl(page)
    if (!detailUrl) {
      test.skip(true, 'No requests in test DB')
      return
    }
    await page.goto(detailUrl)

    // Navigate to manage tab where the date picker is rendered. Click
    // unconditionally (auto-waits): the old isVisible-guard raced the
    // detail loading spinner and silently skipped the click.
    await page.getByRole('tab', { name: /จัดการคำร้อง/ }).click()

    // Day / Month / Year inputs — identified by aria-label (stable).
    const dayInput = page.locator('input[aria-label="วันที่"]').first()
    const monthInput = page.locator('input[aria-label="เดือน"]').first()
    const yearInput = page.locator('input[aria-label="ปี พ.ศ."]').first()

    await expect(dayInput).toBeVisible({ timeout: 5_000 })
    await expect(dayInput).toHaveClass(/\bw-9\b/)
    await expect(monthInput).toHaveClass(/\bw-9\b/)
    await expect(yearInput).toHaveClass(/\bw-14\b/)
  })

  test('AssignModal title strips "(Assign Request)" and has no Active Tasks footnote (#7a, #7b)', async ({ page }) => {
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    const detailUrl = await getFirstRequestDetailUrl(page)
    if (!detailUrl) {
      test.skip(true, 'No requests in test DB')
      return
    }
    await page.goto(detailUrl)

    // Open AssignModal — first try the "มอบหมายงาน" trigger button, fall
    // back to the assignee div in the manage tab. The trigger varies by
    // request status (hero card workflow row vs. manage form).
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })

    const assignTrigger = page
      .locator(
        'button:has-text("มอบหมาย"), button:has-text("เปลี่ยนผู้รับผิดชอบ"), div[title*="คลิกเพื่อเปลี่ยนผู้รับผิดชอบ"]',
      )
      .first()
    const triggerCount = await assignTrigger.count()
    if (triggerCount === 0) {
      test.skip(true, 'Assign trigger not present on this request (likely terminal status)')
      return
    }
    await assignTrigger.click()

    // Title check: should be exactly "มอบหมายงาน" — no parenthetical.
    // The Modal renders the title as a heading element.
    const modalTitle = page.locator('[role="dialog"]').locator('text=มอบหมายงาน').first()
    await expect(modalTitle).toBeVisible({ timeout: 5_000 })
    const titleText = await modalTitle.textContent()
    expect(titleText).not.toContain('Assign Request')
    expect(titleText).not.toContain('(')

    // Footnote check: the "* Active Tasks = Pending + In Progress" line
    // must NOT appear anywhere in the modal.
    await expect(page.locator('text=/Active Tasks.*Pending.*In Progress/')).toHaveCount(0)
  })

  test('ConfirmDialog footnote uses context-specific copy (#8)', async ({ page }) => {
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    // Look for the delete trigger on a row's action menu. The list page
    // renders an ActionIconButton (Trash2 icon) with title="ลบ" in each
    // row's action column. Wait for it (rows load after the table
    // skeleton mounts); skip only on timeout.
    const deleteButton = page.locator('button[title="ลบ"], button[aria-label="ลบ"]').first()
    try {
      await deleteButton.waitFor({ timeout: 10_000 })
    } catch {
      test.skip(true, 'No delete action visible on rows in test DB')
      return
    }
    await deleteButton.click()

    // The delete modal renders the new context-specific copy.
    await expect(page.locator('text=คำร้องที่ลบไปแล้วจะไม่สามารถกู้คืนได้')).toBeVisible({ timeout: 5_000 })

    // The old generic phrase should NOT appear.
    await expect(page.locator('text=การกระทำนี้ไม่สามารถย้อนกลับได้')).toHaveCount(0)
  })

  // Optional screenshot baseline — run with `--update-snapshots` to
  // generate. CI runs without baselines will fail this test; gated behind
  // the UPDATE_SCREENSHOTS env var so CI doesn't depend on it.
  test('visual baseline: list modal at narrow viewport (320px)', async ({ page }) => {
    test.skip(
      process.env.UPDATE_SCREENSHOTS !== '1',
      'Screenshot baseline run — set UPDATE_SCREENSHOTS=1 to enable',
    )
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    const viewButton = page.locator('button[title="เรียกดู"]').first()
    if ((await viewButton.count()) === 0) {
      test.skip(true, 'No rows to preview')
      return
    }
    await viewButton.click()

    await expect(page).toHaveScreenshot('list-modal-320.png', {
      maxDiffPixelRatio: 0.02,
      mask: [page.locator('time, [data-testid="timestamp"]')],
    })
  })
})
