# LINE User ID Pseudonymization (Approach 4 — Storage-Layer)

## Problem Statement

ระบบเก็บ `line_user_id` (raw LINE identifier รูป `U` + hex 32 ตัว เช่น `U4af4980...`) **เป็น plaintext กระจายใน 7 ตาราง** (`users`, `messages`, `chat_sessions`, `service_requests`, `friend_events`, `csat_responses`, `user_rich_menu_links`) และ query/แสดงค่านี้ตรงๆ ใน admin panel (live-chat, chat-histories, friends, reports + CSV/PDF export) — รวม **541 จุดใน backend (69 ไฟล์) + 244 จุดใน frontend (36 ไฟล์)**

`line_user_id` เป็น *personal data* ภายใต้ PDPA เพราะใช้ระบุตัวบุคคลได้เมื่อรวมกับ `display_name` + `picture_url` + เนื้อหาแชทที่ระบบเก็บอยู่ การเก็บ raw identifier แบบ plaintext at-rest กระจายหลายตารางหมายความว่า:
- DB dump / backup / log ใดๆ ที่หลุด → เปิดเผย raw LINE ID ของประชาชนทั้งหมดโดยตรง
- ทุกตารางเป็น attack surface — ต้องปกป้องทั้ง 7 ที่
- ไม่มีทาง revoke/re-key ได้ (ค่าเดิมฝังตายตัว)

## Evidence

- **Audit 2026-07-20** (Explore agent): ยืนยัน 7 ตารางเก็บ `line_user_id` plaintext; 2 column unique (`users`, `user_rich_menu_links`) + 1 partial-unique (`chat_sessions` open session); ทุกตารางมี btree index บน `line_user_id`
- **Plaintext จำเป็นแค่ 2 จุด** (จาก audit): (1) webhook ingress `event.source.user_id` (`webhook.py:277`) เพื่อ resolve/create user, (2) outbound LINE API `line_service.push_messages(line_user_id, ...)` (`line_service.py:188`) — ที่เหลือทั้งหมดใช้เป็น correlation key เท่านั้น
- **มี encryption primitive อยู่แล้ว**: `credential_service.py` ใช้ Fernet + `settings.ENCRYPTION_KEY` (fail-closed ใน production, `config.py:165-167`) — ใช้ encrypt column mapping ได้เลยโดยไม่ต้องเพิ่ม dependency
- **2 regex validator** บังคับรูป `^U[0-9a-f]{32}$`: `ws_events.py:102` (JoinRoomPayload) + `rich_menus.py:45` (LINE_USER_ID_PATTERN) — ตัวกำหนดว่า API/WS boundary ยังใช้ raw shape อยู่
- ระบบมี precedent ของ "dark-ship + flag rollout" ที่สำเร็จแล้ว: `COOKIE_AUTH_MODE` (PR 2A/2B) — ใช้ pattern เดียวกันกับ migration นี้ได้

## Proposed Solution

**Pseudonymize ที่ storage layer โดยให้ `users.id` (surrogate PK ที่มีอยู่แล้ว) เป็น internal identifier ตัวเดียว** — raw LINE ID ถูกย้ายไปเก็บแบบ **encrypted (Fernet) + hashed (HMAC-SHA256 สำหรับ lookup)** บนตาราง `users` เท่านั้น; ตารางลูกทั้ง 6 อ้างอิง `users.id` (FK) แทน `line_user_id`; plaintext `line_user_id` ถูกลบออกจาก schema หลัง cutover

**API / WebSocket / frontend contract ไม่เปลี่ยน** — backend resolve `line_user_id ↔ users.id` ที่ service boundary; API responses ยังคืน `line_user_id` (decrypt จาก users row), WS rooms ยัง route ด้วย `line_user_id`, frontend URLs/keys ยังใช้ `lineUserId` เหมือนเดิม → **ระบบทำงานเหมือนเดิม 100% ในมุมมองผู้ใช้**

