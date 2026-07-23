# Handoff — 2026-07-23 (all security items complete)

> **สถานะปัจจุบัน:** ทุก security migration item เสร็จครบ — cookie auth default, LIFF strict mode default, พร้อม deploy production

---

## สิ่งที่เสร็จล่าสุด

| PR / Commit | สถานะ | รายละเอียด |
|---|---|---|
| PR 2A round-1 (#133) | ✅ Merged | Cookie Backend Foundation (P1.1a) — refresh rotation, family tracking, ws-ticket, dual-mode |
| PR 2A round-2 (#134) | ✅ Merged | ปิด review findings |
| PR 2B (#135) | ✅ Merged | Frontend cookie auth migration — CSRF+credentials, /auth/me bootstrap, single-flight refresh, WS ticket auth, multi-tab sync |
| PR 2C (#157) | ✅ Merged | Cookie-Only Hardening — default `COOKIE_AUTH_MODE=cookie`, SameSite=Strict, ลบ Bearer path, WS ticket auth default (NEW-3 ปิด), ESLint 9 fix |
| LIFF Strict Mode | ✅ Done | `LIFF_STRICT_MODE=True` เป็น default — LIFF clients ทั้ง 3 หน้าส่ง `x-liff-id-token` ครบแล้ว |

**Main branch:** latest (origin/main sync)
**Backend defaults:** `COOKIE_AUTH_MODE=cookie`, `LIFF_STRICT_MODE=True`

---

## สิ่งที่ต้องทำต่อ (Production Deployment — ไม่ต้อง PR)

### Deployment Checklist

| Step | Env Var | Value | When |
|------|---------|-------|------|
| 1 | `COOKIE_AUTH_MODE` | `dual` (override ชั่วคราว) | Deploy backend ก่อน |
| 2 | Deploy frontend | (cookie-only build) | หลัง backend เสถียร |
| 3 | ลบ `COOKIE_AUTH_MODE` override | → default `cookie` | หลังสังเกต 3-5 วัน |
| 4 | `LIFF_STRICT_MODE` | `true` (เป็น default แล้ว) | ทันที (clients พร้อม) |
| 5 | `LINE_ID_STORAGE_MODE` | `pseudonym` | หลัง confirm migration ครบ |

### Rollback

| Item | Rollback |
|------|----------|
| Cookie auth | `COOKIE_AUTH_MODE=dual` หรือ `bearer` ใน backend env |
| LIFF strict | `LIFF_STRICT_MODE=false` ใน backend env |
| LINE ID pseudo | `LINE_ID_STORAGE_MODE=dual` หรือ `plaintext` ใน backend env |

ทุก rollback ทำผ่าน env var + restart — ไม่ต้อง revert code

---

## บันทึกเพิ่มเติม

- LIFF clients ทั้ง 3 หน้า (`service-request`, `request-v2`, `service-request-single`) ส่ง `x-liff-id-token` header ครบแล้ว — design doc §1 finding เก่า/outdated
- `__Host-` prefix ไม่ได้ใช้ — path scoping (`/api/v1`, `/api/v1/auth`) ปลอดภัยกว่า
- Backend tests ต้องใช้ Python 3.13+ (local Windows มี 3.9 — ใช้ WSL)
- LINE ID Pseudonymization PR B merged (`196305b`) — เหลือแค่ flip env var

**สร้างโดย:** Qoder Agent
**วันที่:** 2026-07-23
