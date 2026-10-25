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

test.describe('SAFE-01 two logouts behave differently', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('sidebar logout is a no-confirm div, UserMenu asks first', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin')

    // UserMenu first: it must ask before signing out.
    await page.locator('button[aria-label="Open profile menu"]').click()
    await page.getByRole('menuitem', { name: 'ออกจากระบบ' }).click()
    await expect(page.getByRole('button', { name: 'ยืนยัน' })).toBeVisible()
    await page.screenshot({ path: `${EVIDENCE}/safe-01-usermenu-confirm.png` })
    await page.getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(page).toHaveURL(/\/admin/)

    // Sidebar logout is a plain div wired straight to logout().
    const sidebarLogout = page.locator('aside div.cursor-pointer').first()
    const tagName = await sidebarLogout.evaluate((el) => el.tagName)
    expect(tagName).toBe('DIV')
    await page.screenshot({ path: `${EVIDENCE}/safe-01-sidebar-logout.png` })

    await sidebarLogout.click()
    await page.waitForURL(/\/login/, { timeout: 15_000 })
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