ทำเป็น **3 PR แบบ expand → migrate → contract** (ตามหลัก `deprecation-and-migration`) gate ด้วย flag `LINE_ID_STORAGE_MODE=plaintext|dual|pseudonym` (เลียนแบบ `COOKIE_AUTH_MODE`) เพื่อให้ rollback ได้ทุกขั้นก่อน drop column plaintext

## Key Hypothesis

We believe **การย้าย raw LINE ID ออกจาก 7 ตารางไปเก็บแบบ encrypted+hashed บนตารางเดียว + อ้างอิง internal surrogate key** will **ทำให้ DB at-rest ไม่มี plaintext personal identifier กระจาย (ลด PDPA exposure + ลด attack surface จาก 7 ตารางเหลือ 1 จุดที่ป้องกันได้)** for **ระบบที่ต้องเก็บ/ประมวลผลข้อมูลประชาชนภายใต้ PDPA โดยไม่หยุดการทำงาน**

We'll know we're right when **DB dump ของตารางลูกทั้ง 6 + `users` ไม่มี raw `line_user_id` plaintext (มีแต่ HMAC hash + Fernet token), ทุก endpoint/WS/frontend flow เดิมยัง pass test suite ครบ, และ outbound LINE API ยัง push ข้อความหา user ได้ถูกต้อง**

## What We're NOT Building

- **Display masking ใน UI (Approach 1)** → แยกเป็นอีก PR (frontend-only, ทำคู่กันได้ — แนะนำให้ทำก่อนเพราะคุ้ม/เสี่ยงต่ำสุด); PRD นี้ไม่แตะการ render
- **Full boundary pseudonymization (Approach 4B)** — ไม่เปลี่ยน API/WS/frontend ให้ใช้อ้างอิง internal ID; raw `line_user_id` ยังข้าม API boundary (decrypt คืน) — เก็บเป็น option อนาคตถ้าต้องซ่อน raw ID จาก network layer ด้วย
- **Access control + audit logging (Approach 2)** → แยก (gate `access_live_chat` มีอยู่แล้ว; audit log เพิ่มต่างหาก)
- **Data retention / anonymization job (Approach 3)** → แยก (scheduler ลบ/anonymize แชทเก่า — P1.6)
- **Key rotation automation** — ออกแบบ `key_version` ไว้ให้ rotate ได้ แต่ตัว rotation script/automation ไม่อยู่ใน scope (ทำ manual ได้)
- **Frontend changes ใดๆ** — PRD นี้ backend-only; acceptance ต้องพิสูจน์ `git diff --stat main -- frontend/` = ว่าง
- **เปลี่ยน LINE SDK / webhook signature verification** — ไม่แตะ

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Plaintext `line_user_id` ใน DB at-rest | 0 column (หลัง PR C) | `SELECT` inspect schema + DB dump grep proof |
| Tables referencing raw `line_user_id` | 0 (เหลือ encrypted+hash บน `users` อย่างเดียว) | schema inspection |
| Backend test suite | pass เท่าเดิม (ไม่ลด) | `python -m pytest` ก่อน/หลัง |
| Frontend diff | 0 files | `git diff --stat main -- frontend/` |
| Outbound LINE push ยังทำงาน | 100% (push หา user ถูกคน) | integration test + manual send |
| Webhook resolve user ถูกต้อง | follow/message → user เดิม (ไม่สร้างซ้ำ) | dedup test + refollow count ไม่เพี้ยน |
| Rollback ได้ทุกขั้นก่อน PR C | flag flip กลับ `plaintext` แล้วระบบปกติ | rollout drill |
| Zero downtime migration | ไม่มี maintenance window | expand-contract + dual-write |

## Open Questions

