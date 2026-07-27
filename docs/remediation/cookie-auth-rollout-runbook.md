# Runbook: COOKIE_AUTH_MODE — ตรวจสอบและปิดงาน production rollout

> **สถานะ:** PR 2A/2B/2C merged หมดแล้ว — default ในโค้ดคือ `cookie`, frontend ใช้ cookie
> auth เท่านั้น (ลบ Bearer path แล้ว) สิ่งที่ยังต้องทำ: **ยืนยันว่า Koyeb prod ทำงานใน
> mode `cookie` จริง** (ถ้าเคย set env var ค้างไว้เป็น `bearer`/`dual` จะต้องเลื่อนขึ้น)
> ต้นฉบับ control semantics: [`migration-controls.md`](./migration-controls.md)

## พื้นหลัง (สิ่งที่ merge ไปแล้ว)

| PR | เนื้อหา |
|----|---------|
| 2A (P1.1a) | Backend foundation: `COOKIE_AUTH_MODE` flag, cookies (`access_token`/`refresh_token`/`csrf_token`, HttpOnly, `SameSite=Strict`, `Secure` ใน prod), CSRF double-submit (`X-CSRF-Token` header vs cookie), refresh rotation + session family, `POST /auth/logout`, `POST /auth/migrate-session`, `POST /auth/ws-ticket` |
| 2B (P1.1b) | Frontend migration: `authFetch` interceptor ส่ง `credentials: 'include'` + CSRF header อัตโนมัติ, AuthContext bootstrap จาก `GET /auth/me`, migrate-session ครั้งเดียว |
| 2C (P1.1c) | Hardening: default `COOKIE_AUTH_MODE=cookie`, `SameSite=Strict`, ลบ Bearer path ออกจาก frontend, ลบ flag `NEXT_PUBLIC_COOKIE_AUTH` (ไม่มีอีกต่อไป) |

**ลำดับ mode:** `bearer` → `dual` → `cookie` (เลื่อนทีละขั้น, ถอยกลับได้ทีละขั้น)

- `bearer`: header อย่างเดียว (legacy)
- `dual`: ตั้ง cookies + ยังคืน tokens ใน response body; `get_current_user` ลอง cookie ก่อน แล้ว fallback ไป Bearer header
- `cookie`: cookies เท่านั้น, ไม่คืน tokens ใน body, refresh ต้องมี `auth_sessions` row รองรับ

## Step 0 — ตรวจสอบ effective mode ปัจจุบัน (ต้องทำก่อนเสมอ)

Koyeb env var ชนะ code default — ต้องเช็คของจริง:

1. เปิด `https://jsk-app.vercel.app` → login admin
2. DevTools → Application → Cookies → `https://jsk-app.vercel.app` (และ domain ของ backend)
   - เห็น `access_token` + `refresh_token` + `csrf_token` (HttpOnly, Secure, SameSite=Strict)
     → backend ตั้ง cookies อย่างน้อย `dual`
3. DevTools → Network → ดู response ของ `POST /api/v1/auth/login`
   - response body **มี** `access_token`/`refresh_token` → mode `dual`
   - response body **ไม่มี** tokens → mode `cookie` ✅ (เป้าหมาย)
4. (ถ้ามี Koyeb CLI/dashboard access) เช็ค env var `COOKIE_AUTH_MODE` ของ service
   `conservative-lusa/jsk-app` โดยตรง

**ตัดสินใจ:**
- ไม่พบ env var หรือเป็น `cookie` → **rollout เสร็จแล้ว** → ข้ามไป "Verification checklist"
- เป็น `dual` → ทำ Step 1 เพื่อเลื่อนเป็น `cookie`
- เป็น `bearer` → ทำ Step 1 สองรอบ (`bearer` → `dual` → `cookie`, ห่างกันอย่างน้อย 1 วันสังเกตอาการ)

## Step 1 — เลื่อน mode (ผู้ใช้รันเอง — agent ไม่มีสิทธิ์สั่ง Koyeb)

```bash
# ต้อง login Koyeb CLI ก่อน: koyeb login (ใช้ API token)
koyeb service update conservative-lusa/jsk-app \
  --env COOKIE_AUTH_MODE=cookie
# → เริ่ม redeploy ~2-5 นาที
```

> ⚠️ **ลำดับสำคัญ (กรณีเริ่มจาก `bearer`):** frontend ปัจจุบันเป็น cookie-only แล้ว
> ดังนั้น `bearer` บน backend = login พังสำหรับ user ที่ใช้ frontend ใหม่ ต้องเลื่อนเป็น
> `dual` ก่อนเสมอ แล้วค่อย `cookie`

รอให้ Koyeb deploy เสร็จ (health check: `curl https://conservative-lusa-jsk-4p0-88fe8c20.koyeb.app/api/v1/health`
→ `{"database":true,"redis":true,"status":"healthy"}`)

## Verification checklist (หลังเปลี่ยน mode)

ทำใน browser (incognito, เคลียร์ cookie เก่าก่อน):

- [ ] Login สำเร็จ → cookies 3 ตัวปรากฏ (`access_token`, `refresh_token`, `csrf_token`)
- [ ] Response body ของ login ไม่มี tokens (ถ้า mode `cookie`)
- [ ] เข้า admin pages ได้ (friends / live-chat / reports) — `authFetch` ส่ง cookie อัตโนมัติ
- [ ] Mutation สำเร็จ (เช่น archive conversation, update friend note) — CSRF header ผ่าน
      (ถ้า fail ด้วย 403 CSRF → เช็ค `csrfStore` + cookie `csrf_token`)
- [ ] Refresh ทำงาน: รอ access token หมดอายุ หรือลบ `access_token` cookie แล้ว reload
      → `POST /auth/refresh` ต่ออายุให้อัตโนมัติ
- [ ] WebSocket live-chat เชื่อมต่อได้ (ใช้ ws-ticket flow)
- [ ] Logout → cookies ถูกลบ + session family ถูก revoke (refresh token เก่าใช้ไม่ได้)

**สัญญาณเฝ้าระวัง 24-48 ชม.:** 401/403 spike ใน Koyeb logs, login failure rate,
WebSocket reconnect loop

## Rollback (ถ้ามีปัญหา)

ถอยทีละขั้น แล้วรอ redeploy:

```bash
koyeb service update conservative-lusa/jsk-app --env COOKIE_AUTH_MODE=dual
# ถ้ายังไม่หาย:
koyeb service update conservative-lusa/jsk-app --env COOKIE_AUTH_MODE=bearer
```

> ⚠️ ถอยเป็น `bearer` จะทำให้ frontend ปัจจุบัน (cookie-only) login ไม่ได้ — ใช้เป็น
> มาตรการสุดท้าย และต้องพร้อม redeploy frontend ตัวเก่าหรือแก้ env กลับทันที
> ถอย `cookie` → `dual` ปลอดภัยกว่า (dual ยังรับ cookie อยู่)

หลัง rollback: ยืนยัน login/refresh/WebSocket กลับมาปกติ แล้วบันทึกเหตุลงใน change record

## ขั้นต่อไป (หลัง cookie เสถียร 3-5 วัน)

- ลบ `COOKIE_AUTH_MODE` flag + Bearer fallback ออกจาก backend (`deps.py`, `auth.py`)
  และ legacy token storage ที่เหลือ — เป็น PR แยก (cleanup phase)
- อัปเดต `migration-controls.md` ให้สอดคล้อง (default `cookie`, `SameSite=Strict`)
