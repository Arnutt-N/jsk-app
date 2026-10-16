# Findings — latest PR #258 follow-up (merged 2026-10-15, `fix/audit-f1f4` → `main`)

Scope: PR #258 diff only (13 files, +137/−17). Method: 4 parallel read-only review agents
(backend-tests, frontend, security, architecture) + parent verification of both Highs
against source. Gate G1: no code changed during review.
Source PR: `fix(audit): F1-F4 enterprise sweep fixes (ECC lane, cross-reviewed)`.
Prior findings F1–F6 live in `.audit/enterprise-audit-findings.md`; F1–F4 were fixed by #258,
F5 closed, F6 verified no-action.

## Result counts (after dedup)

- Critical: 0
- High: 2 (H1, H2 — both verified against source, must fix per G3)
- Medium: 7 (M1–M7)
- Low: 6 (L1–L6)
- Clean lanes: frontend (0 findings — F3/F4 implementation clean), security (0 findings — IRON RULE + gates intact)
- Total: 15. No duplicate root causes across agents (reporter count = 1 each unless noted).

## Verified Highs (parent-checked 2026-10-15)

- H1 verified: `backend/tests/test_inbox_distinct_on.py` builds its engine from
  `str(settings.DATABASE_URL)` (shared persistent DB) — see file lines ~30-34.
- H2 verified: `backend/app/services/live_chat_service/conversations.py:176`
  `line_id_map = await decrypt_line_ids_for_users(db, user_ids)` — single fail-loud
  batch decrypt gates the whole inbox listing; one stale-key row fails the window.

## Findings

### H1 — High (regression-risk, tests): equivalence node uses shared persistent DB
- Location: `backend/tests/test_inbox_distinct_on.py:43`
- Evidence: `engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)`
- Category: regression-risk. Reporter: backend-tests (1).
- Disposition: ACCEPT — fix now. Root cause of F2 flakiness class; violates
  testing_standards §2.3 (separate test DB). Fix: isolated test DB wiring with safe
  fallback (no CI break), plus nonce-scoped rows as defence in depth (see M3).

### H2 — High (architecture, backend): one stale-key row fails entire inbox listing
- Location: `backend/app/services/live_chat_service/conversations.py:176`
- Evidence: `line_id_map = await decrypt_line_ids_for_users(db, user_ids)`
- Category: architecture. Reporter: backend-tests (1).
- Disposition: ACCEPT — fix now, visibility-preserving. Production fail-loud contract is
  deliberate per audit, so the fix must NOT silently swallow decrypt failures: quarantine
  per-row `InvalidToken` → flagged/masked row + structured log + metric, listing stays up,
  security visibility kept. Tolerant variant stays confined to cleanup ticks.

### M1 — Medium (missing-test): pseudonym-gate admin endpoint untested
- Location: `backend/tests/test_health_hardening.py:14`
- Evidence: `for path in ("/api/v1/health/detailed", "/api/v1/health/websocket"):`
- Category: missing-test. Reporter: backend-tests (1).
- Disposition: ACCEPT — add `/api/v1/health/pseudonym-gate` (also `Depends(get_current_admin)`)
  to the same assertion loop. Test-only, zero prod risk.

### M2 — Medium (missing-test / naming): WS gate test covers HTTP-only path
- Location: `backend/tests/test_health_hardening.py:8`
- Evidence: `async def test_detailed_and_ws_health_require_admin(test_client, monkeypatch):`
- Category: missing-test. Reporter: backend-tests (1).
- Disposition: ACCEPT (small): either cover the real live-chat WebSocket gate
  (`access_live_chat`) or rename to `test_detailed_and_http_ws_health_require_admin`
  so the name does not over-claim. Prefer rename + comment (no new infra).

### M3 — Medium (edge-case): orphan/staff rows lack nonce scoping
- Location: `backend/tests/test_inbox_distinct_on.py:103`
- Evidence: `message_type="text", content="ut9-orphan", created_at=t2)`
- Category: edge-case. Reporter: backend-tests (1).
- Disposition: ACCEPT — include run nonce in orphan + staff-msg content and in the
  cleanup delete filter. Test-only, prevents cross-run collisions on shared DB.

### M4 — Low (bad-practice): SQL-string-count assertion tests implementation
- Location: `backend/tests/test_inbox_distinct_on.py:60`
- Evidence: `assert sql.count("DISTINCT ON") == 2`
- Category: bad-practice. Reporter: backend-tests (1). Severity Low (agent did not mark Medium).
- Disposition: DEFER — rewriting to pure behavior assertions is a larger test redesign;
  current assertion guards the R3-M19 index-driven contract and is green. Revisit when the
  inbox query is next touched. No code change.

### M5 — Medium (framework-issue): cipher cache precedence undocumented
- Location: `backend/app/services/credential_service.py:54`
- Evidence: `if self.cipher is not None:`
- Category: framework-issue. Reporter: backend-tests (1).
- Disposition: ACCEPT (docs, 1–2 lines): extend the F2 reset note with process-restart +
  `ENV_FILE` vs exported-env precedence (cached cipher ignores later key changes).

