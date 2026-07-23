# Handoff — 2026-07-23 (post-PR-2C-merge)

> **สถานะปัจจุบัน:** PR 2C Cookie-Only Hardening merged เข้า main (`b4aaa05`) แล้ว — cookie auth เป็น default, Bearer path ลบออก, WS ใช้ ticket auth เสมอ

---

## สิ่งที่เสร็จล่าสุด

| PR | สถานะ | Commit บน main |
|---|---|---|
| PR 2A round-1 (#133) | ✅ Merged | Cookie Backend Foundation (P1.1a) — refresh rotation, family tracking, ws-ticket, dual-mode |
| PR 2A round-2 (#134) | ✅ Merged | ปิด review findings |
| PR 2B (#135) | ✅ Merged | Frontend cookie auth migration — CSRF+credentials, /auth/me bootstrap, single-flight refresh, Bearer→cookie migration, WS ticket auth, multi-tab sync |
| PR 2C (#157) | ✅ Merged | Cookie-Only Hardening — default `COOKIE_AUTH_MODE=cookie`, SameSite=Strict, ลบ Bearer path ออกจาก frontend, WS ticket auth เป็น default (NEW-3 ปิด), ESLint 9 flat config fix |

**Main branch:** `b4aaa05` (origin/main sync แล้ว)
**Backend default:** `COOKIE_AUTH_MODE=cookie` (rollback: set `dual` หรือ `bearer` ใน env)

---

## สิ่งที่ต้องทำต่อ (Roadmap)

### 1. Production Rollout (ทำบน production — ไม่ต้อง PR)

เนื่องจาก PR 2C เปลี่ยน default เป็น `cookie` แล้ว ขั้นตอน rollout:

1. **Deploy backend ด้วย `COOKIE_AUTH_MODE=dual`** (override default ชั่วคราว) — ให้ frontend เก่ายังใช้ Bearer ได้ระหว่าง transition
2. **Deploy frontend ใหม่** (cookie-only, ไม่มี `NEXT_PUBLIC_COOKIE_AUTH` flag แล้ว)
3. **สังเกต 3-5 วัน** — ดู error rate, login success, WS connection
4. **ลบ `COOKIE_AUTH_MODE=dual` override** → backend ใช้ default `cookie` (บล็อก Bearer ทั้งหมด)

**Rollback ถ้ามีปัญหา:** set `COOKIE_AUTH_MODE=dual` หรือ `bearer` ใน backend env + restart — ไม่ต้อง revert code

### 2. LIFF Strict Mode (P0.2 — ยังไม่ได้ทำ)

- Wire `LIFF_STRICT_MODE` ให้บังคับ `x-liff-id-token` verification
- ต้อง update LIFF client ให้ส่ง ID token ก่อน (ปัจจุบันไม่ส่ง)
- ดู `docs/remediation/preflight-evidence-and-designs.md` §1 + §9

### 3. LINE ID Pseudonymization — Phase ถัดไป

- PR B (migrate phase) merged แล้ว (`196305b`)
- เหลือ: flip `LINE_ID_STORAGE_MODE=pseudonym` บน production เมื่อพร้อม

---

## บันทึกเพิ่มเติม

- ESLint 9 flat config แก้แล้ว (PR 2C) — `.eslintignore` ลบออก, ใช้ `ignores` ใน `eslint.config.mjs`
- `__Host-` prefix ไม่ได้ใช้ — ต้อง `Path=/` ซึ่งกว้างกว่า path scoping ปัจจุบัน (`/api/v1`, `/api/v1/auth`) ที่ปลอดภัยกว่า
- Backend tests ต้องใช้ Python 3.13+ (local Windows มี 3.9 — ใช้ WSL)

**สร้างโดย:** Qoder Agent
**วันที่:** 2026-07-23
