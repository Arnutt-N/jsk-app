import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

test.describe('Cookie Auth Flow (PR 2C)', () => {
  test('login sets HttpOnly cookies, not localStorage tokens', async ({ page }) => {
    await loginAsAdmin(page)

    const cookies = await page.context().cookies()
    const cookieNames = cookies.map((c) => c.name)
    expect(cookieNames).toContain('access_token')
    expect(cookieNames).toContain('csrf_token')

    const accessToken = cookies.find((c) => c.name === 'access_token')
    expect(accessToken?.httpOnly).toBe(true)

    const localStorageToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(localStorageToken).toBeNull()
  })

  test('admin API requests use cookies without Authorization header', async ({ page }) => {
    await loginAsAdmin(page)

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/v1/admin/') && res.status() === 200),
      page.goto('/admin/requests'),
    ])

    const request = response.request()
    expect(request.headers()['authorization']).toBeUndefined()
  })

  test('logout clears cookies and redirects to /login', async ({ page }) => {
    await loginAsAdmin(page)

    const cookiesBefore = await page.context().cookies()
    expect(cookiesBefore.some((c) => c.name === 'access_token')).toBe(true)

    const logoutButton = page.locator(
      'button:has-text("ออกจากระบบ"), button:has-text("Logout"), a:has-text("ออกจากระบบ")',
    ).first()

    if (await logoutButton.isVisible()) {
      await logoutButton.click()
    } else {
      const menuButton = page.locator('[data-testid="user-menu"], button[aria-haspopup="menu"]').first()
      if (await menuButton.isVisible()) {
        await menuButton.click()
        await page.locator('text=ออกจากระบบ').first().click()
      }
    }

    // The logout now asks for confirmation first (ยืนยัน / ยกเลิก).
    await page.getByRole('button', { name: 'ยืนยัน' }).click()

    await page.waitForURL(/\/login/, { timeout: 10_000 })

    const cookiesAfter = await page.context().cookies()
    const authCookies = cookiesAfter.filter((c) =>
      ['access_token', 'refresh_token', 'csrf_token'].includes(c.name),
    )
    expect(authCookies).toHaveLength(0)
  })

  test('unauthenticated admin access redirects to /login after logout', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/requests')
    await expect(page.locator('a[href*="/admin/requests"]').first()).toBeVisible()

    await page.context().clearCookies()
    await page.goto('/admin/requests')
    await page.waitForURL(/\/login/, { timeout: 10_000 })
  })
})
