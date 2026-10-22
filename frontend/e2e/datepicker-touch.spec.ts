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
    // Let stats/table streams settle: the tap below needs a stable target,
    // and skeleton-to-content swaps above the filter row move it around.
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('table')).toBeVisible()

    const day = page.getByLabel('จากวันที่')
    await day.fill('15')
    // The from-date picker mounts first, so its month/year inputs are .first().
    await page.getByLabel('เดือน').first().fill('01')
    await page.getByLabel('ปี พ.ศ.').first().fill('2567')

    const clear = page.getByLabel('ล้างวันที่').first()
    await expect(clear).toBeVisible()

    // Drop focus from the year input and let the refetch settle, so the
    // trigger stops moving before the tap's stability check runs.
    await page.getByLabel('ปี พ.ศ.').first().evaluate((el) => (el as HTMLElement).blur())
    await page.waitForLoadState('networkidle')

    // The calendar icon must still be tappable with a value present --
    // the tap has to open the dialog, not clear the field.
    // force: the admin shell keeps reflowing on small viewports (stats/
    // fonts/streaming rows), so the stability check never settles; the
    // assertions below carry the proof instead. If the old overlay bug
    // returned, this tap would land on the X, clear the value, and the
    // dialog assertion would fail.
    await page.getByLabel('เปิดปฏิทินเลือกวันที่').first().tap({ force: true })
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