### M6 — Medium (process, bad-practice): 4 concerns bundled in one PR vs plan rule
- Location: `.claude/PRPs/plans/enterprise-audit-sweep.plan.md:42`
- Evidence: `Propose follow-up PR units (each: failing test first, then fix — sequence-verifiable-units), max 1 concern per PR, ordered by dependency.`
- Category: bad-practice (process). Reporter: architecture (1).
- Disposition: DOCUMENT AS LESSON — #258 is merged; un-bundling now would churn history.
  Adopt max-1-concern-per-PR for this follow-up (this plan keeps H1/H2/test/docs in one
  PR only because H1+M3+M5 are the same test-hygiene concern and H2 is the paired prod
  half; state this explicitly in the PRD). No code change for M6 itself.

### M7 — Medium (missing-test / evidence): build/unit verification lacks attached logs
- Location: `.audit/audit-fixes-ecc.md:94`
- Evidence: `` `npx tsc --noEmit` → exit 0; `npm run build` → exit 0, compiled + 49/49 static pages; ``
- Category: missing-test (evidence). Reporter: architecture (1).
- Disposition: ACCEPT (process): this follow-up attaches raw tails / merge-CI links for
  every validation command it runs. No retroactive re-runs of #258's long suites.

### M8 — Medium (evidence): fresh-DB verdict rests on lane receipt + count probe
- Location: `.audit/audit-fixes-ecc.md:33`
- Evidence: `Verification: `pytest tests/test_inbox_distinct_on.py -q` on the fresh DB → `2 passed`.`
- Category: missing-test (evidence). Reporter: architecture (1). (Numbered M8; 8 mediums total counting M1–M8 minus renumber — keep stable IDs: this is the 8th medium.)
- Disposition: ACCEPT (process): retain fresh-DB creation commands + rerun output (or a
  replayable script) for the H1 verification in this follow-up. No code change for M8 itself.

### L1 — Low (evidence): F3 stub proof not replayable after deletion
- Location: `.audit/audit-fixes-ecc.md:59`
- Evidence: `` `0 errors, 11 warnings`. Ignore proof: dropped a fatally-broken stub JS file into ``
- Category: missing-test (evidence). Reporter: architecture (1).
- Disposition: DEFER — #258's F3 ignore is proven and merged; re-proving with a repeatable
  snippet is nice-to-have. This follow-up records stub path + before/after output only if it
  touches eslint config (it does not plan to). No code change.

### L2 — Low (maintainability): audit doc file count off by one
- Location: `.audit/audit-fixes-ecc.md:74`
- Evidence: `- Diff (8 files):`
- Category: maintainability. Reporter: architecture (1).
- Disposition: ACCEPT — correct to 9 code files + audit doc (1-line doc fix, bundled with M5 note edit).

### L3 — Low (regression-risk): eslint ignore covers single report dir
- Location: `frontend/eslint.config.mjs:12`
- Evidence: `"playwright-report-2client/**",`
- Category: regression-risk. Reporter: architecture (1).
- Disposition: DEFER — single-dir naming contract holds today; widening to
  `playwright-report*/**` pre-ignores dirs that do not exist and weakens the explicitness
  of the F3 proof. Revisit if a second report dir appears. No code change.

### L4 — Low (regression-risk): fill-mode thumbnail lacks `sizes`
- Location: `frontend/app/admin/files/page.tsx:542`
- Evidence: `fill`
- Category: regression-risk (perf). Reporter: architecture (1).
- Disposition: DEFER — `unoptimized` bypasses the optimizer so `sizes` has no byte-saving
  effect here; admin thumbnails are low-traffic. Document reason, no code change.

### L5 — Low (maintainability): 13-line F2 module docstring embeds full how-to
- Location: `backend/tests/test_inbox_distinct_on.py:3`
- Evidence: `NOTE (F2, stale-data artifact — proven 2026-10-15): ``test_inbox_equivalence_db```
- Category: maintainability. Reporter: architecture (1).
- Disposition: DEFER — the long note is the deliberate hazard doc keeping the next runner
  from deleting shared-DB rows; trimming risks re-introducing that failure mode. M5 appends
  1–2 lines rather than trimming. No code change.

## Binding spec for PRD/PRP (accepted → tasks)

- H1 → isolated test-DB wiring + M3 nonce scoping (same test-hygiene concern).
- H2 → per-row quarantine with log + metric, listing stays up.
- M1 → pseudonym-gate path in admin-gate loop.
- M2 → rename test (no over-claim) + comment.
- M5 + L2 → F2 note append (precedence) + file-count correction (same doc edit).
- M7 + M8 → evidence discipline for this follow-up (validation section), no separate code task.
- M4, M6, L1, L3, L4, L5 → deferred/documented above, each with reason (no silent drops).

## Clean-lane confirmations (confidence signals)

- Frontend agent: [] — F3 ignore is class-change only; F4 dep-array / Image / destructure /
  mock-typing edits behavior-preserving. No follow-up code tasks from this lane.
- Security agent: [] — IRON RULE honored (counts/descriptions only); pytest dummy key is
  test-only; F1 test-only bypass pin does not weaken prod gates; fail-loud contract intact
  pending H2's visibility-preserving quarantine.
