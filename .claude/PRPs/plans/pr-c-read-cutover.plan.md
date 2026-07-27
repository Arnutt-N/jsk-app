# PR C Read-Cutover — PRP Implementation Plan

> **Status:** APPROVED (plan `~/.qoder/plans/windy-brook-smew.md`) + ERRATA applied from
> 12-agent validation workflow (run `wf_511889f2-83b`, verdict **GO_WITH_ERRATA**:
> 48 refs → 47 valid / 1 drifted / 0 missing / 0 blockers).
> **Branch:** `feat/pr-c-read-cutover`

## Goal
Convert ~50 query paths across 10 files from direct `line_user_id` string filtering to
mode-aware queries using `child_filter` / `resolve_by_line_id` (+ 4 new helpers), so the
codebase works in both `dual` and `pseudonym` storage modes.

## Current State
- `LINE_ID_STORAGE_MODE=dual` on prod (plaintext column still exists, hash column populated, backfill 0 NULL hashes).
- `child_filter(model, line_user_id, user_id)` exists (user_identity_service.py:102) — used in 2 places.
- `resolve_by_line_id(db, raw)` exists (user_identity_service.py:63) — hash-first + plaintext fallback + lazy backfill + gate counter.
- All 7 child tables already have `user_id` FK column (from PR A/B).

## New Helpers (in `user_identity_service.py`)

### 1. `child_column(model)` — mode-aware column for partition_by/group_by/distinct
```python
def child_column(model):
    if settings.LINE_ID_STORAGE_MODE == "pseudonym":
        return model.user_id
    return model.line_user_id
```

### 2. `child_join_condition(parent_model, child_model)` — mode-aware JOIN
```python
def child_join_condition(parent_model, child_model):
    if settings.LINE_ID_STORAGE_MODE == "pseudonym":
        return parent_model.user_id == child_model.user_id
    return parent_model.line_user_id == child_model.line_user_id
```

### 3. `user_identity_filter()` — "is a LINE user" existence check on User table
```python
def user_identity_filter():
    if settings.LINE_ID_STORAGE_MODE == "pseudonym":
        return User.line_user_id_hash.isnot(None)
    return User.line_user_id.isnot(None)
```

### 4. `resolve_many_by_line_id(db, line_user_ids)` — batch resolve for IN queries
```python
async def resolve_many_by_line_id(db, line_user_ids: list[str]) -> dict[str, int]:
    """Map line_user_id -> user.id for a batch. Hash IN lookup, plaintext fallback for misses."""
```

## File-by-File Conversion (ordered by complexity)

### Phase 1: Simple User lookups → `resolve_by_line_id`
| File | Line | Function |
|------|------|----------|
| `live_chat_service/sessions.py` | 93 | `close_session` |
| `live_chat_service/messaging.py` | 153 | `set_chat_mode` |
| `live_chat_service/conversations.py` | 234 | `get_conversation_detail` |
| `api/v1/endpoints/admin_export.py` | 49 | `_get_display_name` |
| `friend_service.py` | 125 | `handle_follow` |
| `friend_service.py` | 157 | `handle_unfollow` |

**ERRATA:** `admin_export.py:49` selects ONLY `User.display_name` with `.limit(1)` and falls
back to the raw line_user_id — NOT a full `select(User)`. Convert to resolve_by_line_id then
read `user.display_name`, preserving the raw-ID fallback string.

### Phase 2: Simple child-table WHERE → `child_filter`
Pattern: resolve user first (`resolve_by_line_id`), then `child_filter(Model, raw, user.id if user else None)`.
| File | Line | Function |
|------|------|----------|
| `live_chat_service/conversations.py` | 27 | `get_recent_messages` |
| `live_chat_service/conversations.py` | 42 | `get_messages_paginated` |
| `live_chat_service/conversations.py` | 215 | `search_messages` (filter) |
| `live_chat_service/unread.py` | 31 | `get_unread_count` |
| `line_service.py` | 232 | `get_incoming_message_by_line_message_id` |
| `api/v1/endpoints/admin_export.py` | 41 | `_get_conversation_messages` |
| `friend_service.py` | 117 | `_get_refollow_count` |
| `friend_service.py` | 185 | `get_friend_events` |
| `friend_service.py` | 210 | `get_all_friend_events` (filter) |

**ERRATA:** preserve `Message.direction == INCOMING` predicates (unread.py:32/78/106).

### Phase 3: UPDATE on User table → resolve first, update by PK
| File | Line | Function |
|------|------|----------|
| `tasks/session_cleanup.py` | 88 | `_close_inactive_session` |
| `tasks/session_cleanup.py` | 136 | `_mark_abandoned_waiting_session` |

**ERRATA:** actual UPDATE sites are lines 86-90 and 134-138; both hard-set
`chat_mode=ChatMode.BOT` keyed on `session.line_user_id` (ChatMode import at line 13).
Session already has `session.user_id` FK — use `User.id == session.user_id` with
`User.line_user_id == session.line_user_id` fallback. Lines 107/111/118/155/159/166 are
push/ws/log uses, NOT queries — leave untouched.

### Phase 4: JOINs → `child_join_condition`
| File | Line | Function |
|------|------|----------|
| `live_chat_service/conversations.py` | 107, 114 | `get_conversations` (outerjoin session/message) |
| `live_chat_service/conversations.py` | 208 | `search_messages` (join User) |
| `friend_service.py` | 206 | `get_all_friend_events` (outerjoin User) |

