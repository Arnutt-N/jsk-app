# Session Handoff — claude_code (Claude Fable 5)

**Agent**: `claude_code` — Claude Code CLI, model Claude Fable 5
**Timestamp**: 2026-07-03T06:55:09+07:00
**Branch**: `main` (all work pushed; working tree clean at handoff time)
**Session span**: 2026-07-02 ~21:00 → 2026-07-03 06:55 (+07:00)

This document is the human-readable rollup of the whole session. The
machine-readable source of truth is the checkpoint JSONs listed under
References — do not hand-edit `TASK_LOG.md` / `SESSION_INDEX.md`.

---

## ✅ Tasks DONE (chronological)

1. **Continued CodeX's session** (`project-log-md/codeX/session-summary-20260702-1423-codex.md`)
   — took over its 19-file uncommitted live-chat fix and its pending checklist.
2. **WSL stack up from cold** — backend :8000 + frontend :3000 in WSL `Ubuntu`,
   docker db/redis on Windows host, routes warmed, E2E data reseeded.
   Playwright was already installed by CodeX (chromium-1217, deps validated).
3. **3-agent parallel review** of the uncommitted diff (ecc:fastapi-reviewer /
   ecc:react-reviewer / ecc:security-reviewer) → found **2 CRITICALs in files
   CodeX never touched** (`useWebSocket.ts` dropped the `options` param so
   `{queue:false}` never took effect → deterministic double-send;
   `client.ts sendRaw()` swallowed errors → false success) + 1 HIGH
   (`initiate_handoff` unguarded IntegrityError → silent customer-message loss).
4. **Fixed 9 review findings** (backend savepoint guard + test, shared
   sanitizer for `initial_message`, honest WS `retryable`, options forwarding,
   direct frame write, retry quota fix, rate-limit toast filter, pending kept
   during HTTP fallback, Thai aria-label e2e selectors).
5. **Validated + shipped** commit `ba16647` (pushed → auto-deploy Vercel+Koyeb):
   WSL pytest 517, tsc/eslint 0, vitest 289/289, smoke green, **2-client
   acceptance 2/2 in a single run**. Plus `4932cbe` (unrelated doc) and handoff
   commits.
6. **Applied migration `v2w3x4y5z6a7` to Supabase PROD** — pre-check found 0
   open sessions / 0 duplicates (no cleanup needed); verified
   `alembic_version` + index `uq_chat_sessions_one_open_per_line_user` in
   `pg_indexes`. PROD now enforces one open chat session per LINE user.
7. **Shipped the 3 deferred follow-ups** (commit `1e5cf5d`): typing_start
   throttled to 1 frame/room/3s; Thai WS-error map
   (`frontend/app/admin/live-chat/_lib/wsErrorMessages.ts` — keys must match
   backend strings EXACTLY); `message_failed.retryable` consumed end-to-end
   (`nonRetryableMessages` store set → retry button removed when backend
   confirmed delivery). vitest 291/291.
8. **Re-ran E2E on final code**: smoke **4/4**, 2-client **2/2** (single run).
9. **Fixed + closed issue #120** — new `find_intent_keyword()` in
   `backend/app/api/v1/endpoints/webhook.py`: priority EXACT > STARTS_WITH >
   CONTAINS > REGEX, case-insensitive; REGEX evaluated in Python with ReDoS
   guards (pattern ≤256 chars, probe ≤1000 chars, invalid patterns logged +
   skipped). **Also fixed a latent bug: the old flow fetched the IntentKeyword
   CONTAINS match but never used it to build a response.** 8 new unit tests
   (`backend/tests/test_webhook_intent_matching.py`); pytest **525 passed**.
   Pushed (`8715338..9a923d0`) → Koyeb auto-deploys.

## ⏳ Tasks PENDING (for the next agent, in priority order)

1. **Supabase keepalive / GitHub Actions** — Actions disabled since 2026-06-20
   (quota exhausted); nothing pings Supabase, and free tier **auto-pauses the
   PROD database** when idle. July quota has reset → either re-enable Actions
   (+ scheduled keepalive workflow, regains CI too) or use an external cron
   (e.g. cron-job.org) hitting a light endpoint every ~15 min. Quick win;
   silent production risk until done.
