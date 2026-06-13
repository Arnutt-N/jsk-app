# Plan: PR D — Admin create form = LIFF parity

## Summary
ฟอร์มสร้างคำร้อง admin ให้เหมือน LIFF request-v2: สลับลำดับ step (ผู้ร้อง → สถานที่/หน่วยงาน → รายละเอียด), ที่อยู่เป็น cascade, หัวข้อ/หัวข้อย่อย cascade ทุกหมวด, submit แท็บสุดท้าย. ย้าย `TOPIC_OPTIONS` (เดิม hardcode ใน LIFF) เป็น shared constant.

## Findings
- create form มี dropdown agency/category อยู่แล้ว แต่ (1) ที่อยู่เป็น `<Input>` free-text, (2) subcategory cascade เฉพาะยาเสพติด ใช้ CATEGORIES (4 หมวด) ไม่ตรง LIFF (TOPIC_OPTIONS 7 หมวด), (3) step order ผู้ร้อง→รายละเอียด→ที่อยู่
- LIFF `TOPIC_OPTIONS: Record<string,string[]>` cascade ทุกหมวด (source จริงที่ LINE user ใช้)
- `ThaiAddressCascade` reusable (value/onChange, 3 FormSelect) ใช้ใน [id] edit อยู่แล้ว

## Tasks (done)
1. `categories.ts`: เพิ่ม `TOPIC_OPTIONS` (คัดลอกจาก LIFF เป๊ะ) + `TOPIC_CATEGORY_OPTIONS`
2. LIFF request-v2: ลบ inline `TOPIC_OPTIONS` → import shared (DRY)
3. create/page.tsx:
   - STEPS reorder: ผู้ร้อง → สถานที่/หน่วยงาน(MapPin) → รายละเอียด(FileText)
   - STEP_FIELDS: เหลือ step 0 (ผู้ร้อง required); step 1 address optional ไม่ gate; required topic fields ใน step สุดท้าย validate ตอน submit (zod)
   - useEffect reset topic_subcategory เมื่อ category เปลี่ยน
   - step 1: agency Select + `ThaiAddressCascade` (จังหวัด→อำเภอ→ตำบล) แทน Input
   - step 2: category = `TOPIC_CATEGORY_OPTIONS`, subcategory cascade = `TOPIC_OPTIONS[category]` (free Input ถ้าไม่มี)
   - submit ปุ่ม "บันทึกคำร้อง" อยู่ step สุดท้าย (step<2 → ถัดไป)

## NOT Building
- ไม่ unify `CATEGORIES` ทั้งแอป (list filter / [id] edit / audit) — risk ripple/data; เป็น follow-up
- ไม่แตะ backend payload (รับ field เดิม)

## Validation
- tsc 0 · eslint 0 · vitest 79/79
- Manual: step order, address cascade โหลดจังหวัด/อำเภอ/ตำบล, subcategory เปลี่ยนตาม category, submit แท็บสุดท้าย, LIFF ยังทำงาน (subcategory cascade)

## Acceptance
- [x] step order = LIFF · [x] address cascade · [x] category/subcategory cascade · [x] submit แท็บสุดท้าย · [x] tsc/eslint/vitest เขียว

## Notes
branch `fix/uat-r3-d-create-form-liff-parity`; squash+delete; ไม่มี Co-Authored-By
