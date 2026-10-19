import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/** /admin/bookings calendar tab: month grid, day-click filters the list. */
test.describe('Bookings calendar view', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/bookings')
  })

  test('shows list/calendar tabs and opens the month grid', async ({ page }) => {
    const tabs = page.getByRole('tablist', { name: 'มุมมองคิวนัดหมาย' })
    await expect(tabs).toBeVisible()
    await expect(page.getByRole('tab', { name: 'รายการ' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.getByRole('tab', { name: 'ปฏิทิน' }).click()
    await expect(page.getByRole('tab', { name: 'ปฏิทิน' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('group', { name: 'วันในเดือน' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'คำอธิบายสี' })).toBeVisible()
  })

  test('clicking a day filters the list to that date', async ({ page }) => {
    await page.getByRole('tab', { name: 'ปฏิทิน' }).click()
    const grid = page.getByRole('group', { name: 'วันในเดือน' })
    await expect(grid).toBeVisible()
    const first = grid.getByRole('button', { name: /^1 / }).first()
    await first.click()
    await expect(page.getByRole('tab', { name: 'รายการ' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('button', { name: 'ล้างวันที่' }).first()).toBeVisible()
  })

  test('month navigation keeps the grid on screen', async ({ page }) => {
    await page.getByRole('tab', { name: 'ปฏิทิน' }).click()
    const grid = page.getByRole('group', { name: 'วันในเดือน' })
    await expect(grid).toBeVisible()
    await page.getByRole('button', { name: 'เดือนถัดไป' }).click()
    await expect(grid).toBeVisible()
    await page.getByRole('button', { name: 'เดือนก่อนหน้า' }).click()
    await expect(grid).toBeVisible()
  })
})