- [x] **HMAC key source** → decided: dedicated `LINE_ID_HMAC_KEY` (rotate อิสระจาก ENCRYPTION_KEY) — see Decisions Log
- [x] **Surrogate type** → decided: ใช้ `users.id` (Integer PK ที่มีอยู่) — see Decisions Log
- [x] **API response decryption cost** → decided: decrypt ตรงๆ (Fernet ~µs/row); cache ถ้ามี perf issue ภายหลัง
- [x] **`Message.line_user_id` nullable** → decided: `messages.user_id` nullable ถาวร (system messages ไม่มี user)
- [ ] **Migration backfill บน production data ปริมาณเท่าไร** (จำนวน rows ใน messages/chat_sessions) — ต้องประเมินเวลา backfill + ทำเป็น batched/idempotent script (ตอบได้ตอนเริ่ม PR B)
- [ ] **ต้อง mask `line_user_id` ใน API responses ด้วยไหม** (เช่น คืน `U…abcd` แทนเต็ม) — ถ้าใช่ นั่นคือ Approach 1 รวมเข้ามา; ปัจจุบัน PRD นี้คืนค่าเต็มเพื่อ "เหมือนเดิม"

---

## Users & Context

**Primary User (ทางอ้อม)**
- **Who**: เจ้าของระบบ / DPO (Data Protection Officer) ที่ต้องรับผิดชอบ PDPA compliance สำหรับข้อมูลประชาชนที่ระบบเก็บ
- **Current behavior**: raw LINE ID ฝัง plaintext กระจาย 7 ตาราง — ถ้า DB หลุด = personal data breach เต็มรูปแบบ
- **Trigger**: ความต้องการลด PDPA exposure + ทำให้ข้อมูล at-rest เป็น pseudonymous
- **Success state**: DB at-rest ไม่มี raw identifier ตรงๆ; breach impact ลดลงอย่างมาก (ต้องได้ ENCRYPTION_KEY + HMAC key ถึงจะ reverse ได้)

**End User (ประชาชน/LIFF + คู่สนทนา live-chat)**
- ไม่เห็นความเปลี่ยนแปลงใดๆ — ระบบทำงานเหมือนเดิม (นี่คือ hard constraint)

**Operator (admin/staff/director/head)**
- ไม่เห็นความเปลี่ยนแปลงใน UI (API ยังคืน `line_user_id` เต็ม — จนกว่าจะทำ Approach 1 แยก)

**Job to Be Done**
When ระบบต้องเก็บข้อมูลประชาชนภายใต้ PDPA, I want raw LINE identifier ถูก pseudonymize/encrypt at-rest, so I can ลดความเสี่ยง data breach โดยไม่กระทบการทำงานของระบบเลย.

**Non-Users**
- LINE Platform (ส่ง `event.source.user_id` มาทาง webhook — ยังรับค่าเดิม)
- Telegram bot / n8n (consume admin API — contract ไม่เปลี่ยน)

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | **#1** Identity resolution service: `resolve_by_line_id(raw) → Optional[User]` (HMAC lookup + legacy fallback + lazy surrogate populate) + `populate_surrogate(user, raw)` crypto helper; user creation stays in `get_or_create_user` (เรียก identity service) | หัวใจของระบบ — resolve เร็ว + แยก crypto ออกจาก business logic |
| Must | **#2** Schema: เพิ่ม `users.line_user_id_hash` (HMAC, unique, indexed) + `users.line_user_id_encrypted` (Fernet) + `users.line_key_version` | เก็บ raw ID แบบ encrypted+hashed บนตารางเดียว |
| Must | **#3** Schema: เพิ่ม `user_id` FK → `users.id` บน 6 ตารางลูก + index | ให้ตารางลูกอ้าง surrogate แทน raw ID |
| Must | **#4** Webhook ingress ใช้ identity service resolve raw → `user.id` | จุดเดียวที่ raw ID เข้าระบบ |
| Must | **#5** Outbound LINE API resolve `user.id` → raw (decrypt) ที่ `push_messages` | จุดเดียวที่ต้องใช้ plaintext ออก |
| Must | **#6** Dual-write + flag `LINE_ID_STORAGE_MODE` (plaintext\|dual\|pseudonym) | rollout ปลอดภัย + rollback ได้ (เลียนแบบ COOKIE_AUTH_MODE) |
| Must | **#7** Backfill script (idempotent, batched) เติม hash/encrypted/user_id จาก data เดิม | ย้าย data เก่าโดยไม่หยุดระบบ |
| Should | **#8** API responses populate `line_user_id` จาก decrypt (แทนอ่าน column plaintext) | ให้ contract เดิมยังทำงานหลัง drop column |
| Should | **#9** Recreate unique/partial-unique indexes บน `user_id` (แทน `line_user_id`) | รักษา constraint เดิม (1 open session/user, 1 rich-menu link/user) |
| Should | **#10** `key_version` + documented manual re-key procedure | รองรับ key rotation อนาคต |
| Won't (PRD นี้) | Display masking ใน UI | Approach 1 — แยก PR |
| Won't (PRD นี้) | เปลี่ยน API/WS/frontend เป็น internal ID | Approach 4B — อนาคต |
| Won't (PRD นี้) | Retention/anonymization job | Approach 3 — แยก |

