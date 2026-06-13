# Plan: Request Edit Audit Log — Phase 2 (Frontend: timeline merge)

## Summary
ดึง audit logs ของ request (action `edit_request_details`) จาก API ที่ Phase 1 เพิ่ม filter ให้
แล้วแทรกเป็น entry ใน timeline เดิมของแท็บ "การดำเนินงาน/ความเห็น" เรียงเวลาแทรกกับ comments
พร้อมชื่อ field ภาษาไทยและ old→new ผ่าน component แยกไฟล์ (`AuditTimelineEntry`)

## User Story
As a หัวหน้างาน/ผู้ตรวจสอบ, I want เห็นประวัติการแก้ไขข้อมูลแทรกใน timeline เดียวกับความเห็น, so that อ่านเหตุการณ์ทั้งหมดเป็นเส้นเรื่องเดียวเรียงตามเวลา

## Problem → Solution
Audit entry ถูกบันทึกแล้ว (Phase 1) แต่ไม่มีที่แสดง → timeline แท็บ comments แสดง merge(comments, audits) เรียง `created_at`

## Metadata
- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/request-edit-audit-log.prd.md`
- **PRD Phase**: Phase 2 — Frontend: timeline merge
- **Estimated Files**: 7 (5 CREATE frontend, 1 UPDATE frontend, 1 UPDATE backend เล็ก)

---

## UX Design

### Before
```
แท็บ การดำเนินงาน/ความเห็น
│● SYSTEM  12 มิ.ย. 68, 10:00
│  [bubble: เปลี่ยนสถานะ...]
│● Admin A 12 มิ.ย. 68, 11:00
│  [bubble: ความเห็น...]
(การแก้เบอร์โทรเมื่อ 10:30 — มองไม่เห็น)
```

### After
```
│● SYSTEM  12 มิ.ย. 68, 10:00
│  [bubble: เปลี่ยนสถานะ...]
│◆ Admin B 12 มิ.ย. 68, 10:30   ← entry ใหม่ (tint ม่วง)
│  [แก้ไขข้อมูลคำร้อง
│   หมายเลขโทรศัพท์: 0812345678 → 0899999999]
│● Admin A 12 มิ.ย. 68, 11:00
│  [bubble: ความเห็น...]
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| แท็บ comments | แสดงเฉพาะ comments | แสดง comments + audit entries เรียงเวลา | read-only ไม่มี interaction ใหม่ |
| หลังบันทึกแก้ไข details/contact | refresh detail | refresh detail + audit logs | เปิดแท็บ comments เห็น entry ทันที |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/app/admin/requests/[id]/page.tsx` | 69-76, 263-275, 289, 337-377, 393-460, 1339-1385 | Comment interface, CommentDate, API_BASE='/api/v1', fetchDetail/fetchComments pattern, จุด refresh หลัง save, timeline JSX |
| P1 | `frontend/lib/diff-fields.ts` + `lib/__tests__/diff-fields.test.ts` | all | pure-function + vitest pattern ที่จะ mirror |
| P1 | `backend/app/api/v1/endpoints/admin_audit.py` | 15-27 | query params (days le=90 ที่ต้องขยาย) + response shape |
| P2 | `frontend/lib/constants/categories.ts` | 1-30 | constants file convention (`as const`, export) |
| P2 | `frontend/components/admin/TypingIndicator.tsx` | all | admin component file convention |

## External Documentation

No external research needed — feature uses established internal patterns.

---

## Patterns to Mirror

### API_FETCH_PATTERN
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:337,361-366
const API_BASE = '/api/v1';
const fetchComments = useCallback(async () => {
    try {
        const res = await fetch(`${API_BASE}/admin/requests/${params.id}/comments`);
        if (!res.ok) throw new Error('Failed to fetch comments');
        const data = await res.json();
        setComments(data);
    } catch (error) { ... logger ... }
}, [params.id]);
```

