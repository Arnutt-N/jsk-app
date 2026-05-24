# Request Management UI Polish

## Problem Statement

Internal admin users (admin, staff, director, head) ใช้หน้า `/admin/requests*` (list, detail, modals) ทุกวันในงานจัดการคำร้อง แต่พบ visual friction หลายจุดจาก manual testing บน production ทำให้การทำงาน "สะดุด" — อ่านปุ่มไม่ออกเพราะข้อความหล่นบรรทัด, ระบุไอคอนไม่ได้เพราะ contrast ต่ำ, รู้สึกว่าระบบไม่น่าเชื่อถือเพราะ copy ฟัง AI-ish. ไม่มี workaround ให้ผู้ใช้ — ต้องทนใช้แบบนี้.

## Evidence

- Manual testing โดยเจ้าของระบบบน production (`https://jsk-app.vercel.app/admin/requests*`) พบ visual issues 7 จุด
- Pattern เดียวกับ PR #48 ("rework request detail header for mobile + visible buttons") — เคยมี icon visibility fix มาแล้ว แสดงว่าปัญหานี้ recurring
- 5 callers ใช้ copy "* การกระทำนี้ไม่สามารถย้อนกลับได้" — ฟัง AI-generated, ไม่ได้ปรับให้เข้ากับบริบทแต่ละที่

## Proposed Solution