### MVP Scope

**3 PRs backend-only** (dark-shipped, flag-gated) ที่ย้าย raw LINE ID ออกจาก schema โดย API/WS/frontend ไม่เปลี่ยน:
- **PR A (expand)**: schema additive + identity service + webhook/outbound ใช้ service + dual-write. flag default `plaintext` → พฤติกรรมเดิม 100%
- **PR B (migrate/cutover)**: backfill + สลับ reads/queries ไปใช้ `user_id`/hash + API responses decrypt. flag `pseudonym`
- **PR C (contract)**: drop column `line_user_id` plaintext ทั้ง 7 ตาราง + recreate indexes บน `user_id`

### User Flow (No change)

ทุกระบบยังทำงานเหมือนเดิม — เปลี่ยนแค่ storage representation:
1. **Webhook follow/message** → `event.source.user_id` (raw) → identity service HMAC-lookup → ได้ `User` (สร้างใหม่ถ้ายังไม่มี โดย encrypt+hash raw ID) → ใช้ `user.id` ภายใน
2. **Live-chat** → operator เปิด conversation → API join ด้วย `line_user_id` (WS protocol เดิม) → backend resolve → query/join ด้วย `user_id` → response decrypt `line_user_id` คืน → frontend แสดงเหมือนเดิม
3. **Outbound push** → `push_messages(user.id)` → decrypt raw ID → เรียก LINE API → บันทึก message ด้วย `user_id`
4. **Reports/CSV/PDF export** → join `users` → decrypt `line_user_id` → export ค่าเดิม

---

## Technical Approach

**Feasibility**: 🟡 **MEDIUM** — backend-only + reversible (ดี) แต่เป็น real-data migration 7 ตาราง + 541 จุดอ้างอิง (ซับซ้อน/เสี่ยง) ต้องทำแบบ expand-contract + flag gate

### Architecture Options (ตัดสินใจ)

| Option | คำอธิบาย | ข้อดี | ข้อเสีย | เลือก? |
|--------|---------|-------|---------|--------|
| **4A — Storage-layer pseudonymization** | `users.id` เป็น internal key; raw ID encrypted+hashed บน `users`; ตารางลูก FK → `users.id`; **API/WS/frontend คงเดิม** | ระบบเหมือนเดิม 100%; backend-only; ลด at-rest exposure จาก 7→1 จุด; reversible | raw ID ยังข้าม API boundary (decrypt คืน); effort สูง | ✅ **แนะนำ** |
| 4B — Full boundary pseudonymization | เหมือน 4A + เปลี่ยน API/WS/frontend ใช้อ้าง internal ID; raw ID ไม่ออกนอก backend | ซ่อน raw ID จาก network layer ด้วย | เปลี่ยน API contract + WS protocol + frontend URLs/keys + 2 regex validator; เสี่ยง "ไม่เหมือนเดิม" สูงมาก | ❌ (อนาคต) |
| Encrypt-in-place | encrypt column `line_user_id` ในทุกตารางตรงๆ | ไม่ต้องเปลี่ยนโครงสร้างมาก | join/filter บน encrypted value ไม่ได้ (พังทุก query); ต้อง decrypt ทั้งตารางเพื่อ query — ไม่ practical | ❌ |
| Status quo + hardening (Approach 2) | คง schema + เพิ่ม access control/audit/encryption-at-rest ระดับ DB | effort ต่ำสุด | raw ID ยัง plaintext ใน app DB; ไม่ลด attack surface เชิงโครงสร้าง | ❌ (ทำเสริมได้) |

