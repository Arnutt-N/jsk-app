# review / correct / deslop — branch fix/codebase-review-20261026

Scope: `git diff e826c03..HEAD` (10 commits, 35 files).
Goal: independent review of this session's work, fix what survives verification,
strip slop. Not a rewrite.

## Interrogate (review)

1. Frame: state intent, scope, rubric.
2. Fan out 4 adversaries (opus, fable, sonnet, haiku) in one message, each in its
   own worktree, each proving findings with a run.
3. Verify: rerun every finding's command. Keep only what reproduces and breaks intent.
4. Merge findings sharing a root cause.

## Correct (fix)

5. Fix verified findings, smallest root-cause change each.
6. Re-run CI locally for touched surfaces (targeted tests, lint, typecheck).

## no-comments (comment review on the diff)

7. Spawn pstack:comment-sicko on the branch diff; act on accepted findings.
   skip: the comments written this session are all "why" comments (constraint
   statements), and the fix round in step 5 rewrites the code they describe.
   Re-run this when the code stops moving.

## Deslop

8. Strip AI-slop patterns introduced by the branch: redundant comments, defensive
   checks on trusted paths, needless nesting, style inconsistent with neighbours.
9. Verify behavior unchanged (tests, build).

## Close

10. Commit the fixes; report what was found, fixed, dropped, and left open.

## Verified findings

- **[1a] `:id` matches any segment, so VIEWER reaches non-numeric
  `/admin/requests/*`.** Old code required `/^\d+$/`. My run:
  `/admin/requests/abc` → VIEWER=true, `/admin/requests/bulk-approve` →
  VIEWER=true, `/admin/requests/` (trailing slash, empty segment) → VIEWER=true.
  Latent today (no such page exists) but it is fail-open in the direction the
  manifest exists to prevent. Fix in `matchesDynamic`:
  `frontend/lib/route-permissions.ts`.
- **[1d] VIEWER capability mismatch on reply-objects / rich-menus.** Manifest
  admits VIEWER while `manage_reply_objects` / `manage_rich_menus` default
  policy is SUPER_ADMIN/ADMIN. The layout special-cases VIEWER past the
  capability check; `PageAccessGuard` does not, so mounting the guard on those
  pages would bounce VIEWER off a page it may read. Fix by moving the
  "capability gates writes, not VIEWER reads" rule into `route-permissions.ts`
  and having both consumers use it.
- **[self] `MANUAL_BASELINE.md` documents a procedure with no target.** The
  commit deleted the spec's only `toHaveScreenshot` call; the doc still tells a
  reader `--update-snapshots` writes "the PNGs that the spec's
  `toHaveScreenshot(...)` calls name". `grep -rc toHaveScreenshot
  frontend/e2e/*.spec.ts` returns nothing. Prove: my own run.

## Held

- Editing `frontend/lib/route-permissions.ts` waits for adversary A (which is
  reviewing that file) so its proofs stay valid.

## Review outcome

Adversaries opus (route/date parity), fable (tests), sonnet (CD/seed) all died
on `ECONNREFUSED` mid-run; haiku returned a verdict. I ran their passes myself
where the result was cheap and decisive:

- 21 menu routes x 6 roles against the old sidebar lists: **zero drift**
  (scripted, temporary test, deleted after).
- old vs new date bounds across 6 input shapes: **zero divergence** (scripted).
- `test.skip()` inside a helper: **works**; Playwright catches the control-flow
  error wherever it is raised. Adversary B's concern dropped.
- Remaining soft-skip paths in `cd.yml` (`VERCEL_DEPLOY_HOOK_URL`,
  `BACKEND_REMOTE_ENV_FILE`, `KOYEB_*`) are the same defect class as F-024 and
  are **not fixed**: out of scope for this round, reported open.

## Outcome

- Fixed 1a, 1d (one commit, tests proven to fail on the pre-fix module).
- Fixed the doc finding (separate commit).
- Deslop: collapsed a redundant double early-out in `PageAccessGuard`, removed
  a non-null assertion introduced mid-fix.
- Behavior-parity check on `/admin/requests/` (trailing slash): now denied for
  VIEWER, was allowed. A trailing-slash URL is not a real page; treated as part
  of the same fix rather than a separate finding.

## Flake found by reading the green run

The review-triggered CI was green, but its log showed the Send-button test
failing with `count = 0` on a seeded run and passing only on retry. That is a
defect the green conclusion hides. Cause: `gotoLiveChatAndLoad` waited for the
`/conversations` response, which can arrive before React commits the rows. Fixed
in `51d4db6` by waiting for either painted outcome (a row, or the loaded-empty
chat pane), so an empty list still skips and a slow one no longer fails.

Lesson worth keeping: a green E2E job with retries can hide a real race. Read
the log for `retry #1` lines, not just the conclusion.

## Second flake round

`51d4db6`'s fix then went RED, which is the useful outcome: the union
`getByRole('option').first().or(getByText(...))` put `.first()` on the left
branch only, so when the seed row and the empty-state pane coexisted the
combined locator resolved to 2 elements and Playwright's strict mode threw.
`.first()` belongs on the combined locator. `c04f5b8` fixes it; that run is
green with no `retry` line at all, 52 passed / 1 skipped.

Both mistakes here were mine, and CI caught both. Local tsc, eslint and vitest
were green the whole time because none of them exercises the locator.