แก้ visual/copy issues 7 จุดในหน้าจัดการคำร้องเป็น single PR — ทุก fix เป็น **CSS attribute change หรือ string replacement** ไม่มี behavior change, ไม่แตะ API, ไม่แตะ state machine. ใช้ pattern ที่มีอยู่แล้วในระบบ (PR #48 icon visibility, `ConfirmDialog.description` prop, Tailwind `w-*` utilities). เพิ่ม Playwright screenshot test เป็น regression baseline.

## Key Hypothesis

We believe **การแก้ visual friction 7 จุดในหน้าจัดการคำร้อง** will **ทำให้ admin/staff/director/head ใช้งานได้ไหลลื่นโดยไม่ต้องเดาว่าปุ่มไหนทำอะไร** for **admin users 4 roles ที่ใช้ระบบทุกวัน**.

We'll know we're right when **เจ้าของระบบ (user = tester) approve UI ผ่าน self-test และ Playwright screenshot test ทั้งหมด pass**.

## What We're NOT Building

- **Hero card merge + workflow button colors review** → PRD B (feature/decision)
- **Revert approval workflow** → PRD B (behavior change + RBAC)
- **AssignModal i18n toggle + confirm button** → PRD D (assignment workflow)
- **Multi-assign / unassign / edit assignment** → PRD D (new data model)
- **Configurable permission matrix (3 new keys)** → PRD C (settings extension)
- **Action button completeness audit** → PRD B (requires UX review)

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Visual issues fixed | 7 / 7 | Code review against issue list |
| Playwright screenshot test | All baselines green | CI run on PR |
| User self-approval | Pass | Owner manual test on staging |
| Regression on other pages | Zero | Existing E2E suite continues to pass |

## Open Questions

- [ ] Confirm exact copy wording for each of 5 `ConfirmDialog` callers (per-context strategy — Q2 confirmed)
- [ ] Decide responsive breakpoints for Playwright screenshots (default: 320, 768, 1440)

---

## Users & Context

**Primary User**
- **Who**: Admin users (4 roles: ADMIN, AGENT [staff], DIRECTOR, HEAD) ที่เปิดหน้า `/admin/requests*` หลายครั้งต่อวัน
- **Current behavior**: คลิกเข้าหน้า list → เปิด modal preview → ไป detail page → ใช้ tab nav (details/contact/comments/manage) → แก้ไข date, มอบหมายงาน, ลบคำร้อง
- **Trigger**: เจอ visual friction ระหว่างทำงาน — ปุ่มอ่านไม่ออก, ไม่รู้ว่าไอคอนแทนอะไร, copy ฟังแปลก
- **Success state**: เปิดหน้า → อ่านง่าย → ทำงานเสร็จเร็วโดยไม่ต้อง zoom/squint/เดา

**Job to Be Done**
When ผมจัดการคำร้องของประชาชน, I want UI ที่อ่านง่ายและสื่อสารชัดเจน, so I can ทำงานได้เร็วโดยไม่ต้องเดาว่าปุ่มไหนทำอะไร.

**Non-Users**
- LIFF user (ประชาชนที่ submit คำร้อง) — front-end คนละชุด
- Backend API consumer (Telegram bot, n8n) — ไม่เห็น admin UI

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | **#1** Fix "ดูรายละเอียดเต็ม" button wrap ใน list page modal | ปุ่มหลักที่ใช้บ่อย, อ่านไม่ออกเป็น blocker |
| Must | **#2** Fix tab nav button icons visibility (white-on-white) ใน `[id]/page.tsx` | Navigation blocker — ไม่รู้ว่ากดอะไรได้ |
| Must | **#3** Adjust date picker width proportion (day/month `w-10`, year `w-24`) | Visual balance ใน manage tab |
| Must | **#4-hover** Add `cursor-pointer` to action buttons ใน detail page | Cursor feedback มาตรฐาน |
| Must | **#7a** Strip "(Assign Request)" จาก AssignModal title | TH-only system, EN parenthetical = noise |
| Must | **#7b** Remove "* Active Tasks = Pending + In Progress" footnote ใน AssignModal | ผู้ใช้ไม่ต้องการคำอธิบาย metric ขนาดนี้ |
| Must | **#8** Rewrite "* การกระทำนี้ไม่สามารถย้อนกลับได้" footnote — per-context | AI-ish copy, แยก wording ตาม context (5 callers) |
| Should | Playwright screenshot test เป็น regression baseline | User-requested automated guard |
| Won't (PRD A) | AssignModal confirm button | Deferred to PRD D |
| Won't (PRD A) | Hero card merge | Deferred to PRD B |
| Won't (PRD A) | i18n toggle | Deferred to PRD D |

### MVP Scope

**1 PR ที่แก้ทั้ง 7 issues + เพิ่ม Playwright screenshot test** — ทุก fix อยู่ใน `frontend/` ไม่แตะ backend, ไม่แตะ database, ไม่แตะ API contract.

### User Flow (No change)

Flow ปัจจุบันยังเหมือนเดิม — แก้แค่ visual presentation. User journey:
1. Admin เปิด `/admin/requests` → list ของคำร้อง
2. คลิก row → modal preview เด้งขึ้น → คลิก "ดูรายละเอียดเต็ม" (Issue 1 fix)
3. ไป `/admin/requests/[id]` → tab nav (Issue 2 fix) → ดู details/contact/comments/manage tabs
4. ใน manage tab → date picker (Issue 3 fix), action buttons (Issue 4-hover fix)
5. ใน detail page เปิด AssignModal → title/footnote (Issues 7a, 7b fix)
6. ลบคำร้อง/ลบไฟล์/ลบ broadcast → `ConfirmDialog` (Issue 8 fix — per-context)

---

## Technical Approach

**Feasibility**: 🟢 **HIGH**

**Architecture Notes**
- ทุก fix เป็น single-file หรือ single-attribute change
- ใช้ Tailwind utilities ที่มีอยู่แล้ว (`whitespace-nowrap`, `w-10`, `w-24`, `cursor-pointer`)
- ใช้ `ConfirmDialog.description` prop ที่มีอยู่แล้ว (line 16, 65-67) — แก้ที่ caller, ไม่แตะ component
- ใช้ icon color pattern จาก PR #48 (`text-text-secondary` หรือ explicit color บน light bg)

**Key Files**

| Issue | File | Change |
|-------|------|--------|
| #1 | `frontend/app/admin/requests/page.tsx:463-465` | Add `whitespace-nowrap` to `<Button>` |
| #2 | `frontend/app/admin/requests/[id]/page.tsx:530-541` | Change inactive tab icon color (PR #48 pattern) |
| #3 | `frontend/components/ui/CalendarPickerTH.tsx:331,347,363` | Day/month `w-10`, year `w-24`, simplify year placeholder |
| #4-hover | `frontend/app/admin/requests/[id]/page.tsx` | Add `cursor-pointer` to action buttons |
| #7a | `frontend/components/admin/AssignModal.tsx:76` | Title: "มอบหมายงาน" (remove " (Assign Request)") |
| #7b | `frontend/components/admin/AssignModal.tsx:143-146` | Remove `<p>* Active Tasks = ...</p>` |
| #8 | 5 callers (see below) | Per-context copy rewrite |

**5 ConfirmDialog callers for #8:**
- `frontend/app/admin/files/page.tsx:927` — context: delete files
- `frontend/app/admin/settings/custom/page.tsx:422` — context: delete integration
- `frontend/app/admin/requests/page.tsx:477` — context: delete request
- `frontend/app/admin/chatbot/broadcast/[id]/page.tsx:432` — context: delete broadcast (detail)
- `frontend/app/admin/chatbot/broadcast/page.tsx:336` — context: delete broadcast (list)

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tailwind class conflict กับ existing CSS | Low | ใช้ utilities มาตรฐาน ทดสอบใน Storybook/browser |
| Playwright screenshot test ไม่ stable ข้าม OS | Medium | Pin Docker image / use Linux CI runner only |
| Date picker proportion ไม่สวยใน narrow viewport | Low | Test ที่ 320/768/1440 breakpoints |
| Per-context copy ทำให้ตัดสินใจช้า | Medium | Pre-write copy variants ในไฟล์นี้ — review with user before code |

**Proposed Copy Variants for Issue #8** (per-context, draft — needs user approval):

| Caller | Current | Proposed |
|--------|---------|----------|
| `files/page.tsx` | "การดำเนินการนี้ไม่สามารถย้อนกลับได้" | "ไฟล์ที่ลบไปแล้วจะกู้คืนไม่ได้" |
| `settings/custom/page.tsx` | "การดำเนินการนี้ไม่สามารถย้อนกลับได้" | "การลบ Integration จะมีผลทันทีและไม่สามารถกู้คืน" |
| `requests/page.tsx` | "* การกระทำนี้ไม่สามารถย้อนกลับได้" | "คำร้องที่ลบไปแล้วจะหายถาวร" |
| `chatbot/broadcast/[id]/page.tsx` | "* การกระทำนี้ไม่สามารถย้อนกลับได้" | "ข้อความที่ลบไปแล้วจะกู้คืนไม่ได้" |
| `chatbot/broadcast/page.tsx` | "* การกระทำนี้ไม่สามารถย้อนกลับได้" | "ข้อความที่ลบไปแล้วจะกู้คืนไม่ได้" |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently
  DEPENDS: phases that must complete first
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | List page polish | Issue #1 (button wrap) | pending | with 2,3 | - | - |
| 2 | Detail page polish | Issues #2 (tab icons) + #4-hover (cursor) | pending | with 1,3 | - | - |
| 3 | Date picker proportion | Issue #3 (width ratio) | pending | with 1,2 | - | - |
| 4 | AssignModal copy fixes | Issues #7a (title) + #7b (footnote) | pending | with 5 | - | - |
| 5 | ConfirmDialog per-context rewrites | Issue #8 — 5 callers | pending | with 4 | - | - |
| 6 | Playwright screenshot baseline | Add visual regression tests | pending | - | 1, 2, 3, 4, 5 | - |
| 7 | User acceptance test (self-test) | Owner verifies all 7 fixes on staging | pending | - | 6 | - |

### Phase Details

**Phase 1: List page polish**
- **Goal**: ปุ่ม "ดูรายละเอียดเต็ม" ไม่หล่นบรรทัด
- **Scope**: 1 attribute change (`whitespace-nowrap`)
- **Success signal**: ปุ่มแสดงในบรรทัดเดียวที่ทุก breakpoint

**Phase 2: Detail page polish**
- **Goal**: Tab nav icons มองเห็นชัด + action buttons มี cursor feedback
- **Scope**: Icon color change (PR #48 pattern) + `cursor-pointer` class
- **Success signal**: ทุก tab icon มี contrast ratio > 4.5:1, hover state ของ action buttons แสดง pointer

**Phase 3: Date picker proportion**
- **Goal**: Day/month/year fields มี width proportion 1:1:2.5
- **Scope**: 3 width class changes + simplify year placeholder
- **Success signal**: Visual balance ใน manage tab, ไม่ overflow ที่ narrow viewport

**Phase 4: AssignModal copy fixes**
- **Goal**: Title ไม่มี EN parenthetical, ไม่มี footnote redundant
- **Scope**: 2 string changes
- **Success signal**: Modal title อ่านสั้นลง, footer สะอาด

**Phase 5: ConfirmDialog per-context rewrites**
- **Goal**: 5 callers มี copy ที่เข้ากับ context ของตัวเอง
- **Scope**: 5 string changes (ตาม Proposed Copy Variants table)
- **Success signal**: Copy ฟังเป็น "ภาษามนุษย์" ไม่ generic

**Phase 6: Playwright screenshot baseline**
- **Goal**: Visual regression guard
- **Scope**: เพิ่ม screenshot tests ที่ 3 viewports (320, 768, 1440) สำหรับ list, detail, AssignModal, ConfirmDialog
- **Success signal**: Baseline images committed, CI green

**Phase 7: User acceptance test**
- **Goal**: Owner approval บน staging
- **Scope**: Manual test 7 issues ตาม checklist
- **Success signal**: User sign-off + merge to main

### Parallelism Notes

- Phases 1-5 independent ไฟล์ → ทำ parallel ได้ทั้งหมดใน 1 PR
- Phase 6 ต้องรอ 1-5 จบเพื่อ capture screenshot ที่ถูกต้อง
- Phase 7 sequential สุดท้าย

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Test strategy | Playwright screenshot + manual self-test | Manual only / Unit test only | User-requested automated baseline (Q1 answered) |
| ConfirmDialog copy strategy | Per-context (5 different copies) | Single shared copy | Each delete context มี semantics ต่างกัน (Q2 answered) |
| Date picker ratio | day/month `w-10`, year `w-24` (~1:1:2.5) | Keep current (`w-12`, `w-12`, `flex-1`) | User chose proposed ratio (Phase 3 answer) |
| Scope boundary | Polish only — no behavior change | Combine with PRD B | Single hypothesis per PRD; A = visual only, B = behavior |
| Issue #8 scope | Fix at caller (5 places) | Fix at `ConfirmDialog` component | Component already has `description` prop; context-specific copy needs caller-level control |
| AssignModal i18n (7c) | NOT in PRD A | Include in A | Affects all strings — better done with PRD D (assignment workflow redesign) |
| AssignModal confirm button (7d) | NOT in PRD A | Include in A | Interaction model change — couples with PRD D |

---

## Research Summary

**Market Context**
- Internal admin tools polish typically delivered as part of "QA pass" sprints, not feature work
- Linear, Notion, Jira all use single-attribute fixes for similar issues (`whitespace-nowrap`, accent colors on icons)

**Technical Context**
- `ConfirmDialog` component already supports `description` prop (`components/ui/ConfirmDialog.tsx:16,65-67`) — fixing at caller is correct pattern
- `CalendarPickerTH` uses `flex-1 min-w-[60px]` for year field — current behavior fills available space
- Tab nav icons in detail page render via `<tab.icon size={16} />` (line 538) — color inherits from button `text-text-tertiary`
- PR #48 (`19d0866`) established "visible buttons" pattern — same approach applies to tab icons

---

*Generated: 2026-05-13*
*Status: DRAFT - approved by user, ready for implementation*
