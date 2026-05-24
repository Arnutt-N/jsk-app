# Local Code Review: Request Management UI Polish (PRD A)

**Reviewed**: 2026-05-13
**Branch**: `fix/request-mgmt-polish`
**Scope**: 8 source files modified + 1 new test spec
**Decision**: ✅ **APPROVE with comments** (no CRITICAL/HIGH issues)

## Summary

PRD A เป็น polish-only changeset ที่ scope ตรงตามที่ออกแบบ — ทุก diff hunk เป็น single-attribute CSS หรือ string replacement ตามที่ PRD ระบุ ไม่มี behavior change, ไม่แตะ API/state machine. การตรวจสอบ static analysis (tsc, eslint) ผ่านทั้งหมด. มี 1 issue เกี่ยวกับ pattern fragility ใน test spec ที่ควรปรับก่อน merge.

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

#### M-1: Fragile `test.skip(true, ...) + non-null assertion` pattern

**Location**: `frontend/e2e/admin-requests-polish.spec.ts:54-55, 80-81, 104-105`

**Issue**: Test spec ใช้ pattern นี้ 3 ครั้ง:
```ts
const firstDetailLink = await page.locator(...).getAttribute('href')
if (!firstDetailLink) test.skip(true, 'No request to navigate to')
await page.goto(firstDetailLink!)  // ← non-null assertion lies to TS
```

ปัญหา:
- TypeScript ไม่รู้ว่า `test.skip(true, ...)` throws → ต้องใช้ `!` ลบ null check
- ถ้า Playwright เปลี่ยน behavior (เช่น ไม่ throw ตอน `test.skip(true)`), code จะ call `page.goto(null)` → runtime crash
- `!` ขัดกับ project rule `coding-style.md`: "Avoid `any`...use generics when value depends on caller" — เช่นกัน, non-null assertion เป็น escape hatch ที่ควรหลีกเลี่ยง

**Suggested fix** (ใช้ guard block แทน):
```ts
const firstDetailLink = await page.locator(...).getAttribute('href')
if (!firstDetailLink) {
  test.skip(true, 'No request to navigate to')
  return  // ← explicit return; TS narrows correctly after
}
await page.goto(firstDetailLink)  // no `!` needed
```

หรือใช้ helper:
```ts
function requireExists<T>(val: T | null | undefined, msg: string): T {
  if (val == null) test.skip(true, msg)
  return val as T  // safe — test.skip threw before reaching here
}
```

**Severity rationale**: MEDIUM — code smell, not a current bug. Affects 3 locations in test-only code.

---

### LOW

#### L-1: `await assignTrigger.isVisible()` race window
**Location**: `frontend/e2e/admin-requests-polish.spec.ts:109, 133, 137, 157`

**Issue**: `isVisible()` คืนค่าทันทีโดยไม่รอ — ถ้า element render ช้า อาจ skip ทั้ง ๆ ที่จริง ๆ มี element

**Suggested fix**: ใช้ `.first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)` หรือ `.count()` แทน

**Severity rationale**: LOW — false negatives ใน flaky environments, แต่ test ใน CI seed มี baseline ที่ค่อนข้างเสถียร

#### L-2: `text=/^\* การกระทำ.../` regex anchor อาจไม่ทำงานตามที่คาด
**Location**: `frontend/e2e/admin-requests-polish.spec.ts:145`

**Issue**: ใช้ `^` anchor ใน Playwright `text=/.../` filter — Playwright fuzzy matches accessible text จาก DOM tree ที่ไม่ตรงกับ raw HTML markup, anchor พฤติกรรมไม่ confirmed

**Mitigation in place**: ใหม่ copy ที่เปลี่ยนแล้ว (`คำร้องที่ลบไปแล้วจะหายถาวร`) ไม่มี substring "การกระทำนี้ไม่สามารถย้อนกลับได้" อยู่แล้ว → `toHaveCount(0)` pass แม้ regex แปลก

**Severity rationale**: LOW — test ยังทำงานถูกต้อง แต่ regex pattern เก่ายังกินที่อยู่ใน code

