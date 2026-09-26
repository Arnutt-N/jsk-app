# Handoff — 2026-07-28 (PR #165 merged, production rollout next)

> **สถานะปัจจุบัน:** PR #165 merged — แก้ live-chat "Offline" (CSRF header หายใน ws-ticket) อยู่ใน main แล้ว — เหลือ production rollout (cookie auth + pseudonym flip)

---

## สิ่งที่เสร็จล่าสุด

| PR / Commit | สถานะ | รายละเอียด |
|---|---|---|
| PR 2A round-1 (#133) | ✅ Merged | Cookie Backend Foundation (P1.1a) — refresh rotation, family tracking, ws-ticket, dual-mode |
| PR 2A round-2 (#134) | ✅ Merged | ปิด review findings |
| PR 2B (#135) | ✅ Merged | Frontend cookie auth migration — CSRF+credentials, /auth/me bootstrap, single-flight refresh, WS ticket auth, multi-tab sync |
| PR 2C (#157) | ✅ Merged | Cookie-Only Hardening — default `COOKIE_AUTH_MODE=cookie`, SameSite=Strict, ลบ Bearer path, WS ticket auth default (NEW-3 ปิด), ESLint 9 fix |
| LIFF Strict Mode | ✅ Done | `LIFF_STRICT_MODE=True` เป็น default — LIFF clients ทั้ง 3 หน้าส่ง `x-liff-id-token` ครบแล้ว |
| PR #159 | ✅ Merged | LINE ID display masking across admin panel (PDPA) |
| PR #160 | ✅ Merged | LINE ID read-cutover — mode-aware query paths |
| PR #161 | ✅ Merged | COOKIE_AUTH_MODE production rollout runbook (docs) |
| PR #162 (`bab8b8e`) | ✅ Merged + Deployed | Live-chat per-operator pin/mute/spam prefs + soft-delete conversation — production verified |
| PR #163 (`8e49b9c`) | ✅ Merged | Pseudonym prepare-indexes migration + preflight/rollback scripts |
| PR #165 (`3d96f76`) | ✅ Merged | Live-chat WS CSRF fix — แนบ `X-CSRF-Token` ทุก mutating API request (ไม่ใช่แค่ admin) |

**Main branch:** `3d96f76` (synced with origin/main)
**Backend defaults:** `COOKIE_AUTH_MODE=cookie`, `LIFF_STRICT_MODE=True`
**Alembic head:** `d5e6f7g8h9i0` (single head, chain verified)

---

## PR #165 — Live-chat "Offline" CSRF fix

### อาการ
- หน้า `/admin/health` เขียวทุกช่อง (Database/Redis/WebSocket ปกติ) แต่หน้า live-chat ค้างที่ **"Offline — ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้"** ตลอดไป ไม่ retry

### Root cause
- Backend บังคับ CSRF double-submit กับ **ทุก** POST ที่ auth ด้วย cookie (`backend/app/api/deps.py:152`)
- แต่ fetch interceptor frontend แนบ `X-CSRF-Token` เฉพาะ URL `/api/v1/admin/` (`frontend/lib/authFetch.ts`)
- WS ticket minter POST ไป `/api/v1/auth/ws-ticket` (non-admin) + cookie แต่**ไม่มี** CSRF header → โดน **403** → mint ticket ล้มเหลว → client ตั้ง `intentionalDisconnect` → ค้าง "Offline" ถาวร (ไม่ retry)
- ที่ health เขียวเพราะใช้แค่ GET (CSRF-exempt) และ WS health status เป็นแค่ in-process counter ไม่ได้ทดสอบ handshake จริง

### การแก้ไข
| ไฟล์ | การเปลี่ยน |
|------|-----------|
| `frontend/lib/authFetch.ts` | ขยาย `needsCsrf` จาก `/api/v1/admin/` → `/api/v1/` (rename `isAdminApiRequest` → `isApiRequest`) ให้ตรงกับ backend policy |
| `frontend/lib/__tests__/authFetch.cookie.test.ts` | เพิ่ม regression test — POST `/api/v1/auth/ws-ticket` ต้องได้ `X-CSRF-Token` |

### Verification
- `vitest run lib/__tests__/authFetch.cookie.test.ts` — **7/7 pass** (6 เดิม + 1 ใหม่)
- CI green: Frontend Lint & Build, Backend Pytest, Playwright Smoke
- การเปลี่ยนเป็น strictly additive (เพิ่ม header ให้ request อื่น ไม่ลบ) — admin pages ที่แนบ header เองไม่กระทบ; backend ignore header สำหรับ non-cookie auth

### Manual check (แนะนำ)
- Login ผ่าน cookie auth → เปิด `/admin/live-chat` → socket ต้อง connect (ไม่มี banner Offline ค้าง)

---

## ไฟล์ที่เพิ่มใน PR #163

| ไฟล์ | หน้าที่ |
|------|---------|
| `backend/alembic/versions/d5e6f7g8h9i0_line_id_pseudonym_prepare_indexes.py` | Migration: สร้าง `uq_chat_sessions_one_open_per_user` + `uq_user_rich_menu_links_user_id` |
| `backend/scripts/preflight_pseudonym_indexes.py` | Pre-flight validation (hash coverage, duplicates) — read-only, exit 0 = safe |
| `backend/scripts/rollback_pseudonym_indexes.py` | Rollback: `DROP INDEX CONCURRENTLY` (dry-run default, AUTOCOMMIT) |

---

## สิ่งที่ต้องทำต่อ (Production Deployment)

### Phase 1: Cookie Auth Rollout

| Step | Action | สถานะ |
|------|--------|--------|
| 1 | Set `COOKIE_AUTH_MODE=dual` → deploy backend | ⬜ รอทำ |
| 2 | Deploy frontend (cookie-only build) | ⬜ รอทำ |
| 3 | สังเกต 3-5 วัน → ลบ override (default = `cookie`) | ⬜ รอทำ |

### Phase 2: LIFF + LINE ID Pseudonym

| Step | Action | สถานะ |
|------|--------|--------|
| 4 | Confirm `LIFF_STRICT_MODE=true` (default แล้ว) | ⬜ รอทำ |
| 5 | Production: run `backfill_line_id_pseudonym.py --apply` | ⬜ รอทำ |
| 6 | Production: run `preflight_pseudonym_indexes.py` → ต้อง PASS | ⬜ รอทำ |
| 7 | Production: `alembic upgrade head` (apply `d5e6f7g8h9i0`) | ⬜ รอทำ |
| 8 | Confirm pseudonym gate = 0 fallback hits (3-5 วัน) | ⬜ รอทำ |
| 9 | Flip `LINE_ID_STORAGE_MODE=pseudonym` | ⬜ รอทำ |

### Phase 3: Contract (future PR — ยังไม่ต้องทำตอนนี้)

| Step | Action | สถานะ |
|------|--------|--------|
| 10 | Convert remaining 6 direct `.line_user_id ==` query sites | ⬜ รอ PR |
| 11 | Contract migration: drop `line_user_id` จาก 7 tables | ⬜ รอ PR |
| 12 | ลบ dual-write code + legacy fallback | ⬜ รอ PR |

> **Runbook อ้างอิง:** PR #161 — COOKIE_AUTH_MODE production rollout runbook

### Rollback

| Item | Rollback |
|------|----------|
| Cookie auth | `COOKIE_AUTH_MODE=dual` หรือ `bearer` ใน backend env |
| LIFF strict | `LIFF_STRICT_MODE=false` ใน backend env |
| LINE ID pseudo | `LINE_ID_STORAGE_MODE=dual` หรือ `plaintext` ใน backend env |
| Prepare indexes | `python scripts/rollback_pseudonym_indexes.py --apply` หรือ `alembic downgrade -1` |
| PR #162 prefs | `alembic downgrade` ย้อนไปก่อน `c4d5e6f7g8h9` |
| PR #165 CSRF | revert `3d96f76` (frontend-only) — หรือ backend งด enforce CSRF ชั่วคราว (ไม่แนะนำ) |

ทุก rollback ทำผ่าน env var + restart — ไม่ต้อง revert code (ยกเว้น PR #165 เป็น frontend-only)

---

## Local DB Status (verified)

- Backfill: 4 users hashed, 104 child rows FK-populated
- Preflight: PASS (100% hash coverage, 0 duplicates)
- Migration `d5e6f7g8h9i0`: applied, both indexes confirmed

---

## บันทึกเพิ่มเติม

- LIFF clients ทั้ง 3 หน้า (`service-request`, `request-v2`, `service-request-single`) ส่ง `x-liff-id-token` header ครบแล้ว
- `__Host-` prefix ไม่ได้ใช้ — path scoping (`/api/v1`, `/api/v1/auth`) ปลอดภัยกว่า
- Backend tests ต้องใช้ Python 3.13+ (local Windows ใช้ venv Python 3.12 + asyncpg)
- PR #162 ไม่กระทบ security rollout — ใช้ `get_current_staff` (HTTP gate เดิม), migration เป็นตารางใหม่ไม่ conflict
- Remaining direct `.line_user_id ==` sites (6 แห่ง): webhook.py:722/748, rich_menus.py:189/357, admin_reports.py:495, admin_live_chat.py:488 — ต้อง convert ก่อน contract migration
- Scripts ใช้ `ENV_FILE=app/.env` สำหรับ local (production guard จะ block ถ้าใช้ `.env` root)
- GitHub repo: `allow_auto_merge=false`, branch protection เปิดอยู่ — ต้องใช้ `gh pr merge --admin` หรือ merge บน GitHub UI (PR #165 merge ได้ปกติหลัง CI green ทุก check)
- Docker Desktop ต้องเปิดก่อน run scripts (PostgreSQL container: `docker-compose up -d db`)
- WS health status ใน `/health/detailed` เป็นแค่ in-process counter — ไม่สามารถ detect browser ที่ connect ไม่ได้ (origin-1008 reject หรือ CSRF 403 เกิดก่อน/นอก WS handler) — อย่าใช้เป็นตัวชี้วัดว่า live-chat ใช้ได้จริง

**สร้างโดย:** Qoder Agent
**วันที่:** 2026-07-28
