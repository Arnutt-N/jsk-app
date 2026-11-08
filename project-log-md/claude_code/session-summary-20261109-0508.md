# Session Summary — claude_code — 2026-11-09

## What shipped
7 PRs merged to main, HEAD at `421f084`:
- #321 chat-histories + broadcast date filter (backend start_date/end_date, frontend DatePresetFilter)
- #322 bookings date filter (range on booking_date, legacy `date` kept)
- #323 friends/history date filter (range on FriendEvent.created_at)
- #324 refactor: `optional_range_utc` + `apply_optional_range` in date_windows, `useDatePresetFilter` hook for 5 pages, bookings unified to half-open
- #325 correct: pre-push guard, scripts/r.cjs, order-proof mock, rule table in CLAUDE.md
- #326 (hardening from interrogate: r.cjs no-cmd guard + cwd check, pre-push no-newline fix, installer backup + exit 1, mock fail-loud routing)
- #327 pre-commit guard (root cause of 5x direct-main commits: pre-push never fires when workflow is commit-then-reset)

All CI green on every PR (Backend Pytest, Frontend Lint+Build, Playwright Smoke, Encoding, Vercel).

## Verified facts (ran, not read)
- r.cjs guards: no-cmd → usage exit 2; outside repo root → exit 2; happy paths exit 0
- pre-commit blocks on main (BLOCKED message seen), passes on branch
- Installer: no .git → exit 0 silent; missing src under .git → exit 1; custom hook → backup + install
- Mock reorder-proof: swapped count/page order in service, 3/3 tests still pass
- Full suites: backend 40/40, frontend 41/41, lint + tsc clean

## Open / follow-up
1. `shell: true` in scripts/r.cjs (command injection surface; dev-tool local-only, low risk) — decide: allowlist or doc-only
2. OTHER-bucket mock branch (resolve_by_line_id path untested in this mock) — out of scope for the date tests
3. 13 test files still use order-based `side_effect=[...]` — follow-up sweep, not blocking
4. Interrogate adversaries 3+4 of PR325 + thermos bug/security retry: still pending/no-verdict; rerun if needed
5. pre-push hook has known `--no-verify` bypass (documented in hook); pre-commit is the real gate now

## Handoff pointer
Checkpoint: `.agents/state/checkpoints/handover-claude_code-20261109-0508.json`