### Architecture Notes (4A — แนะนำ)

**Identity resolution (หัวใจ):**
```
webhook raw LINE id
   │  get_or_create_user(line_user_id, db)
   ▼
resolve_by_line_id(db, raw):
   HMAC-SHA256(raw, LINE_ID_HMAC_KEY) → lookup_hash
   SELECT * FROM users WHERE line_user_id_hash = :lookup_hash
   ├─ found → return User (ใช้ user.id ภายใน)
   ├─ not found → SELECT WHERE line_user_id = :raw (legacy fallback)
   │   ├─ found → lazy populate surrogate → return User
   │   └─ not found → return None
   ▼
get_or_create_user (caller):
   None → fetch LINE profile → INSERT users (
        line_user_id = raw,
        + populate_surrogate(user, raw):  # hash + encrypted + key_version
        line_user_id_hash, line_user_id_encrypted, line_key_version)
```

**Data flow หลัง migrate:**
- **ภายใน app** (queries, joins, WS room derivation, FK): ใช้ `users.id` / `user_id`
- **เข้าระบบ** (webhook): raw → HMAC lookup → `user.id`
- **ออกสู่ LINE** (push): `user.id` → decrypt `line_user_id_encrypted` → raw → LINE API
- **ออกสู่ frontend** (API response): join `users` → decrypt → คืน `line_user_id` (contract เดิม)

**Encryption/Hashing:**
- `line_user_id_encrypted`: Fernet (`credential_service._get_cipher()`, `settings.ENCRYPTION_KEY`) — recoverable, ใช้ตอน push + response
- `line_user_id_hash`: HMAC-SHA256 (dedicated `settings.LINE_ID_HMAC_KEY`) — deterministic สำหรับ lookup; **ไม่ใช่** plain SHA-256 (ต้อง keyed กัน rainbow-table/brute-force เพราะ LINE ID space ~128-bit แต่ควรกันไว้)
- `line_key_version`: int, รองรับ rotation (re-encrypt + re-hash เมื่อเปลี่ยน key)

### Data Model (target schema)

**`users` (เปลี่ยน):**
```
+ line_user_id_hash       String(64)  UNIQUE INDEX NOT NULL*  # HMAC-SHA256(raw)
+ line_user_id_encrypted  Text        NOT NULL*               # Fernet(raw)
+ line_key_version        Integer     NOT NULL default 1
- line_user_id            (DROP ใน PR C)
  * nullable ชั่วคราวระหว่าง PR A (ก่อน backfill); NOT NULL หลัง PR B
```

**6 ตารางลูก (เปลี่ยน):** `messages`, `chat_sessions`, `service_requests`, `friend_events`, `csat_responses`, `user_rich_menu_links`
```
+ user_id   Integer  FK → users.id  INDEX  [NULLABLE สำหรับ messages (system msg)]
- line_user_id   (DROP ใน PR C)
```

**Indexes ที่ต้อง recreate บน `user_id` (PR C):**
- `uq_chat_sessions_one_open_per_user` — partial unique `(user_id) WHERE status IN ('WAITING','ACTIVE')` (แทน `..._per_line_user`)
- `ix_user_rich_menu_links_user_id` — unique (แทน `..._line_user_id`)
- btree `ix_<table>_user_id` บนทั้ง 6 ตาราง

### Key Files (จาก audit)

