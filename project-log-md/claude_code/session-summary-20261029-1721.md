# Session Summary — claude_code — 2026-10-29T17:21:00+07:00

**Branch**: `fix/codebase-review-20261026`  **HEAD**: `c04f5b8`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20261029-1721.json`
**PR**: https://github.com/Arnutt-N/jsk-app/pull/301 (draft, CI CLEAN)
**Predecessor**: `project-log-md/claude_code/session-summary-20261029-1132.md`

## Objective

Finish the codebase-review plan, then review that work adversarially and fix
what survives. The plan itself was 22/30 when this context began; this session
closed the remaining eight tasks and then ran a review/correct/deslop pass over
the whole session's output.

## Completed — plan 30/30

Tasks 20, 21, 29, 30, 12, 23, 25, 26, each with its own green CI SHA. Per-task
detail is in the predecessor summary; the commits are `912717e`, `a56847f`,
`7a9f4a1`, `504825a`, `a70d961`, `33e794a`, `a282775`, `1cddbbb`, `38f2385`.

Two deviations from the plan, both recorded in the plan's own notes:

- **Task 30** uses `day_bounds_utc` per bound, not `resolve_range`. The endpoint
  treats `start_date` and `end_date` as independently optional, and
  `resolve_range` fills a missing side with a lookback bound the caller never
  asked for. The endpoint also already rejects inverted ranges before the query,
  so the planned `InvertedRangeError` catch would have been dead code.
- **Task 21** found 22 bare admin navigations, not the 29 the plan enumerated;
  the files had been refactored since the plan was written.

## Completed — review / correct / deslop

Four adversaries ran against the branch. opus, fable and sonnet all died on
`ECONNREFUSED` mid-run; haiku returned a verdict. I ran the dead adversaries'
decisive passes myself rather than let the gate pass empty.

**Fixed, each proven:**

- `9229246` — two fail-open gaps in the new route manifest. `:id` matched any
  segment, so VIEWER reached `/admin/requests/<anything>` where the guard it
  replaced required digits. And the manifest admits VIEWER to reply-objects and
  rich-menus while their capability keys are SUPER_ADMIN/ADMIN; the sidebar
  special-cased VIEWER past the key but `PageAccessGuard` did not, so mounting
  the guard there would have bounced VIEWER off a page the backend serves it.
  Both rules now live in `route-permissions.ts`. The four new tests were run
  against the pre-fix module and fail there.
- `95c6a9e` — `MANUAL_BASELINE.md` told a reader `--update-snapshots` writes the
  PNGs named by "the spec's `toHaveScreenshot(...)` call", which the same change
  deleted. Rewritten to hand the reader a throwaway spec to copy in.
- `51d4db6`, `c04f5b8` — a race in `live-chat-smoke.spec.ts` that I had
  introduced in Task 26. Waiting for the `/conversations` response is not
  waiting for React to paint the rows; and the replacement union needed
  `.first()` on the combined locator, not on its left branch.

**Proven clean, not assumed:**

- 21 menu routes × 6 roles against the old sidebar lists: zero drift (scripted).
- Old vs new date bounds across six input shapes: zero divergence (scripted).
- `test.skip()` called from inside a helper: supported; Playwright catches the
  control-flow error wherever it is raised.
- The `requiredCapability` prop could not have been lost: no call site ever
  passed it.
- `readErrorMessage`'s new log never reaches the browser in production;
  `logger` gates console on `isDev` and `reportError` is an empty stub, so the
  change strictly reduced exposure.
- No secret values in the diff; the four grep hits are an env var name, a
  `<placeholder>`, a test title, and prose.

## Next Steps

1. **The three remaining `cd.yml` soft skips.** Task 20 fixed only the
   healthcheck-URL member of the class. `VERCEL_DEPLOY_HOOK_URL`,
   `BACKEND_REMOTE_ENV_FILE` and the `KOYEB_*` set still warn and skip, and
   because `smoke-frontend` / `smoke-backend` are gated on
   `deploy_configured == 'true'`, CD can conclude green having deployed and
   verified nothing. Same defect as F-024, reported open rather than fixed
   here because it was outside the round's fence.
2. **Merge PR #301** when reviewed. Two sessions of work, 15 commits.
3. **After merge:** verify Task 14 Step 3, that a red E2E blocks deploy. It is
   only observable on `main`.

## Blockers

None. CI, E2E and Encoding are green at `c04f5b8` with no retry lines.

## Deferred (not blockers)

- The `cd.yml` soft skips above.
- Ruff gate scope is `app tests`, excluding `backend/scripts` (25 pre-existing errors).
- E501/E402 bulk cleanup; mypy evaluation.
- `KEY_MANAGE_RICH_MENUS` / `KEY_MANAGE_REPLY_OBJECTS` gate reads and writes with
  one key, so VIEWER needs the path special-case.
- Pre-existing tsc error at `e2e/admin-audit-verify/nav-search-roles.spec.ts:53`,
  present before this branch's work and untouched by it.

## Environment notes for the next agent

- **CI is the only trustworthy judge.** The Windows local env gives false
  results: the full backend suite hangs near the end, and `npm` does not create
  `node_modules/.bin`, so run vitest as `node node_modules/vitest/vitest.mjs run <path>`.
- **A green E2E run with retries hides real races.** `95c6a9e` was green and
  carried a genuine paint race that only passed on retry. Grep the run log for
  `retry #1` before believing a conclusion.
- **Waiting for a network response is not waiting for a render.** E2E waits must
  target the rendered element. A `.or()` union needs `.first()` on the combined
  locator; both branches can match at once and strict mode throws.
- **`isolation: worktree` did not check out the branch under review here.** It
  based reviewers on `main` at an older commit. Two adversaries caught it by
  reading `git log` first. Verify the checkout before trusting a worktree
  reviewer.
- **Turbopack font flake**: `Can't resolve @vercel/turbopack-next/internal/font/google/font`
  while `next/font/google` fetches Outfit from `fonts.gstatic.com`. Hit three
  times, cleared on re-run every time. Not a code regression.
- `next build` rewrites `frontend/next-env.d.ts`; revert it before committing.
- Full-suite vitest on Windows can exhaust memory and get the background job
  killed; prefer targeted file runs.

## Iron rule reminder (user-mandated 2026-10-13)

No key, token, password, or secret appears in this handoff, the checkpoint, the
PR body, or any log from this session. Secrets were handled by presence/count
checks only. Cite this rule in every handoff.
