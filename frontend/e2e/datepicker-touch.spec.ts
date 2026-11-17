import { expect, test, devices } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { gotoAdmin } from './utils/nav'

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
    await gotoAdmin(page, '/admin/requests')
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

    // The year-complete fill already commits, so no blur is needed here. A
    // manual blur would fire a second validateAndUpdate and refetch, which
    // moves the row under the clear tap.
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
    // Escape-proof: Radix Portal wraps content in a plain div, so the
    // direct parent is a DIV. What matters is that no clipping ancestor
    // (overflow hidden/clip/scroll/auto) sits between the popup and BODY.
    const clipped = await dialog.evaluate((el) => {
      let n = el.parentElement
      while (n && n.tagName !== 'BODY') {
        const overflow = getComputedStyle(n).overflow
        if (overflow !== 'visible') return true
        n = n.parentElement
      }
      return false
    })
    expect(clipped).toBe(false)

    await page.keyboard.press('Escape')
    // Wait for the dialog to detach. The old force:true tap masked a real
    // instability: the blur after the year-complete fill fired a second
    // onChange and refetch, which moved the row under the clear tap. The
    // blur-commit is gone now, so the layout is stable and the tap can be
    // checked normally.
    await expect(dialog).toHaveCount(0)
    await clear.tap()
    await expect(day).toHaveValue('')
    await expect(page.getByLabel('ล้างวันที่')).toHaveCount(0)

    const group = page.locator('div.flex.w-full', { has: day }).first()
    const box = await group.boundingBox()
    expect(box).not.toBeNull()

    // The admin main flex item used to grow to 526px inside a 412px viewport,
    // letting the sticky header cover the clear button during tap. Assert no
    // document overflow, then that the row still fills most of its card.
    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
    const cardContent = await group.evaluate((el) => {
      const card = el.closest('.p-4')
      return card ? card.getBoundingClientRect().width : 0
    })
    expect(box!.width).toBeGreaterThan(cardContent * 0.7)
  })
})
