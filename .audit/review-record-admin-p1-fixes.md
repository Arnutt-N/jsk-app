# Review record — feat/admin-p1-fixes

Owner-visible state of the review pipeline. Updated 2026-10-26.

## Round 1 (2026-10-25): mostly lost to a provider quota wall

| Review | Outcome |
|---|---|
| `no-comments` | Delivered. 24 restating comments removed, 5 keeps with proof. Applied in `dd4e628`. |
| `blast-radius` | Worked until the harness stopped it, but its proof work already surfaced the real defect below. |
| `interrogate` A/B/C/D | All lost: two failed, two stopped. No verdicts. |
| `thermos` bug/security, code quality | Lost: failures and stops, no verdicts. |

**Defect the partial blast-radius run caught.** `Modal.dismissDisabled` returned early from
`handleKeyDown`, which killed the Tab focus trap as well as Escape. While a dialog was pending, Tab
walked out into the page behind. Fixed in `dc559b9`.

## Round 2 (2026-10-26): four reviewers delivered

`interrogate` A, B, C, D and the security `thermos` pass all returned findings against heads
`9206cba` and `6a244ba`. Triage below.

### Accepted and fixed

| Finding | Fix |
|---|---|
| A1: a pending ConfirmDialog has zero focusable controls, so the trap fell through and Tab reached the page behind | Trap now forces focus to the dialog root (`tabIndex={-1}`) when nothing is focusable; test asserts focus stays inside |
| A2: the countdown rendered twice (Modal description plus body) | Dropped the duplicate description; test expects one |
| A3: Modal wrote the unlock branch while closed, which could clear another dialog's scroll lock | Body lock only runs while open |
| A5: a cancelled request was logged as an unexpected error | `apiFetch` returns a distinct aborted result and logs nothing |
| A6: no abort on unmount | Cleanup effect aborts the in-flight request |
| A7: double-submit guard read state from a stale closure | Ref guard blocks the second DELETE |
| C1: the drawer claimed a focus trap it never had; the spec passed only because the sidebar holds more than 12 focusables | Page content is `inert` while the drawer is open; the spec asserts that attribute |
| C2: `setPage((p) => (p === 0 ? p : 0))` was a no-op carrying a comment claiming a fix | Reverted to `setPage(0)` and deleted the comment |
| C3: a superseded request cleared the loading state of the request that replaced it | `finally` is sequence-guarded |
| C4: the X button branch was dead by construction | X is now disabled rather than removed, so the header does not reflow |
| C5: two test files asserted the same thing, reaching into Tailwind classes and React internals | One behavior-level file, `data-testid` backdrop, framework-internals test deleted |
| C6 (partly): NAV-02 title described the pre-fix behavior | Retitled |
| C9: orphan comment left beside changed markup | Shortened to the rationale only |
| B1: a nested dialog closing unlocked the page behind the one still open | Body lock is reference-counted |
| B2 / C8 / thermos-1: every dismiss path of the timeout warning silently extended an idle admin session | Escape, backdrop, and the X are blocked; only the two explicit buttons act |
| B3 / thermos-3: one Escape acted on the drawer and every open dialog | Modal claims the key with `preventDefault`; the drawer skips while a dialog is open |
| B4: the aborted result was indistinguishable from a network failure | Added the `aborted: true` discriminator |
| B7: the pending hint was invisible to screen readers | Hint is a `role="status"` live region |
| thermos-2: a hung DELETE left the dialog uncloseable with no timeout | DELETE is bounded by `AbortSignal.timeout(15s)` |
| thermos-4: Shift+Tab from the drawer reached the skip link, whose target was inert | Skip link is not rendered while the drawer owns focus |
| thermos-5: the deferred initial-focus query still matched disabled controls | Reuses the trap's selector |
| D1: the mocks were never cleared, so the Escape test satisfied the button test | `beforeEach` clears; every case asserts an exact call count |
| D2: the Modal trap test asserted jsdom's lack of Tab traversal | Replaced with a test that requires the real fallback (focus lands on the dialog) |
| D3: `net-race` used sleeps as its only synchronisation and could pass without racing | First search request is held on a promise and released only after the winning query has painted |
| D4: NAV-02's skip swallowed any login failure, and its zero-count assertion passed on a blank page | Only a failed sign-in may skip; a positive control runs first |
| D5: the SAFE-02 backdrop test clicked raw coordinates with no pending assertion | Asserts the pending status first and clicks the backdrop by test id |
| D6: A11Y-01 reached the inert host by child index and asserted a CSS transform | Drawer has a test id; the Tab loop is the signal; closed state is `not.toBeInViewport` |
| D7: every spec claimed "fail loudly instead of retrying" while CI retries once | All four specs pin `retries: 0` |
| D9: A11Y-02 could not fail for the reason it existed | Relabelled to the regression it can catch; the 25-minute case is delegated to the unit test |
| D10: SAFE-01 asserted a tag name and a URL that was already true | Asserts the dialog disappears after cancel |
| D11: the Logout button and the backdrop were untested | Both covered |
| D12: palette tests matched any dialog and the first option | Named dialog plus option by accessible name |

### Dismissed, with reasons

- **B5**: "AGENT removal is an unexplained authorization change". It is explained: owner decision D1 in
  `docs/PRD-admin-p1-fixes.md` and the PR body, and the thermos pass confirmed the menu entry was dead
  because `AdminAuthGate` already redirects AGENT. Not reverted.
- **B8 / D8**: `data-testid="modal-backdrop"` ships in production and specs write screenshots into a
  tracked tree. Both accepted as deliberate: the hook is inert markup, and the stills are the audit
  deliverable this branch exists to produce.
- **B6**: drawer containment is page-level, not a Tab cycle. Stated in the comment above the `inert`
  binding, and the Tab loop is the behaviour under test.

### Noted, not fixed here

- **C6**: the four `admin-audit-verify` specs keep one `waitForTimeout(1500)` after releasing the stale
  response, to give a dropped response a chance to repaint. The ordering itself is now promise-gated.
- **C7**: `captureCsrf` encodes a call-order dependency that surfaces later as a fixture error. It
  fails loudly with the reason; folding capture into a login helper is a follow-up.
- **D9 / A11Y-02**: the idle-warning e2e case covers only "hidden while active". Driving the 25-minute
  window with `page.clock` did not fire the hook's timers, so the dialog semantics and the dismiss
  policy are covered by the unit test instead.

## Current gate state

CI is green and all ten `admin-audit-verify` specs pass. `interrogate` B and D and the security
`thermos` pass delivered verdicts for this branch. The code-quality `thermos` pass never delivered: two
attempts died on quota and the third hung until the harness stopped it, so that single axis stays
uncovered. Everything else in the gate is closed.

Secrets rule (user-mandated 2026-10-13) held throughout: no key, token, or password appears in this
file, the PR body, or any log from this session.
