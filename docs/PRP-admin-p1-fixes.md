# [Admin P1 Fixes] Implementation Plan (rev.2 — validated fixes applied)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ซ่อม 8 ข้อ P1 ที่ตรวจยืนยันว่าพังจริง (NAV-01/02, SAFE-01/02/03, A11Y-01/02, NET-01) พร้อมเทส

**Architecture:** แก้ที่ shared primitive ก่อน (`Modal`/`ConfirmDialog`) แล้วค่อยแก้รายหน้า (layout/requests/SessionTimeoutWarning) ทุก task มี failing-check → แก้ → ตรวจ → เทส → commit

**Tech Stack:** Next.js 16 + React 19 + Tailwind v4 (frontend), Vitest, Playwright (`playwright test`), `next build`

**Decisions made (2026-10-25):** D1 = ทาง (ก) ซ่อนเมนูนัดหมายจาก AGENT, D2 = live-chat ต้องมีเตือนหมดเวลาเหมือนหน้าอื่น

## Frozen Contracts (ห้ามเปลี่ยนชื่อระหว่างทำ — Tasks 4/5/7 ใช้ชุดเดียวกัน)

- `Modal` (`@/components/ui/Modal`) เพิ่ม prop `dismissDisabled?: boolean` (ค่าเริ่มต้น `false`) กันทางออกทั้ง 3 ทาง (Escape, คลิกฉากหลัง, ปุ่ม X) เมื่อเป็น `true`
- `ConfirmDialog` (`@/components/ui/ConfirmDialog`) ส่ง `dismissDisabled={isLoading}` ให้ `Modal` เสมอ ไม่รับ prop ใหม่
- `LogoutConfirmDialog` (`@/components/admin/LogoutConfirmDialog`) props เดิม: `{ isOpen, onClose, onConfirm }`
- `useSessionTimeout(onLogout)` (`@/hooks/useSessionTimeout`) คืน `{ showWarning, remainingTime, extendSession }`
- `apiFetch<T>(url, init?)` (`@/lib/api-error`) รับ `ApiFetchOptions extends RequestInit` (ส่ง `signal` ผ่านได้) คืน `{ ok: true; data } | { ok: false; status; message }`
- Path alias `@/*` ชี้ `frontend/*` (ดู `frontend/tsconfig.json:25-26`)

## Code Conventions (ของจริงใน repo นี้)

- ผล API ใช้ discriminated union ของ `apiFetch` — ตรวจ `result.ok` ก่อนแตะ `result.data` เสมอ
- แจ้งผู้ใช้ด้วย `useToast` (`@/components/ui/Toast`) หรือ error state ในหน้า (เช่น `setFetchError`) ข้อความภาษาไทย
- Log ด้วย `logger` (`@/lib/logger`: `logger.error(message, err, context)`) ไม่ `console.log`
- สไตล์: `cn()` รวม class, 2-space indent, comments แบบ why-only ไม่มี banner
- Secrets ห้ามพิมพ์ ตรวจโดยการนับจำนวนเท่านั้น

## Global Constraints

- ไม่ลดทอน backend authorization (Task 2 เปลี่ยนแค่เมนู frontend)
- Admin date/filter semantics คงเดิม งานนี้ไม่แตะ query/bangkok windows
- Branch: `feat/admin-p1-fixes`
- ทุก task: `npm run lint` ผ่านก่อน commit; ปิดงานด้วย Task 9 (full gate รวม `npm run build`)

## NOT Building (นอกขอบเขต — อย่าแตะ)

- ข้อ P2 ทั้งหมด: UserMenu/โปรไฟล์, ปุ่มภาษา TH/EN, Input error association, modal ซ้อน (stacking/scroll-lock นอกเหนือ dismiss), tooltip keyboard, filter 100 รายการฝั่ง client, session timer reset, A11Y-03/04 เต็มรูป
- วัด LCP/INP/CLS, contrast จริง, memory/waterfall
- เปลี่ยนสิทธิ์หลังบ้าน, validation rules, query params
- ตาราง matrix 49 ช่องที่เหลือ + browser pass ถ่ายภาพ (ทำคู่ขนานได้ ไม่ใช่ส่วนของแผนนี้)

## Risks & Mitigations

