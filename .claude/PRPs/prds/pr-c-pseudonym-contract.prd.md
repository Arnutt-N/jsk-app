# PRD: PR C — LINE ID Pseudonymization Contract Phase (drop plaintext)

> **Status: DRAFT (2026-08-16)** — รอ review ก่อน implement
> **ส่วนของ:** PRD หลัก `line-id-pseudonymization.prd.md` Phase C
> **Gate:** ต้องผ่าน verification ของ PR B (flag `pseudonym` ทำงาน ≥3-5 วัน, gate `pass`/`0`)

## Problem Statement

PR A (expand) + PR B (migrate/cutover) เสร็จแล้ว — schema มี `line_user_id_hash` + `line_user_id_encrypted` บน `users` และ `user_id` FK บน 6 ตารางลูกแล้ว (dual mode ทำงาน, prod ใช้ `LINE_ID_STORAGE_MODE=dual`)

**สิ่งที่เหลือ:** plaintext `line_user_id` ยังอยู่ทั้ง 7 ตาราง + dual-write code ยังเขียน column นี้ + indexes/constraints บางตัวยังชี้ column นี้ → DB at-rest ยังมี personal data กระจาย (PDPA exposure ยังไม่ลด) จนกว่าจะ drop

## Evidence (ยืนยันจากโค้ด 2026-08-16)

- **7 ตารางมี `line_user_id` อยู่** (`models/*.py`):
  - `user.py:43` (unique+index), `message.py:25` (index, nullable), `chat_session.py:22` (index), `service_request.py:48` (index, nullable), `friend_event.py:25` (index), `csat_response.py:24` (index), `user_rich_menu_link.py:18` (unique+index, NOT NULL)
- **`user_id` FK มีอยู่แล้วทุกตารางลูก** (สำรวจ): `message.py:26`, `chat_session.py:23`, `service_request.py:49`, `friend_event.py:26`, `csat_response.py:25`, `user_rich_menu_link.py:19` (nullable) — พร้อม drop plaintext
- **`users` มี hash/encrypted พร้อม**: `user.py:44-45` (hash unique+index, encrypted Text)
- **Reference ถึง column plaintext เหลือ 91 จุดใน backend** (grep `\.line_user_id` ใน `app/` ไม่รวม models): services 34, api 37, core 0 (ws ใช้ protocol boundary), schemas 0, tasks 8, รวม 91 → **ต้อง grep proof = 0 ก่อน drop** (บางจุดเป็น protocol boundary — ใช้ค่าจาก payload ไม่ใช่ column — ต้องแยกให้ชัด)
- **Identity service มี helper ครบ**: `user_identity_service.py:186-193` — `decrypt_line_id` (fallback ไป plaintext column → หลัง drop ต้องไม่มี fallback), `resolve_by_line_id` (HMAC lookup + legacy fallback → หลัง drop ต้องไม่มี legacy fallback), `line_identity_filter`/`child_join_condition` (mode-aware → หลัง drop ต้อง hardcode pseudonym)
- **Config**: `LINE_ID_STORAGE_MODE` มีแล้ว (`config.py:54`, Literal plaintext|dual|pseudonym)
- **Alembic head**: `e6f7g8h9i0j1` (หลัง booking migrations)
- **Indexes ที่ต้อง recreate บน `user_id`** (จาก PRD หลัก): partial-unique `uq_chat_sessions_one_open_per_user`, unique `user_rich_menu_links.user_id`, btree `ix_*_user_id` ทั้ง 6 ตาราง

## Proposed Solution

### 1. Grep proof — 0 reference ถึง column plaintext (non-boundary)

แยก refs ออกเป็น 3 กลุ่ม:
- **Protocol boundary (คงอยู่ — ไม่ใช่ column read):** WS payload/room key, API param — `ws_events.py`, `websocket_manager.py`, `liff_bookings.py` (จาก `x-liff-id-token` claim), `admin_live_chat.py` (รับ param แล้ว resolve) — ใช้ค่า raw ที่เข้ามา ไม่ได้อ่านจาก DB
- **ต้องแก้ (column read):** ทุกจุดที่เหลือ 91 จุด → สลับไป `resolve_by_line_id`/`user_id`/`decrypt_line_id` — ส่วนใหญ่ PR B ทำไปแล้ว เหลือ check ว่าไม่มี `where(User.line_user_id == ...)` / `select(...line_user_id...)` / `child_join_condition` ที่ fallback
- **Tests:** grep ใน `tests/` — fixture ที่สร้าง User ด้วย raw column → ใช้ identity service

