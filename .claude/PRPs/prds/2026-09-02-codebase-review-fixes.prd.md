# PRD — Codebase Review Fixes 2026-09-02

Source spec: `.claude/PRPs/findings/2026-09-02-codebase-review-findings.md` (binding)
Branch: `fix/codebase-review-fixes-20260902` · Pipeline: `codebase-review-fix` (G1 passed)

## Problem

A 4-agent parallel review (backend / frontend / security / tests+config) of the whole
repository produced 36 unique evidence-verified findings: 6 High, 17 Medium, 13 Low
(0 Critical). The High set contains two privilege/data-integrity bugs (role-check
fall-through for DIRECTOR/HEAD; webhook dedup that silently drops every LINE message
during a Redis outage), two user-facing LIFF race conditions that can submit wrong
addresses / book wrong slots, and two test-coverage holes on the most exposed
surfaces (unauthenticated LINE webhook; display-scheduler SQL). These must be fixed
now because they are correctness/security defects on live paths, not hardening
suggestions.

## Scope (per findings dispositions)

- **FIX in this PR**: all 6 High (H1–H6) + 14 Medium (M1–M13 as listed, incl. the
  minimal SSRF block M9 and media MIME allowlist M10) + 2 Low one-liners (L1–L2; L3 re-scoped to DEFER during planning).
- **DEFER (documented in findings)**: 3 Medium policy decisions (CD gating ×2,
  dependency lock file) + 11 Low (each with its reason: owner policy, product
  decision, perf-only, or UX polish).

## Root causes → fix strategy (one line each)

1. `RedisClient.set` collapses "error/absent" into `False` → webhook fail-closed.
   Tri-state lock + fail-open processing (dedup is best-effort by design).
2. `_check_role_permission` has no DIRECTOR/HEAD branches → silent allow.
   Add explicit SUPER_ADMIN-only branches.
3. LIFF cascading selects ignore response order → stale list under new selection.
   Capture requested id; discard mismatched responses (3 pages + booking slots).
4. Webhook + scheduler SQL untested → signature/HMAC matrix tests; real-Postgres
   scheduler integration test following the existing DB-backed test pattern.
5. Various input-hardening gaps (upload caps, MIME allowlist, login rate limit,
   export caps, read-before-size-check) → align each endpoint with the repo's own
   established patterns (rich_menus upload, liff.py whitelist, auth limiter).
6. Pseudonymization leak (plaintext line ids in 2 log lines) → `mask_line_id`.
7. `bcrypt` transitive dep + vulnerable jose floor → explicit pins.
8. Rich-menu recreate silently drops image on dangling media FK → hard-fail.

## Why now

H1/H2 are exploitable failure modes on production paths (message loss; privilege
escalation from ADMIN to manager-level roles). H3/H4 corrupt user-submitted data.
H5/H6 leave the exact regressions these bugs resemble unguarded. All fixes are
surgical and pattern-following; none require schema changes or new dependencies
beyond version pins.

## Acceptance criteria

- Every FIX finding above maps to ≥1 implemented change + tests (see PRP task table).
- Full backend pytest green (CI), frontend vitest/tsc/lint/build green, CI + E2E green.
- No behavior change for the deferred findings.
- Each validation gate of the pipeline (G2 READY ≥8, G3 no open Critical/High) passed.
