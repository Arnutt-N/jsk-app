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

## Round 2 (2026-10-26): two reviewers delivered

`interrogate` A and C returned full findings against head `9206cba`. Triage below.

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

### Dismissed, with reasons

- **C8**: the session warning now extends on backdrop click and Escape. Kept deliberately. The owner
  decision for this work (D2) states in plain terms that every dismiss path extends the session, and a
  backdrop click is a presence signal on a dialog whose only job is preventing a surprise logout.
- **A8**: AGENT can still reach `/admin/bookings` by direct URL. That is the agreed scope. The chosen
  fix hides the advertisement; the route guard already bounces AGENT and backend authorization is
  untouched by design.

### Noted, not fixed here

- **C6**: the four `admin-audit-verify` specs keep fixed sleeps in `net-race.spec.ts` as race
  synchronisation. They are green in CI; gating on `waitForResponse` is a follow-up.
- **C7**: `captureCsrf` encodes a call-order dependency that surfaces later as a fixture error. It
  fails loudly with the reason; folding capture into a login helper is a follow-up.

## Current gate state

CI is green and all ten `admin-audit-verify` specs pass. `interrogate` B and D plus both `thermos`
passes have still not delivered a verdict for this branch, so per poteto-mode **the independent-review
gate stays closed** and PR #300 is not merge-ready. A reviewer that dies without a verdict is not an
approval.

Secrets rule (user-mandated 2026-10-13) held throughout: no key, token, or password appears in this
file, the PR body, or any log from this session.