| ความเสี่ยง | งานที่เกี่ยว | วิธีกัน |
|---|---|---|
| `Modal` มี focus trap/restore อยู่แล้ว การกัน dismiss ต้องไม่พัง focus flow | Task 4 | แก้แค่ 3 จุดออก (Escape/backdrop/X) ไม่แตะ focus effect; Verify ด้วย keyboard-only |
| `apiFetch` กลืน abort เป็น `ok:false` ทำให้ error ปลอมกระพริบ | Task 8 | เช็ค `signal.aborted` ก่อนแตะ state ทุกทาง (ทั้ง success และ error) |
| เตือนหมดเวลาใน live-chat branch อาจขาด AuthProvider/context | Task 7 | Verify ว่า `useAuth`/`useSessionTimeout` ทำงานใน early-return branch ก่อน commit; ถ้าไม่มี context ให้ห่อ provider แทนย้าย logic |
| ซ่อนเมนู AGENT แล้ว direct-URL guard ยังต้องเด้งเหมือนเดิม | Task 2 | เทสทั้งคลิกเมนู (ต้องไม่เห็น) และเปิด URL ตรง (ต้องเด้ง live-chat) |
| ลบแล้ว error ต้องคืนปุ่มให้กดใหม่ได้ ไม่ค้าง loading | Task 5 | `try/finally` คืน `isDeleting=false` เสมอ; เทสเคส error-path |
| ลิ้นชัก `inert` อาจซ่อนจาก screen reader เกินไปตอนเปิด | Task 6 | `inert` + `aria-hidden` เฉพาะตอนปิดเท่านั้น ตอนเปิดต้องไม่มีทั้งคู่ |

---

### Task 1: NAV-01 — ปุ่มค้นมือถือเปิดแผงค้นหาเดียวกับคอม

**Files:**
- Modify: `frontend/app/admin/layout.tsx:404-429`
- Test: `frontend/e2e/admin-audit-verify/nav-search-roles.spec.ts` (มีโครงจาก browser pass)

**Interfaces:**
- Consumes: `jsk:open-command-palette` event (listener มีอยู่จริงฝั่ง desktop)
- Produces: ปุ่มมือถือ + คอมเปิดแผงเดียวกัน

- [ ] **Step 1: Failing check** — viewport 360px กดค้นหา พิมพ์คำ ยืนยันว่าไม่มีผล (ภาพ `nav-01-mobile-dead-input.png` มีแล้ว)
- [ ] **Step 2: Implement** — ปุ่มมือถือ `onClick` ส่ง `document.dispatchEvent(new Event('jsk:open-command-palette'))` เหมือนคอม ลบ input เปล่า (`404-414`) ทิ้ง
- [ ] **Step 3: Verify** — 360px + 1280px เปิดค้นหา พิมพ์ เลือกผล ไปปลายทางได้ทั้ง touch/keyboard
- [ ] **Step 4: Run** — `npm run test:e2e -- nav-search-roles` + `npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): mobile search opens shared command palette"`

### Task 2: NAV-02 — เมนูตรงกับตัวกันสิทธิ์ (D1 = ซ่อนเมนู)

**Files:**
- Modify: `frontend/app/admin/layout.tsx:224` (เอา AGENT ออกจาก Appointments)
- Test: เติม `frontend/e2e/admin-audit-verify/nav-search-roles.spec.ts` (AGENT matrix)

- [ ] **Step 1: Failing check** — login AGENT เปิด URL `/admin/bookings` ตรง ดูว่าเด้งกลับ live-chat (ภาพ `nav-02-agent-snapped-back.png` มีแล้ว)
- [ ] **Step 2: Implement** — ลบ `'AGENT'` ออกจาก `allowedRoles` ของ Appointments บรรทัดเดียว ไม่แตะ guard `86-92,132-140`
- [ ] **Step 3: Verify** — AGENT ไม่เห็นเมนูนัดหมาย เปิด URL ตรงยังเด้ง live-chat เหมือนเดิม
- [ ] **Step 4: Run** — `npm run test:e2e -- nav-search-roles` + `npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): hide Appointments from AGENT nav to match route guard"`

### Task 3: SAFE-01 — ปุ่มออกแถบข้างเป็นปุ่มจริง + ถามก่อนออก

**Files:**
- Modify: `frontend/app/admin/layout.tsx:146-160` (`SidebarUserInfo`)
- Reuse: `LogoutConfirmDialog` from `@/components/admin/LogoutConfirmDialog` (props `{ isOpen, onClose, onConfirm }`)

**Interfaces:**
- Produces: ปุ่มออกทุกทางผ่าน `LogoutConfirmDialog` ตัวเดียวกัน

