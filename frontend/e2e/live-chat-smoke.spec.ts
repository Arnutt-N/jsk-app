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

/** Open the live-chat console as an authenticated admin. */
async function gotoLiveChat(page: Page): Promise<void> {
  await loginAsAdmin(page)
  await page.goto(LIVE_CHAT)
  // Force-dynamic page + WebSocket bootstrap — wait for network to settle
  // rather than a fixed timeout (the repo's testing rules ban flaky waits).
  await page.waitForLoadState('networkidle')
}

/**
 * Resolve the first conversation row (role=option) if the seed has any.
 * Returns null on an empty DB so callers can skip gracefully.
 */
async function firstConversation(page: Page) {
  const options = page.getByRole('option')
  return (await options.count()) > 0 ? options.first() : null
}

test.describe('/admin/live-chat smoke', () => {
  test('console shell renders for an authenticated operator', async ({ page }) => {
    await gotoLiveChat(page)

    // Landed on the live-chat route (not bounced to /login).
    await expect(page).toHaveURL(/\/admin\/live-chat/)

    // The conversation list uses the Listbox a11y pattern (audit-confirmed).
    await expect(page.getByRole('listbox')).toBeVisible()
  })

  test('message composer is present', async ({ page }) => {
    await gotoLiveChat(page)
    // MessageInput renders a <textarea> (disabled until HUMAN mode / a
    // session is selected) — its presence is the smoke signal.
    await expect(page.locator('textarea').first()).toBeVisible()
  })

  test('selecting a conversation reveals the chat area', async ({ page }) => {
    await gotoLiveChat(page)
    const convo = await firstConversation(page)
    test.skip(convo === null, 'no seeded conversation in this DB')

    await convo!.click()
    // After selecting, the message log region should be present. Phase 1/H4
    // makes this a dedicated role="log" live region; assert role=log once
    // H4 lands. Until then fall back to the textarea staying visible.
    await expect(page.locator('textarea').first()).toBeVisible()
  })

  /**
   * Phase 1 / H1 acceptance guard. The Send button currently renders as an
   * icon-only <button> with no accessible name (the bug). This SHOULD fail
   * until H1 is implemented, so it is skipped now and must be un-skipped as
   * part of Phase 1 to prove the fix + prevent future regression.
   */
  test.skip('Send button exposes an accessible name (un-skip in Phase 1/H1)', async ({ page }) => {
    await gotoLiveChat(page)
    await expect(page.getByRole('button', { name: /send|ส่ง/i })).toBeVisible()
  })
})
