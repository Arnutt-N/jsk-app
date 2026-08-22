# PRD: COOKIE_AUTH_MODE Cleanup — ตัด migration flag + Bearer fallback (cookie-only)

> **Status: DRAFT (2026-08-22)** — รอ review/approval ก่อน implement
> **ต้นทาง:** Backlog item "COOKIE_AUTH_MODE cleanup PR" (`PROJECT_STATUS.md` → Backlog)
> **Gate:** effective mode = `cookie` บน prod ยืนยันแล้ว (2026-08-22) + cookie stable นานกว่าเกณฑ์ 3-5 วันมาตั้งแต่ PR 2C (ก.ค. 2026)

## Problem Statement

PR 2A/2B/2C (ก.ค. 2026) เปิดตัว cookie auth พร้อม mode ladder `bearer` → `dual` → `cookie`
เพื่อ rollback ได้โดยไม่แต่โค้ด ตอนนี้ทุกอย่างอยู่บน `cookie` ครบแล้ว:

- frontend เป็น cookie-only ตั้งแต่ 2B/2C (`NEXT_PUBLIC_COOKIE_AUTH` ถูกลบ)
- Koyeb prod **ไม่ได้ set** env var → code default `"cookie"` มีผลอยู่
- ผลคือ branch `bearer`/`dual` ทั้งหมดใน backend = **dead code** ที่ต้องรับภาระ:
  test mode-matrix, comment/docstring หลอก (เช่น client.ts บอก ws-ticket "via Bearer"
  ทั้งที่จริง mint ด้วย cookie), และ surface area ของ auth ที่กว้ากว่าความจำเป็น

## Evidence (ยืนยัน 2026-08-22)

- **Env จริงบน prod:** อ่าน deployment definition ผ่าน control-plane API — 20 env vars,
  **ไม่มี** `COOKIE_AUTH_MODE` → default `"cookie"` (`config.py:53`) มีผล
- **พิสูจน์เชิงพฤติกรรม (prod smoke):**
  - `POST /auth/login` 200 → body **ไม่มี** tokens (cookie mode) + `csrf_token` ใน body
  - admin GET (`/admin/rich-menus`, `/admin/rich-menus/aliases`, `/health/pseudonym-gate`)
    200 ด้วย **cookie session ล้วน — ไม่ส่ง Authorization header เลย**
  - `POST /auth/ws-ticket`: 403 เมื่อไม่มี CSRF header / 200 เมื่อมี (server enforce ถูก;
    browser ผ่านเพราะ `authFetch.ts:163` monkey-patch `window.fetch` เติม header ให้)
- **Frontend ไม่พึ่ง Bearer:** grep `Authorization|Bearer` ใน `frontend/` เจอเฉพาะ
  (a) test ที่ assert *ไม่* ส่ง header, (b) comment เก่า, (c) `AuthContext` migrate-session
  one-time path (ส่ง Bearer legacy token → endpoint `_bearer_only` by design), (d) WS types comment
- **Test suite ไม่พังกระจาย:** pattern หลักของ 93 test files คือ
  `app.dependency_overrides[deps.get_current_admin]` — bypass real auth resolution
  ไฟล์ที่ exercise mode matrix + Bearer headers ทั้งหมดอยู่ใน **test_cookie_auth.py
  file เดียว** (14 จุด `headers={"Authorization"}`) + test_config_migration_controls.py
- **pydantic settings `extra="ignore"`**: env var `COOKIE_AUTH_MODE` ที่เหลือค้างที่ใดก็ตาม
  จะถูก ignore เงียบ ๆ หลังลบ field — ไม่ crash startup

## Dead-code inventory (จุดที่ต้องแก้)

| ไฟล์ | จุด | สิ่งที่ทำ |
|---|---|---|
| `app/core/config.py:48-53` | flag + comments | ลบ field — ⚠️ ระวังช่วง 48-53 มี `LIFF_STRICT_MODE` (:52) อยู่ด้วย ห้ามลบรวบ |
| `app/api/deps.py:19` | `security = HTTPBearer(auto_error=False)` | ลบ + import |
| `app/api/deps.py:32-68` | `get_current_user` mode-aware block | collapse → cookie-only |
| `app/api/deps.py:149-159` | CSRF comment อ้าง bearer exemption | แก้ comment (behavior เดิม) |
| `app/api/v1/endpoints/auth.py:186-197` | login branches | always session family + cookies + empty body tokens |
| `auth.py:222` | param `authorization: Header(default=None)` กลายเป็น dead | ลบ (ไม่งั้นค้างใน OpenAPI) |
| `auth.py:228-235` | refresh source fallback header | cookie-only |
| `auth.py:274` | guard `COOKIE_AUTH_MODE == "cookie"` | unconditional |
| `auth.py:321,334-335` | `body_omitted` conditional | always omit |
| `auth.py:340-355` | legacy stateless refresh path | ลบทิ้ง |
| `auth.py:451-455` | migrate-session bearer-mode 409 | ลบ |
| `auth.py:471,484-485` | `body_omitted` conditional | always omit |
| `auth.py:498-499` | ws-ticket docstring "Any auth mode" | แก้ docstring |
| `core/security.py:113` | comment "bearer-mode caller" | แก้ comment |
| `core/cookie_auth.py:58` | docstring "`dual` or `cookie`" | แก้ docstring |
| `app/schemas/auth.py:34` | comment "dual/cookie; None in bearer mode" | แก้ comment |
| `app/services/auth_session_service.py:80-81` | docstring "dual or cookie" | แก้ docstring |
| `backend/app/.env.example:14`, `.env.production.example:9`, `.env.development.example:5` | `COOKIE_AUTH_MODE=bearer` (stale) | ลบบรรทัด |
| `frontend/app/admin/friends/page.tsx:3`, `chat-histories/page.tsx:3`, `chat-histories/[lineUserId]/page.tsx:3` | comment "bearer or cookie mode" | แก้ comment |

