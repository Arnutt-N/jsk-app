# [Admin P1 Fixes] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ซ่อม 7 ข้อ P1 ที่ตรวจยืนยันว่าพังจริง (NAV-01/02, SAFE-01/02/03, A11Y-01/02, NET-01) พร้อมเทส

**Architecture:** แก้ที่ shared primitive ก่อน (`Modal`/`ConfirmDialog`) แล้วค่อยแก้รายหน้า (layout/requests/SessionTimeoutWarning) ทุก task มี failing-check → แก้ → ตรวจ → เทส → commit

**Tech Stack:** Next.js 16 + React 19 + Tailwind v4, Vitest, Playwright

**Decisions made (2026-10-25):** D1 = ทาง (ก) ซ่อนเมนูนัดหมายจาก AGENT, D2 = live-chat ต้องมีเตือนหมดเวลาเหมือนหน้าอื่น

## Global Constraints

- ไม่ลดทอน backend authorization (ยกเว้น D1 ทาง ข ที่ต้องมีรีวิวแยก)
- Admin date/filter semantics คงเดิม งานนี้ไม่แตะ query/bangkok windows
- Comments แบบ why-only ไม่มี banner
- Secrets ห้ามพิมพ์ ตรวจโดยนับจำนวนเท่านั้น
- Branch: `feat/admin-p1-fixes`
- ทุก task: `npm run lint` + เทสที่ระบุผ่านก่อน commit

---

### Task 1: NAV-01 — ปุ่มค้นมือถือเปิดแผงค้นหาเดียวกับคอม

**Files:**
- Modify: `frontend/app/admin/layout.tsx:404-429`
- Test: `frontend/e2e/admin-audit-verify/nav-search-roles.spec.ts` (เติมจากโครง)

**Interfaces:**
- Consumes: `jsk:open-command-palette` event
- Produces: ปุ่มมือถือ + คอมเปิดแผงเดียวกัน

- [ ] **Step 1: Failing check** — viewport 360px กดค้นหา พิมพ์คำ ยืนยันว่าไม่มีผล (ถ่ายภาพก่อนแก้)
- [ ] **Step 2: Implement** — ปุ่มมือถือ `onClick` ส่ง `document.dispatchEvent(new Event('jsk:open-command-palette'))` เหมือนคอม ลบ input เปล่า (`404-414`) ทิ้ง
- [ ] **Step 3: Verify** — 360px + 1280px เปิดค้นหา พิมพ์ เลือกผล ไปปลายทางได้ทั้ง touch/keyboard
- [ ] **Step 4: Run** — `npm run test:e2e -- nav-search-roles` + `npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): mobile search opens shared command palette"`

### Task 2: NAV-02 — เมนูตรงกับตัวกันสิทธิ์ (D1 = ซ่อนเมนู)

**Files:**
- Modify: `frontend/app/admin/layout.tsx:224` (เอา AGENT ออกจาก Appointments)
- Test: เติม `nav-search-roles.spec.ts` (AGENT matrix)

- [ ] **Step 1: Failing check** — login AGENT กด Appointments ดู URL เด้งกลับ live-chat
- [ ] **Step 2: Implement** — ลบ `'AGENT'` ออกจาก `allowedRoles` ของ Appointments
- [ ] **Step 3: Verify** — AGENT เห็นเฉพาะเมนูที่เข้าได้ เปิด URL ตรงของหน้าที่ไม่มีสิทธิ์โดนเด้งเหมือนเดิม
- [ ] **Step 4: Run** — e2e role matrix + lint
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): align Appointments nav with AGENT route guard"`

### Task 3: SAFE-01 — ปุ่มออกแถบข้างเป็นปุ่มจริง + ถามก่อนออก

**Files:**
- Modify: `frontend/app/admin/layout.tsx:146-160` (`SidebarUserInfo`)
- Reuse: `frontend/components/admin/LogoutConfirmDialog.tsx`

