import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'

/**
 * Layout-stability regression for /admin/live-chat.
 *
 * Guards against the "UI shifts up leaving dead space below" bug: the
 * 3-column shell is overflow-hidden, but overflow-hidden boxes are still
 * programmatically scrollable — if any column grows taller than the
 * viewport (the CustomerPanel used to), scrollIntoView/focus can scroll
 * the shell and shift the whole layout upward. The load-bearing invariant
 * is therefore `shell.scrollHeight === shell.clientHeight` (no hidden
 * scroll range), plus pointer cursors and send-button alignment.
 */

interface LayoutSnapshot {
  scrollY: number
  innerHeight: number
  docScrollHeight: number
  shellScrollTop: number
  shellScrollHeight: number
  shellHeight: number
  filterCursor: string | null
  toggleCursor: string | null
  sendTop: number | null
  inputBoxTop: number | null
}

function collectLayout(): LayoutSnapshot {
  const shell = document.querySelector<HTMLElement>('div.h-screen')
  const filterBtn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim().startsWith('All'),
  )
  const toggleBtn = document.querySelector('button[aria-label="สลับเป็นโหมดบอท"]')
  const sendBtn = document.querySelector('button[aria-label="ส่งข้อความ"]')
  const inputBox = document.querySelector('textarea[placeholder="Type a message..."]')?.parentElement ?? null

  return {
    scrollY: window.scrollY,
    innerHeight: window.innerHeight,
    docScrollHeight: document.documentElement.scrollHeight,
    shellScrollTop: shell?.scrollTop ?? 0,
    shellScrollHeight: shell?.scrollHeight ?? 0,
    shellHeight: shell ? shell.getBoundingClientRect().height : 0,
    filterCursor: filterBtn ? getComputedStyle(filterBtn).cursor : null,
    toggleCursor: toggleBtn ? getComputedStyle(toggleBtn).cursor : null,
    sendTop: sendBtn ? sendBtn.getBoundingClientRect().top : null,
    inputBoxTop: inputBox ? inputBox.getBoundingClientRect().top : null,
  }
}

function expectViewportStable(snap: LayoutSnapshot) {
  // The page itself must never scroll…
  expect(snap.docScrollHeight, 'document taller than viewport').toBeLessThanOrEqual(snap.innerHeight + 1)
  expect(snap.scrollY, 'page scrolled').toBe(0)
  // …and the overflow-hidden shell must have no hidden scroll range.
  expect(snap.shellScrollHeight, 'a column overflows the viewport').toBeLessThanOrEqual(Math.ceil(snap.shellHeight) + 1)
  expect(snap.shellScrollTop, 'shell was programmatically scrolled').toBe(0)
}

test('live-chat layout stays viewport-stable and controls use pointer cursor', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 650 })
  await loginAsAdmin(page)
  await page.goto('/admin/live-chat')
  await page.locator('[role="listbox"]').waitFor({ state: 'visible', timeout: 30_000 })

  const before = await page.evaluate(collectLayout)
  expectViewportStable(before)
  expect(before.filterCursor, 'filter buttons need cursor-pointer').toBe('pointer')

  // Selecting a conversation mounts the chat column + customer panel — the
  // moment the layout used to break. Skip gracefully on an unseeded DB.
  const firstConversation = page.locator('[role="option"]').first()
  if ((await firstConversation.count()) === 0) return

  await firstConversation.click()
  await page.locator('textarea[placeholder="Type a message..."]').waitFor({ state: 'visible', timeout: 15_000 })
  // Give the smooth auto-scroll time to finish before measuring.
  await page.waitForTimeout(1_500)

  const after = await page.evaluate(collectLayout)
  expectViewportStable(after)
  if (after.toggleCursor !== null) {
    expect(after.toggleCursor, 'mode toggle needs cursor-pointer').toBe('pointer')
  }
  // Send button aligns with the TOP edge of the message input box.
  expect(Math.abs((after.sendTop ?? 0) - (after.inputBoxTop ?? 0)), 'send button misaligned with input top').toBeLessThanOrEqual(2)
})
