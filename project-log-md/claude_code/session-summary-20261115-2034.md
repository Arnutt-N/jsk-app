# Session Summary — claude_code — 2026-11-15 (datepicker flake, unresolved)

## What shipped since last handoff
- **#335 merged** (`96faf04`) — Minor 2: media-path mocks in
  `test_send_message_failure.py` now use the shared shape-routing helper
- **#336 merged**? No — OPEN, red only on the shared Playwright job. It is a
  docstring-only PR recording why `test_intent_combine.py` keeps order-based
  queues. Its content is correct and wanted.
- **#332, #333, #334 merged earlier** — validator interpreter fix, send_message
  SELECT gate, handoff checkpoint
- **#337 OPEN, RED** — first datepicker attempt (dialog-detach wait + force
  removed). Superseded by #338.
- **#338 OPEN, RED** — blur-commit fix in `CalendarPickerTH.handleBlur` plus
  spec cleanup. INSUFFICIENT: the tap still times out with the same
  interceptor rotation.

## The datepicker flake — what is actually known
`e2e/datepicker-touch.spec.ts:24` fails on CI only (main green), both runs and
retries, since #335. Trace call log (`.audit/pw338.log`):
```
- waiting for getByLabel('ล้างวันที่').first()
- locator resolved to <button aria-label="ล้างวันที่" ...>   (resolves fine)
- element is visible, enabled and stable                    (stable!)
- scrolling into view if needed / done scrolling
- <input aria-label="ปี พ.ศ." value="2567"> intercepts pointer events
- retrying → wrapper div intercepts
- retrying → <span>90 วัน</span> from preset button subtree intercepts
- retrying → <header class="sticky top-0 z-40 ...glass-navbar"> intercepts
```
Four different interceptors in one 10s window. Element is stable per
Playwright, so this is NOT the layout-moving-under-tap story I committed in
#338. The blur-commit fix was real and correct on its own merits (a second
onChange+refetch did fire), but it is not the flake's cause.

Hypotheses killed by evidence:
1. "tap lands on overlay during close animation" — dialog-detach wait passed
2. "element handle goes stale" — trace says resolved+stable
3. "blur double-commit moves the row" — fixed in #338, failure identical

Remaining unexplained: why the tap POINT on a visible, stable button is
covered by the year input, the wrapper, a preset span, and a sticky header,
in rotation, on a Pixel 7 viewport.

## What the next agent must do first
Get the real trace, not the call log. Options:
- open the Playwright Trace Viewer link in the #338 CI run log
- or download the `test-results`/`playwright-report` artifact zip and open
  `trace.zip` locally
- or reproduce with backend+DB+frontend running (not available on this box:
  Docker daemon down, Playwright MCP disconnected)
Then read the DOM/geometry at the moment of the tap. Do NOT propose another
fix from reading the spec and component code alone. Three wrong fixes have
already shipped on that basis.

## Open / follow-up
1. datepicker flake — blocker for #336, #337, #338
2. decide #337: close as superseded, or keep for its dialog-detach wait
3. decide #336: it is docstring-only; its red E2E is the shared job, not its
   content. If the flake must be green before merge, either fix the flake or
   temporarily quarantine the spec with a tracked reason + expiry
4. Minor 3 already shipped in #333. No other review findings pending.

## Lessons encoded this round
- Never push a final commit after a branch is merge-ready; a merge can land
  without it. Verify live state before claiming green.
- The MS Store `python` stub exits non-zero with no stdout; prefer `py` and
  require an output marker (shipped in #332, #333).
- A trace call log is not a trace. Read the viewer or the DOM snapshot before
  fixing geometry.

## Handoff pointer
Checkpoint: `.agents/state/checkpoints/handover-claude_code-20261115-2034.json`