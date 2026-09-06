# PRD: PR #228 Review Follow-ups (F1–F3)

**Date:** 2026-09-06 · **Status:** self-review (autonomous session) · **Branch:** `fix/review-pr228-followups`
**Binding spec:** `.claude/PRPs/findings/2026-09-06-pr228-review-findings.md`

## Problem Statement

The codebase-review-fix pass over PR #228 found zero Critical/High issues but three small accepted gaps: two shipped `DateTimePickerTH` behaviors have no test coverage (the `timeDisabled` prop; degradation on an invalid ISO `value`), the reply-objects form now mixes two background tokens (`bg-bg` select vs `bg-surface` inputs) after the height unification, and the webhook dedup suite never exercises "release_lock fails at release time".

## Solution

Add the missing tests, align the select's background token with the inputs, and add one backend test pinning that a release failure is swallowed (TTL cleans up) without affecting event processing. No production-code behavior changes except the select background class.

## User Stories

1. As a developer refactoring `DateTimePickerTH` later, I want its full public surface under test, so that regressions in `timeDisabled` or invalid-value handling cannot ship silently.
2. As an admin filling in the reply-objects form, I want the fields to share one background style, so that the form looks unified.
3. As an ops person, I want a Redis hiccup at lock-release time to never fail webhook processing, so that citizen messages keep flowing even when Redis is degraded.

## Implementation Decisions

- **F1 (tests)**: extend `frontend/components/ui/__tests__/DateTimePickerTH.test.tsx` with (a) a `timeDisabled` test — field disabled regardless of date presence, no interference with the date part; (b) an invalid-`value` test — a garbage string renders empty parts and does not crash (`isoToYMD`/`isoToHM` already return `''` for invalid dates — this pins the contract at the component seam).
- **F2 (consistency)**: reply-objects select `bg-bg` → `bg-surface` (matches the shared `Input` outline variant). Single class change; height/typography classes from PR #228 stay.
- **F3 (test)**: add `test_release_failure_is_swallowed` to `backend/tests/test_webhook_deduplication.py` — mock `release_lock` to return `None` (Redis error path), assert `setex` still called and processing completes (event marked processed).

## Testing Decisions

- All three fixes are test-first where they touch tests; F2 is a style-only change validated by the existing reply-objects integration test (11 tests) + lint + build.
- Full gates per stack table in the findings file; CI remains the authoritative full-suite gate (known Windows teardown hang).

## Out of Scope

- R1–R5 from the findings file (documented there with reasons: pre-existing a11y label constants, documented component limitation, pre-existing raw event_id logging, security surface verified clean).

## Further Notes

- Deviation ledger and final summary will note that review ran as an in-context fallback (subagent model requests failed).