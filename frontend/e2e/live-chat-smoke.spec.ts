import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * /admin/live-chat — smoke / regression baseline.
 *
 * Created as BLOCKER-3 of the live-chat audit-remediation plan review
 * (`.claude/PRPs/plans/PLAN-REVIEW-FIXES.md`). Its job is to give the 8
 * remediation phases a real "no regression" net: every phase plan claims
 * "Playwright smoke passes" but before this file NO spec touched
 * /admin/live-chat at all.
 *
 * Selector strategy (mirrors admin-requests-polish.spec.ts):
 *   - Prefer SEMANTIC assertions (roles, accessible names, text) over
 *     pixel screenshots — they say WHAT regressed and survive font/OS drift.
 *   - The conversation list is a `role="listbox"` of `role="option"` rows
 *     (audit confirmed the Listbox pattern). The composer is a `<textarea>`
 *     inside MessageInput; the Send button must have an accessible name
 *     after Phase 1 / H1 (that assertion is intentionally a separate test
 *     so it flips green when H1 lands and red if H1 later regresses).
 *
 * Data-dependence: a fresh/empty DB has no conversations. Interaction
 * tests that need a conversation resolve it defensively and `skip()` when
 * none exists — same approach as the requests suite — so the suite is
 * green on an empty seed and still guards behavior when data is present.
 *
 * NOTE: keep this list/spec aligned with phase work. After Phase 1 (H1)
 * un-skip / tighten the "Send button has accessible name" assertion; after
 * Phase 6 (H2) add a transfer-picker assertion to replace the numeric-ID one.
 */

const LIVE_CHAT = '/admin/live-chat'

test.setTimeout(120_000)

/** Open the live-chat console as an authenticated admin. */
async function gotoLiveChat(page: Page): Promise<void> {
  await loginAsAdmin(page)
  await page.goto(LIVE_CHAT, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 45_000 })
}

/**
 * Open the console and wait until the conversation list has settled.
 *
 * Two separate races bit this spec. The listbox mounts before the
 * `/conversations` response arrives, so a count taken right after
 * `gotoLiveChat` read zero and turned a seeded conversation into a false
 * "empty DB" skip. Waiting for the response alone was still not enough: it can
 * land before React commits the rows, so the count read zero again on a seeded
 * run (F-030, seen in CI).
 *
 * So wait for the request, then let the listbox finish rendering. A loaded list
 * that is genuinely empty still returns here; whether an empty list is allowed
 * is the caller's decision, which `skipWhenUnseeded` makes.
 */
async function gotoLiveChatAndLoad(page: Page): Promise<void> {
  const firstList = page.waitForResponse(
    (res) => {
      if (res.request().method() !== 'GET') return false
      // The list call is `/conversations`, optionally followed by `?status=`;
      // detail fetches append `/{line_user_id}`. Strip the query before
      // matching so both list shapes hit and detail fetches do not.
      return new URL(res.url()).pathname.endsWith('/admin/live-chat/conversations')
    },
    { timeout: 45_000 },
  )
  await gotoLiveChat(page)
  await firstList
  // The response resolving does not mean React has painted the rows yet. Wait
  // for either outcome to render: a row, or the loaded-but-empty chat pane.
  await expect(
    page.getByRole('option').first().or(page.getByText(/select a conversation/i)),
  ).toBeVisible({ timeout: 30_000 })
}

/**
 * CI seeds the rows (`seed_live_chat_e2e.py`), so an empty list there is a
 * broken seed, not an empty database — fail instead of skipping, otherwise the
 * test could go green while asserting nothing (F-030).
 */
function skipWhenUnseeded(count: number, what: string): void {
  if (process.env.CI) {
    expect(count, `CI seed must provide ${what}`).toBeGreaterThan(0)
    return
  }
  test.skip(count === 0, `no conversation in this DB — run seed_live_chat_e2e.py --apply`)
}

test.describe('/admin/live-chat smoke', () => {
  test('console shell renders for an authenticated operator', async ({ page }) => {
    await gotoLiveChat(page)

    // Landed on the live-chat route (not bounced to /login).
    await expect(page).toHaveURL(/\/admin\/live-chat/)

    // The conversation list uses the Listbox a11y pattern (audit-confirmed).
    await expect(page.getByRole('listbox')).toBeVisible()
  })

  test('chat pane renders its empty state until a conversation is selected', async ({ page }) => {
    await gotoLiveChat(page)
    // ChatArea returns an empty-state pane when `selectedId` is null
    // (ChatArea.tsx: `if (!selectedId) return <empty state>`). The
    // <textarea> composer is only mounted AFTER a conversation is selected,
    // so on an empty seed the always-true smoke signal is the empty-state
    // CTA in the chat pane. The composer-after-selection path is covered by
    // the next test (which skips gracefully when the seed has no rows).
    await expect(page.getByText(/select a conversation/i)).toBeVisible()
  })

  test('selecting a conversation reveals the chat area', async ({ page }) => {
    await gotoLiveChatAndLoad(page)
    const options = page.getByRole('option')
    const count = await options.count()
    skipWhenUnseeded(count, 'at least one conversation')
    const convo = options.first()

    await convo.click()
    // After selecting, the message log region should be present. Phase 1/H4
    // makes this a dedicated role="log" live region; assert role=log once
    // H4 lands. Until then fall back to the textarea staying visible.
    await expect(page.locator('textarea').first()).toBeVisible()
  })

  /**
   * WCAG 2.1.1 guard. #176 added `onMouseDown preventDefault` to this listbox
   * to block an `aria-activedescendant` auto-scroll; #180 then deleted the
   * aria-activedescendant, leaving a preventDefault whose only remaining effect
   * was to suppress focus — so clicking a row left the composite widget
   * unfocused and the arrow keys dead until the user tabbed in. jsdom does not
   * implement "click focuses the nearest focusable ancestor", so this behavior
   * can only be pinned in a real browser.
   */
  test('arrow keys move the selection after clicking a conversation', async ({ page }) => {
    await gotoLiveChatAndLoad(page)
    const options = page.getByRole('option')
    const count = await options.count()
    skipWhenUnseeded(count, 'at least two conversations')
    if (count < 2) test.skip(true, `needs two conversations, the DB has ${count}`)

    await options.first().click()
    await expect(options.first()).toHaveAttribute('aria-selected', 'true')
    // The click must leave the listbox focused, or ArrowDown goes nowhere.
    await expect(page.getByRole('listbox')).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  })

  /**
   * Phase 1 / H1 acceptance guard. The Send button currently renders as an
   * icon-only <button> with no accessible name (the bug). This SHOULD fail
   * until H1 is implemented, so it is skipped now and must be un-skipped as
   * part of Phase 1 to prove the fix + prevent future regression.
   */
  test('Send button exposes an accessible name (H1)', async ({ page }) => {
    await gotoLiveChatAndLoad(page)
    // The composer (and its Send button) only mounts after a conversation is
    // selected — same data-dependence as the test above. H1 is also covered
    // deterministically by the MessageInput unit test.
    const options = page.getByRole('option')
    const count = await options.count()
    skipWhenUnseeded(count, 'at least one conversation')
    const convo = options.first()

    await convo.click()
    await expect(page.getByRole('button', { name: /ส่งข้อความ|send/i })).toBeVisible()
  })
})
