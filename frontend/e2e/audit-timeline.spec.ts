import { expect, test, type Page, type Response, type TestInfo } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { gotoAdmin } from './utils/nav'
import { captureCsrf, createRequestFixture } from './utils/request-fixture'

/**
 * /admin/requests/[id] -- audit timeline (request-edit-audit-log PRD).
 *
 * Each test owns its request row. The detail and audit requests are matched to
 * that row before the tab is clicked: a 200 from audit alone says nothing about
 * the detail fetch that actually mounts the tablist.
 */

function caseName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Open a case detail page and prove the two independent reads for THIS case
 * landed. On failure attach a browser trace plus the observed statuses, since
 * the detail page deliberately swallows fetch errors.
 */
async function openCaseDetail(
  page: Page,
  requestId: number,
  testInfo: TestInfo,
): Promise<Response | null> {
  const detailPath = `/admin/requests/${requestId}`
  const detailStatus = { value: 'no response' as number | string }
  const auditStatus = { value: 'no response' as number | string }

  const detailResponse = page
    .waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/v1${detailPath}` &&
        r.request().method() === 'GET',
      { timeout: 15_000 },
    )
    .then(
      (r) => {
        detailStatus.value = r.status()
        return r
      },
      () => null,
    )
  const auditResponse = page
    .waitForResponse(
      (r) =>
        r.url().includes('/admin/audit/logs') &&
        r.url().includes(`resource_id=${requestId}`),
      { timeout: 15_000 },
    )
    .then(
      (r) => {
        auditStatus.value = r.status()
        return r
      },
      () => null,
    )

  // Playwright already traces retries (trace: 'on-first-retry'). Starting a
  // second recorder there throws and discards the runner's trace, so only own
  // tracing on the first attempt; retries get the automatic trace instead.
  const tracePath = testInfo.outputPath(`case-${requestId}-detail.zip`)
  const manualTrace = testInfo.retry === 0
  if (manualTrace) await page.context().tracing.start({ screenshots: true, snapshots: true })

  try {
    await gotoAdmin(page, detailPath)
    const [detailRes, auditRes] = await Promise.all([detailResponse, auditResponse])
    expect(detailRes?.status(), 'GET /admin/requests/:id must not error').toBe(200)
    await expect(page.getByRole('tablist', { name: 'รายละเอียดคำร้อง' })).toBeVisible({
      timeout: 15_000,
    })
    return auditRes
  } catch (error) {
    await testInfo.attach('case-detail-statuses', {
      body: JSON.stringify({ detailStatus: detailStatus.value, auditStatus: auditStatus.value }),
      contentType: 'application/json',
    })
    await testInfo.attach('case-detail-dom', {
      body: await page.locator('body').innerText().catch(() => '<unavailable>'),
      contentType: 'text/plain',
    })
    if (manualTrace) {
      await page.context().tracing.stop({ path: tracePath })
      await testInfo.attach('case-detail-failure-trace', { path: tracePath })
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`detail status=${detailStatus.value} audit status=${auditStatus.value}: ${reason}`)
  } finally {
    if (manualTrace && page.context().tracing) {
      await page.context().tracing.stop().catch(() => {})
    }
  }
}

test.describe('Request detail -- audit timeline', () => {
  // CI runs two workers. Login plus the two case-matched reads can exceed the
  // suite-wide 30s cap even when every response is 200; keep the assertions
  // strict and give slow runs enough time to reach them.
  test.describe.configure({ timeout: 60_000 })

  test.beforeEach(async ({ page }) => {
    // captureCsrf must be installed before login so the fixture can post.
    captureCsrf(page)
    await loginAsAdmin(page)
  })

  test('comments tab renders the merged timeline without crashing', async ({ page }, testInfo) => {
    const requestId = await createRequestFixture(page, caseName('AuditCase'))
    const auditRes = await openCaseDetail(page, requestId, testInfo)

    expect(auditRes?.status(), 'GET /admin/audit/logs must not error').toBe(200)

    await page.getByRole('tab', { name: /การดำเนินงาน/ }).click()
    await expect(page.locator('#panel-comments')).toBeVisible({ timeout: 10_000 })

    // A fresh fixture has no history, so the empty state proves the merged
    // timeline mounted without breaking the tab. The mutation test below
    // proves an audit row renders through the same pipeline.
    const emptyState = page.getByText('ยังไม่มีประวัติการดำเนินงาน')
    const anyEntry = page.locator('#panel-comments .relative.group').first()
    await expect(emptyState.or(anyEntry)).toBeVisible({ timeout: 10_000 })
  })

  test('editing a contact field surfaces an audit entry in the timeline', async ({ page }, testInfo) => {
    test.skip(
      process.env.E2E_ALLOW_MUTATION !== '1',
      'mutates the shared dev DB; run locally with E2E_ALLOW_MUTATION=1 for UAT'
    )

    const requestId = await createRequestFixture(page, caseName('AuditEdit'), {
      phone_number: '0899999999',
    })
    const auditRes = await openCaseDetail(page, requestId, testInfo)
    expect(auditRes?.status(), 'GET /admin/audit/logs must not error').toBe(200)

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

    // The audit entry must appear in the merged timeline. A phone edit is a
    // contact-tab field, so the scope badge reads "แก้ไขข้อมูลผู้ติดต่อ".
    await page.getByRole('tab', { name: /การดำเนินงาน/ }).click()
    await expect(page.locator('#panel-comments')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('แก้ไขข้อมูลผู้ติดต่อ').first()).toBeVisible({ timeout: 10_000 })
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

  test('distinguishes a transient detail error from a missing case', async ({ page }) => {
    const requestId = await createRequestFixture(page, caseName('AuditRetry'))
    const isDetail = (url: URL) =>
      url.pathname === `/api/v1/admin/requests/${requestId}` && url.search === ''
    let failUntilRetry = true

    await page.route(isDetail, async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      if (failUntilRetry) {
        await route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary' })
        return
      }
      await route.continue()
    })

    await gotoAdmin(page, `/admin/requests/${requestId}`)
    await expect(page.getByText('ไม่สามารถโหลดข้อมูลคำร้อง')).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(() => page.evaluate(() => document.body.innerText.includes('ไม่สามารถโหลดข้อมูลคำร้อง')))
      .toBe(true)
    failUntilRetry = false
    await page.getByRole('button', { name: 'ลองใหม่' }).click()
    await expect(page.getByRole('tablist', { name: 'รายละเอียดคำร้อง' })).toBeVisible({
      timeout: 15_000,
    })

    await page.unroute(isDetail)
    const missingId = requestId + 1_000_000
    await page.route(
      (url) => url.pathname === `/api/v1/admin/requests/${missingId}`,
      (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
    )
    await gotoAdmin(page, `/admin/requests/${missingId}`)
    await expect(page.getByText('ไม่พบข้อมูลคำร้อง')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'ลองใหม่' })).toHaveCount(0)
  })
})
