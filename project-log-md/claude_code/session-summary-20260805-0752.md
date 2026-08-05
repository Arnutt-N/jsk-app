# Session Summary — claude_code — 2026-08-05T07:52:00+07:00

**Branch**: `main`  **HEAD**: `9da4b1a`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260805-0752.json`

## Objective
Answer "does production need a migration?", then close everything that question exposed.

## Completed

### 1. PROD migration status: nothing pending
Read-only verification against Supabase PROD (WSL, `venv_linux`):

```
python scripts/db_target.py alembic --target remote current → d5e6f7g8h9i0 (head)
python -m alembic heads                                     → d5e6f7g8h9i0  (single head, matches disk)
```

**0 revisions pending.** Notes claiming PROD sat at `z1a2b3c4d5e6` were stale — the 4
revisions after it were already applied: `a2b3c4d5e6f7` (strip leading `/` from
canned_responses.shortcut), `b3c4d5e6f7g8` (pseudonym EXPAND),
`c4d5e6f7g8h9` (operator_conversation_preferences), `d5e6f7g8h9i0` (pseudonym PREPARE).

`LINE_ID_STORAGE_MODE` still defaults to `plaintext` (`app/core/config.py:54`, unset in
`backend/.env`). The CONTRACT migration does not exist yet — that is the next PROD migration.

### 2. PR #183 merged (squash `9da4b1a`) — autogenerate is safe again

Two defects, both found by trying to answer the migration question.

**Defect A — autogenerate crashed outright.** `app/models/__init__.py` imported 24 of 29
model modules; `alembic/env.py:35` builds `target_metadata` from `import app.models`, so
metadata was incomplete and every autogenerate command died with
`NoReferencedTableError: ... could not find table 'rich_menus'`. Added `RichMenu`,
`Credential`, `FriendEvent`, `SystemSetting`, `ChatAnalytics` → 34 tables register.

**Defect B — the fixed autogenerate then proposed dropping 8 live indexes.** Root cause:
`index=True` generates `ix_<table>_<col>`, while hand-written migrations used `idx_<...>`
and explicitly named constraints. Alembic compares **by name**, so it saw unrelated objects.
The proposed drops included `uq_chat_sessions_one_open_per_user` and
`uq_user_rich_menu_links_user_id` — **the pseudonym uniqueness guards from `d5e6f7g8h9i0`**,
i.e. exactly the invariants PR C is being built on — plus `idx_messages_user_created`
(`line_user_id, created_at DESC`, behind conversation history),
`idx_chat_sessions_started_at`, `idx_chat_sessions_claimed_at`,
`ix_csat_responses_session_id`, `ix_user_tags_user_id`, `ix_user_tags_tag_id`.

Anyone generating the PR C destructive migration with `--autogenerate` would have dropped
them silently.

Fix: declare every index in `__table_args__` under the name PROD actually uses and remove
the competing `index=True`. Also corrected 5 real drifts where the MODEL was wrong (PROD
is correct — no migration): `audit_logs.user_agent` String(255)→String(500);
`audit_logs.action`/`resource_type` and `canned_responses.shortcut` → `nullable=False`;
`ondelete="SET NULL"` on `audit_logs.admin_id` and `permission_settings.updated_by_id`;
`rich_menus.status` Enum→String(9) (mirrors the existing `ChatSession.status` pattern).
Plus split unique-constraint-vs-index on `business_hours.day_of_week`,
`intent_categories.name`, `tags.name`, and dropped the redundant `index=True` on 13 PKs.

**Result: `alembic check --target remote` → `No new upgrade operations detected`.**
Was 40+ operations including 8 destructive ones.

### 3. Verification
- `alembic check` green against PROD (pre-commit, on the same code that merged)
- CI Backend Pytest **799 passed** — critically this covers the 60 DB-backed tests
  (`test_websocket`, `test_session_claim`, `test_reconnection`) that could NOT run locally
  (no Postgres/Redis on the dev box; Docker daemon was down). Those are the only tests that
  would catch a `rich_menus.status` type regression.
- All CI checks green (Frontend Lint/Build, Playwright Smoke, Encoding, Vercel)

### 4. Closed an open follow-up
The geography FK-nullability drift is resolved — `geography.py:21,35` declare
`province_id`/`district_id` as `nullable=True`, matching live schema.

## Not done / blocked

- **pseudonym gate not read.** Requires an admin cookie session; the browser tab had no
  session and entering credentials is out of scope for the agent. `curl` returns 401
  (cookie auth, `SameSite=Strict`). User needs to log in, then it is one `fetch` away.
- **Post-merge `alembic check` re-run timed out twice** (Supabase pooler dropped the
  connection after many checks this session). Not retried further. The pre-merge check on
  identical code was green and CI passed.

## Next Steps
- Read `GET /api/v1/health/pseudonym-gate` from a logged-in admin tab. Gate clock restarted
  2026-07-30 and was due ~2026-08-04, so it is ripe: need `gate_status: pass` +
  `fallback_hit_count: 0`.
- If it passes: write the PR C destructive-phase PRD + PRP (drop plaintext `line_user_id`
  on 7 tables, remove dual-write, flip `LINE_ID_STORAGE_MODE=pseudonym`). Autogenerate is
  now safe to use for that migration — that was the point of #183.
- Fix the 3 HIGH correctness defects from the 2026-08-02 architecture review: backend never
  enforces `STATUS_TRANSITIONS` (frontend-only state machine, so PENDING→COMPLETED skips
  approval), no audit log on ordinary status transitions, HTTP-vs-WS drift where
  `db.commit()` succeeds but the client is told the operation failed.

## Blockers
- _none_ (the gate read needs a human login, which is not a code blocker)