- [ ] **Step 1: Failing check** — Tab ไปไม่ถึงปุ่มออกแถบข้าง, กดแล้วออกทันทีไม่มีถาม
- [ ] **Step 2: Implement** — เปลี่ยน `div onClick` เป็น `button` + เปิด `LogoutConfirmDialog` ก่อนเรียก `logout()` เหมือน UserMenu
- [ ] **Step 3: Verify** — Tab/Enter ได้ มีถามก่อนออกทั้งสองทาง ยกเลิกแล้วไม่ออก
- [ ] **Step 4: Run** — lint + e2e logout (ถ้ามี) หรือ manual checklist
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): sidebar logout uses shared confirm dialog"`

### Task 4: SAFE-02 — นโยบายปิด dialog ตอนกำลังรอ (primitive กลาง)

**Files:**
- Modify: `frontend/components/ui/Modal.tsx` (Escape/backdrop/close เคารพสถานะรอ)
- Modify: `frontend/components/ui/ConfirmDialog.tsx:65` (ส่ง `isLoading` ให้ Modal)
- Test: Vitest ใหม่ `components/ui/__tests__/pending-dismiss.test.tsx` (ถ้าไม่มีโครงให้ใช้ manual + e2e)

**Interfaces:**
- Consumes: `isLoading`
- Produces: ตอนรอ = ปิดทุกช่องทางไม่ได้ + ข้อความบอกว่าไม่ได้ยกเลิกคำสั่ง

- [ ] **Step 1: Failing test** — render ConfirmDialog `isLoading=true` ส่ง Escape + backdrop click ยืนยันว่า `onClose` ยังโดนเรียก
- [ ] **Step 2: Implement** — Modal รับ prop กันปิดตอนรอ (เช่น `dismissDisabled`) Escape/backdrop/X เช็คก่อนเรียก `onClose`; ConfirmDialog ส่ง `isLoading` ต่อ + แสดงข้อความไทยสั้นๆ
- [ ] **Step 3: Verify** — ตอนรอ: Cancel ล็อก, X ไม่มี/กดไม่ได้, Escape เงียบ, คลิกพื้นหลังเงียบ; ตอนปกติปิดได้ทุกทางเหมือนเดิม
- [ ] **Step 4: Run** — Vitest ใหม่ + lint
- [ ] **Step 5: Commit** — `git commit -m "fix(ui): block dialog dismiss while pending"`

### Task 5: SAFE-03 — กันลบเบิ้ลหน้าคำร้อง

**Files:**
- Modify: `frontend/app/admin/requests/page.tsx:211-226,562-578`
- Depends: Task 4 (ใช้ `isLoading` ของ dialog)

**Interfaces:**
- Produces: `confirmDelete` ยิง DELETE ครั้งเดียวต่อรอบ

- [ ] **Step 1: Failing check** — throttle เน็ตช้า กดยืนยันลบ 2 ที นับ DELETE ได้ 2 ครั้ง
- [ ] **Step 2: Implement** — เพิ่ม `isDeleting` guard (`if (isDeleting) return`) + `try/finally` คืนสถานะ + ส่ง `isLoading={isDeleting}` ให้ ConfirmDialog
- [ ] **Step 3: Verify** — เน็ตช้ากดเบิ้ลยิงครั้งเดียว ปุ่มแสดงกำลังลบ success/error คืนสถานะถูก
- [ ] **Step 4: Run** — e2e/lint
- [ ] **Step 5: Commit** — `git commit -m "fix(admin/requests): guard against double delete"`

### Task 6: A11Y-01 — ลิ้นชักมือถือเข้าถึงได้จริง

**Files:**
- Modify: `frontend/app/admin/layout.tsx:295-310,465-475`

