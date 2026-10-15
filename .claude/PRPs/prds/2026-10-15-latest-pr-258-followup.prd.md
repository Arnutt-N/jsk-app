# PRD — latest PR #258 follow-up (H1/H2 + test/docs hardening)

## Problem
PR #258 (merged as `a9d807c`) fixed audit findings F1–F4, but a read-only 4-lane review of
the #258 diff produced 15 findings: 0 Critical, **2 High**, 7 Medium, 6 Low.
Binding spec: `.claude/PRPs/findings/2026-10-15-latest-pr-258-findings.md`.
Per hard gate G3, the two Highs must be resolved before this work is done. Frontend and
security lanes returned clean (no code tasks from them).

## Root causes
- **H1 (regression-risk):** `test_inbox_equivalence_db` builds its engine from the shared
  `settings.DATABASE_URL` (`backend/tests/test_inbox_distinct_on.py:43`). Any stale row in
  the persistent dev DB encrypted under a different `ENCRYPTION_KEY` fails the node with
  `InvalidToken` even though the test's own nonce rows are fine. The #258 docstring note
  documents the hazard but the test still shares the DB — the flakiness class survives.
- **H2 (architecture):** `get_conversations` fail-loud batch-decodes every user row in the
  inbox window (`conversations.py:176` → `decrypt_line_ids_for_users`, fail-loud by design).
  One undecryptable row (stale key, incomplete backfill) fails the **entire** admin inbox
  listing. The audit explicitly keeps fail-loud as the prod contract, so the fix must
  quarantine per-row failures **without** silencing them (skip + count + log + metric,
  listing stays up).

## Impact
- H1: every local full-suite run on a used dev DB risks a red `test_inbox_equivalence_db`
  that looks like a regression but is environmental; erodes trust in the suite.
- H2: one bad row can take down the whole live-chat inbox view for agents — availability +
  support-operability impact. Security visibility must be preserved (no silent swallowing).

## Why now
#258 is merged; H1/H2 are its known leftovers with evidence in hand. Fixing now keeps the
audit sweep's "green gates" claim true on real dev DBs and prevents the first stale-key
row from paging as an inbox outage. All changes are small, test-first, and additive.

## Scope (accepted → fix; deferred → reason in findings file)
- FIX: H1 (isolated test DB wiring + nonce-scoped orphan/staff rows = M3, same concern),
  H2 (visibility-preserving quarantine), M1 (pseudonym-gate path in admin-gate test),
  M2 (rename test so it does not over-claim WS coverage), M5+L2 (F2 note: cipher-cache
  precedence append + audit-doc file-count correction).
- PROCESS (no code): M7+M8 evidence discipline — this PR attaches raw tails / CI links.
- DEFERRED with documented reasons (no code): M4 (SQL-string assert rewrite), M6 (un-bundle
  merged PR — lesson adopted going forward), L1 (F3 stub re-proof), L3 (wider eslint ignore),
  L4 (`sizes` prop — no-op under `unoptimized`), L5 (docstring trim — hazard doc stays).

## Constraints (IRON RULES + project rules)
- NEVER output key material in chat, summaries, logs, or docs — counts/hashes/presence only.
  The pytest dummy `ENCRYPTION_KEY` in `conftest.py` is test-only; never introduce a real key.
- No `.env` file created, modified, or committed. No Alembic revision (no schema change).
- No new dependencies. No eslint-config change. No weakening of prod auth gates or tests.
- Async by default; `select()` style; Pydantic schemas for new response fields if the
  endpoint enforces one (check first — the mixin currently returns plain dicts).
