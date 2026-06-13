# Implementation Report: Request Edit Audit Log — Phase 3 (E2E + validation)

## Summary
เพิ่ม E2E spec `frontend/e2e/audit-timeline.spec.ts` พิสูจน์ timeline ที่ merge audit entries
และผ่านรอบ code review (verdict APPROVE) พร้อม fix 3 จุดจาก review ก่อน commit —
ปิด feature ชุด request-edit-audit-log ครบ 3 phases รอ CI/merge

## E2E Strategy

| Test | รันเมื่อไร | พิสูจน์อะไร |
|---|---|---|
| `comments tab renders the merged timeline without crashing` | ทุกครั้ง (CI Playwright Smoke) | เปิดแท็บการดำเนินงานบนข้อมูลจริง → pipeline fetchAuditLogs + mergeTimeline + render ไม่พังหน้า |
| `editing a contact field surfaces an audit entry in the timeline` | เฉพาะ `E2E_ALLOW_MUTATION=1` (UAT/local) | roundtrip เต็ม: แก้เบอร์โทร → บันทึก → entry "แก้ไขข้อมูลคำร้อง" + ชื่อ field ไทย + ค่าใหม่ปรากฏใน timeline แล้ว revert ค่ากลับ |

เหตุผล guard: spec เดิมของโปรเจกต์ (permission-settings, supervisor) เลี่ยงการ mutate shared dev DB ใน CI
— mutation test จึงเปิดด้วย env flag สำหรับ UAT แทน (ตรรกะ capture/merge มี pytest 4 + vitest 6 covering แล้ว)

## Code Review (Phase 1+2 รวม)

Verdict: **APPROVE** — 0 CRITICAL / 0 HIGH / 3 MEDIUM (pre-existing) / 1 LOW

| Finding | Action |
|---|---|
| MEDIUM: N+1 enrich admin_name (แย่ลงเพราะ limit=200) | ✅ Fixed — batch IN query เดียว |
| MEDIUM: `audit_logs.resource_id` ไม่มี index | ✅ Fixed — `index=True` + migration `q7r8s9t0u1v2` (apply local แล้ว) |
| MEDIUM: `created_at` naive utcnow vs aware cutoff | ⏸️ Deferred — ต้องเปลี่ยน column type (migration ใหญ่กว่า scope); pre-existing ทั้งระบบ |
| LOW: `params.id` ไม่ encode ใน URL | ✅ Fixed — `encodeURIComponent(String(params.id))` |

## Validation Results

| Check | Status |
|---|---|
| pytest (affected หลัง fix) | ✅ 23 passed |
| pytest full suite | ✅ 344 passed (ก่อน review fixes; fixes กระทบเฉพาะไฟล์ที่ retest แล้ว) |
| vitest | ✅ 69 passed |
| tsc (หลัง fix ทุกจุด) | ✅ 0 errors |
| eslint (รวม spec ใหม่) | ✅ 0 errors |
| alembic upgrade head (local) | ✅ ไล่ถึง q7r8s9t0u1v2 |
| CI (Playwright Smoke / Build / Pytest) | ⏳ รอ PR |

## UAT Checklist (manual — user ทำหลัง deploy/preview)
- [ ] ADMIN แก้เบอร์โทรในแท็บผู้ติดต่อ → แท็บการดำเนินงานเห็น entry ม่วง "แก้ไขข้อมูลคำร้อง" พร้อม ค่าเดิม → ค่าใหม่
- [ ] แก้หลาย field ใน 1 ครั้ง → entry เดียวรวมทุก field
- [ ] บันทึกโดยไม่เปลี่ยนค่า → ไม่มี entry ใหม่
- [ ] entry แทรกตามลำดับเวลา ไม่เพี้ยนเมื่อสลับกับ comment ใหม่
- [ ] (option) รัน `E2E_ALLOW_MUTATION=1 npx playwright test e2e/audit-timeline.spec.ts` กับ dev server local

## Files Changed (Phase 3 + review fixes)

| File | Action |
|---|---|
| `frontend/e2e/audit-timeline.spec.ts` | CREATED |
| `backend/app/api/v1/endpoints/admin_audit.py` | UPDATED (batch enrich) |
| `backend/app/models/audit_log.py` | UPDATED (index=True) |
| `backend/alembic/versions/q7r8s9t0u1v2_add_index_audit_logs_resource_id.py` | CREATED |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATED (encodeURIComponent) |

## Next Steps
- [ ] push + PR + CI เขียว + merge
- [ ] หลัง merge: `python scripts/db_target.py alembic --target remote upgrade head` (apply index บน Supabase)
- [ ] UAT checklist ด้านบน