#### L-3: `package.json` มี `optionalDependencies` ที่อาจ untracked broken state
**Location**: `frontend/package.json` (not part of this PR's diff)

**Issue**: `optionalDependencies['@tailwindcss/oxide-win32-x64-msvc']` มี version `^4.2.2` แต่ root `@tailwindcss/oxide` resolve เป็น `4.1.18` — version mismatch ทำให้ local build fail บน Windows

**Out of scope for this PR**: ปัญหานี้มีอยู่ก่อนเริ่ม PRD A — แค่บันทึกไว้

**Suggested followup**: ใน separate PR ทำ `rm -rf node_modules package-lock.json && npm install --include=optional` หรือ pin version ให้ตรงกัน

## Validation Results

| Check | Result | Notes |
|-------|--------|-------|
| Type check (`tsc --noEmit`) | ✅ Pass | Exit 0 |
| Lint (`eslint`) | ✅ Pass | Exit 0 on modified files |
| Unit tests (`vitest`) | ✅ Pass | 6/6 (`useGuardedUpdate`) |
| Build (`next build`) | ⏸️ Skipped | npm Win32 optional-deps env bug — CI Linux runner จะ build ได้ |
| Integration tests (E2E) | ⏸️ Deferred | ต้อง dev server + seed — CI workflow handles |
| Security scan | ✅ Pass | ไม่มี hardcoded secrets, ไม่มี new user input handling, ไม่มี SQL/XSS surface ใหม่ |
| Pattern compliance | ✅ Pass | ตาม project coding-style.md, ใช้ Tailwind utilities มาตรฐาน, ใช้ `aria-label` selectors |

## Files Reviewed

| File | Change Type | Verdict |
|------|------------|---------|
| `frontend/app/admin/requests/page.tsx` | Modified (+2/-2) | ✅ Clean — `whitespace-nowrap` + copy |
| `frontend/app/admin/requests/[id]/page.tsx` | Modified (+1/-1) | ✅ Clean — tab inactive color |
| `frontend/components/ui/CalendarPickerTH.tsx` | Modified (+4/-4) | ✅ Clean — width classes + placeholder. CalendarPickerTH ใช้ที่เดียวเท่านั้น → no cross-impact |
| `frontend/components/admin/AssignModal.tsx` | Modified (+2/-3) | ✅ Clean — title + footer simplification (`justify-between` → `justify-end` หลังลบ footnote) |
| `frontend/app/admin/files/page.tsx` | Modified (+1/-1) | ✅ Clean — copy fix |
| `frontend/app/admin/settings/custom/page.tsx` | Modified (+1/-1) | ✅ Clean — copy fix |
| `frontend/app/admin/chatbot/broadcast/page.tsx` | Modified (+1/-1) | ✅ Clean — copy fix |
| `frontend/app/admin/chatbot/broadcast/[id]/page.tsx` | Modified (+1/-1) | ✅ Clean — copy fix |
| `frontend/e2e/admin-requests-polish.spec.ts` | Added (+165) | ⚠️ M-1 issue: fix `test.skip + !` pattern (3 places) ก่อน merge |

## Cross-Cutting Concerns

### Security
- ✅ ไม่มี new user input handling
- ✅ ไม่มี SQL/XSS attack surface ใหม่ (เป็น CSS/copy เท่านั้น)
- ✅ ไม่มี secrets / API keys
- ✅ ConfirmDialog copy เปลี่ยนเป็นภาษาไทยล้วน — ไม่กระทบ encoding / locale handling

### Accessibility (a11y)
- ✅ Tab nav: contrast เปลี่ยนจาก `text-text-tertiary` → `text-text-secondary` = darker, ดีต่อ contrast ratio
- ✅ Date picker `aria-label` คงไว้ (`"วันที่"`, `"เดือน"`, `"ปี พ.ศ."`) — screen reader ยังได้ context ถึงแม้ placeholder จะสั้นลง
- ✅ AssignModal: ลด redundant footnote = ลด screen reader noise
- ⚠️ Optional improvement: Tab nav อาจเพิ่ม `aria-current="page"` หรือ `aria-selected` สำหรับ active state (not in scope)

### Internationalization
- ⚠️ AssignModal title เปลี่ยนจาก bilingual "มอบหมายงาน (Assign Request)" → Thai-only "มอบหมายงาน" — ตรงกับ Decision Log ใน PRD ว่า "TH-only system" แต่ PRD D (Assignment Workflow) จะมี i18n toggle TH/EN — ต้องระวัง regression ตอน implement D

### Performance
- ✅ ไม่มี runtime cost — แค่ Tailwind class change, string change
- ✅ ไม่ใช้ heavy dependencies เพิ่ม

### Consistency กับ PR ก่อน
- ✅ Tab nav fix อิงจาก PR #48 ("visible buttons") pattern
- ✅ Branch naming `fix/...` ตรง convention PR #48-#51
- ✅ Commit-able as `fix(ui): ...` per repo history

## Decision Rationale

**APPROVE with comments** เพราะ:
1. ไม่มี CRITICAL/HIGH issues
2. Type check, lint, unit tests ผ่านครบ
3. Scope ตรงกับ PRD A ทั้งหมด (ไม่มี scope creep)
4. การ deviation ทั้ง 4 จุดใน report ถูกต้อง + อธิบายไว้ชัดเจน
5. M-1 (test.skip pattern) เป็นเรื่อง maintainability ไม่ใช่ correctness → fix ได้ใน PR เดียวกัน หรือ followup

**Recommended action**: แก้ M-1 (3 places) ก่อน commit เพื่อให้ test code สะอาด แล้ว open PR

## Suggested Pre-Merge Checklist

- [ ] แก้ M-1 (fix 3 places ของ `test.skip(true) + !` pattern) — recommended
- [ ] L-1, L-2 — optional, no functional impact
- [ ] L-3 — out of scope, separate PR
- [ ] Local dev test (browser): เปิด `/admin/requests`, modal preview, detail page → confirm 7 fixes ตาม PRD
- [ ] CI run on PR: build + lint + E2E (Linux runner, no Win32 bug)
- [ ] User self-test on staging per PRD Phase 7
