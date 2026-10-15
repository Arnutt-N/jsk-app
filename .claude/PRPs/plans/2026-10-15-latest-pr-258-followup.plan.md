# PRP — latest PR #258 follow-up (H1/H2 + test/docs hardening)

## Metadata
- Branch: `fix/latest-pr-258-followup-clean` (based on `origin/main` incl. #258 `a9d807c`)
- Binding spec: `.claude/PRPs/findings/2026-10-15-latest-pr-258-findings.md`
- PRD: `.claude/PRPs/prds/2026-10-15-latest-pr-258-followup.prd.md`
- Stack: FastAPI 0.109+ / Python 3.13 / SQLAlchemy 2.0 async / pytest + pytest-asyncio
  (backend); Next.js 16 / React 19 / vitest (frontend — NO frontend code changes in this plan)
- Skills applied: testing_standards (§1 behavior-not-impl, §2.3 test-DB hygiene),
  database_postgresql_standard (no Alembic bypass), error_handling, monitoring_logging,
  security_checklist (gates intact, IRON RULE), git_workflow (1 concern per PR — see deviation note)

## Files to Change
1. `backend/tests/test_inbox_distinct_on.py` — T1 (DB wiring + nonce scoping), T4 (note append)
2. `backend/app/services/user_identity_service.py` — T2 (quarantine helper, additive only)
3. `backend/app/services/live_chat_service/conversations.py` — T2 (call-site swap; pinned:
   `ConversationsMixin.get_conversations`, conversations.py:81)
3b. `backend/app/schemas/live_chat.py` — T2 (additive: `quarantined_count: int = 0` on
   `ConversationList`; `ConversationSummary` UNTOUCHED)
3c. `backend/app/api/v1/endpoints/admin_live_chat.py` — T2 (read-only reference: route
   `list_conversations` enforces `response_model=ConversationList`; no edit expected)
4. `backend/tests/test_conversations_quarantine.py` — T2 (NEW regression test)
5. `backend/tests/test_health_hardening.py` — T3 (pseudonym path + rename)
6. `.audit/audit-fixes-ecc.md` — T4 (L2 count fix; append follow-up entry, do NOT rewrite F1–F4)
7. Live-chat conversations route + row schema — PINNED (R5, ex-discovery item): route
   `backend/app/api/v1/endpoints/admin_live_chat.py:76` (`response_model=ConversationList`);
   schema `backend/app/schemas/live_chat.py:22-40` (`ConversationSummary.line_user_id: str`
   is REQUIRED — hence skip+count, never `None` rows).

## NOT Building
- No Alembic revision / schema change. No new dependencies / lockfile edits.
- No `frontend/**` edits (L3/L4 deferred with reasons). No eslint-config edits.
- No rewrite of the `DISTINCT ON` string-count assertion (M4 deferred).
- No un-bundling of merged #258 (M6 = lesson only). No trimming of the F2 hazard note (L5).
- No reuse of `decrypt_line_ids_for_users_tolerant` (cleanup-tick helper) in the listing path;
  T2 adds a dedicated quarantining helper with logging + metric instead.
- No `.env` files created/modified/committed. No secret values in code, docs, or logs.

## Step-by-Step Tasks

### T1 — H1+M3: isolate the equivalence test's database + nonce-scope its rows
- Finding coverage: H1 (isolated DB wiring) + M3 (nonce scoping, same test-hygiene concern).
  Root cause: shared `DATABASE_URL` + unscoped orphan rows. Fix strategy: env-resolved DB URL
  with CI-safe fallback + nonce in row contents and cleanup filter. Required tests: node green
  on default AND second DB (both tails blocking). Regression risk if missed: F2-class flakiness returns.
- ACTION: read `backend/tests/conftest.py:17-36` (`setdefault` env defaults) and
  `backend/tests/test_inbox_distinct_on.py:1-45` (`_test_session`, `_db_reachable`).
- IMPLEMENT in `test_inbox_distinct_on.py`:
  1. Resolve DB URL as `os.environ.get("TEST_DATABASE_URL", str(settings.DATABASE_URL))`
     inside `_test_session()` (add `import os`); engine + NullPool otherwise unchanged.
     Fallback keeps CI green when `TEST_DATABASE_URL` is unset; setting it isolates dev runs.
  2. Gate `_db_reachable()` on the same resolved URL (probe host/port parsed from it, not
     hardcoded) so skip logic follows the actual target.
  3. (M3) Include the run `nonce` in `ut9-orphan` and `ut9-staff-msg` contents
     (e.g. `f"ut9-orphan-{nonce}"`) AND in the cleanup `delete(... where Message.content == ...)`
     filter; update the exclusion assertion `not in (...)` to the nonced values.
- MIRROR: none (test-only).
- VALIDATE: `python -m pytest tests/test_inbox_distinct_on.py -q` green with default env
  AND with `TEST_DATABASE_URL` pointing at a second database; paste both tails into the PR.
- Required tests: the node itself (both env states). Regression risk if missed: shared-DB
  flakiness (F2 class) returns on the next stale row.

### T2 — H2: quarantine per-row decrypt failures in the inbox listing (visibility-preserving)
- ACTION: read `user_identity_service.py:150-200` (fail-loud + tolerant variants),
  `conversations.py:1-30` (imports incl. `logger`) and `conversations.py:170-235`
  (listing construction), PLUS `schemas/live_chat.py:1-45` (ConversationSummary/
  ConversationList — row shape is enforced) and `admin_live_chat.py:70-90` (route
  `response_model=ConversationList`).
- IMPLEMENT:
  1. In `user_identity_service.py`, add `decrypt_line_ids_for_users_quarantined(db, user_ids)`
     returning `(mapping: dict[int, str], quarantined: list[int])`: per-row try/except around
     `_decrypt_line_id` catching `Exception` (covers `InvalidToken` + missing-token
     `RuntimeError`); per skipped row `logger.warning("inbox decrypt quarantine: user %s ...", uid)`
     (uid only, never token material) + best-effort counter increment — grep for an existing
     metrics/counter helper first; if none exists, logging only (do NOT invent infra).
     Docstring: listing-path helper; fail-loud `decrypt_line_ids_for_users` stays for all
     other callers (do NOT change its body).
  1b. Metric (R3): grep the existing counter precedent first
     (`app/core/pseudonym_gate.py` counter design, `get_gate_status`). Reuse that counter
     helper for `inbox_decrypt_quarantine_total` if one fits; if NO reusable counter exists,
     `logger.warning` (uid only) + the `quarantined_count` response field IS the visibility
     proof, and the
     PR body names the metric as follow-up (explicit, not silent). Do NOT invent new infra.
  2. In `ConversationsMixin.get_conversations` (conversations.py:81), swap ONLY the line-176
     call to the quarantined helper:
     `line_id_map, quarantined = await decrypt_line_ids_for_users_quarantined(db, user_ids)`.
     Everything downstream (`tag_map`, `unread_counts`, `pref_map`) unchanged.
  3. Skip quarantined rows (R5 — REQUIRED, not flaggable): `ConversationSummary.line_user_id`
     is a required `str` (`schemas/live_chat.py:22`) and the route enforces
     `response_model=ConversationList`, so emitting `line_user_id=None` rows would 500 on
     response validation. Build `quarantined_set = set(quarantined)` before the row loop and
     `continue` (skip) users in the set. Add additive `quarantined_count: int = 0` to
     `ConversationList` (default keeps old clients/old tests safe; `ConversationSummary`
     UNTOUCHED) and return `"quarantined_count": len(quarantined)` in the result dict.
     Visibility proof = skipped-row count in response + `logger.warning` per row (+ reused
     counter or named follow-up per 1b) — the failure is counted and logged, never silent.
- MIRROR: NEW `backend/tests/test_conversations_quarantine.py` — MANDATORY integration proof
  (no escape hatch): drive `ConversationsMixin.get_conversations` (conversations.py:81) with
  an AsyncMock `db` whose `execute` yields 2 user rows (one token decrypting under the pytest
  dummy key, one garbage). Assert: no exception escapes; good row present with its
  `line_user_id`; bad row ABSENT from `conversations`; top-level `quarantined_count == 1`.
  Validate the returned payload against the `ConversationList` schema (must not 500 on
  `line_user_id: str`). A helper-direct unit test is allowed ONLY as an extra, never as
  the substitute.
- Finding coverage: H2. Root cause: single fail-loud batch decrypt gates the whole listing.
  Fix strategy: additive quarantining helper + call-site swap + skip with count (fail-loud fn
  untouched). Required tests: new quarantine test, red-first on pre-fix code (`InvalidToken`
  escapes). Regression risk if missed: §T2 body.
- VALIDATE: new test file green + `tests/test_inbox_distinct_on.py` still green
  (listing path changed — the equivalence node is the integration proof).
- Required tests: new quarantine test (red-first: fails on old code with InvalidToken;
  ALSO red on the naive per-row-`None` variant via `ConversationList` response validation).
  Regression risk if missed: silent-swallowing (forbidden — count+log+metric are the proof
  it is not silent) or breaking every other `decrypt_line_ids_for_users` caller (forbidden —
  helper is additive, old function untouched).

### T3 — M1+M2: health admin-gate test covers pseudonym gate + honest name
- Finding coverage: M1 (pseudonym-gate path) + M2 (rename, no over-claim). Root cause: new
  admin-gated route lacks 401/403 proof; test name over-claims WS coverage. Fix strategy:
  extend loop tuple + rename + comment. Required tests: file green in bypass on/off matrix.
  Regression risk if missed: §T3 body.
- ACTION: read `backend/app/api/v1/endpoints/health.py:57-100` (all three admin-gated
  routes use `Depends(get_current_admin)`) and `test_health_hardening.py:1-16`. FIRST grep
  CI + docs for the old test name (`grep -rn detailed_and_ws_health_require_admin
  .github/ docs/ backend/ | head`) — if any `-k` filter or doc references it, update the
  reference in the same commit or keep an alias; do NOT break selectors silently.
- IMPLEMENT in `test_health_hardening.py`: rename
  `test_detailed_and_ws_health_require_admin` → `test_detailed_and_http_ws_health_require_admin`
  (M2 — the test asserts HTTP health endpoints, not the live-chat WS `access_live_chat` gate;
  add a comment stating that), keep the `monkeypatch` bypass-off pin, extend the loop tuple
  with `"/api/v1/health/pseudonym-gate"` (M1). No other edits.
- MIRROR: none (test-only).
- VALIDATE: `python -m pytest tests/test_health_hardening.py -q` green with bypass unset AND
  with `DEV_AUTH_BYPASS=true` exported (the F1 matrix). Paste both tails.
- Required tests: the file itself. Regression risk if missed: pseudonym gate loses its
  401/403 proof; test name keeps over-claiming WS coverage.

### T4 — M5+L2: docs (cipher-cache precedence + audit file-count correction)
- Finding coverage: M5 (precedence note) + L2 (file-count correction).
- ACTION: read `credential_service.py:40-70` (cipher caching) and
  `.audit/audit-fixes-ecc.md:30-40, 70-80`.
- IMPLEMENT:
  1. Append 1–2 lines to the F2 module-docstring note in `test_inbox_distinct_on.py`
     (T1 touches this file already): cipher is cached per process — changing the key
     requires a process restart; `ENV_FILE` vs exported-env precedence decides which key
     wins. No other docstring edits (L5: the long note stays).
  2. In `.audit/audit-fixes-ecc.md`: fix `- Diff (8 files):` → `- Diff (9 code files + this doc):`
     (L2) and append a short `## Follow-up (PR #TBD)` entry listing H1/H2/M1/M2/M3/M5
     fixes + validation tails. Do NOT rewrite the F1–F4 sections.
- MIRROR: none.
- VALIDATE: `git diff --stat` shows docs-only for these two hunks; no test rerun required
  beyond T1's.
- Required tests: none new. Regression risk: none (docs), but keep the note accurate —
  verify precedence claim against `conftest.py` + `config.py` before writing.

### T5 — M7+M8: evidence discipline (process, no code)
- Finding coverage: M7 (attach tails/CI links) + M8 (retain fresh/second-DB commands).
- ACTION: none beyond execution hygiene.
- IMPLEMENT: every VALIDATE run in T1–T3 pastes raw command + tail output (or merge-CI links)
  into the PR body; record fresh/second-DB creation commands for the H1 proof (M8).
- VALIDATE: PR body checklist complete: scoped pytest (both env states) ×2 files, new
  quarantine test, health matrix (bypass on/off). No frontend suites (no frontend changes).

## Validation Commands (run from `backend/`; WSL required; Docker `db`+`redis` up)
```bash
python -m pytest tests/test_health_hardening.py tests/test_inbox_distinct_on.py tests/test_conversations_quarantine.py -q
# + matrix rerun: DEV_AUTH_BYPASS=true python -m pytest tests/test_health_hardening.py -q
# + isolation rerun: TEST_DATABASE_URL=<second-db-url> python -m pytest tests/test_inbox_distinct_on.py -q
python -m pytest -q            # full suite before PR (long; attach tail)
```
Frontend: no changes → no `lint`/`tsc`/`build`/`test:unit` reruns required (state why in PR).
Per-change rule: validate immediately after each task (scoped tests); never accumulate broken state.

## Testing Strategy
- Red-first where cheap: T2 quarantine test must fail on pre-fix code (`InvalidToken`
  escapes); T1 isolation proved by running the node against default vs second DB.
- Test behavior, not implementation (testing_standards §1): quarantine test asserts listing
  shape/counts, not internal call counts; keep the `DISTINCT ON` string assertion as-is (M4 deferred).
- No weakening: no skipped tests removed/added except the nonce fix; no assertion relaxed.

## Acceptance Criteria
- [ ] G3: H1 + H2 fixed and validated; zero Critical/High remain (findings file updated).
- [ ] M1/M2/M3/M5/L2 done; M4/M6/L1/L3/L4/L5 deferred with reasons (already in findings file).
- [ ] New quarantine test red-first → green (integration proof via `get_conversations`, R1);
      health matrix (bypass on/off) green; inbox node green on default + isolated DB
      (second-DB tail BLOCKING, R4); old-test-name grep clean (R4).
- [ ] Visibility proof for H2: `quarantined_count` in response + `logger.warning` present;
      counter reused or metric named as follow-up in PR body (R3); `ConversationSummary`
      untouched, no `None` line_user_id rows (R5).
- [ ] No `.env` created/modified/committed; no secret material in diff (counts-only);
      `git diff --stat` reviewed for unrelated changes (none).
- [ ] Gate G2 result (this plan's review report): verdict + confidence + link, recorded below.
- [ ] Branch `fix/latest-pr-258-followup-clean` → PR → merge per git_workflow.

## Deviation note (M6 lesson, pre-declared)
The sweep plan prescribes max-1-concern per PR. This follow-up bundles H1+M3+M5 (one
test-hygiene concern: shared-DB flakiness) + H2 (its paired prod half: stale rows must not
fail the listing) + M1/M2 (same admin-gate test function) + doc touch-ups. Justification:
all hunks are small, test-first, and H1-without-H2 (or vice versa) leaves the stale-row
class half-fixed. Recorded here so the G2 reviewers judge it explicitly.
