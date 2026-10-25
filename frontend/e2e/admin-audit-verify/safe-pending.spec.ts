import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'
import { gotoAdmin } from '../utils/nav'
import { captureCsrf, createRequestFixture } from '../utils/request-fixture'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

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

test.describe('SAFE-01 both logouts confirm first', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('sidebar logout is a button that asks before signing out', async ({ page }) => {
    await loginAsAdmin(page)
    await gotoAdmin(page, '/admin')

    const sidebarLogout = page.locator('aside button[aria-label="ออกจากระบบ"]')
    await expect(sidebarLogout).toBeVisible()
    const tagName = await sidebarLogout.evaluate((el) => el.tagName)
    expect(tagName).toBe('BUTTON')

    await sidebarLogout.click()
    await expect(page.getByRole('heading', { name: 'ต้องการออกจากระบบหรือไม่?' })).toBeVisible()
    await page.screenshot({ path: `${EVIDENCE}/safe-01-sidebar-logout.png` })

    await page.getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(page).toHaveURL(/\/admin/)

    await sidebarLogout.click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await page.waitForURL(/\/login/, { timeout: 60_000 })
  })
})

test.describe('SAFE-02 dialog stays open while delete is pending', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Escape does not close the confirm dialog mid-request', async ({ page }) => {
    await page.route('**/admin/requests/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await new Promise((r) => setTimeout(r, 1200))
        await route.abort()
        return
      }
      await route.continue()
    })
    await openDeleteDialog(page)

    await page.getByRole('button', { name: 'ยืนยันลบ' }).click()
    await expect(page.getByText('กำลังทำรายการ ปิดหน้าต่างนี้ไม่ได้ยกเลิกคำสั่ง')).toBeVisible()
    await page.waitForTimeout(400)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'ยืนยันการลบ' })).toBeVisible({ timeout: 5_000 })
    await page.screenshot({ path: `${EVIDENCE}/safe-02-escape-blocked.png` })
  })

  test('backdrop click does not close the confirm dialog mid-request', async ({ page }) => {
    await page.route('**/admin/requests/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await new Promise((r) => setTimeout(r, 1200))
        await route.abort()
        return
      }
      await route.continue()
    })
    await openDeleteDialog(page)

    await page.getByRole('button', { name: 'ยืนยันลบ' }).click()
    await page.waitForTimeout(400)
    await page.mouse.click(40, 400)
    await expect(page.getByRole('heading', { name: 'ยืนยันการลบ' })).toBeVisible({ timeout: 5_000 })
    await page.screenshot({ path: `${EVIDENCE}/safe-02-backdrop-blocked.png` })
  })
})

test.describe('SAFE-03 double confirm sends one DELETE', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('fast double-click is deduped by the pending guard', async ({ page }) => {
    let deleteCount = 0
    await page.route('**/admin/requests/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCount += 1
        await new Promise((r) => setTimeout(r, 800))
      }
      await route.continue()
    })
    await openDeleteDialog(page)

    await page.getByRole('button', { name: 'ยืนยันลบ' }).dblclick()
    await page.waitForResponse(
      (res) => res.url().includes('/admin/requests/') && res.request().method() === 'DELETE',
      { timeout: 15_000 },
    )
    await page.waitForTimeout(1500)
    expect(deleteCount).toBe(1)
    await page.screenshot({ path: `${EVIDENCE}/safe-03-double-delete.png` })
  })
})