**ไม่แตะ (historical record):** alembic migration comments ที่อ้าง flag
(`w3x4y5z6a7b8_*:11`, `b3c4d5e6f7g8_*:8`) — migrations เขียนครั้งเดียวแก้ไม่ได้

**คงไว้ (deliberate):** `/auth/migrate-session` endpoint ทั้งตัว (legacy straggler one-time
migration — frontend `AuthContext.tsx:152` ยังเรียกถ้า localStorage มี token เก่า; การถอด
endpoint เป็น PR แยกเมื่อยืนยัน cohort = 0), `_bearer_only` HTTPBearer ของ endpoint นี้,
CSRF double-submit, DEV_AUTH_BYPASS, ws-ticket flow

## Requirements

- **FR1** — Settings ไม่มี `COOKIE_AUTH_MODE`; env override ค้างถูก ignore (`extra="ignore"`)
- **FR2** — `get_current_user`: อ่าน credential จาก access_token cookie เท่านั้น;
  Authorization header ไม่ถูก consult ที่ไหนใน app/ ยกเว้น `_bearer_only` ของ migrate-session;
  semantics "presence-based not validity-based" + DEV_AUTH_BYPASS คงเดิม
- **FR3** — login: สร้าง session family + set cookies เสมอ; body ไม่คืน tokens
  (คง field `token_type="bearer"` ตาม OAuth convention — cosmetic ไม่ใช่ credential path)
- **FR4** — refresh: ต้องเป็น refresh **cookie** ที่ session-backed (jti+family);
  legacy stateless header path ถูกลบ; reuse-detection flow คงเดิม
- **FR5** — migrate-session: ลบ bearer-mode 409 branch; behavior เหลือแบบ cookie เท่านั้น
- **FR6** — CSRF double-submit คงเดิมทุกด้าน behavior (comment ปรับให้สะท้อนว่า
  ทุก request authenticated เป็น cookie-sourced แล้ว)
- **FR7** — Docs: runbook ปิดงาน + migration-controls.md อัปเดต control table +
  แก้ stale comments ฝั่ง frontend (`client.ts`, `types.ts` — comment-only)

## Non-goals

- ไม่ลบ `/auth/migrate-session` (PR แยกตาม cohort)
- ไม่แตะ LIFF/webhook/WS-ticket mechanism
- ไม่เปลี่ยน cookie attributes / session-family logic

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Client ภายนอกที่ยังยิง Bearer เข้า API เรา → 401 | Audit ไม่พบ (frontend cookie-only, smoke scripts ของเราใช้ cookie); runbook note rollback |
| Rollback ไม่ได้ด้วย env flip แล้ว | Rollback = redeploy image ก่อนหน้าบน Koyeb (document ใน runbook) |
| Env var ค้างใน .env ท้องถิ่น | `extra="ignore"` → ไม่ crash (ยืนยันแล้ว) |
| Test churn ใหญ่ | Survey แล้วจำกัดที่ ~2-3 files (mode matrix) — suite อื่น override deps |

## Acceptance criteria / Gates

1. `grep -rn "COOKIE_AUTH_MODE" backend/app --include="*.py"` = **0 matches**
2. `grep -rni "COOKIE_AUTH_MODE" backend --include="*.env*" .claude/../backend/*.example*`
   และ `grep -rn "COOKIE_AUTH_MODE" backend/.env.*.example` = **0 matches**
   (alembic/ docs/ ยกเว้น — historical record)
3. Frontend: `grep -rn "COOKIE_AUTH_MODE\|bearer or cookie mode" frontend/` — comment-only
   mentions ล้างให้หมด
4. Full pytest green (suite ปรับแล้ว), lint/tsc/vitest/build green, CI green
5. Post-deploy prod smoke: login → admin GET (cookie-only) 200; ws-ticket no-CSRF=403 /
   with-CSRF=200; health green