2. **Verify #120 on prod LINE OA** (needs a human with the LINE app): create a
   STARTS_WITH test intent in the admin UI, message the OA, confirm the bot
   replies. Do the same for a simple REGEX intent.
3. **Issue #121** — chatbot Phase 4 PR2 Phase B deferred test coverage +
   a11y/security polish (reply-object editors page).
4. **6 deferred live-chat items** — see `.claude/PRPs/reviews/pr-116-review.md`.
   Highest-value: `broadcast_to_all` double-delivery under Redis self-loopback
   (matters at multi-server scale) and JWT-in-WS-URL hygiene.
5. **Housekeeping**: WSL dev servers were left running **detached** (nohup).
   Stop with `wsl -d Ubuntu pkill -f run.py` and
   `wsl -d Ubuntu pkill -f "next dev"` when no longer needed.

## Environment notes (verified this session)

- WSL distro = default **`Ubuntu`** (fresh install by CodeX; `jsk-ubuntu` /
  `Ubuntu-26.04` are stale). Node 20.20.0; `backend/venv_linux` = Python
  3.13.12. First WSL wake after reboot may throw `HCS_E_CONNECTION_TIMEOUT` —
  retry once.
- Actions are OFF → run the full validation matrix locally before push
  (backend pytest in WSL; frontend tsc/eslint/vitest in WSL; e2e recipe below).
- E2E recipe: docker db/redis on Windows host; backend + frontend both in WSL;
  seed via `create_test_users.py --apply` + `seed_admin.py --apply` +
  `seed_live_chat_e2e.py --apply` (all `ENV_FILE=app/.env`; **`seed_admin.py`
  is dry-run without `--apply`**); test credentials per
  `.agents` recipe / project memory (redacted here); 2-client spec:
  `npm run test:e2e:2client` with `E2E_SEED_CMD` set to the seed command.
- **Background-task gotcha**: long-running background shells were killed twice
  mid-session. Start servers detached (`nohup ... & disown`) inside WSL and
  run test suites in the foreground.
- `python scripts/db_target.py alembic --target remote ...` = Supabase PROD
  (`aws-1-eu-central-1.pooler.supabase.com`); PROD head is now `v2w3x4y5z6a7`.
- `settings.DATABASE_URL` is a Pydantic `PostgresDsn` — `str()` it before parsing.

## Suggested skills (invoke before the matching task)

| Task | Skill |
|---|---|
| Webhook / intent matching changes (#120 verify) | `skn-webhook-handler` |
| Reply-object editors polish (#121) | `skn-chatbot-frontend`, `skn-reply-auto` |
| Live-chat WS debt (pr-116 items) | `skn-live-chat-ops`, `skn-live-chat-frontend` |
| Any DB migration | `skn-migration-helper` |
| GitHub Actions re-enable / keepalive workflow | `github-ops` |
| Pre-commit review (mandatory per user rules) | ecc review agents (fastapi/react/security) |

**Review lesson worth carrying forward**: when a diff threads a new
argument/contract through hook layers, review the UNCHANGED intermediary files
end-to-end — both CRITICALs this session lived in files the diff never touched,
invisible to tsc, eslint, and layer-mocked unit tests.

## References (do not duplicate — read these)

- Checkpoints: `.agents/state/checkpoints/handover-claude_code-20260702-2355.json`,
  `-20260703-0001.json`, `-20260703-0143.json`, `-20260703-0404.json`, `-20260703-0621.json`
- Session summaries (same timestamps) in `project-log-md/claude_code/`
- CodeX origin: `project-log-md/codeX/session-summary-20260702-1423-codex.md`
- Deferred live-chat debt: `.claude/PRPs/reviews/pr-116-review.md`
- Project memory (Claude): `project_codex_livechat_hardening`,
  `project_prod_migration_state`, `project_chatbot_prs_111_112`
- Commits (all on `main`): `ba16647`, `4932cbe`, `c6c608f`, `4aa29dd`,
  `1e5cf5d`, `8715338`, `9a923d0` + the #120 fix commit directly before `9a923d0`
