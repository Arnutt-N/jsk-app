# UAT Round 3 — Fixes Backlog (request detail + create form + mobile + LIFF)

> สร้างจาก UAT รอบ 3 (2026-06-13) หลัง PR #86/#87/#88 merged แล้ว
> จัดเป็น 6 PR ย่อย ทำตามลำดับ A→F (วน loop: review→fix→commit→PR→CI→merge)
> ผู้ใช้เลือก: /compact ก่อนเริ่ม

## PR A — [วิกฤต] CRUD: โหลดข้อมูลคำร้องไม่ได้

> **สถานะ: ✅ complete** — แผน(archived): `.claude/PRPs/plans/completed/uat-round3-pr-a-silent-token-refresh.plan.md`
> รายงาน: `.claude/PRPs/reports/uat-round3-pr-a-silent-token-refresh-report.md`
> แก้แล้ว: silent refresh+retry+dedupe ใน interceptor + listen `jsk:auth-expired`→logout + allowlist `/auth/login`+`/auth/refresh` ครอบ DIRECTOR/HEAD

**อาการ**: หน้า `admin/requests` ใช้งานไปสักพักขึ้น "ไม่สามารถโหลดข้อมูลคำร้องได้ กรุณาลองใหม่"
**Hypothesis หลัก**: access token (JWT) หมดอายุแล้วไม่ได้ refresh → admin API ตอบ 401 → fetch ใน
`frontend/app/admin/requests/page.tsx:115` เข้า catch (L129-131) โชว์ error generic
**จุดตรวจ**:
- `frontend/contexts/AuthContext.tsx` — refresh flow (เห็น `Authorization: Bearer ${refreshTokenValue}` ~L289), มี proactive refresh ไหม / event `jsk:auth-expired` ถูก handle ที่ไหน
- `frontend/lib/authFetch.ts` — interceptor dispatch `jsk:auth-expired` เมื่อ 401 แต่ list page ไม่ได้ retry/refresh
- backend token TTL (`backend/app/core/config.py`, `core/security.py`) — ACCESS_TOKEN_EXPIRE
- เป็นไปได้รอง: Supabase free-tier idle/cold start → connection ตอนแรกล้ม
**แนวแก้**: ทำ silent refresh เมื่อ 401 (refresh token แล้ว retry คำขอเดิม) หรืออย่างน้อย redirect ไป login + ปุ่ม "ลองใหม่" ที่เรียก refresh ก่อน ; ยืนยันด้วยการ reproduce token expiry

## PR B — [สูง] ปุ่ม workflow การ์ดคำร้องตามบทบาท + เคบับ inline

**ไฟล์**: `frontend/app/admin/requests/[id]/page.tsx` (hero card workflow buttons), `frontend/lib/permissions.ts`
**กติกาปุ่ม (cap)**:
- **staff (เดิม AGENT) / user ทั่วไป**: แสดง **ไม่เกิน 2 ปุ่ม + เคบับ 1 ปุ่ม**
  - ปุ่มหลักตามสถานะการดำเนินงาน: รับเรื่อง → เริ่มดำเนินงาน → ส่งอนุมัติ (แสดงทีละสเต็ปตามสถานะ) + ปฏิเสธ
  - **ไม่มี "มอบหมาย"**
- **superadmin / admin / ผู้อำนวยการ(DIRECTOR) / หัวหน้า(HEAD)**: แสดง **ไม่เกิน 3 ปุ่ม + เคบับ 1 ปุ่ม**
  - รับเรื่อง / เริ่มดำเนินงาน / ส่งอนุมัติ (ตามสถานะ) + **มอบหมาย** + ปฏิเสธ
- ย้าย **เคบับ (รายการเพิ่มเติม) มาบรรทัดเดียวกัน ตำแหน่งขวาสุด**
- ปัญหาเดิม: ปุ่มแน่นเกินไป (ดูภาพ ecfdd8ff: รับเรื่อง·มอบหมาย·ส่งต่อ·ปฏิเสธ ล้นแถว)
**สำคัญ**: ตรวจ role/permission ให้สอดคล้องกับหน้า `admin/users` และ `admin/settings/permissions`
— "เคยแก้ agent → staff แล้ว" ต้องเช็คว่า role enum/label ตรงกันทุกที่ (backend `UserRole`, permissions matrix, frontend `lib/permissions.ts`)

## PR C — [กลาง] Unity หน้า request detail (3 ประเด็นรวม)

**ไฟล์**: `frontend/app/admin/requests/[id]/page.tsx`, `frontend/components/admin/AuditTimelineEntry.tsx`
1. **ปุ่มยกเลิก/บันทึก ทุกแท็บให้เหมือนกัน** (รายละเอียด / ที่อยู่ / การดำเนินงาน·ความเห็น / จัดการคำร้อง)
   — ตอนนี้ position/ขนาด/ไอคอนไม่ตรงกัน → ทำ pattern เดียว (ล่างขวา, ปุ่มเดียวกัน) อาจแตก component `<FormActions onCancel onSave saving/>`