**Gate: `grep -rn "\.line_user_id" app/ tests/ --include="*.py" | grep -v "models/"` = 0 (นอกจาก protocol-boundary allowlist ที่ระบุ)**

### 2. Migration — drop + recreate (1 revision ต่อเนื่องจาก head)

```
revision: <new> (ลงท้าย PR C)
down_revision: e6f7g8h9i0j1

upgrade:
  1. ตรวจ precondition: LINE_ID_STORAGE_MODE != "plaintext" (script flag กันพลาด)
  2. messages:
     - drop index idx_messages_user_created (ชี้ line_user_id + created_at)
     - create index ix_messages_user_created (user_id, created_at DESC)
     - drop column line_user_id
  3. chat_sessions:
     - drop partial-unique uq_chat_sessions_one_open_per_line_user
     - create partial-unique uq_chat_sessions_one_open_per_user (user_id) WHERE status IN ('WAITING','ACTIVE')
     - drop column line_user_id
  4. service_requests, friend_events, csat_responses:
     - drop index ix_*_line_user_id
     - create index ix_*_user_id (ถ้ายังไม่มี)
     - drop column line_user_id
  5. user_rich_menu_links:
     - drop unique uq_user_rich_menu_links_line_user_id (หรือชื่อจริง)
     - create unique index บน user_id
     - drop column line_user_id
  6. users:
     - drop unique index ix_users_line_user_id + column line_user_id
     - (hash กลายเป็น unique ที่แท้จริงแล้ว)

downgrade: restore columns (มีข้อมูล hash/encrypted → re-populate ได้) + indexes
```

> house style: hand-written + existence guards (ห้าม autogenerate — ORM/live-schema drift, PR #183 lesson)

### 3. ลบ dual-write + fallback code

- `user_identity_service.py`:
  - `resolve_by_line_id`: ลบ legacy fallback branch (`User.line_user_id == raw`)
  - `decrypt_line_id`: ลบ fallback `return user.line_user_id` → decrypt อย่างเดียว (fail-loud ถ้า encrypted ว่าง)
  - `populate_surrogate`: ไม่เขียน `line_user_id` อีก
  - `child_join_condition` / `line_identity_filter`: hardcode pseudonym path (ลบ mode branch)
- `friend_service.py`: `get_or_create_user` ไม่ set `line_user_id` column
- Config: `LINE_ID_STORAGE_MODE` เหลือค่าเดียว — ลบ Literal/guard หรือคงเป็น `"pseudonym"` fixed (decide: คง field ไว้เผื่อ rollback จาก backup แต่อย่าใช้ในโค้ด — **decision: ลบออกจากโค้ด ตั้ง `LINE_ID_STORAGE_MODE=pseudonym` บน prod เป็นเอกสารสถานะ**)

### 4. Tests

- ปรับ fixture ทั้งหมดที่สร้าง `User(line_user_id=...)` → ใช้ identity service / hash+encrypted
- เติม regression: `resolve_by_line_id` ไม่ fallback (hash ไม่ match → None แม้มี raw), `decrypt_line_id` ว่าง → raise
- Full suite green

### 5. Rollout

1. User ยืนยัน gate `pass`/`0` (admin session)
2. PR merge → CD deploy → migration run (production DB migrations job ใน CD — เห็นใน run #31902648039)
3. Verify: `SELECT column_name FROM information_schema.columns WHERE table_name IN (...) AND column_name='line_user_id'` = 0 rows; DB dump grep = 0
4. ถ้าผิดพลาด: **ต้อง restore จาก backup** (PR C ไม่มี rollback แบบ flag — drop ไม่ reversible ด้วย code) — mitigation: migration เก็บ snapshot/backup ก่อน run (Supabase point-in-time)

## Out of Scope

- เปลี่ยน API/WS/frontend contract (PRD หลัก: Approach 4B — อนาคต)
- Key rotation automation (manual procedure)
- Display masking (ทำแล้ว — PR #159)

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ref 91 จุดแก้ไม่ครบ → runtime error หลัง drop | H | grep proof = 0 + full suite + smoke บน staging ก่อน CD |
| Drop ไม่มี rollback ผ่าน flag | H | migration ตรวจ precondition + Supabase backup/PITR ก่อนรัน; downgrade revision เขียนไว้ restore column |
| Partial-unique conflict (open session ซ้ำ) | M | pre-flight check ก่อนสร้าง index (pattern `v2w3x4y5z6a7`) |

## Success Metrics

| Metric | Target |
|--------|--------|
| columns `line_user_id` ใน 7 ตาราง | 0 |
| grep `\.line_user_id` (non-boundary) | 0 |
| Backend suite | pass เท่าเดิม |
| DB dump | ไม่มี raw LINE ID |
