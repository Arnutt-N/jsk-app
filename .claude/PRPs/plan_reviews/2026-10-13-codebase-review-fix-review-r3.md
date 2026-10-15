# Plan Review: 2026-10-13-codebase-review-fix (round 3, REV 3 plan)

**Plan**: `.claude/PRPs/plans/2026-10-13-codebase-review-fix.plan.md`
**Verdict**: NOT READY (3rd loop — cap reached, escalating per workflow)
**Confidence Score**: 4/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | parent model | FAIL | 5 |
| B | context isolation only | FAIL | 3 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1/A2/A3/A5/A6 | Context/Format/Patterns/UX/Knowledge | PASS | PASS | Self-contained, 17/17 headers, refs live, N/A+before/after |
| A4 | Validation | FAIL | FAIL | C3 grep-0 impossible (59 matches); A5 unescaped-grep count wrong (9 vs 8, post-fix 2 vs claimed 1); NEW-file paths; B-tasks lack file paths (B) |
| B1/B4/B5 | Spec/Scope/Risks | PASS | PASS | Aligned |
| B2 | Consistency | FAIL | FAIL | A5 skip math; shared-file serialization false; C5/C6 hook conflict |
| B3 | Soundness | FAIL(A)/PASS(B) | — | A: B1 byte-identical vs counts-populated contradiction |
| B6 | Testability | FAIL | FAIL | Batched C3/C4/C5/C6 (+B2) lack per-item literal pairs |
| B7 | Coverage | FAIL(A)/PASS(B) | — | A: shorthand prose, not countable 44 rows |

## 🔴 Critical (all verified real — 6 small fixes, no foundation change)

1. C3 gate: scope grep to `admin_audit.py` (expect 0 there), not whole `api/` (59 legit matches).
2. A5 gate: `grep -c "test\.skip\("` escaped; post-fix expected count is 1 (only by-design :132); :188 comment retained intentionally.
3. Serialization: Phase B/C tasks sharing a file run sequentially in listed order (auth.py, broadcast_service.py, admin_requests.py, config.py); C6 hook-merge runs AFTER C5 with NEW retry tests carried over (or fold C5 hook items into C6).
4. B1 wording: counts fix CHANGES values (0/None → populated) — behavior-changing fix with updated snapshots, not byte-identical.
5. Per-item literal pairs on B2/C1/C2/C3/C4/C5/C6 (one line per sub-finding).
6. B7 as true rows (expand `sleeps×3` to 3 rows; fix "26 High" if still present).

## Recommended Next Step (escalation — cap reached)

Do NOT run gate loop 4 unprompted. Options for the human:
(a) Authorize REV 4 applying exactly the 6 fixes above, then implement Phase A (Criticals) first without another full gate.
(b) Authorize gate loop 4 anyway (cap override) before any implementation.
(c) Descope (e.g. Criticals-only batch) and re-plan the remainder later.
Recommendation: (a) — residual items are plan-precision, foundation is stable across 3 rounds.
