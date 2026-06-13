# Implementation Report: PR C — Request detail unity

## Summary
แก้ 3 ประเด็น unity ในหน้า request detail: (1) ปุ่มยกเลิก/บันทึก 4 แท็บ → `<FormActions>` ใช้ร่วม (size sm, X/Save, loading เหมือนกัน); (2) จุด timeline กึ่งกลางเส้น (`pl-8` + dot `-left-[45px]`); (3) ที่อยู่ว่างไม่โชว์ ",," → `filter(Boolean).join(', ') || 'ไม่ระบุ'`.

## Tasks Completed
| # | Task | Status |
|---|---|---|
| 1 | สร้าง `components/admin/FormActions.tsx` | ✅ |
| 2 | แทนปุ่ม cancel/save 4 จุด (details/contact/comment/manage) | ✅ |
| 3 | timeline: container `pl-6 sm:pl-8`→`pl-8`; dot `-left-[41px]`→`-left-[45px]` (page + AuditTimelineEntry) | ✅ |
| 4 | address L1218 → filter(Boolean).join | ✅ |
| 5 | ลบ unused import (Send/Save/XIcon) | ✅ |

## Validation
| Level | Status |
|---|---|
| tsc | ✅ 0 errors |
| eslint | ✅ 0 errors (1 warning setManageFormData เดิม) |
| vitest | ✅ 79/79 |

## Files Changed
| File | Action |
|---|---|
| `frontend/components/admin/FormActions.tsx` | CREATED |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATED (4 ปุ่ม + timeline + address + imports) |
| `frontend/components/admin/AuditTimelineEntry.tsx` | UPDATED (dot offset) |

## Notes
- dot offset px-tuned: content-left=border(2)+pad(32)=34, dot center=34+(-45)+12=1 = border center → กลางเส้นพอดี ทุก breakpoint (padding คงที่ pl-8)
- manage save flag ใช้ `loading` (handleSaveManage เรียก setLoading) — comment ใช้ submittingComment + saveDisabled=ข้อความว่าง
- Deviations: ไม่มี

## Next
- [ ] commit → push → PR → CI → merge → PR D
