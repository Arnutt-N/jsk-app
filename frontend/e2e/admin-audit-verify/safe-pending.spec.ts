import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from '../utils/auth'

const EVIDENCE = '../.audit/browser-verify'

// Dev-server compiles make first hits slow; fail loudly instead of retrying.
test.describe.configure({ timeout: 90_000 })

async function openDeleteDialog(page: Page) {
  await loginAsAdmin(page)
  await page.goto('/admin/requests', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'ลบ' }).first().click()
  await expect(page.getByRole('heading', { name: 'ยืนยันการลบ' })).toBeVisible()
}

test.describe('SAFE-01 both logouts confirm first', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('sidebar logout is a button that asks before signing out', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin')

    // Sidebar logout must be a real button, not a div.
    const sidebarLogout = page.locator('aside button[aria-label="ออกจากระบบ"]')
    await expect(sidebarLogout).toBeVisible()
    const tagName = await sidebarLogout.evaluate((el) => el.tagName)
    expect(tagName).toBe('BUTTON')

    // Clicking it asks first instead of signing out immediately.
    await sidebarLogout.click()
    await expect(page.getByRole('heading', { name: 'ต้องการออกจากระบบหรือไม่?' })).toBeVisible()
    await page.screenshot({ path: `${EVIDENCE}/safe-01-sidebar-logout.png` })

    // Cancelling keeps the session.
    await page.getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(page).toHaveURL(/\/admin/)

    // Confirming signs out to /login.
    await sidebarLogout.click()
    await page.getByRole('button', { name: 'ยืนยัน' }).click()
    await page.waitForURL(/\/login/, { timeout: 60_000 })
  })
})

test.describe('SAFE-02 dialog dismisses while delete is pending', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Escape closes the confirm dialog mid-request', async ({ page }) => {
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
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'ยืนยันการลบ' })).toBeHidden({ timeout: 5_000 })
    await page.screenshot({ path: `${EVIDENCE}/safe-02-escape-dismissed.png` })
  })

  test('backdrop click closes the confirm dialog mid-request', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: 'ยืนยันการลบ' })).toBeHidden({ timeout: 5_000 })
    await page.screenshot({ path: `${EVIDENCE}/safe-02-backdrop-dismissed.png` })
  })
})

test.describe('SAFE-03 double confirm sends two DELETEs', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('fast double-click is not deduped', async ({ page }) => {
    let deleteCount = 0
    await page.route('**/admin/requests/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCount += 1
      }
      await route.continue()
    })
    await openDeleteDialog(page)

    await page.getByRole('button', { name: 'ยืนยันลบ' }).dblclick()
    await page.waitForResponse(
      (res) => res.url().includes('/admin/requests/') && res.request().method() === 'DELETE',
      { timeout: 15_000 },
    )
    await page.waitForResponse(
      (res) => res.url().includes('/admin/requests/') && res.request().method() === 'DELETE',
      { timeout: 15_000 },
    )
    expect(deleteCount).toBe(2)
    await page.screenshot({ path: `${EVIDENCE}/safe-03-double-delete.png` })
  })
})
