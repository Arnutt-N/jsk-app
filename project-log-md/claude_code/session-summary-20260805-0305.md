# Session Summary — claude_code — 2026-08-05T03:05:00+07:00

**Branch**: `main`  **HEAD**: `6aece07`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260805-0305.json`

## Objective
Answer "does production need a migration?" — then fix what that check turned up.

## Completed

### 1. PROD migration status: nothing pending
Read-only verification against Supabase PROD (WSL, `venv_linux`):

```
python scripts/db_target.py show    --target remote  → aws-1-eu-central-1.pooler.supabase.com:5432/postgres
python scripts/db_target.py alembic --target remote current → d5e6f7g8h9i0 (head)
python -m alembic heads                                     → d5e6f7g8h9i0  (single head, matches disk)
```

PROD head equals the repo head — **0 revisions pending, no multiple-heads conflict**.
Prior notes claiming PROD sat at `z1a2b3c4d5e6` were stale: the 4 revisions after it
were already applied — `a2b3c4d5e6f7` (strip leading `/` from canned_responses.shortcut),
`b3c4d5e6f7g8` (LINE-ID pseudonym EXPAND), `c4d5e6f7g8h9` (operator_conversation_preferences),
`d5e6f7g8h9i0` (pseudonym PREPARE indexes).

`LINE_ID_STORAGE_MODE` still defaults to `plaintext` (`app/core/config.py:54`, unset in
`backend/.env`). The CONTRACT migration (drop plaintext `line_user_id`) does not exist
yet — that is the next PROD migration whenever the flag rollout completes.

### 2. Fixed: alembic autogenerate/check was crashing
`app/models/__init__.py` imported only 24 of 29 model modules, so `alembic/env.py:35`
(`import app.models`) built incomplete metadata and every autogenerate command died with:

```
sqlalchemy.exc.NoReferencedTableError: Foreign key associated with column
'rich_menu_aliases.rich_menu_id' could not find table 'rich_menus'
```

Added the 5 missing imports: `RichMenu`, `Credential`, `FriendEvent`, `SystemSetting`,
`ChatAnalytics` (`rich_menu` placed before `rich_menu_alias`, which FKs into it).

Verification: `import app.models, app.main` clean → metadata now registers **34 tables**;
`pytest -q` → **739 passed**, 60 errors solely from Postgres/Redis being down
(`PostgreSQL at 127.0.0.1:5432 and Redis at 127.0.0.1:6379 not reachable`), unrelated
to this change.

### 3. Mapped model-vs-PROD drift (`alembic check` now runs)
Drift is one-directional — hand-written migrations shaped PROD, the models never caught
up. **PROD is correct; do not migrate PROD from this diff.**

DANGEROUS — autogenerate proposes dropping 8 live indexes the models never declare in
`__table_args__`: `uq_chat_sessions_one_open_per_user`, `uq_user_rich_menu_links_user_id`
(both the pseudonym uniqueness guards from `d5e6f7g8h9i0`), `idx_messages_user_created`
(line_user_id, created_at DESC), `idx_chat_sessions_started_at`, `idx_chat_sessions_claimed_at`,
`ix_csat_responses_session_id`, `ix_user_tags_tag_id`, `ix_user_tags_user_id`.

Real drift to fix in the MODELS: `audit_logs.user_agent` String(255) vs DB VARCHAR(500);
missing `ondelete="SET NULL"` on `audit_logs.admin_id` and `permission_settings.updated_by_id`;
`rich_menus.status` model Enum vs DB VARCHAR(9); `audit_logs.action` / `resource_type` /
`canned_responses.shortcut` model-nullable vs DB NOT NULL.

Noise only: `ix_<table>_id` on ~12 primary keys (models say `primary_key=True, index=True`,
duplicating the PK index) and unique-constraint-vs-unique-index on `business_hours.day_of_week`,
`intent_categories.name`, `tags.name`.

The drift was inspected via a temporary autogenerate revision, which was deleted
immediately — it never touched the PROD database and is not in the tree.

### 4. Closed an open follow-up
The geography FK-nullability drift is resolved — `app/models/geography.py:21,35` now
declare `province_id` / `district_id` as `nullable=True`, matching live schema, and the
drift no longer appears in the comparison.

## Next Steps
- Declare the 8 hand-written PROD indexes in `__table_args__` so autogenerate stops proposing `drop_index` (highest value — closes the trap)
- Fix the 5 real model-vs-PROD drifts (Python-only, no PROD migration)
- Run full pytest with `docker compose up -d db redis` to clear the 60 infra errors

## Blockers
- _none_