| Area | Files | บทบาทใน migration |
|------|-------|-------------------|
| Models (7) | `models/user.py:43`, `message.py:25`, `chat_session.py:22,44-52`, `service_request.py:48`, `friend_event.py:25`, `csat_response.py:19`, `user_rich_menu_link.py:18` | เพิ่ม/drop column |
| Webhook ingress | `api/v1/endpoints/webhook.py:277` (45 refs) | ใช้ identity service resolve |
| Identity / friend | `services/friend_service.py:13` (`get_or_create_user`), `:50` (`refresh_profile`) | แทนด้วย identity service |
| Outbound LINE | `services/line_service.py:188,239,402` | decrypt raw ID ก่อน push |
| Live-chat service | `services/live_chat_service/{conversations,sessions,messaging,handoff,unread}.py` | query/join ด้วย `user_id` |
| WS routing | `core/websocket_manager.py:438,518` (`get_room_id`, read-marker) | **ไม่เปลี่ยน** (ยังใช้ line_user_id ที่ protocol boundary) |
| WS validators | `schemas/ws_events.py:102`, `endpoints/rich_menus.py:45` | **ไม่เปลี่ยน** (API boundary ยัง raw shape) |
| API schemas | `schemas/{message,chat_session,live_chat,friend,friend_event,service_request_liff}.py`, `admin_users.py:24-36` | populate `line_user_id` จาก decrypt |
| Admin endpoints | `endpoints/admin_live_chat.py` (67 refs), `admin_friends.py`, `admin_export.py`, `admin_reports.py` (211-683) | resolve param → user_id; decrypt สำหรับ response/export |
| Encryption util | `services/credential_service.py:51,74,79` (`_get_cipher`, encrypt/decrypt) | reuse Fernet |
| Config | `core/config.py:57` (ENCRYPTION_KEY), `:165-167` (prod guard) | เพิ่ม `LINE_ID_HMAC_KEY`, `LINE_ID_STORAGE_MODE` + guard |
| Migrations | `alembic/versions/` (head `z1a2b3c4d5e6`) | 3 revisions (expand/contract) chain ต่อ |
| Tests (23 ไฟล์) | `tests/test_{websocket,ws_security,session_claim,live_chat_service,friend_service,liff_token,...}.py` | ปรับ fixture ให้สร้าง user ผ่าน identity service |

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Backfill บน production data ใหญ่ (messages) ช้า/lock ตาราง | M | H | batched idempotent script, ทำช่วง low-traffic, ไม่ lock (UPDATE ... WHERE user_id IS NULL LIMIT) |
| Partial-unique index `chat_sessions` conflict ตอน backfill (open session ซ้ำ) | M | M | pre-flight check (เหมือน `v2w3x4y5z6a7`) + collapse duplicates ก่อนสร้าง index |
| API response decrypt เพิ่ม latency (N rows) | M | L | Fernet decrypt ~µs/row; join users อยู่แล้ว; cache ถ้าจำเป็น (open question) |
| HMAC key หลุด → reverse hash ไม่ได้แต่ brute-force ได้ | L | M | dedicated key, length ≥32B, เก็บใน secret manager; LINE ID space 128-bit กัน brute-force ได้ระดับหนึ่ง |
| ENCRYPTION_KEY หลุด → decrypt raw ID ได้ | L | H | key_version + rotation procedure; existing prod guard fail-closed |
| 541 จุดอ้างอิงแก้ไม่ครบ → บาง query ยังใช้ column plaintext (พังหลัง drop) | M | H | PR C ไม่ drop จนกว่า grep proof = 0 reference + full suite green; flag gate ให้ rollback ได้ |
| dual-write period data drift (เขียน hash/encrypted พลาดบาง row) | M | M | backfill script ซ้ำได้ (idempotent) + validation query นับ row ที่ยัง NULL ก่อน cutover |
| WS room / Redis key ยังใช้ line_user_id → ต้อง decrypt บ่อย | L | L | protocol boundary คงเดิมโดยออกแบบ; resolve ครั้งเดียวตอน join แล้ว cache user object ใน connection state |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently
  DEPENDS: phases that must complete first
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| A | **Expand** (PR A) | Schema additive (hash/encrypted/key_version + user_id FK ทั้ง 7 ตาราง) + identity service + webhook/outbound ใช้ service + dual-write; flag default `plaintext` (พฤติกรรมเดิม) | pending | - | - | `line-id-pseudonymization.plan.md` |
| B | **Migrate + Cutover** (PR B) | Backfill script (idempotent/batched) + สลับ reads/queries/join เป็น `user_id`/hash + API responses decrypt; flag `pseudonym` | pending | - | A | `line-id-pseudonymization.plan.md` |
| C | **Contract** (PR C) | Drop column `line_user_id` plaintext ทั้ง 7 ตาราง + recreate indexes บน `user_id` + ลบ dual-write code; grep proof 0 reference | pending | - | B (verified ≥3-5 วัน) | (แยก plan) |
| D | (เสริม, ทำก่อน/คู่ได้) | **Approach 1 — Display masking** ใน UI (frontend-only) | pending | with A/B | - | (แยก PRD/plan) |

