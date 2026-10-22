import { expect, test, devices } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * Touch hardening for the shared Thai date picker (PR #287).
 *
 * Proves in a real mobile browser what jsdom cannot:
 *  1. tapping the calendar icon opens the Portal calendar (the old overlay
 *     bug made the same tap clear the value instead),
 *  2. the clear (X) is a separate tap target that empties the field,
 *  3. filter groups span the full row width on a narrow viewport.
 *
 * Read-only: typing a filter never writes server data.
 */
test.use({ ...devices['Pixel 7'] })

test.describe('datepicker touch behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/requests')
  })

  test('tap opens calendar, tap X clears, groups span full width', async ({ page }) => {
    const day = page.getByLabel('จากวันที่')
    await day.fill('15')
    // The from-date picker mounts first, so its month/year inputs are .first().
    await page.getByLabel('เดือน').first().fill('01')
    await page.getByLabel('ปี พ.ศ.').first().fill('2567')

    const clear = page.getByLabel('ล้างวันที่').first()
    await expect(clear).toBeVisible()

    // The calendar icon must still be tappable with a value present --
    // the tap has to open the dialog, not clear the field.
    await page.getByLabel('เปิดปฏิทินเลือกวันที่').first().tap()
    const dialog = page.getByRole('dialog', { name: 'ปฏิทิน พ.ศ.' })
    await expect(dialog).toBeVisible()
    const parentTag = await dialog.evaluate((el) => (el.parentElement as HTMLElement).tagName)
    expect(parentTag).toBe('BODY')

    await page.keyboard.press('Escape')
    await clear.tap()
    await expect(day).toHaveValue('')
    await expect(page.getByLabel('ล้างวันที่')).toHaveCount(0)

    const group = page.locator('div.flex.w-full', { has: day }).first()
    const box = await group.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(box!.width).toBeGreaterThan(viewport!.width - 60)
  })
})