- [ ] **Step 1: Failing check** — Tab ไปไม่ถึงปุ่มออกแถบข้าง, กดแล้วออกทันทีไม่มีถาม
- [ ] **Step 2: Implement** — เปลี่ยน `div onClick` เป็น `button` + state `confirmingLogout` เปิด `LogoutConfirmDialog` แล้วค่อยเรียก `logout()` ใน `onConfirm` (ลอก pattern จาก `UserMenu.tsx:188-204`)
- [ ] **Step 3: Verify** — Tab/Enter ได้ มีถามก่อนออกทั้งสองทาง กดยกเลิกแล้วไม่ออก
- [ ] **Step 4: Run** — `npm run test:e2e -- safe-pending` (เคส logout) + `npm run lint`; ถ้าเคสยังไม่มีให้จด manual checklist ใน commit message
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): sidebar logout uses shared confirm dialog"`

### Task 4: SAFE-02 — นโยบายปิด dialog ตอนรอ (primitive กลาง)

**Files:**
- Modify: `frontend/components/ui/Modal.tsx` (เพิ่ม `dismissDisabled?: boolean` กัน Escape/backdrop/X)
- Modify: `frontend/components/ui/ConfirmDialog.tsx:65` (ส่ง `dismissDisabled={isLoading}` + ข้อความไทยตอนรอ)
- Test: `frontend/components/ui/__tests__/pending-dismiss.test.tsx` (สร้างใหม่)

**Interfaces:**
- Consumes: `isLoading`; Produces: ตอนรอปิดทุกช่องทางไม่ได้ + ข้อความ "กำลังทำรายการ ปิดหน้าต่างนี้ไม่ได้ยกเลิกคำสั่ง"

- [ ] **Step 1: Failing test** — render `ConfirmDialog isLoading=true` ส่ง Escape + backdrop click ยืนยันว่า `onClose` ยังโดนเรียก (ต้องแดงก่อนแก้)
- [ ] **Step 2: Implement** — `ModalProps` เพิ่ม `dismissDisabled?: boolean = false`; `handleKeyDown` Escape คืนทันทีถ้ากัน; backdrop `onClick` เป็น `undefined` ถ้ากัน; ปุ่ม X ไม่ render ถ้ากัน; `ConfirmDialog` ส่ง `dismissDisabled={isLoading}` + แสดงข้อความไทยใต้ปุ่มตอนรอ
- [ ] **Step 3: Verify** — ตอนรอ: Cancel ล็อก, X หาย/กดไม่ได้, Escape เงียบ, คลิกพื้นหลังเงียบ; ตอนปกติปิดได้ทุกทางเหมือนเดิม; keyboard-only ผ่าน
- [ ] **Step 4: Run** — `npm run test:unit -- pending-dismiss` + `npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "fix(ui): block dialog dismiss while pending"`

### Task 5: SAFE-03 — กันลบเบิ้ลหน้าคำร้อง

**Files:**
- Modify: `frontend/app/admin/requests/page.tsx:211-226,562-578`
- Depends: Task 4 (ใช้ `isLoading` ของ dialog)
- Test: เติม `frontend/e2e/admin-audit-verify/safe-pending.spec.ts` (นับ DELETE)

**Interfaces:**
- Produces: `confirmDelete` ยิง DELETE ครั้งเดียวต่อรอบ (`isDeleting` guard + `try/finally`)

- [ ] **Step 1: Failing check** — throttle เน็ตช้า กดยืนยันลบ 2 ทีติด นับ DELETE ได้ 2 ครั้ง (e2e route handler counter)
- [ ] **Step 2: Implement** — เพิ่ม `isDeleting` state; `if (!selectedRequest || isDeleting) return;` + `setIsDeleting(true)` + `try/finally { setIsDeleting(false) }`; ส่ง `isLoading={isDeleting}` ให้ `ConfirmDialog`
- [ ] **Step 3: Verify** — เน็ตช้ากดเบิ้ลยิงครั้งเดียว ปุ่มแสดงกำลังลบ; เคส error คืนปุ่มให้กดใหม่ได้ (error-path reset)
- [ ] **Step 4: Run** — `npm run test:e2e -- safe-pending` + `npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "fix(admin/requests): guard against double delete"`

### Task 6: A11Y-01 — ลิ้นชักมือถือเข้าถึงได้จริง

**Files:**
- Modify: `frontend/app/admin/layout.tsx:295-310,465-475`
- Test: เติม `frontend/e2e/admin-audit-verify/a11y-drawer-session.spec.ts`

