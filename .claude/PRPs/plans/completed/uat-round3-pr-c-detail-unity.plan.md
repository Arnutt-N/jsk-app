# Plan: PR C — Request detail unity (buttons / timeline dot / empty address)

## Summary
3 ประเด็น unity ในหน้า request detail: (1) ปุ่มยกเลิก/บันทึก 4 แท็บ สไตล์ไม่ตรงกัน → แตก `<FormActions>` ใช้ร่วม; (2) จุดวงกลม timeline ไม่กึ่งกลางเส้น (`-left-[41px]` ไม่ตรงกับ `pl-6 sm:pl-8 border-l-2`); (3) การ์ดที่อยู่ว่างโชว์ ",," → join เฉพาะค่าที่มี.

## Metadata
- Complexity: Small–Medium · Source PRD: uat-round3-fixes.prd.md (PR C) · Files: 3

## Findings (โค้ดจริง)
- ปุ่ม cancel/save 4 จุดใน `[id]/page.tsx`:
  - details L1163: ghost sm XIcon + primary sm Save, disabled+isLoading(savingDetails)
  - contact L1330: เหมือน details (savingContact)
  - comment composer L248: ghost **md** + primary **md** Send, isLoading(submittingComment)
  - manage L1562: ghost **md** + primary **md** **CheckCircle2**, ไม่มี loading/disabled
  → ไม่ตรงกัน (size/icon/loading)
- timeline: container L1360 `pl-6 sm:pl-8 border-l-2 ... ml-3`; comment dot L1385 + AuditTimelineEntry dot = `absolute -left-[41px] top-0 w-6 h-6`. padding เปลี่ยนตาม breakpoint แต่ dot offset คงที่ → ไม่ตรงทั้งสองขนาด
- address: L1218 `{request.sub_district}, {request.district}, {request.province}` → ", ," เมื่อว่าง

## Design decisions
- **FormActions** (`components/admin/FormActions.tsx`): render 2 ปุ่ม canonical (ไม่มี wrapper div เพื่อ drop เข้า container เดิม): ghost sm `X` "ยกเลิก" (disabled={saving}) + primary sm `Save` "บันทึก" (isLoading={saving}, disabled={saving||saveDisabled}). props: onCancel, onSave, saving?, saveDisabled?, saveLabel?, cancelLabel?. ใช้ทั้ง 4 แท็บ → size/icon/loading เหมือนกันหมด
- **timeline dot**: ทำ padding คงที่ `pl-8` (เลิก responsive) + dot `-left-[45px]` ทั้ง 2 dot. คำนวณ: content-left = border(2)+pad(32)=34; dot center = 34 + L + 12 = border center(1) → L=-45 → จุดอยู่กลางเส้นพอดี
- **address**: `[sub_district, district, province].filter(Boolean).join(', ') || 'ไม่ระบุ'`

## Tasks
1. สร้าง `components/admin/FormActions.tsx`
2. แทนปุ่ม cancel/save ทั้ง 4 จุดด้วย `<FormActions>` (คง container justify-end/toolbar เดิม)
3. timeline: container `pl-6 sm:pl-8`→`pl-8`; dot `-left-[41px]`→`-left-[45px]` ใน page.tsx (comment dot) + AuditTimelineEntry.tsx
4. address L1218 → filter(Boolean).join

## Validation
- `npx tsc --noEmit` 0 errors · `npx eslint "app/admin/requests/[id]/page.tsx" components/admin/FormActions.tsx components/admin/AuditTimelineEntry.tsx` · `npx vitest run` no regress
- Manual: 4 แท็บปุ่มเหมือนกัน; dot กลางเส้นทั้ง mobile/desktop; ที่อยู่ว่างโชว์ "ไม่ระบุ"

## Acceptance
- [ ] ปุ่ม cancel/save เหมือนกันทุกแท็บ (size sm, X/Save, loading)
- [ ] จุด timeline กึ่งกลางเส้นทุก breakpoint
- [ ] ที่อยู่ว่างไม่โชว์ ",,"
- [ ] tsc/eslint/vitest เขียว

## Notes
branch `fix/uat-r3-c-detail-unity`; squash merge + delete; ไม่มี Co-Authored-By
