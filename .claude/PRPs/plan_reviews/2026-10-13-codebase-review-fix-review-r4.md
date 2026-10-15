# Plan Review: 2026-10-13-codebase-review-fix (round 4, REV 4 plan — cap override authorized)

**Verdict**: NOT READY
**Confidence Score**: 5/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Verdict | Critical issues |
|---|---|---|
| A | FAIL | 4 |
| B | FAIL | 3 |

Round-3 items verified closed (A5 grep, B1 wording, B7 rows, serialization rules,
B2/B5 pairs). New verified gaps only — foundation stable 4 rounds running.

## Rubric Results

| # | A | B | Note |
|---|---|---|---|
| A1/A2/A3/A5/A6 | PASS | PASS | Format, refs, UX, knowledge all hold |
| A4 | FAIL | PASS | A: unnamed snapshot test + vague C6/C4 paths |
| B1/B4/B5 | PASS | PASS | Scope and risks hold |
| B2 | FAIL | FAIL | Title REV 3 vs metadata REV 4 |
| B3 | FAIL(A)/PASS(B) | — | A: C3 grep-0 impossible, User import must stay |
| B6 | FAIL | FAIL | C3/C4/C6 still short on per-item pairs |
| B7 | PASS | PASS | Counts reconcile, zero orphans (both) |

## 🔴 Critical (6 small fixes)

1. Title H1 → REV 4 (both reviewers).
2. C3 VALIDATE: `admin_audit.py` keeps `User` import (:11, used :27/:68/:102) — gate
   becomes `grep -c "AuditLog" admin_audit.py` ⇒ 0; name NEW
   `tests/test_admin_route_snapshot.py` for the route list.
3. C4 sleep list: real fixed sleeps are supervisor:81, supervisor:311,
   layout:79 (verified); polish:43 is the HELPER evidence (M-TEST-02), not a sleep.
4. Per-item pairs: C3 (compose header, migration note, cd.yml), C4 (CI Postgres,
   unstub, helper, each sleep, screenshot), C6 (remaining smalls) — one line each.
5. C6 VALIDATE paths: `npx vitest run hooks components/ui` (exact dirs); C4 specs
   listed explicitly.
6. B3 holds (drain/client-key/redis verified again this round).

## Recommended Next Step

REV 5 applying exactly the 6 fixes above (no reviewer disagrees on any of them),
then implement Phase A directly — 4 consecutive rounds agree the foundation is
sound; residual findings are plan-precision only.
