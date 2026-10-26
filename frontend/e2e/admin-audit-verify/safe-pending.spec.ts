import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'
import { gotoAdmin } from '../utils/nav'
import { captureCsrf, createRequestFixture } from '../utils/request-fixture'

const EVIDENCE = '../.audit/browser-verify'
const PENDING = 'กำลังดำเนินการ'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000, retries: 0 })

async function openDeleteDialog(page: Page) {
  captureCsrf(page)
  await loginAsAdmin(page)
  await createRequestFixture(page, `Del${Date.now()}`)
  await gotoAdmin(page, '/admin/requests')
  // Cold dev-server compile plus auth bootstrap can outlast the 10s default action timeout.
  const deleteButton = page.getByRole('button', { name: 'ลบ' }).first()
  await expect(deleteButton).toBeVisible({ timeout: 60_000 })
  await deleteButton.click()
  await expect(page.getByRole('heading', { name: 'ยืนยันการลบ' })).toBeVisible()
}

/** Holds every DELETE until the test releases it, so "pending" is a state, not a race. */
async function holdDeletes(page: Page) {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let count = 0
  await page.route('**/admin/requests/*', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue()
      return
    }
    count += 1
    await released
    await route.abort()
  })
  return { release, count: () => count }
}

test.describe('SAFE-01 both logouts confirm first', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('sidebar logout asks before signing out', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAdmin(page, '/admin')

    const sidebarLogout = page.locator('aside button[aria-label="ออกจากระบบ"]')
    await expect(sidebarLogout).toBeVisible()

    await sidebarLogout.click()
    const confirm = page.getByRole('heading', { name: 'ต้องการออกจากระบบหรือไม่?' })
    await expect(confirm).toBeVisible()
    await page.screenshot({ path: `${EVIDENCE}/safe-01-sidebar-logout.png` })

    await page.getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(confirm).toHaveCount(0)

    await sidebarLogout.click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await page.waitForURL(/\/login/, { timeout: 60_000 })
  })
})

test.describe('SAFE-02 dialog stays open while delete is pending', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Escape does not close the confirm dialog mid-request', async ({ page }) => {
    const held = await holdDeletes(page)
    await openDeleteDialog(page)

    await page.getByRole('button', { name: 'ยืนยันลบ' }).click()
    await expect(page.getByRole('status')).toContainText(PENDING)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'ยืนยันการลบ' })).toBeVisible()
    await page.screenshot({ path: `${EVIDENCE}/safe-02-escape-blocked.png` })
    held.release()
  })

  test('backdrop click does not close the confirm dialog mid-request', async ({ page }) => {
    const held = await holdDeletes(page)
    await openDeleteDialog(page)

    await page.getByRole('button', { name: 'ยืนยันลบ' }).click()
    await expect(page.getByRole('status')).toContainText(PENDING)

    await page.getByTestId('modal-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(page.getByRole('heading', { name: 'ยืนยันการลบ' })).toBeVisible()
    await page.screenshot({ path: `${EVIDENCE}/safe-02-backdrop-blocked.png` })
    held.release()
  })
})

test.describe('SAFE-03 double activate sends one DELETE', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('two clicks in one tick are deduped by the pending guard', async ({ page }) => {
    const held = await holdDeletes(page)
    await openDeleteDialog(page)

    // Two clicks before React can re-render: the state guard alone would miss this,
    // the ref guard is what has to hold.
    await page.getByRole('button', { name: 'ยืนยันลบ' }).evaluate((el) => {
      const button = el as HTMLElement
      button.click()
      button.click()
    })
    await expect(page.getByRole('status')).toContainText(PENDING)
    await page.waitForTimeout(500)
    expect(held.count()).toBe(1)
    await page.screenshot({ path: `${EVIDENCE}/safe-03-double-delete.png` })
    held.release()
  })
})