**ERRATA:** friend_service.py:206 outerjoin references line_user_id on BOTH FriendEvent and
User sides — both must go through the mode-aware condition.

### Phase 5: Window functions / partition_by → `child_column`
| File | Line | Function |
|------|------|----------|
| `live_chat_service/conversations.py` | 72 | `get_conversations` (partition_by session) |
| `live_chat_service/conversations.py` | 92 | `get_conversations` (partition_by message) |

### Phase 6: group_by / distinct / aggregation → `child_column`
| File | Line | Function |
|------|------|----------|
| `live_chat_service/unread.py` | 73, 77, 80 | `get_unread_counts` (group_by) |
| `live_chat_service/unread.py` | 88-109 | `get_unread_counts` (values join + group_by) |
| `friend_service.py` | 276 | `get_friend_stats` (distinct) |
| `friend_service.py` | 297 | `get_friend_stats` (group_by) |
| `friend_service.py` | 326, 330, 333 | `get_user_refollow_counts` |
| `analytics_service.py` | 149, 168, 193, 209 | FCR rate (correlated subquery) |
| `analytics_service.py` | 336, 339 | `get_conversation_funnel` (distinct) |

**ERRATA:**
- friend_service.py:333 is a WHERE `.in_()` filter, NOT group_by — relabel.
- unread.py values-table block: line 88 (values column def), 92 (.data tuples), 97 (SELECT
  column), 103 (join condition `Message.line_user_id == marker_values.c.line_user_id`) — all
  must move together; preserve direction==INCOMING predicates.
- analytics FCR: update label columns (149/193) AND exists() correlation predicates (168/209)
  in tandem; neither FCR function currently joins User — a join is needed to reach
  `User.chat_mode`.
- analytics funnel (336/339) uses `Message.line_user_id` — needs a Message→User path unlike
  the ChatSession-based FCR paths.

### Phase 7: Existence checks on User.line_user_id → `user_identity_filter`
| File | Line | Function |
|------|------|----------|
| `live_chat_service/conversations.py` | 118, 182 | `get_conversations` |
| `friend_service.py` | 250, 259, 268, 284, 346 | `get_friend_stats`, `list_friends` |

**ERRATA:** friend_service.py:346 is written `User.line_user_id != None  # noqa: E711`
(semantically equivalent to `.isnot(None)`).

### Phase 8: Bulk IN queries → `resolve_many_by_line_id`
| File | Line | Function |
|------|------|----------|
| `rich_menu_service.py` | 51 | `get_current_links_for_users` (DRIFTED: plan said `get_user_menus_bulk` — def at line 31) |
| `live_chat_service/unread.py` | 77 | `get_unread_counts` (ids_without_markers) |

## Additional usages to cover in the same pass (from validation)
- `conversations.py`: 153/161 (unread-count key list + dict lookup), 164/222/252 (line_user_id
  in output dicts), 248-249 (pass-through to get_active_session/get_recent_messages).
- `friend_service.py`: 233 (response dict), 336 (dict key) — plaintext in outputs.
- `sessions.py`: close_session User lookup (line 93) does NOT use child_filter and does not
  pass user_id; get_active_session (252-267) already uses child_filter (all session lookups
  claim/close/ensure/release/transfer already mode-aware); ensure_operator_session writes
  `ChatSession(line_user_id=...)` at line 167 (write path — out of scope, dual-write exists).
- `line_service.py`: module-level `resolve_raw_for_push` (426-437) already implements
  mode-aware resolution — REUSE, do not reinvent; save_message writes
  `Message(line_user_id=...)` at 267 (write path — out of scope).

## Scope boundary (response dicts / API contract)
Output-dict `line_user_id` fields are part of the API contract consumed by the frontend as
route params / React keys / Zustand keys. They are NOT changed here (display masking is
already handled at the UI layer by PR #159). Column removal + serialization strategy belongs
to the gated destructive phase.

## Testing Strategy
- Run full backend suite (`python -m pytest`) after each phase.
- Existing 753 tests exercise most paths (default `LINE_ID_STORAGE_MODE=plaintext`/`dual`).
- Add targeted tests for the 4 new helpers.

## What This Does NOT Do
- Does NOT drop any columns.
- Does NOT change `LINE_ID_STORAGE_MODE` (stays `dual` on prod).
- Does NOT modify the write path (dual-write already in place from PR A).
- Does NOT touch the gate endpoint or counter logic.
- Does NOT change API response shapes (line_user_id fields preserved).

## Implementation Notes (deviations from plan)
1. **`child_join_condition` User-as-parent fix** — the planned version returned
   `parent_model.user_id == child_model.user_id`, but `User` has no `user_id` column
   (PK is `id`). All Phase 4 JOINs are User↔child, so the helper uses
   `parent_key = parent_model.id if parent_model is User else parent_model.user_id`.
   Covered by `test_child_join_condition_user_as_parent`.
2. **Two extra Phase 7 sites** found outside the plan table, same
   `User.line_user_id.isnot(None)` pattern, converted with `user_identity_filter()`:
   `admin_friends.py` list_friends pagination count and `admin_reports.py`
   dashboard + `/followers` total_followers counts.
3. **Bulk-IN dict-key contract** — `get_unread_counts`, `get_user_refollow_counts`,
   and `get_current_links_for_users` return dicts keyed by raw `line_user_id`
   (callers look up by raw ID). In pseudonym mode they resolve via
   `resolve_many_by_line_id`, filter by `user_id` PKs, and reverse-map result keys
   back to raw IDs. Dual/plaintext mode keeps the original single-query shape.