2. **จุดวงกลม timeline ไม่กึ่งกลางเส้น** — เส้น `border-l-2` ของ container กับ dot `absolute -left-[41px]` ไม่ตรงแกน
   — แก้ให้ dot center อยู่บนเส้นพอดี (คำนวณ left จาก padding-left ของเส้น/ความกว้าง dot) ทั้ง comment dot และ AuditTimelineEntry dot
3. **การ์ดที่อยู่ว่างโชว์ ",,"** — `page.tsx` view mode contact: `{sub_district}, {district}, {province}` เมื่อว่างหมดได้ ", ,"
   — แก้เป็น join เฉพาะค่าที่มี: `[sub_district, district, province].filter(Boolean).join(', ') || 'ไม่ระบุ'`

## PR D — [กลาง/ใหญ่สุด] Admin create form = LIFF parity

**ไฟล์**: `frontend/app/admin/requests/create/page.tsx` (ตรวจ path จริง), เทียบ `frontend/app/liff/request-v2/page.tsx`
**ปัญหา**: ลำดับ step admin = ผู้ร้อง → รายละเอียด → ที่อยู่ ; พอกด "ถัดไป" ที่ step รายละเอียดกลับให้บันทึกเลย
ทั้งที่ที่อยู่ (step สุดท้าย) ยังไม่กรอก
**เป้าหมาย**: ทำให้เหมือน LIFF `request-v2`:
- ลำดับ LIFF: ข้อมูลส่วนตัว → **หน่วยงาน/ที่อยู่** → **รายละเอียด** → เอกสารแนบ (submit ที่แท็บสุดท้าย)
- **หน่วยงาน = dropdown** จาก `AGENCIES`: ศูนย์ยุติธรรมชุมชน, ศูนย์ดำรงธรรม, สถานีตำรวจภูธร, กำนัน ผู้ใหญ่บ้าน จิตอาสา ผู้นำชุมชน
- **ที่อยู่ = cascade** จังหวัด→อำเภอ→ตำบล (reuse `ThaiAddressCascade` หรือ logic `/api/v1/locations/*`)
- **หัวข้อ (category) = dropdown**: แจ้งเบาะแสยาเสพติด, กองทุนยุติธรรม, เงินเยียวยาเหยื่ออาชญากรรม, ไกล่เกลี่ยข้อพิพาท, ร้องเรียน/ร้องทุกข์
- **หัวข้อย่อย = cascade** ตาม category (ตาม LIFF `TOPIC_OPTIONS` / `DRUG_REPORTING_SUBCATEGORIES`)
- กดส่งข้อมูลจริงเมื่อจบแท็บสุดท้ายเท่านั้น (ปุ่ม "บันทึกคำร้อง" อยู่ step สุดท้าย, step กลางเป็น "ถัดไป")
- ใช้ `FormSelect` ให้ chevron ไม่ชิดขอบ

## PR E — [polish] มือถือ: ย้าย toggle ภาษา/ธีม เข้า dropdown โปรไฟล์

**ไฟล์**: `frontend/app/admin/layout.tsx` (header), `frontend/components/admin/UserMenu.tsx`,
`AdminLanguageToggle.tsx`, `ThemeToggleSwitch.tsx`
**ปัญหา**: บนมือถือ navbar header แน่น (TH/EN + sun/moon inline)
**แก้**: บน mobile (`lg:hidden` หรือ breakpoint) ย้าย AdminLanguageToggle + ThemeToggleSwitch เข้าไปใน
dropdown ของ avatar (UserMenu) เป็น selector ; desktop คงเดิม

## PR F — [polish] LIFF form: chevron < > + dropdown edge

**ไฟล์**: `frontend/app/liff/request-v2/page.tsx` (+ service-request variants ถ้ากระทบ)
- ปุ่ม step nav "< กลับ" / "ถัดไป >" ไม่ให้ข้อความ/ไอคอนหล่นบรรทัด (whitespace-nowrap / flex)
- dropdown selector chevron `v` ไม่ชิดขอบ (เพิ่ม pr / appearance-none + custom chevron แบบ FormSelect ฝั่ง admin)

---

## บริบทบทบาท/สิทธิ์ (อ้างอิงทำ PR B)
- backend `UserRole`: SUPER_ADMIN, ADMIN, AGENT, USER (+ อาจมี DIRECTOR/HEAD ที่เพิ่มทีหลัง — ตรวจ `models/user.py` + permission matrix `_SEED_DESCRIPTIONS`)
- permission matrix หน้า `admin/settings/permissions` (Stage 2) มี 5+ keys รวม `revert_approval`, `edit_request_details`
- "agent → staff" rename: ตรวจว่า label/enum sync ทุกที่ (ปุ่มบอกว่ายัง map ไม่ตรง)

## หมายเหตุ env/ลำดับ
- ทุก PR frontend-only ยกเว้น PR A (อาจแตะ backend token config) → ส่วนใหญ่ไม่ต้อง migration
- รัน: tsc/eslint (WSL), vitest (Windows PowerShell), pytest (WSL); CI = Pytest + Lint&Build + Playwright Smoke + Encoding Scan + Vercel
- commit ไม่มี Co-Authored-By (global rule), squash merge + delete branch
