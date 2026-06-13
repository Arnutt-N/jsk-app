# UAT Round 4 — Fixes Backlog (buttons unity / focus / loading / LIFF / create form)

> สร้างจาก UAT รอบ 4 (2026-06-13) หลัง PR #89–#94 (รอบ 3) merged
> จัดเป็น 5 PR ย่อย ทำตามลำดับ A→E (วน loop: plan→implement→review→commit→PR→CI→merge)
> ผู้ใช้ทำงาน PR-by-PR; commit ไม่มี Co-Authored-By; squash merge + delete branch

## PR A — [med] Loading UI unity (centered + styled)
**อาการ** (ภาพ 772724.jpg): บนมือถือจังหวะ "ย้อนกลับ"/redirect ขึ้น spinner + "กำลังโหลด..." **ดิบ มุมซ้ายบน** ไม่ centered/ไม่ styled; desktop login→admin มี spinner กลางจอ แล้ว "ขยับ" มากลาง content (layout shift)
**จุดตรวจ**:
- `frontend/app/admin/loading.tsx` (route-level fallback — น่าจะเป็นตัวที่ดิบ)
- หา root `app/loading.tsx` / `app/liff/loading.tsx` ว่ามีไหม (login redirect ใช้ตัวไหน)
- `components/ui/LoadingSpinner` — ใช้เป็น fallback กลาง centered (min-h-screen flex center)
- AuthContext redirect flow (`isLoading`) → spinner ตอน redirect login→admin
**แนวแก้**: ทำ loading fallback กลาง 1 แบบ (centered, `min-h-[60vh]`/`min-h-screen` flex items-center justify-center + LoadingSpinner + ข้อความ) ใช้ทุกที่ ; กัน layout shift ตอน login redirect (spinner อยู่ใน container เดียวกับ content)

## PR B — [med] ปุ่ม ยกเลิก/บันทึก unity ทั้งโปรเจค (state + ไอคอน)
**อาการ**:
1. แท็บ "การดำเนินงาน/ความเห็น" ปุ่มบันทึก disabled จนกว่าจะพิมพ์ (saveDisabled) แต่แท็บ "จัดการคำร้อง" **ไม่มี disabled state** (บันทึก active ตลอด) → ไม่ consistent
2. ไอคอนปุ่มบันทึก/ยกเลิก + การตกแต่ง ทุกหน้า ไม่ unity (issue #6)
**ไฟล์**: `frontend/components/admin/FormActions.tsx` (มีแล้วจากรอบ 3), `frontend/app/admin/requests/[id]/page.tsx` (แท็บ manage → ใช้ FormActions + saveDisabled = ไม่มีการแก้ไข/ไม่ dirty), create page, และหน้าอื่นที่มีปุ่มบันทึก/ยกเลิกเอง
**แนวแก้**:
- manage tab: ส่ง `saveDisabled` (เช่น ไม่มีการเปลี่ยนแปลงจากค่าเดิม) ให้สอดคล้องกับ comment tab
- ตรวจหน้าอื่น ๆ ที่ยังใช้ `<Button>` ยกเลิก/บันทึกเอง → พิจารณาใช้ FormActions หรืออย่างน้อย icon (X + Save) + variant เหมือนกัน
- ไอคอนมาตรฐาน: ยกเลิก = `X`, บันทึก = `Save` (ตาม FormActions)

## PR C — [low] โฟกัสช่อง input วันที่ (focus ring ซ้อน)
**อาการ**: ช่องวันที่ (แท็บจัดการคำร้อง + create form) ตอนคลิก/เคอร์เซอร์อยู่ในช่อง มีโฟกัส **สีเทาดำ (outline เบราว์เซอร์) ซ้อนกับสีฟ้า/น้ำเงิน (custom ring)** พอเอาเมาส์ออกถึงเป็นสีฟ้าอย่างเดียว
**ไฟล์**: `frontend/components/ui/CalendarPickerTH.tsx` (และ/หรือ trigger input ของมัน)
**แนวแก้**: เพิ่ม `focus:outline-none` / `focus-visible:outline-none` แล้วใช้ ring เดียว (focus-visible:ring) ; เอา default browser outline (สีเทาดำ) ออก ไม่ให้ซ้อน

## PR D — [low] /admin/requests/create เรียง source + label วันที่
**ไฟล์**: `frontend/app/admin/requests/create/page.tsx`
1. เรียง `SOURCE_OPTIONS` ใหม่ตามนี้: **แบบฟอร์มคำร้อง → โทรศัพท์ติดต่อ → Facebook → LINE → Walk-in → อื่นๆ**
   (ค่าเดิม: PHONE 'โทรศัพท์', FORM 'แบบฟอร์มคำร้อง', FACEBOOK, LINE, WALK_IN, OTHER — แก้ทั้งลำดับและ label 'โทรศัพท์'→'โทรศัพท์ติดต่อ')
2. ช่องวันที่: เอา label `(ค่าเริ่มต้น = วันนี้)` ออก (เหลือแค่ "วันที่รับเรื่อง")
3. focus ช่องวันที่ → ครอบใน PR C (CalendarPickerTH)
4. ปุ่มยกเลิก/บันทึก unity → ครอบใน PR B

## PR E — [low] LIFF service-request: chevron + ปิดหน้าหลัง submit
**ไฟล์**: `frontend/app/liff/service-request/page.tsx`
1. ปุ่ม "< กลับ" / "ถัดไป >" **ยังหล่นบรรทัด** แม้ใส่ `whitespace-nowrap` แล้ว — เจาะลึก: อาจเป็นที่ icon+text ใน `<Button>` ไม่ได้ inline หรือ flex-1 บีบจนตัด → wrap label ใน `<span className="inline-flex items-center whitespace-nowrap">` หรือปรับ Button ให้ icon+text เป็น flex nowrap
2. กดส่งข้อมูลสำเร็จ แต่หน้าไม่ปิดเอง (LIFF) → เพิ่มปุ่ม **กากบาท (X) ปิดฟอร์ม** หรือ redirect กลับหน้าแรก/index หลัง success ; ตรวจ success screen ปัจจุบัน (มี setSuccess ไหม) ว่าควรมี `liff.closeWindow()` หรือปุ่มปิด/กลับ

## หมายเหตุ
- ทุก PR frontend-only (ไม่มี backend/migration)
- รัน: tsc/eslint (WSL/PowerShell), vitest (PowerShell), pytest (WSL); CI = Pytest + Lint&Build + Playwright Smoke + Encoding Scan + Vercel
- unity ไอคอน/ปุ่ม: ยกเลิก=`X` (lucide), บันทึก=`Save` (lucide), variant ghost/primary ตาม FormActions