- [ ] **Step 1: Failing check** — 360px เปิดเมนู กด Tab ดูโฟกัสหลุดไปหลังฉาก กด Escape ดูไม่ปิด
- [ ] **Step 2: Implement** — ตอนปิดใส่ `inert` (+ `aria-hidden`) ตอนเปิดย้ายโฟกัสเข้าปุ่มปิด Escape ปิด ปิดคืนโฟกัสปุ่มเปิดเมนู
- [ ] **Step 3: Verify** — Tab ขังในเมนูตอนเปิด Escape ปิดได้ โฟกัสกลับที่เดิม screen reader เจอชื่อเมนู
- [ ] **Step 4: Run** — lint + e2e keyboard (เติม `a11y-drawer-session.spec.ts`)
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): mobile drawer focus trap, inert, Escape"`

### Task 7: A11Y-02 — เตือนหมดเวลาใช้หน้าต่างกลาง + ครอบ live-chat (D2)

**Files:**
- Modify: `frontend/components/admin/SessionTimeoutWarning.tsx`
- Reuse: `frontend/components/ui/Modal.tsx` (หลัง Task 4)

- [ ] **Step 1: Failing check** — เปิดเตือน ตรวจว่าไม่มี `role=dialog` โฟกัสไม่ย้าย screen reader ไม่อ่าน
- [ ] **Step 2: Implement** — ใช้ `Modal` กลางพร้อม `title` (ชื่อ dialog) โฟกัสเข้าปุ่มต่อเวลา Escape/ต่อเวลาได้ และติด `SessionTimeoutWarning` ในเส้นทาง early-return ของ live-chat (`layout.tsx:275`) ให้มีเตือนเหมือนหน้าอื่น
- [ ] **Step 3: Verify** — โปรแกรมอ่านจออ่านชื่อ + เวลาที่เหลือ โฟกัสกลับจุดเดิมหลังต่อเวลา สี/ข้อความเข้าชุดเดียวกับ dialog อื่น
- [ ] **Step 4: Run** — lint + e2e session spec
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): session warning uses shared modal semantics"`

### Task 8: NET-01 — ผลค้นหาตรงคำล่าสุดเสมอ

**Files:**
- Modify: `frontend/app/admin/requests/page.tsx:116-171`
- Test: `frontend/e2e/admin-audit-verify/net-race.spec.ts`

- [ ] **Step 1: Failing check** — throttle เน็ต พิมพ์ค้นหารัว จดว่าผลสุดท้ายไม่ตรงคำค้นล่าสุด
- [ ] **Step 2: Implement** — `fetchRequests` ใช้ AbortController ยกเลิกคำขอก่อนหน้า + เลขลำดับคำขอทิ้งผลเก่า รวม effect รีเซ็ตหน้า (`setPage(0)`) ไม่ให้ยิงซ้ำซ้อน
- [ ] **Step 3: Verify** — response สลับลำดับแล้วจอยังแสดงตาม query ล่าสุด เปลี่ยน filter หน้าไกลยิงครั้งเดียว
- [ ] **Step 4: Run** — e2e net-race + lint
- [ ] **Step 5: Commit** — `git commit -m "fix(admin/requests): abort stale fetches, sequence-guard results"`

---

## Self-Review

- [x] Spec coverage: PRD ข้อ 1–8 map ถึง Task 1–8 (D1 ใน Task 2, D2 ใน Task 7)
- [x] Placeholder scan: ไม่มี TBD/TODO ทุก step ระบุไฟล์ คำสั่ง ผลที่คาด
- [x] Type consistency: `isLoading`/`dismissDisabled`/`isDeleting` ชื่อเดียวทั้งแผน Task 4 → 5 → 7 ใช้ของเดียวกัน
- [x] Dependency order: Task 4 (primitive) ก่อน Task 5 + 7, Task 1–3/6/8 ทำขนานได้

## Execution Handoff

รอเจ้าของอนุมัติ PRD + แผนนี้ก่อนเริ่ม Task 1 (D1/D2 ได้คำตอบแล้ว)
