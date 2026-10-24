# Todo — PR #259 review fixes, option A (Bug fix playbook, read-only except fix hunks)

Playbook steps (verbatim from playbooks/bug-fix.md):
- [x] 1. Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. (PG down here: wiring repro via runtime script + mocked TOCTOU repro; DB-node proof deferred to CI per step-5 exception.)
- [x] 2. Binary-search the cause. (Done in review: survives = get_db never overridden; TOCTOU = skip only covers quarantined_set.)
- [ ] 3. Plan the fix. If it crosses a function boundary, architect first. (skip architect: two contained hunks, design settled in review R5 — test-only override + one-line skip condition.)
- [ ] 3b. Delegate implementation to a subagent using your configured bug-fix model with a specific scope.
- [ ] 4. Verify on the same surface. The original repro now passes.
- [ ] 5. Stage the commits so the failing repro lands before the fix in git history. (TOCTOU red test first, then fix. Split-brain: no cheap local test path — needs 2 live PG DBs — skip per exception, CI proves.)
- [ ] 6. Run Opening a PR. (PR #259 exists: update body + watch checks green.)

Task todos:
- [x] F1. Wiring repro script (TEST_DATABASE_URL set → seed URL vs app URL diverge, no get_db override) — run, keep output
- [x] F2. TOCTOU red test added to test_conversations_quarantine.py (vanished row → 500 today) — run, keep output
- [x] F3. Delegate: get_db override in test_inbox_distinct_on.py + skip-condition hardening in conversations.py
- [x] F4. Verify: quarantine tests green, compile OK, collect-only health OK; review delegate diff myself
- [x] F5. deslop + technical-writing reads; commit (red test, then fix); push; update PR body; poll CI green
- [ ] skip deslop-noop: applied at F5 before commit as prescribed