### DATE_FORMAT_PATTERN
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:267-275
function CommentDate({ dateStr }: { dateStr: string }) {
    const formatted = useMemo(() => {
        const d = new Date(dateStr);
        const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
        const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        return `${date}, ${time}`;
    }, [dateStr]);
    return <span className="text-[10px] font-bold text-text-tertiary">{formatted}</span>;
}
```

### TIMELINE_BUBBLE_PATTERN
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:1361-1378
<div key={i} className="relative group">
    <div className={`absolute -left-[41px] top-0 w-6 h-6 rounded-full border-[5px] border-surface shadow-md ${dotColor}`}></div>
    <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold ...`}>{comment.display_name}</span>
        <CommentDate dateStr={comment.created_at} />
    </div>
    <div className={`${bubbleTint} rounded-2xl rounded-tl-sm p-4 text-sm text-text-secondary leading-relaxed shadow-sm`}>
        {comment.content}
    </div>
</div>
// tint เดิม: SYSTEM=amber, ADMIN=brand — entry แก้ไขข้อมูลใช้ violet แยกชัด
```

### PURE_FUNCTION_DOC_PATTERN
```ts
// SOURCE: frontend/lib/diff-fields.ts:1-17
/**
 * เปรียบเทียบค่าในฟอร์มกับ baseline (ข้อมูลจาก API) แล้วคืนเฉพาะ field ที่เปลี่ยน
 * ... (Thai docstring อธิบาย semantic + edge cases)
 */