- [ ] **Step 1: Failing check** — 360px เปิดเมนู กด Tab ดูโฟกัสหลุดไปหลังฉาก กด Escape ดูไม่ปิด (ภาพ `a11y-01-*.png` มีแล้ว)
- [ ] **Step 2: Implement** — ตอนปิดใส่ `inert` + `aria-hidden` ที่ aside; ตอนเปิดย้ายโฟกัสเข้าปุ่มปิด; Escape ปิด (`onKeyDown` หรือ effect); ปิดแล้วคืนโฟกัสปุ่มเปิดเมนู; `inert`/`aria-hidden` มีเฉพาะตอนปิดเท่านั้น
- [ ] **Step 3: Verify** — Tab ขังในเมนูตอนเปิด Escape ปิดได้ โฟกัสกลับที่เดิม screen reader เจอชื่อเมนู
- [ ] **Step 4: Run** — `npm run test:e2e -- a11y-drawer-session` + `npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): mobile drawer focus trap, inert, Escape"`

### Task 7: A11Y-02 — เตือนหมดเวลาใช้หน้าต่างกลาง + ครอบ live-chat (D2)

**Files:**
- Modify: `frontend/components/admin/SessionTimeoutWarning.tsx` (ใช้ `Modal` กลาง)
- Modify: `frontend/app/admin/layout.tsx:275` (ติด warning ใน early-return branch ของ live-chat)
- Reuse: `Modal` from `@/components/ui/Modal` (หลัง Task 4), `useSessionTimeout` from `@/hooks/useSessionTimeout`
- Test: เติม `frontend/e2e/admin-audit-verify/a11y-drawer-session.spec.ts` (เคส session dialog semantics)

**Interfaces:**
- Consumes: `{ showWarning, remainingTime, extendSession }`; Produces: dialog มีชื่อ โฟกัสเข้าปุ่มต่อเวลา `onClose` = `extendSession` (ปิด = ต่อเวลา ไม่ใช่ทิ้ง)

- [ ] **Step 1: Failing check** — เปิดเตือน ตรวจว่าไม่มี `role=dialog` โฟกัสไม่ย้าย screen reader ไม่อ่าน
- [ ] **Step 2: Implement** — แทน overlay ทำเองด้วย `Modal title="Session Expiring Soon" description` (เวลาที่เหลือ) `onClose={extendSession}` `dismissDisabled={false}`; ปุ่ม "ต่อเวลา" เรียก `extendSession` + ปิด; ใน `layout.tsx:275` branch เปลี่ยน `{children}` เป็น `{children}<SessionTimeoutWarning />` (คง bypass admin chrome ไว้)
- [ ] **Step 3: Verify** — โปรแกรมอ่านจออ่านชื่อ + เวลาที่เหลือ โฟกัสกลับจุดเดิมหลังต่อเวลา กด Escape = ต่อเวลา (ไม่หลุด); live-chat มีเตือนโดยหน้าแชทยังใช้ได้; สี/ข้อความเข้าชุด dialog อื่น
- [ ] **Step 4: Run** — `npm run test:e2e -- a11y-drawer-session` + `npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): session warning uses shared modal semantics"`

### Task 8: NET-01 — ผลค้นหาตรงคำล่าสุดเสมอ

**Files:**
- Modify: `frontend/app/admin/requests/page.tsx:116-171`
- Test: `frontend/e2e/admin-audit-verify/net-race.spec.ts` (มีโครงจาก browser pass)

**Interfaces:**
- Produces: abort คำขอก่อนหน้า + เลขลำดับคำขอ ทิ้งผลเก่า; `signal.aborted` แล้วห้ามแตะ state

- [ ] **Step 1: Failing check** — throttle เน็ต พิมพ์ค้นหารัว จดว่าผลสุดท้ายไม่ตรงคำค้นล่าสุด (ภาพ `net-01-stale-wins.png` มีแล้ว)
- [ ] **Step 2: Implement** — `abortRef = useRef<AbortController | null>` + `seqRef = useRef(0)`; ต้น `fetchRequests` abort ตัวเก่า สร้างตัวใหม่ เพิ่ม seq; ส่ง `signal` เข้า `apiFetch(url, { signal })`; หลังได้ผลเช็ค `if (controller.signal.aborted || seq !== seqRef.current) return;` ก่อน `setRequests`/`setFetchError` ทุกทาง; รวม effect รีเซ็ต `setPage(0)` ไม่ให้ยิงซ้ำซ้อน (abort ตัวค้างก่อน setPage หรือย้าย reset เข้า effect เดียวกับ fetch)
- [ ] **Step 3: Verify** — response สลับลำดับแล้วจอยังแสดงตาม query ล่าสุด เปลี่ยน filter หน้าไกลยิงครั้งเดียว ไม่มี error ปลอมกระพริบตอนพิมพ์เร็ว
- [ ] **Step 4: Run** — `npm run test:e2e -- net-race` + `npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "fix(admin/requests): abort stale fetches, sequence-guard results"`

