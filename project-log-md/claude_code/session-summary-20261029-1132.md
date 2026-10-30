# Session Summary — claude_code — 2026-10-29T11:32:00+07:00

**Branch**: `fix/codebase-review-20261026`  **HEAD**: `38f2385`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20261029-1132.json`
**PR**: https://github.com/Arnutt-N/jsk-app/pull/301 (draft, CI CLEAN)

## Objective

Finish `.claude/PRPs/plans/codebase-review-20261026.plan.md`. The previous
session closed 22/30; this one closed the remaining eight.

## Completed — 8 tasks, plan now 30/30

### Phase 2

- **Task 20** F-024 (`912717e`) — smoke steps in `cd.yml` used to `exit 0` with a
  `::warning` when the healthcheck URL was unset, so a deploy nobody verified
  reported green. They now `::error` + `exit 1`: the deploy already ran by that
  point, so skipping the job would still leave the workflow conclusion green.
  Proved by extracting both step scripts from the YAML and running them:
  unset → exit 1, reachable URL → exit 0, unreachable → exit 1 after retries.
- **Task 21** F-025 (`a56847f`) — all 22 remaining bare admin navigations (not
  the 29 the plan enumerated: the files had been refactored since) now go
  through `gotoAdmin`. Left alone: `/login` gotos and the two live-chat specs
  that already pass their own 60–90s budget.
- **Task 29** F-033 (`7a9f4a1`) — new `frontend/lib/route-permissions.ts` is the
  single route→roles+capability declaration; the sidebar, `PageAccessGuard`, and
  the VIEWER path allow-list all read it. Two real defects fell out:
  DIRECTOR/HEAD saw the dashboard in the menu while its page guard bounced them
  back to it (infinite spinner), and `/admin/taxonomy` admitted AGENT while its
  backend gate (`KEY_MANAGE_TAXONOMY`) is SUPER_ADMIN/ADMIN only (403 on every
  call). 28 new unit tests.
- **Task 30** F-034 (`504825a`) — `list_requests` uses `day_bounds_utc` instead
  of hand-rolled pytz. Deviation from the plan: **not** `resolve_range`, because
  this endpoint treats `start_date` and `end_date` as independently optional and
  `resolve_range` would invent a lookback bound the caller never asked for; the
  endpoint also already rejected inverted ranges before the query, so the
  planned `InvertedRangeError` catch would have been dead code.

### Phase 3

- **Task 12** F-016 (`a70d961`) — `readErrorMessage` no longer returns a
  non-JSON body to callers (proxy HTML, Python tracebacks); the body goes to
  `logger.error` with its content-type. The old test that pinned the
  passthrough is replaced by two that pin the new behaviour.
- **Task 23** F-027 (`33e794a`) — `forbidOnly: !!process.env.CI` in both
  Playwright configs. Verified with a scratch `test.only`: rejected under
  `CI=true`, allowed locally.
- **Task 25** F-029 (`a282775`) — the screenshot-baseline test was permanently
  skipped (`UPDATE_SCREENSHOTS` set nowhere, no baseline image committed).
  Deleted; capture is now a documented manual step in `e2e/MANUAL_BASELINE.md`.
- **Task 26** F-030 (`1cddbbb`, `38f2385`) — two defects, not one. The seed
  provided a single conversation while the keyboard-nav assertion needs two, so
  that test skipped forever regardless of seeding; and the spec counted rows
  before the `/conversations` response had arrived. The seed now creates two
  customers via a shared `_seed_customer()` helper, the spec waits for the list
  response, and CI **fails** (rather than skips) when the seed produced nothing.
  `1cddbbb` went red because the new wait predicate required a `?` in the URL
  and the unfiltered list call has no query string — fixed in `38f2385`.
  All five live-chat smoke tests now run and pass.

## Next Steps

1. Verify Task 14 Step 3 — a real red-E2E-blocks-deploy cycle is only
   observable on `main`; check it on the first CD run after merge.
2. Merge PR #301 when ready.

## Blockers

None. CI + E2E + Encoding green at `38f2385` (52 Playwright tests passed,
1 skipped — the mutating `audit-timeline` test gated on `E2E_ALLOW_MUTATION`).

## Deferred (not blockers)

- Task 14 Step 3 (above).
- Ruff gate scope is `app tests`, excluding `backend/scripts` (25 pre-existing errors).
- E501/E402 bulk cleanup; mypy evaluation; `KEY_MANAGE_RICH_MENUS` /
  `KEY_MANAGE_REPLY_OBJECTS` gate reads and writes with one key, so VIEWER
  needs the path special-case.
- Pre-existing tsc error at `e2e/admin-audit-verify/nav-search-roles.spec.ts:53`
  (`string | undefined` into a `string` parameter) — present before this branch's
  work and untouched by it.

## Environment notes for the next agent

- **CI is the only trustworthy judge.** The Windows local env gives false
  results: the full backend suite hangs near the end, and `npm` does not create
  `node_modules/.bin`, so run vitest as `node node_modules/vitest/vitest.mjs run <path>`.
- **Turbopack font flake**: `Can't resolve @vercel/turbopack-next/internal/font/google/font`
  while `next/font/google` fetches Outfit from `fonts.gstatic.com`. Hit on
  `33e794a` in CI and once locally; cleared on re-run both times. It is not a
  code regression — re-run before investigating.
- `next build` rewrites `frontend/next-env.d.ts`; revert it before committing.
- Full-suite vitest on Windows can exhaust memory and get the background job
  killed; prefer targeted file runs.

## Iron rule reminder (user-mandated 2026-10-13)

No key, token, password, or secret appears in this handoff, the checkpoint, the
PR body, or any log from this session. Secrets were handled by presence/count
checks only. Cite this rule in every handoff.
