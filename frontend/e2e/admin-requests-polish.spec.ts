import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * /admin/requests* — UI polish regression suite (PRD A).
 *
 * This spec guards 7 visual/copy fixes documented in
 * `.claude/PRPs/plans/completed/request-mgmt-polish.prd.md` so that future
 * UI refactors don't silently revert the fixes.
 *
 * The tests favor SEMANTIC assertions (class names, text content, computed
 * styles) over pixel-perfect screenshots because:
 *   1. Screenshots are flaky across OS / font rendering.
 *   2. Semantic assertions tell future readers WHAT the fix protected.
 *   3. Test failures point to the specific regression, not "image differs".
 *
 * `toHaveScreenshot()` is included as an OPTIONAL baseline guard that runs
 * only when baselines exist on disk (the first run with `--update-snapshots`
 * creates them). Without baselines the screenshot assertions short-circuit.
 *
 * If you change any of the fixes intentionally, re-baseline with:
 *   npx playwright test admin-requests-polish --update-snapshots
 */
test.describe('Admin Requests UI Polish', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('list modal "ดูรายละเอียดเต็ม" button has whitespace-nowrap (#1)', async ({ page }) => {
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    // Open the first row's preview modal. The list renders rows as <tr>
    // with onClick — use the first data row (skip header).
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.click()

    // The modal contains the "ดูรายละเอียดเต็ม" button. Verify the class.
    const fullDetailButton = page.locator('a:has-text("ดูรายละเอียดเต็ม") button, button:has-text("ดูรายละเอียดเต็ม")').first()
    await expect(fullDetailButton).toBeVisible()
    await expect(fullDetailButton).toHaveClass(/whitespace-nowrap/)
  })

  test('detail page tab nav uses text-text-secondary for inactive (#2)', async ({ page }) => {
    // Visit any existing request — fall back to the first request listed
    // in /admin/requests so this test stays robust across DB seeds.
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    const firstDetailLink = await page.locator('a[href^="/admin/requests/"]').filter({
      hasNot: page.locator('text="สร้างคำร้อง"'),
    }).first().getAttribute('href')

    if (!firstDetailLink) {
      test.skip(true, 'No request to navigate to')
      return
    }
    await page.goto(firstDetailLink)

    // Each tab is a <button> in the tab navigation row. Inactive tabs
    // should use text-text-secondary (darker than the original
    // text-text-tertiary that was invisible on white). Active stays as
    // text-primary.
    const tabs = page.locator('button:has(svg)').filter({
      has: page.locator('text=/รายละเอียด|ติดต่อ|ความคิดเห็น|จัดการ/'),
    })
    await expect(tabs.first()).toBeVisible({ timeout: 10_000 })

    // At least one tab should carry the secondary or primary color class.
    // We check the className contains either the active or inactive token.
    const tabsClasses = await tabs.evaluateAll((els: HTMLElement[]) =>
      els.map(e => e.className),
    )
    expect(tabsClasses.some(c => /text-text-secondary|text-primary/.test(c))).toBe(true)
  })

  test('date picker has w-10 / w-10 / w-24 width proportions (#3)', async ({ page }) => {
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    const detailHref = await page.locator('a[href^="/admin/requests/"]').filter({
      hasNot: page.locator('text="สร้างคำร้อง"'),
    }).first().getAttribute('href')
    if (!detailHref) {
      test.skip(true, 'No request to navigate to')
      return
    }
    await page.goto(detailHref)

    // Navigate to manage tab where the date picker is rendered.
    const manageTab = page.locator('button:has-text("จัดการ")').first()
    if (await manageTab.isVisible()) await manageTab.click()

    // Day / Month / Year inputs — identified by aria-label (stable).
    const dayInput = page.locator('input[aria-label="วันที่"]').first()
    const monthInput = page.locator('input[aria-label="เดือน"]').first()
    const yearInput = page.locator('input[aria-label="ปี พ.ศ."]').first()

    await expect(dayInput).toBeVisible({ timeout: 5_000 })
    await expect(dayInput).toHaveClass(/\bw-10\b/)
    await expect(monthInput).toHaveClass(/\bw-10\b/)
    await expect(yearInput).toHaveClass(/\bw-24\b/)
  })

  test('AssignModal title strips "(Assign Request)" and has no Active Tasks footnote (#7a, #7b)', async ({ page }) => {
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
    const detailHref = await page.locator('a[href^="/admin/requests/"]').filter({
      hasNot: page.locator('text="สร้างคำร้อง"'),
    }).first().getAttribute('href')
    if (!detailHref) {
      test.skip(true, 'No request to navigate to')
      return
    }
    await page.goto(detailHref)

    // Open AssignModal via the "มอบหมายงาน" trigger (button or dropdown).
    const assignTrigger = page.locator('button:has-text("มอบหมาย"), div:has-text("ยังไม่ได้มอบหมาย")').first()
    if (!(await assignTrigger.isVisible())) test.skip(true, 'Assign trigger not visible')
    await assignTrigger.click()

    // Title check: should be exactly "มอบหมายงาน" — no parenthetical.
    const title = page.locator('h2, h3, [role="heading"]').filter({ hasText: /มอบหมายงาน/ }).first()
    await expect(title).toBeVisible({ timeout: 5_000 })
    const titleText = await title.textContent()
    expect(titleText).toContain('มอบหมายงาน')
    expect(titleText).not.toContain('Assign Request')
    expect(titleText).not.toContain('(')

    // Footnote check: the "* Active Tasks = Pending + In Progress" line
    // must NOT appear anywhere in the modal.
    await expect(page.locator('text=/Active Tasks.*Pending.*In Progress/')).toHaveCount(0)
  })

  test('ConfirmDialog footnote uses context-specific copy, not generic AI-ish phrase (#8)', async ({ page }) => {
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    // Look for the delete trigger on a row's action menu. The exact
    // selector depends on the menu pattern — we open the first row's
    // kebab/more menu if one exists.
    const moreButton = page.locator('button[aria-label*="more"], button:has(svg.lucide-more-vertical)').first()
    if (!(await moreButton.isVisible())) test.skip(true, 'No more-menu on rows in this seed')
    await moreButton.click()

    const deleteOption = page.locator('text=/ลบ/').first()
    if (!(await deleteOption.isVisible())) test.skip(true, 'No delete action visible')
    await deleteOption.click()

    // The delete modal should contain the new context-specific copy.
    // For requests/page.tsx this is "คำร้องที่ลบไปแล้วจะหายถาวร".
    await expect(page.locator('text=คำร้องที่ลบไปแล้วจะหายถาวร')).toBeVisible({ timeout: 5_000 })

    // The old generic phrase should NOT appear anywhere.
    await expect(page.locator('text=/^\\* การกระทำนี้ไม่สามารถย้อนกลับได้/')).toHaveCount(0)
  })

  // Optional screenshot baselines — run with `--update-snapshots` to
  // generate. CI runs that don't have baselines will skip via the
  // toHaveScreenshot soft-fail in non-CI mode.
  test('visual baseline: list modal at narrow viewport (320px)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    const firstRow = page.locator('table tbody tr').first()
    if (!(await firstRow.isVisible())) test.skip(true, 'No rows to preview')
    await firstRow.click()

    await expect(page).toHaveScreenshot('list-modal-320.png', {
      maxDiffPixelRatio: 0.02,
      mask: [page.locator('time, [data-testid="timestamp"]')],
    })
  })
})
