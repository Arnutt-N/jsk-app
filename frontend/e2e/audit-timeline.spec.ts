import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * /admin/requests/[id] -- audit timeline (request-edit-audit-log PRD).
 *
 * The "การดำเนินงาน/ความเห็น" tab now renders comments merged with
 * edit_request_details audit entries (violet bubbles, Thai field labels,
 * old -> new). The render-safety test always runs; the full
 * edit -> entry roundtrip mutates the shared dev DB, so it only runs
 * when E2E_ALLOW_MUTATION=1 (UAT / local verification).
 */

/**
 * Resolve the URL of the first request detail page from the list view.
 * Same approach as admin-requests-supervisor.spec.ts -- returns null
 * when the test DB has no request rows.
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

test.describe('Request detail -- audit timeline', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/requests')
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
  })

  test('comments tab renders the merged timeline without crashing', async ({ page }) => {
    const detailUrl = await getFirstRequestDetailUrl(page)
    test.skip(!detailUrl, 'no requests in test DB; nothing to render')
    await page.goto(detailUrl!)

    await page.getByRole('tab', { name: /การดำเนินงาน/ }).click()
    await expect(page.locator('#panel-comments')).toBeVisible({ timeout: 10_000 })

    // Either the empty state or at least one timeline entry must render.
    // This proves the merged comments+audit pipeline (fetchAuditLogs +
    // mergeTimeline + AuditTimelineEntry) mounted without breaking the tab.
    const emptyState = page.getByText('ยังไม่มีประวัติการดำเนินงาน')
    const anyEntry = page.locator('#panel-comments .relative.group').first()
    await expect(emptyState.or(anyEntry)).toBeVisible({ timeout: 10_000 })
  })

  test('editing a contact field surfaces an audit entry in the timeline', async ({ page }) => {
    test.skip(
      process.env.E2E_ALLOW_MUTATION !== '1',
      'mutates the shared dev DB; run locally with E2E_ALLOW_MUTATION=1 for UAT'
    )

    const detailUrl = await getFirstRequestDetailUrl(page)
    test.skip(!detailUrl, 'no requests in test DB; nothing to edit')
    await page.goto(detailUrl!)

    // Enter contact tab edit mode and flip the phone number.
    await page.getByRole('tab', { name: /ข้อมูลผู้ติดต่อ/ }).click()
    await page.getByRole('button', { name: 'แก้ไข' }).click()
    const phoneInput = page.locator('#edit-phone')
    await expect(phoneInput).toBeVisible()
    const original = await phoneInput.inputValue()
    const flipped = original === '0899999999' ? '0888888888' : '0899999999'
    await phoneInput.fill(flipped)
    await page.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByText('บันทึกข้อมูลผู้ติดต่อเรียบร้อย')).toBeVisible({ timeout: 10_000 })

    // The audit entry must appear in the merged timeline.
    await page.getByRole('tab', { name: /การดำเนินงาน/ }).click()
    await expect(page.locator('#panel-comments')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('แก้ไขข้อมูลคำร้อง').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('หมายเลขโทรศัพท์').first()).toBeVisible()
    await expect(page.getByText(flipped).first()).toBeVisible()

    // Best-effort revert so repeated runs don't drift the row's data
    // (each revert intentionally writes one more audit entry).
    await page.getByRole('tab', { name: /ข้อมูลผู้ติดต่อ/ }).click()
    await page.getByRole('button', { name: 'แก้ไข' }).click()
    await page.locator('#edit-phone').fill(original)
    await page.getByRole('button', { name: 'บันทึก' }).click()
    await expect(page.getByText('บันทึกข้อมูลผู้ติดต่อเรียบร้อย')).toBeVisible({ timeout: 10_000 })
  })
})
