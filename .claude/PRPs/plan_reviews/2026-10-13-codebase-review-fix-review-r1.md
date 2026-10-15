# Plan Review: 2026-10-13-codebase-review-fix (round 1)

**Plan**: `.claude/PRPs/plans/2026-10-13-codebase-review-fix.plan.md`
**Reviewed**: 2026-10-13
**Source PRD**: `.claude/PRPs/prds/2026-10-13-codebase-review-fix.prd.md`
**Binding spec**: `.claude/PRPs/findings/2026-10-13-codebase-review-findings.md`
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation (mechanical; one shared
root cause per cluster, see note)

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | parent model | FAIL | 5 |
| B | context isolation only | FAIL | 4 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | PASS | File:line spans + SOURCE patterns + deps listed |
| A2 | Implementation Readiness | FAIL | FAIL | B/C tasks lack ACTION; short paths; search directives |
| A3 | Pattern Faithfulness | PASS | PASS | 16 + 6 refs spot-checked live, all real |
| A4 | Validation Coverage | PASS | PASS | Commands exist in project |
| A5 | UX Clarity | FAIL | FAIL | No before/after or N/A markers |
| A6 | No Prior Knowledge Test | FAIL | FAIL | Batched "per-finding" prose without concrete edits |
| B1 | Spec Coverage | PASS | PASS | AC1-AC4 mapped |
| B2 | Internal Consistency | FAIL | FAIL | "8 tasks" headers vs 6 listed; C3/C6 overlap; "Step 9" dangling |
| B3 | Technical Soundness | FAIL | FAIL | A2 assumes failure-reporting `drain_outbox` (returns None); B4 "existing proxy helper" absent from auth.py |
| B4 | Scope Discipline | PASS | PASS | NOT Building explicit |
| B5 | Risk Coverage | PASS | PASS | R1-R5 + GOTCHAs |
| B6 | Testability | PASS | FAIL | A: pairs present; B: batched tasks lack literal pairs |
| B7 | Finding Coverage | FAIL | FAIL | 48 M/L − 4 deferred = 44 to fix vs claimed 40; group-level mapping only |

## 🔴 Critical (must fix before implementing)

- A2 unimplementable as written: `drain_outbox(box) -> None` (verified
  `outbox.py:20`, logs-and-swallows) with 5 existing call sites; `delivery_failures`
  model has zero repo hits. Fix verified this session: change return to failure count,
  update all 5 callers, no new model.
- B4 helper missing: no forwarded/proxy helper in `auth.py`. Fix verified this session:
  `_client_key(request)` EXISTS in `core/http_rate_limit.py:34` (proxy-aware); auth's
  login limiter (`auth.py:59-84`) just doesn't use it. Import it there.
- B7 arithmetic: 44 M/L to fix, not 40. Needs an explicit per-finding table.
- A2/B2/B6: ACTION labels + full paths + enumerated targets on every task; fix phase
  counts (6, not 8); split C3/C6 cleanly; drop the "Step 9" reference.
- A5/A6/B6: N/A-internal-change markers, 3 user-visible before/afters, literal
  input/expected pairs on every batched task.

## 🟡 Important

- None separate — all findings above block single-pass implementation.

## 🟢 Minor / Suggestions

- B2 redis factory: verified `core/redis_client.py` EXISTS (used by auth/health/media/
  webhook) — route `pubsub_manager` through it (not new infra).
- `set_setting` callers enumerated this session: `settings.py:353`,
  `booking_settings.py:201` — both move in one wave.

## Reviewer Disagreements

- B6 only (A PASS, B FAIL) — resolved by adding literal pairs to batched tasks.

## Recommended Next Step

Revise (REV 2: verified outbox/client-key/redis designs + 44-row B7 table + full
PRP task format) and re-run the gate (loop 2 of max 3).