### Task 9: Full gate — lint + unit + e2e + build

**Files:** none (verification only)

- [ ] **Step 1: Run** — `npm run lint` (frontend) ผ่านทั้งก้อน
- [ ] **Step 2: Run** — `npm run test:unit` ผ่าน (รวม `pending-dismiss`)
- [ ] **Step 3: Run** — `npm run test:e2e -- admin-audit-verify` เขียว 10/10 เท่าเดิมหรือดีขึ้น
- [ ] **Step 4: Run** — `npm run build` ผ่าน (ดัก type error จาก prop `dismissDisabled`/`inert`)
- [ ] **Step 5: Commit** — ถ้ามีแก้จาก gate ให้ commit แยก ห้ามรวมกับ Task 1–8

---

## Testing Strategy (input/expected + edge cases)

| เคส | input | expected |
|---|---|---|
| Task 4 pending-dismiss | `isLoading=true` + Escape / backdrop click | `onClose` ไม่โดนเรียกเลย |
| Task 4 normal | `isLoading=false` + Escape / backdrop / X / Cancel | `onClose` โดนเรียกทุกทาง |
| Task 5 double-click | กดยืนยัน 2 ทีติดตอน throttle | DELETE ออก 1 ครั้ง, ปุ่ม loading, success/error คืนสถานะ |
| Task 5 error-path | DELETE ตอบ 500 | error toast/state โชว์ ปุ่มกดใหม่ได้ `isDeleting=false` |
| Task 2 AGENT | login AGENT: ดูเมนู + เปิด `/admin/bookings` ตรง | ไม่เห็นเมนู + URL เด้ง `/admin/live-chat` |
| Task 8 race | พิมพ์ 3 คำรวด + throttle | จอแสดงผลตามคำสุดท้าย ไม่มี error กระพริบ |
| Task 6 drawer | 360px เปิดเมนู + Tab + Escape | โฟกัสขังในเมนู Escape ปิด โฟกัสกลับปุ่มเปิด |
| Task 7 warning | เปิดเตือน + Escape | ต่อเวลาให้ (session ไม่หลุด) โฟกัสกลับจุดเดิม |
| Task 1 search | 360px + 1280px เปิดค้นหา พิมพ์ เลือก | ไปปลายทางเดียวกันทั้ง touch/keyboard |
| Task 3 logout | Tab ถึงปุ่มออก + กดออก + กดยกเลิก | เข้าถึงได้ทั้งคู่ ยืนยันแล้วออก ยกเลิกแล้วไม่ออก |

---

## Self-Review

- [x] Spec coverage: PRD 8 ข้อ (R1–R8) map ถึง Task 1–8 (D1 ใน Task 2, D2 ใน Task 7); Task 9 เป็น gate ปิดงาน
- [x] Placeholder scan: ไม่มี TBD/TODO ทุก step ระบุไฟล์ คำสั่ง ผลที่คาด spec ชื่อไฟล์จริง (`nav-search-roles`, `safe-pending`, `a11y-drawer-session`, `net-race`, `pending-dismiss.test.tsx`)
- [x] Type consistency: `dismissDisabled` (Modal) / `isLoading` (ConfirmDialog) / `isDeleting` (requests) ชื่อเดียวทั้งแผน; import paths + hook/API signatures ระบุครบ
- [x] Dependency order: Task 4 (primitive) ก่อน Task 5 + 7; Task 1–3/6/8 ทำขนานได้; Task 9 ปิดท้าย
- [x] Review fixes: 7 critical + important จาก `prp-validate-plan` ใส่ครบ (frozen contracts, conventions, NOT Building, risks, testing strategy, build gate, Task 7 files, abort-guard, onClose→extendSession, relabel 8)

## Execution Handoff

แผนฉบับ rev.2 พร้อมส่งตรวจซ้ำด้วย `prp-validate-plan` ก่อน implement
