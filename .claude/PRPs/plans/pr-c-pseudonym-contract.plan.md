# PR C — LINE ID Pseudonymization Contract Phase (destructive) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Drop plaintext `line_user_id` ทั้ง 7 ตาราง + recreate indexes บน `user_id` + ลบ dual-write/fallback code — ให้ DB at-rest ไม่มี raw LINE ID กระจาย

**Architecture:** grep-proof แยก protocol boundary ก่อน → migration 1 revision (drop + recreate, hand-written + existence guards) → ลบ fallback ใน identity service → ปรับ tests → full suite

**Tech Stack:** Alembic (hand-written migration), SQLAlchemy 2.0 async, pytest

**PRD:** `.claude/PRPs/prds/pr-c-pseudonym-contract.prd.md`
**PRD หลัก (context):** `.claude/PRPs/prds/line-id-pseudonymization.prd.md`
**Alembic head:** `e6f7g8h9i0j1`

## Global Constraints

- **Gate ก่อน merge:** user ยืนยัน `pseudonym-gate` = `pass`/`0` (admin session) — ถ้ายังไม่ confirm ห้าม merge
- **grep proof = 0** ก่อน drop: `grep -rn "\.line_user_id" app/ tests/ --include="*.py"` เหลือแค่ protocol-boundary allowlist
- **Migration house style:** hand-written + existence guards (ห้าม autogenerate — PR #183 lesson)
- **ไม่มี rollback ผ่าน flag** — ต้อง backup/PITR Supabase ก่อน CD run; downgrade revision restore column ไว้
- **ไม่เปลี่ยน API/WS/frontend contract** — protocol boundary (payload/param) ยังใช้ raw shape
- **ข้อความ error เป็นภาษาไทย**; identifier/โค้ดเป็นอังกฤษ

---

## File Structure

- `backend/alembic/versions/<new>_pr_c_drop_line_user_id.py` — **สร้างใหม่**: drop+recreate migration
- `backend/app/services/user_identity_service.py` — ลบ legacy fallback + decrypt fallback + mode branches
- `backend/app/services/friend_service.py` — `get_or_create_user` ไม่ set plaintext column
- `backend/app/api/v1/endpoints/{admin_friends,admin_users,admin_reports,admin_export,admin_live_chat,rich_menus,liff}.py` — refs ที่เหลือ (ถ้า grep เจอ)
- `backend/app/services/{analytics_service,handoff_service,line_service,sla_service}.py` + `tasks/session_cleanup.py` + `live_chat_service/*` — refs ที่เหลือ
- `backend/app/core/config.py` — ตรวจ `LINE_ID_STORAGE_MODE` หลังลบ mode
- `backend/tests/` — fixtures + regression tests ใหม่

---

## Task 1: Grep proof — inventory + classify ทุก reference

**Files:** (read-only ตรวจ)
- Modify: none
- Output: รายการ refs แบ่ง 3 กลุ่ม

- [x] **Step 1: รัน inventory**

```bash
grep -rn "\.line_user_id" app/ tests/ --include="*.py" | grep -v "app/models/"
```

- [x] **Step 2: จำแนก 3 กลุ่ม**
  1. **Protocol boundary (keep):** ค่าจาก payload/param/claim — `ws_events.py` (JoinRoomPayload), `websocket_manager.py` (room key), `liff_bookings.py` (x-liff-id-token claim), `admin_live_chat.py` (param → resolve)
  2. **Column read (ต้องแก้):** `User.line_user_id == ...`, `select(...line_user_id...)`, `child_column(...)`, `session.line_user_id` (model column)
  3. **Model definition (keep):** `app/models/*.py` (จนกว่า migration drop — แก้หลัง drop)

- [x] **Step 3: สรุป allowlist** — กลุ่ม 1 เขียนเป็น list ชัดเจนใน PRD/pr ไว้ให้ reviewer ตรวจ

---

## Task 2: Migration — drop + recreate

**Files:**
- Create: `backend/alembic/versions/<new>_pr_c_drop_line_user_id.py`
- Test: manual verify (alembic upgrade/downgrade on local PG)

- [x] **Step 1: เขียน migration (hand-written, existence guards)**

```python
"""PR C: drop plaintext line_user_id from 7 tables, recreate indexes on user_id

Hand-written (never autogenerate — ORM/live-schema drift, PR #183 lesson).
Requires LINE_ID_STORAGE_MODE != "plaintext" as a runtime precondition.
"""
import os
from alembic import op
import sqlalchemy as sa

revision = "<new>"
down_revision = "e6f7g8h9i0j1"


def _assert_not_plaintext():
    mode = os.environ.get("LINE_ID_STORAGE_MODE", "plaintext")
    assert mode != "plaintext", (
        "PR C cannot run while LINE_ID_STORAGE_MODE=plaintext — backfill/cutover incomplete"
    )


def _has_column(conn, table, column) -> bool:
    return bool(conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).scalar())


def _has_index(conn, table, index) -> bool:
    return bool(conn.execute(
        sa.text("SELECT 1 FROM pg_indexes WHERE tablename = :t AND indexname = :i"),
        {"t": table, "i": index},
    ).scalar())


def upgrade() -> None:
    _assert_not_plaintext()
    conn = op.get_bind()

    # messages
    if _has_column(conn, "messages", "line_user_id"):
        if _has_index(conn, "messages", "idx_messages_user_created"):
            op.drop_index("idx_messages_user_created", table_name="messages")
        if not _has_index(conn, "messages", "ix_messages_user_created"):
            op.create_index(
                "ix_messages_user_created", "messages",
                ["user_id", sa.text("created_at DESC")],
            )
        op.drop_column("messages", "line_user_id")

    # chat_sessions
    if _has_column(conn, "chat_sessions", "line_user_id"):
        for idx in ("uq_chat_sessions_one_open_per_line_user",):
            if _has_index(conn, "chat_sessions", idx):
                op.drop_index(idx, table_name="chat_sessions")
        if not _has_index(conn, "chat_sessions", "uq_chat_sessions_one_open_per_user"):
            op.create_index(
                "uq_chat_sessions_one_open_per_user", "chat_sessions", ["user_id"],
                unique=True,
                postgresql_where=sa.text("status IN ('WAITING', 'ACTIVE')"),
            )
        op.drop_column("chat_sessions", "line_user_id")

    # service_requests, friend_events, csat_responses
    for table in ("service_requests", "friend_events", "csat_responses"):
        if _has_column(conn, table, "line_user_id"):
            if _has_index(conn, table, f"ix_{table}_line_user_id"):
                op.drop_index(f"ix_{table}_line_user_id", table_name=table)
            if not _has_index(conn, table, f"ix_{table}_user_id"):
                op.create_index(f"ix_{table}_user_id", table, ["user_id"])
            op.drop_column(table, "line_user_id")

    # user_rich_menu_links
    if _has_column(conn, "user_rich_menu_links", "line_user_id"):
        for idx in ("ix_user_rich_menu_links_line_user_id", "uq_user_rich_menu_links_line_user_id"):
            if _has_index(conn, "user_rich_menu_links", idx):
                op.drop_index(idx, table_name="user_rich_menu_links")
        if not _has_index(conn, "user_rich_menu_links", "uq_user_rich_menu_links_user_id"):
            op.create_index(
                "uq_user_rich_menu_links_user_id", "user_rich_menu_links", ["user_id"],
                unique=True,
            )
        op.drop_column("user_rich_menu_links", "line_user_id")

    # users
    if _has_column(conn, "users", "line_user_id"):
        if _has_index(conn, "users", "ix_users_line_user_id"):
            op.drop_index("ix_users_line_user_id", table_name="users")
        op.drop_column("users", "line_user_id")


def downgrade() -> None:
    # Restore columns + indexes (data re-populatable from hash/encrypted via
    # a script; this restores the shape so the DB is usable while that runs).
    conn = op.get_bind()
    if not _has_column(conn, "users", "line_user_id"):
        op.add_column("users", sa.Column("line_user_id", sa.String(), nullable=True))
        op.create_index("ix_users_line_user_id", "users", ["line_user_id"], unique=True)
    # ... (per-table: add column + recreate indexes — mirror upgrade)
```

- [x] **Step 2: ทดสอบบน local PG (WSL)** — `alembic upgrade head` จาก empty → `downgrade -1` → `re-upgrade` (pattern จาก session booking verification 2026-08-14) — ตรวจ migration ทำงานจริงทั้ง 2 ทิศ
- [x] **Step 3: `alembic check --target remote`** — หลัง deploy เท่านั้น

---

## Task 3: ลบ dual-write + fallback code

**Files:**
- Modify: `backend/app/services/user_identity_service.py`
- Modify: `backend/app/services/friend_service.py`
- Modify: `backend/app/core/config.py`

- [x] **Step 1: `user_identity_service.py`**
  - `resolve_by_line_id`: ลบ legacy fallback (`User.line_user_id == raw` branch) — hash ไม่ match → None
  - `decrypt_line_id`: ลบ `return user.line_user_id` fallback — encrypted ว่าง → raise (fail-loud)
  - `populate_surrogate`: ไม่ set `line_user_id`
  - `child_join_condition` / `line_identity_filter` / `child_column`: hardcode pseudonym path (ลบ mode branch)
  - `resolve_many_by_line_id`: ลบ surrogate-self-heal ต่อ plaintext (เหลือ hash lookup เท่านั้น)

- [x] **Step 2: `friend_service.py`** — `get_or_create_user` / `refresh_profile` ไม่ set `line_user_id`

- [x] **Step 3: `config.py`** — ตรวจ `LINE_ID_STORAGE_MODE`: ลบ Literal ให้เป็นค่าคงที่ `"pseudonym"` หรือลบ field — **decision: เก็บ field ไว้แต่ default เป็น `"pseudonym"` + ลบ guard `!= plaintext`** (กัน migration ใหม่พลาด)

- [x] **Step 4: รัน tests ที่เกี่ยวข้อง** — `test_user_identity*.py`, `test_friend_service*.py`, webhook tests

---

## Task 4: แก้ refs ที่เหลือ (จาก Task 1 กลุ่ม 2)

**Files:** ตาม inventory — `admin_friends.py`, `admin_users.py`, `admin_reports.py`, `admin_export.py`, `admin_live_chat.py`, `rich_menus.py`, `liff.py`, `analytics_service.py`, `handoff_service.py`, `line_service.py`, `sla_service.py`, `session_cleanup.py`, `live_chat_service/*`, `report_service/operators.py`

- [x] **Step 1: แก้ทีละไฟล์ตามรายการ inventory** — รูปแบบ:
  - `User.line_user_id == x` → `resolve_by_line_id(db, x)` ก่อน แล้วใช้ `user.id`
  - `select(User.line_user_id, ...)` → `select(User.id, ...)` + decrypt ที่ response
  - `child_column(...) == ...line_user_id` → `user_id` join
  - `session.line_user_id` (อ่านจาก column) → `session.user_id` + decrypt ถ้าต้องการ raw
- [x] **Step 2: หลังแก้ทุกไฟล์** — รัน grep proof ซ้ำ: เหลือแค่ allowlist (Task 1 กลุ่ม 1)

---

## Task 5: Tests — fixtures + regression

**Files:**
- Modify: `backend/tests/` (ทุกไฟล์ที่ fixture สร้าง `User(line_user_id=...)`)
- Create: tests ใหม่ใน `test_user_identity_service.py` หรือไฟล์ใหม่

- [x] **Step 1: ปรับ fixtures** — สร้าง user ผ่าน identity service / ตั้ง `line_user_id_hash` + `line_user_id_encrypted` ตรงๆ
- [x] **Step 2: regression tests ใหม่**
  - `resolve_by_line_id`: hash ไม่ match → None (แม้มี raw column เดิม) — พิสูจน์ว่า legacy fallback หาย
  - `decrypt_line_id`: encrypted ว่าง → raise
  - `child_join_condition` (pseudonym mode): join ด้วย `user_id` เสมอ
- [x] **Step 3: full suite** — `python -m pytest`

---

## Task 6: Verification + PR

- [x] **Step 1: grep proof สุดท้าย** — non-boundary = 0
- [x] **Step 2: backend full suite** — ผ่าน (13 env failures เดิมยอมรับได้)
- [x] **Step 3: local migration drill** — upgrade/downgrade/re-upgrade บน PG16 (WSL)
- [x] **Step 4: commit + push + PR** — อธิบาย gate condition ให้ reviewer เห็นชัด

---

## Deviations Log

1. **MV `daily_message_stats`** (ไม่อยู่ในแผน) — references `messages.line_user_id`; migration rebuilds it keyed on `user_id` (no app code reads it; downgrade restores original shape)
2. **Revision ID** — `g7h8i9j0k1l2` มีอยู่ใน chain แล้ว (fix_chat_session_started_at_index) → ใช้ `q8r9s0t1u2v3` แทน
3. **Migration drill** — ย้ายไปรันพร้อม Task 6 (หลัง code changes) แทน Task 2 step 2 — upgrade/downgrade/re-upgrade ผ่านบน local PG16
4. **ลบ scripts เพิ่ม** — `preflight_pseudonym_indexes.py` + `rollback_pseudonym_indexes.py` (dead หลัง drop column เช่นเดียวกับ backfill script)
5. **`rich_menu_service.get_current_links_for_users`** — เปลี่ยนเป็นรับ `user_ids: list[int]` (caller มี User rows อยู่แล้ว ประหยัด hash round-trip)
6. **62 Redis-gated tests** — รันผ่านครบหลังเปิด Docker Desktop: final result **1049 passed, 0 failed** (full suite, post-migration schema)
7. **config guard** — `LINE_ID_HMAC_KEY` required unconditional ใน production (ตามแผน task 3 step 3)