### Phase Details

**Phase A — Expand (PR A, dark)**
- **Goal**: วางโครงสร้างใหม่ + identity service โดยพฤติกรรม production เหมือนเดิม 100% (flag `plaintext`)
- **Scope**: migration additive (ไม่ drop อะไร), `user_identity_service.py`, config (`LINE_ID_HMAC_KEY`, `LINE_ID_STORAGE_MODE`), webhook + outbound ใช้ service, dual-write (เขียนทั้ง plaintext + hash/encrypted/user_id)
- **Success signal**: deploy แล้วระบบปกติ (flag plaintext), column ใหม่ถูกเติมสำหรับ user ใหม่, full suite green, frontend diff = ว่าง

**Phase B — Migrate + Cutover (PR B)**
- **Goal**: ย้าย data เก่า + สลับ read path ไปใช้ surrogate
- **Scope**: backfill script (hash/encrypted บน users เก่า, user_id บน rows ลูกเก่า), validation query (นับ NULL = 0), สลับ queries/join/export เป็น `user_id` + decrypt สำหรับ response, flip flag `pseudonym`
- **Success signal**: backfill complete (0 NULL), ทุก query ใช้ user_id, API ยังคืน line_user_id ถูกต้อง (decrypt), flag flip กลับ `plaintext` ได้ถ้ามีปัญหา

**Phase C — Contract (PR C)**
- **Goal**: ลบ plaintext ออกจาก schema ถาวร
- **Scope**: grep proof (0 reference ถึง column plaintext ใน code), migration drop column + recreate indexes บน user_id, ลบ dual-write code
- **Success signal**: DB dump ไม่มี raw line_user_id, schema สะอาด, full suite green, DB dump grep proof = 0 plaintext

### Parallelism Notes

