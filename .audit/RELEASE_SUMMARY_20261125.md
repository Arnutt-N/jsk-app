# Release summary — 2026-11-25

## Status

`origin/main` is `13d7845bf82109425ea249cfc4a38cc713533820`. Three PRs landed from the F01-F09 release run:

| PR | Squash commit | Scope |
|---|---|---|
| #349 | `6ec8041` | LIFF retry conflict, reminder claims and outcomes, broadcast recovery, webhook durability, CD migration gate |
| #350 | `046d6ba` | Stabilized audit-timeline E2E against React 19 StrictMode double mount |
| #351 | `13d7845` | One metadata-only query for LIFF attachment resolution |

No code from this run remains uncommitted. The working tree has local handoff state edits and untracked audit files only.

## Production verification

CD run `45158783827` for `6ec8041` completed `Run Production DB Migrations`, `Deploy Backend (Koyeb)`, and both smoke checks. Migration log shows `a3b4c5d6e7f8 -> c1d2e3f4a5b6 -> f09a1b2c3d4` and `Migration gate passed: revision f09a1b2c3d4 confirmed`. Evidence: `.audit/pr349-cd-migration.log`.

## Review and gates

PR #349 and #350 each received independent PASS verdicts before merge. PR #351 received an independent PASS at `06cce5b`. All required CI checks passed on the merged heads: Backend Pytest, Frontend Lint and Build, Playwright Smoke, Source Encoding Scan. no-comments ran before the #349 and #350 merges; accepted findings were comment-only.

## Performance outcomes

Baseline report and raw runs: `.audit/perf-baseline-20261123/`. Issue record: `.scratch/handoff-analysis-20261122-1948/issues/09-performance-baseline.md`.

| Candidate | Outcome | Evidence |
|---|---|---|
| C1 attachment metadata | Shipped in #351. Three attachments went from 3 media SELECTs and 8,978,807 fetched row bytes to 1 SELECT and 123 bytes. | `.audit/perf-baseline-20261123/`, PR #351 body |
| C2 reminder reads | Baseline only. About 6 SQL per reminder; one stolen lease removed that row from the batch. No code change. | `.audit/perf-baseline-20261123/perf-c2.json` |
| C3 broadcast delay | Inconclusive for true scheduled-to-start. Live scheduler raced the probe. No code change. | `.audit/perf-baseline-20261123/perf-c3-clean1.json` through `perf-c3-clean5.json` |
| C4 lazy audit fetch | No change. Request count fell 9 to 8 before tab open, but latency stayed inside run-to-run spread. | `.audit/c4-no-change-20261124/` |

## Browser checklist

All three flows passed under browser simulation, not a real LINE client: delayed upload blocked submit during upload, new-case retry preserved the first case and created a new one, and hidden-email booking omitted email from DOM, payloads, and captured outbound messages. Cleanup restored test rows and settings. Report and harness: `.audit/line-browser-checklist-20261124/`.

Still unverified without a device: real LINE in-app ID token verification, LINE push delivery, and mobile gestures. Need `adb` plus a phone logged in to LINE.

## Issue tracker pointers

- `.scratch/pr349-review-20261123/issues/` four defects found by the first independent review, all fixed.
- `.scratch/audit-timeline-e2e-tab-flake/issues/01-audit-timeline-tab-timeout.md` marked resolved-pending-merge; PR #350 merged.
- `.scratch/handoff-analysis-20261122-1948/issues/09-performance-baseline.md` records outcomes for all four candidates.

## Audit artifact index

Selected entry points in `.audit/`. Older logs remain in place and were not deleted.

- Release work plan and decision trail: `f01-f09-release-work.todo.md`, `f01-f09-release-work.tsv`
- PR #349 CI logs and CD migration: `pr349-backend-ci.log`, `pr349-ci-failure-excerpt.txt`, `pr349-cd-migration.log`; review issues are in `.scratch/pr349-review-20261123/`
- PR #350 and E2E: `e2e-stable-subset.txt`, `e2e-transient-retry4.txt`, `pr-e2e-transient-body.md`
- PR #351 and C1: `pr-c1-body.md`, `perf-baseline-20261123/`
- C4 no-change: `c4-no-change-20261124/`
- Browser simulation: `line-browser-checklist-20261124/`
- Latest handoff: `.agents/state/checkpoints/handover-claude_code-20261125-0013.json`

No files were deleted or rewritten to produce this summary.