export function buildChangedFields(
    form: Record<string, string>,
    baseline: Record<string, unknown>,
): Record<string, string> {
```

### TEST_STRUCTURE
```ts
// SOURCE: frontend/lib/__tests__/diff-fields.test.ts:1-17
import { describe, it, expect } from 'vitest';
import { buildChangedFields } from '../diff-fields';

describe('buildChangedFields', () => {
  it('returns only the fields whose values differ from baseline', () => {
    ...
    expect(buildChangedFields(form, baseline)).toEqual({ firstname: 'สมหญิง' });
  });
});
```

### AUDIT_API_RESPONSE (contract จาก Phase 1)
```jsonc
// SOURCE: backend/app/api/v1/endpoints/admin_audit.py:69-87
// GET /api/v1/admin/audit/logs?resource_type=service_request&resource_id={id}&action=edit_request_details&days=3650&limit=200
{ "total": 1, "logs": [{
    "id": 9, "admin_id": 7, "admin_name": "Real Admin",
    "action": "edit_request_details", "resource_type": "service_request", "resource_id": "42",
    "details": { "fields": { "phone_number": { "old": "081...", "new": "089..." } } },
    "created_at": "2026-06-12T10:30:00+00:00" }],
  "limit": 200, "offset": 0 }
// เรียง created_at DESC — frontend ต้อง sort เองตอน merge
```

### THAI_FIELD_LABELS (จาก form labels จริงใน page.tsx:1013-1330)
| field | label |
|---|---|
| topic_category | หมวดหมู่ |
| topic_subcategory | ประเภท |
| description | รายละเอียดเพิ่มเติม |
| prefix | คำนำหน้า |
| firstname | ชื่อ |
| lastname | นามสกุล |
| phone_number | หมายเลขโทรศัพท์ |
| email | อีเมล |
| sub_district | ตำบล/แขวง |
| district | อำเภอ/เขต |
| province | จังหวัด |
| agency | หน่วยงาน |

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `frontend/lib/constants/request-field-labels.ts` | CREATE | mapping ชื่อ field ไทย (PRD open question — ตัดสิน: constants กลางตาม Shared Constants Pattern) |
| `frontend/lib/constants/__tests__/request-field-labels.test.ts` | CREATE | ครบ 12 field + fallback |
| `frontend/lib/timeline-merge.ts` | CREATE | types + `mergeTimeline()` pure function |
| `frontend/lib/__tests__/timeline-merge.test.ts` | CREATE | ลำดับ merge + tie-break + payload ผิดรูป |
| `frontend/components/admin/AuditTimelineEntry.tsx` | CREATE | render audit entry (กัน page.tsx บวม) |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATE | state + fetch + merge + render |
| `backend/app/api/v1/endpoints/admin_audit.py` | UPDATE | `days` le=90 → le=3650 (ประวัติเก่าหายถ้าไม่ขยาย) |
| `backend/tests/test_admin_audit_endpoints.py` | UPDATE | test days=3650 ได้ 200 |

## NOT Building
- ไม่แสดง entry unassign / revert_approval ใน timeline (Could ใน PRD — เลื่อน; query filter `action=edit_request_details` ไว้แล้ว เพิ่มทีหลังแค่ถอด filter + render เพิ่ม)
- ไม่มี permission gate การเห็น log (ตัดสินใจแล้ว: ทุก admin role เห็น)
- ไม่ทำ pagination ใน timeline (limit=200 พอสำหรับ scale ปัจจุบัน — บันทึกเป็น known limit)
- ไม่แตะ E2E (Phase 3)

---

## Step-by-Step Tasks

### Task 1: constants ชื่อ field ไทย
- **ACTION**: CREATE `frontend/lib/constants/request-field-labels.ts`
- **IMPLEMENT**:
  ```ts
  /**
   * ชื่อ field ภาษาไทยของ details/contact tabs — ใช้แสดง audit diff ใน timeline
   * ต้อง sync กับ EDITABLE_DETAIL_CONTACT_FIELDS (backend admin_requests.py:345)
   * และ label จริงในฟอร์มหน้า request detail
   */
  export const REQUEST_FIELD_LABELS: Record<string, string> = {
      topic_category: 'หมวดหมู่',
      topic_subcategory: 'ประเภท',
      description: 'รายละเอียดเพิ่มเติม',
      prefix: 'คำนำหน้า',
      firstname: 'ชื่อ',
      lastname: 'นามสกุล',
      phone_number: 'หมายเลขโทรศัพท์',
      email: 'อีเมล',
      sub_district: 'ตำบล/แขวง',
      district: 'อำเภอ/เขต',
      province: 'จังหวัด',
      agency: 'หน่วยงาน',
  };

  /** คืน label ไทย; field ที่ไม่รู้จัก (เช่น backend เพิ่มทีหลัง) คืนชื่อ field ดิบ */
  export function getRequestFieldLabel(field: string): string {
      return REQUEST_FIELD_LABELS[field] ?? field;
  }
  ```
- **MIRROR**: convention `lib/constants/categories.ts` (constant + helper export)
- **VALIDATE**: Task 2 test

### Task 2: test constants
- **ACTION**: CREATE `frontend/lib/constants/__tests__/request-field-labels.test.ts`
- **IMPLEMENT**: vitest — (1) ครบ 12 key ตรงกับ list ตายตัวในเทสต์ (กัน drift), (2) `getRequestFieldLabel('phone_number') === 'หมายเลขโทรศัพท์'`, (3) unknown field คืนชื่อดิบ
- **MIRROR**: TEST_STRUCTURE
- **VALIDATE**: `npx vitest run lib/constants/__tests__/request-field-labels.test.ts` (PowerShell)

### Task 3: timeline merge pure function
- **ACTION**: CREATE `frontend/lib/timeline-merge.ts`
- **IMPLEMENT**:
  ```ts
  /** รูปร่าง audit log จาก GET /admin/audit/logs (Phase 1) */
  export interface AuditFieldChange { old: string | null; new: string | null }
  export interface AuditLogEntry {
      id: number;
      admin_name: string | null;
      action: string;
      details: { fields?: Record<string, AuditFieldChange> } | null;
      created_at: string | null;
  }
  export interface TimelineComment { id: number; content: string; user_id: number; display_name: string; created_at: string }
  export type TimelineItem =
      | { kind: 'comment'; createdAt: string; comment: TimelineComment }
      | { kind: 'audit'; createdAt: string; audit: AuditLogEntry };

  /**
   * รวม comments + audit entries เป็น timeline เดียวเรียงเวลาเก่า→ใหม่
   * - timestamp เท่ากัน: audit มาก่อน comment (การแก้เกิดก่อนการคุยถึงผลการแก้)
   * - audit ที่ไม่มี created_at หรือไม่มี fields diff ถูกตัดทิ้ง (payload ผิดรูป)
   */
  export function mergeTimeline(comments: TimelineComment[], audits: AuditLogEntry[]): TimelineItem[] {
      const items: TimelineItem[] = [
          ...audits
              .filter((a) => a.created_at && a.details?.fields && Object.keys(a.details.fields).length > 0)
              .map((a) => ({ kind: 'audit' as const, createdAt: a.created_at as string, audit: a })),
          ...comments.map((c) => ({ kind: 'comment' as const, createdAt: c.created_at, comment: c })),
      ];
      return items.sort((x, y) => {
          const dx = new Date(x.createdAt).getTime();
          const dy = new Date(y.createdAt).getTime();
          if (dx !== dy) return dx - dy;
          if (x.kind === y.kind) return 0;
          return x.kind === 'audit' ? -1 : 1;  // tie-break: audit ก่อน comment
      });
  }
  ```
- **MIRROR**: PURE_FUNCTION_DOC_PATTERN (Thai docstring + edge case notes)
- **GOTCHA**: API คืน DESC — sort ใหม่หมดที่นี่; `Array.prototype.sort` เป็น stable ใน ES2019+ จึงรักษาลำดับเดิมภายในชนิดเดียวกัน; comments เดิม render ตามลำดับ API (ascending) — sort ascending คงพฤติกรรมเดิม
- **VALIDATE**: Task 4 test

### Task 4: test merge
- **ACTION**: CREATE `frontend/lib/__tests__/timeline-merge.test.ts`
- **IMPLEMENT**: vitest cases — (1) แทรกถูกลำดับเวลา (audit 10:30 อยู่ระหว่าง comment 10:00 กับ 11:00), (2) tie-break audit ก่อน comment, (3) audit ไม่มี created_at/fields ว่าง ถูกตัด, (4) list ว่างทั้งคู่ → [], (5) comments อย่างเดียว → ลำดับเดิม
- **MIRROR**: TEST_STRUCTURE
- **VALIDATE**: `npx vitest run lib/__tests__/timeline-merge.test.ts`

### Task 5: component AuditTimelineEntry
- **ACTION**: CREATE `frontend/components/admin/AuditTimelineEntry.tsx`
- **IMPLEMENT**: client component (`'use client'`) props `{ audit: AuditLogEntry }` — โครง JSX เหมือน TIMELINE_BUBBLE_PATTERN: dot สี violet (`bg-violet-400 dark:bg-violet-500 shadow-violet-100 dark:shadow-violet-900/20`), header = `{audit.admin_name ?? 'ไม่ระบุผู้ใช้'}` + badge "แก้ไขข้อมูลคำร้อง" + date (ฟอร์แมตแบบ DATE_FORMAT_PATTERN ใน useMemo), bubble tint `bg-violet-50/60 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800` ภายในเป็นรายการ field:
  ```tsx
  {Object.entries(fields).map(([field, change]) => (
      <div key={field} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-text-primary">{getRequestFieldLabel(field)}:</span>
          <span className="line-through text-text-tertiary">{change.old || '—'}</span>
          <span aria-hidden="true">→</span>
          <span className="font-medium">{change.new || '—'}</span>
      </div>
  ))}
  ```
- **MIRROR**: TIMELINE_BUBBLE_PATTERN + DATE_FORMAT_PATTERN; ไฟล์ component เดี่ยวแบบ `components/admin/TypingIndicator.tsx`
- **IMPORTS**: `import { getRequestFieldLabel } from '@/lib/constants/request-field-labels'; import type { AuditLogEntry } from '@/lib/timeline-merge'; import { useMemo } from 'react';`
- **GOTCHA**: ค่า null/'' แสดง '—' กัน bubble โล่ง; dot ต้องใช้ absolute -left-[41px] เท่าเดิมให้แนวเส้น timeline ตรงกับ comment dots
- **VALIDATE**: tsc + eslint ผ่าน; ดูจริงใน browser (Phase 3/UAT)

### Task 6: ต่อเข้า page.tsx
- **ACTION**: UPDATE `frontend/app/admin/requests/[id]/page.tsx`
- **IMPLEMENT**:
  1. imports: `AuditTimelineEntry`, `mergeTimeline`, `type AuditLogEntry`
  2. state: `const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);` (ใกล้ `comments` L289)
  3. `fetchAuditLogs` useCallback แบบ API_FETCH_PATTERN:
     `${API_BASE}/admin/audit/logs?resource_type=service_request&resource_id=${params.id}&action=edit_request_details&days=3650&limit=200`
     → `setAuditLogs(data.logs ?? [])` (response เป็น envelope ไม่ใช่ array ตรง ๆ)
  4. useEffect เดิม (L374-377): เพิ่ม `void fetchAuditLogs();` + dependency
  5. หลังบันทึกแก้ไข details/contact สำเร็จ (จุดที่ toast 'บันทึกรายละเอียดเรียบร้อย' L503 และ flow contact ที่คู่กัน): เรียก `void fetchAuditLogs();` เพื่อให้ timeline สดเมื่อสลับแท็บ
  6. timeline render (L1340-1381): แทน `comments.map(...)` ด้วย `mergedTimeline.map(item => item.kind === 'audit' ? <AuditTimelineEntry key={`a-${item.audit.id}`} audit={item.audit} /> : <เดิม key={`c-${item.comment.id}`}>)` โดย `const mergedTimeline = useMemo(() => mergeTimeline(comments, auditLogs), [comments, auditLogs]);` และ empty state เช็ค `mergedTimeline.length === 0`
- **MIRROR**: API_FETCH_PATTERN; โครง JSX comment เดิมห้ามเปลี่ยน (แค่ย้าย key จาก index เป็น id)
- **GOTCHA**: Comment interface เดิม (L70-76) ใช้ต่อได้ — ตรง shape `TimelineComment`; อย่าลืม dependency array ของ useEffect ไม่งั้น eslint react-hooks/exhaustive-deps แดง; fetch ล้มเหลว → log + คง [] (timeline ยังแสดง comments ได้ — graceful degradation)
- **VALIDATE**: tsc + eslint + เปิดหน้า dev ดู

### Task 7: ขยาย days bound (backend เล็ก)
- **ACTION**: UPDATE `backend/app/api/v1/endpoints/admin_audit.py` — `days: int = Query(7, ge=1, le=90, ...)` → `le=3650`
- **IMPLEMENT**: เปลี่ยนเฉพาะ `le` + คง default 7; UPDATE docstring บรรทัด description เป็น "Number of days to look back (default 7)"
- **GOTCHA**: default ห้ามเปลี่ยน — client เดิม (ถ้ามี) พฤติกรรมเดิม; เหตุผล: timeline ต้องเห็นประวัติทั้งชีวิตของ request ไม่ใช่ 90 วัน
- **VALIDATE**: Task 8 test + pytest เดิมผ่าน

### Task 8: pytest days bound
- **ACTION**: UPDATE `backend/tests/test_admin_audit_endpoints.py` — เพิ่ม `test_logs_accepts_long_lookback_days`: GET `/api/v1/admin/audit/logs?days=3650` → 200; และ `days=3651` → 422
- **MIRROR**: test เดิมในไฟล์ (FakeAuditDB + override)
- **VALIDATE**: `wsl pytest tests/test_admin_audit_endpoints.py`

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| labels ครบ | REQUEST_FIELD_LABELS | 12 keys ตรง backend tuple | - |
| unknown label | `getRequestFieldLabel('x')` | `'x'` | ✓ |
| merge ordering | comment 10:00, audit 10:30, comment 11:00 | [c,a,c] | - |
| tie-break | audit + comment เวลาเดียวกัน | audit ก่อน | ✓ |
| malformed audit | created_at null / fields ว่าง | ถูกตัดทิ้ง | ✓ |
| empty inputs | [], [] | [] | ✓ |
| days bound | ?days=3650 / ?days=3651 | 200 / 422 | ✓ |

### Edge Cases Checklist
- [x] audit ว่าง (request ไม่เคยถูกแก้) → timeline เดิมเป๊ะ
- [x] fetch audit fail → comments ยังแสดง (graceful degradation)
- [x] ค่า old/new เป็น null/'' → แสดง '—'
- [x] admin_name null → 'ไม่ระบุผู้ใช้'

---

## Validation Commands

### Static Analysis (WSL)
```bash
wsl -e bash -lc "cd /mnt/d/genAI/jsk-app/frontend && npx tsc --noEmit"
wsl -e bash -lc "cd /mnt/d/genAI/jsk-app/frontend && npx eslint lib/constants/request-field-labels.ts lib/timeline-merge.ts components/admin/AuditTimelineEntry.tsx 'app/admin/requests/[id]/page.tsx' lib/__tests__/timeline-merge.test.ts lib/constants/__tests__/request-field-labels.test.ts"
```
EXPECT: 0 errors

### Unit Tests (vitest บน Windows PowerShell)
```powershell
cd frontend; npx vitest run
```
EXPECT: ทุก test ผ่าน (29+ เดิม + ~8 ใหม่)

### Backend Tests (WSL)
```bash
wsl -e bash -lc "cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python -m pytest tests/test_admin_audit_endpoints.py -q"
```
EXPECT: ผ่านทั้งไฟล์ (4 tests)

### Manual Validation
- [ ] แก้เบอร์โทรในแท็บผู้ติดต่อ → เปิดแท็บการดำเนินงาน → เห็น entry ม่วงแทรกถูกตำแหน่งเวลา (เลื่อนไป Phase 3 UAT ได้)

---

## Acceptance Criteria
- [ ] เปิดแท็บการดำเนินงาน เห็น audit entry แทรกเรียงเวลากับ comments
- [ ] ชื่อ field เป็นภาษาไทย + old→new อ่านได้ (ค่าโล่งแสดง '—')
- [ ] request ที่ไม่เคยถูกแก้: timeline เหมือนเดิมทุกประการ
- [ ] tsc/eslint/vitest/pytest เขียวหมด

## Completion Checklist
- [ ] page.tsx ไม่บวมเกิน ~40 บรรทัด (logic อยู่ใน lib/ + component แยก)
- [ ] ไม่แตะโครง JSX bubble ของ comment เดิม
- [ ] field label sync กับ backend tuple (test กัน drift)
- [ ] days default 7 คงเดิม

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| key เปลี่ยนจาก index เป็น id ชนกันระหว่างชนิด | L | L | prefix `a-`/`c-` |
| comments API ลำดับไม่ ascending ในบางเคส | L | M | mergeTimeline sort ใหม่ทั้งหมด ไม่พึ่งลำดับ API |
| timeline เก่าหายเพราะ days cap | M→ปิดแล้ว | M | Task 7 ขยาย le=3650 |

## Notes
- ตอบ PRD open questions: (1) mapping ไทยอยู่ `lib/constants/request-field-labels.ts` (2) tie-break = audit ก่อน comment
- Could (แสดง unassign/revert ใน timeline) เลื่อน — โครง mergeTimeline รองรับอยู่แล้วแค่ถอด action filter + เพิ่ม renderer