- PR A → PR B → PR C **sequential** (แต่ละขั้นต้อง verify ก่อน)
- **Approach 1 (display masking, PR D)** ทำคู่กับ A/B ได้เลย (frontend-only, ไม่ชนกัน) — แนะนำให้ทำก่อน/คู่เพราะให้ประโยชน์ที่เห็นได้ทันที
- ระหว่าง PR A กับ B มี dual-write period — ต้อง monitor ว่า hash/encrypted/user_id ถูกเติมครบก่อน cutover

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| ขอบเขต pseudonymization | **4A — storage-layer** (API/WS/frontend คงเดิม) | 4B — full boundary (เปลี่ยน API/WS/frontend) | hard constraint "ระบบทำงานเหมือนเดิม"; 4B เสี่ยงสูงมาก; 4A ลด at-rest exposure ได้จริงโดย backend-only |
| Internal identifier | **`users.id`** (Integer PK ที่มีอยู่) | เพิ่ม UUID column แยก | มีอยู่แล้ว, ทุก join ใช้ได้, ไม่ต้อง generate/migrate ID ใหม่ |
| Lookup mechanism | **HMAC-SHA256 (keyed)** | plain SHA-256 / เก็บ raw + encrypt | keyed hash กัน brute-force/rainbow; deterministic สำหรับ O(1) lookup |
| Encryption | **Fernet (reuse `credential_service`)** | AES-GCM ใหม่ / DB-level TDE | มีอยู่แล้ว, fail-closed prod guard, ไม่ต้องเพิ่ม dependency |
| HMAC key | **dedicated `LINE_ID_HMAC_KEY`** | derive จาก ENCRYPTION_KEY (HKDF) | rotate อิสระจาก encryption key; แยก compromise domain |
| Migration pattern | **expand → migrate → contract + flag** | big-bang migration | zero-downtime, reversible ทุกขั้นก่อน PR C, เลียนแบบ COOKIE_AUTH_MODE ที่สำเร็จแล้ว |
| Rollout gate | **`LINE_ID_STORAGE_MODE=plaintext\|dual\|pseudonym`** | ไม่มี flag | rollback ได้ทันทีโดยยังไม่ต้อง redeploy schema; สอดคล้องกับ pattern เดิม |
| WS/API boundary | **คง raw `line_user_id`** (decrypt คืน) | เปลี่ยนเป็น internal ID | "เหมือนเดิม" — ไม่แตะ WS regex validator, frontend URLs/keys |
| Display masking | **แยก PRD (Approach 1)** | รวมใน PRD นี้ | คนละ layer (frontend vs backend); ทำคู่กันได้; ลด scope/risk ของ PRD นี้ |

---

## Research Summary

**Technical Context (จาก codebase audit 2026-07-20)**
- 7 ตารางเก็บ `line_user_id` plaintext; 541 backend refs (69 ไฟล์) + 244 frontend refs (36 ไฟล์); 23 test ไฟล์อ้างอิง
- Plaintext จำเป็นจริงแค่ 2 จุด: webhook ingress (`webhook.py:277`) + outbound push (`line_service.py:188`)
- Fernet + `ENCRYPTION_KEY` มีอยู่แล้ว (`credential_service.py`), fail-closed ใน prod (`config.py:165-167`)
- 2 regex validator `^U[0-9a-f]{32}$` (`ws_events.py:102`, `rich_menus.py:45`) — ยืนยันว่า API/WS boundary ยังใช้ raw shape → 4A ไม่ต้องแตะ
- WS routing (`websocket_manager.py:438,518`) + Redis keys ใช้ `line_user_id` — 4A คงเดิมที่ protocol boundary
- Alembic head `z1a2b3c4d5e6`; migration house style = hand-written + existence guards (ห้าม autogenerate เพราะมี ORM/live-schema drift)
- Precedent: `COOKIE_AUTH_MODE` dark-ship + flag rollout (PR 2A/2B) สำเร็จ → ใช้ pattern เดียวกัน

**Compliance Context**
- `line_user_id` = personal data ภายใต้ PDPA (ระบุบุคคลได้เมื่อรวมกับ display_name/picture/chat content)
- Pseudonymization + encryption at-rest = มาตราการลดความเสี่ยงที่ PDPA/GDPR แนะนำ (data minimization + security)
- breach impact หลัง migrate: ต้องได้ทั้ง ENCRYPTION_KEY + HMAC key ถึงจะ reverse raw ID ได้ (แทนที่จะได้ plaintext ตรงๆ จาก dump)

**Market Context**
- pattern "internal surrogate key + encrypted external identifier mapping" เป็นมาตรฐานในระบบที่ต้อง handle external identity (เช่น payment tokenization, HIPAA-safe harbor pseudonymization)
- expand-contract (parallel change) migration เป็น best practice สำหรับ zero-downtime schema change ใน production

---

*Generated: 2026-07-20*
*Status: DRAFT — pending user review/approval before implementation*
*Author: Qoder (skill methodology: mattpocock/to-prd + addyosmani/spec-driven-development + deprecation-and-migration)*
