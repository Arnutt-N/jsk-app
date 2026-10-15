# Plan Review: 2026-10-13-codebase-review-fix (round 2, REV 2 plan)

**Plan**: `.claude/PRPs/plans/2026-10-13-codebase-review-fix.plan.md`
**Verdict**: NOT READY
**Confidence Score**: 2/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | parent model | FAIL | 3 |
| B | context isolation only | FAIL | 3 |

Converged fixes in REV 2: verified drain/client-key/redis designs held (B3 mostly
PASS), ACTION format held (A2 PASS both). Remaining gaps below — all verified real
this session before revision.

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1/A3/A5 | Context/Patterns/UX | PASS | PASS | Self-contained; refs verified live |
| A2 | Readiness | PASS | PASS | 17/17 ACTION headers (B verified by grep count) |
| A4 | Validation | PASS | FAIL | B: B-tasks lack pytest file paths; C4/A5 CI-only |
| A6 | Prior knowledge | PASS | PASS | No history pointers; full paths |
| B1/B4/B5 | Spec/Scope/Risks | PASS | PASS | Aligned |
| B2 | Consistency | FAIL | FAIL | "26 High" typo (spec: 21); A5 skip-0 vs 8 real skips |
| B3 | Soundness | PASS | PASS | Drain/client-key/redis verified |
| B6 | Testability | FAIL | FAIL | Batched tasks missing per-item literal pairs |
| B7 | Coverage | PASS | PASS | 44 mapped (B: counted); A: shorthand prose |

## 🔴 Critical

- A5 false promise: `supervisor.spec.ts` has 8 `test.skip` lines (:94,:124,:132,:153,
  :195,:229,:254,:306 — verified by grep). Fix verified: seed normal + COMPLETED
  requests removes 7; :132 (terminal-state kebab hidden by design) legitimately stays.
  VALIDATE becomes grep-count ⇒ 1 with :132 named.
- Self-review "26 High" contradicts spec "21 High".
- A4: name exact pytest files per B-task (verified names this session:
  `test_broadcast_service.py`, `test_media_endpoints.py`,
  `test_liff_attachments_resolve.py`, `test_line_service_circuit_breaker.py`,
  `test_permissions.py`, `test_admin_requests_endpoints.py`,
  `test_auth_login_ratelimit.py`, `test_auth_rate_limit.py`, `test_ws_security.py`,
  `test_credential_service.py`, `test_pubsub_manager.py`, `test_handoff_service.py`,
  `test_webhook_deduplication.py`, `test_follow_welcome.py`) + `-k` filters for
  message_intake coverage.
- B6: literal input/expected per sub-item on A3/A4/B2/C3/C4/C6 (B1/B3/B4/B5/C1/C2/C5
  already carry pairs).

## 🟢 Minor

- None outstanding beyond the above.

## Recommended Next Step

Revise (REV 3: corrected A5 + counts + executable VALIDATEs + per-item pairs +
countable 44-row B7) and re-run the gate (loop 3 of max 3).
