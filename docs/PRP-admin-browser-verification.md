# [Admin Browser Verification] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ยืนยันข้อ P1 ทั้ง 8 ข้อของ audit ด้วยของจริงใน browser + ทำ route-state matrix ก่อนสั่งซ่อม

**Architecture:** Read-only verification — ไม่แตะโค้ดโปรดักชัน เพิ่มเฉพาะสคริปต์ตรวจ (`frontend/e2e/admin-audit-verify/*.spec.ts`) + หลักฐาน (`.audit/browser-verify/`) + ตารางสรุป (`docs/VERIFY-admin-browser-matrix.md`)

**Tech Stack:** Playwright (E2E), Next.js dev server, existing `e2e/utils` login helpers

## Global Constraints

- ห้ามแก้ `frontend/app/**`, `frontend/components/**`, `backend/app/**` ในเฟสนี้
- ตรวจซ้ำได้: ทุก spec รันด้วย `BASE_URL=http://localhost:3000 npm run test:e2e -- <spec>` แล้วได้ผลเดิม
- Comments แบบ why-only; ไม่ใส่ banner
- Secrets ห้ามพิมพ์ ตรวจโดยนับจำนวนเท่านั้น
- Branch: `feat/admin-browser-verification`
- `npm run lint` ต้องผ่านสำหรับไฟล์ที่เพิ่ม

---

### Task 1: โครง + route inventory

**Files:**
- Create: `frontend/e2e/admin-audit-verify/` (โฟลเดอร์สเปกตรวจ)
- Create: `.audit/browser-verify/` (เก็บหลักฐานภาพ/โน้ต)
- Modify: `docs/VERIFY-admin-browser-matrix.md` (สร้างโครงตาราง)

- [ ] **Step 1: Inventory** — ลิสต์ route ทั้งหมดใต้ `frontend/app/admin/` (จาก `ls`) + role ที่เมนูอ้าง (`layout.tsx:181-226`, `lib/nav-access.ts`)
- [ ] **Step 2: Scaffold** — สร้างโฟลเดอร์สเปก + ไฟล์ matrix โครง (`route × role × viewport × keyboard/touch`)
- [ ] **Step 3: Verify** — `ls frontend/e2e/admin-audit-verify/` เจอไฟล์ + matrix มีหัวตารางครบ
- [ ] **Step 4: Commit** — `git commit -m "chore(verify): scaffold admin browser verification matrix"`

### Task 2: NAV-01 + NAV-02 (ค้นหามือถือ + เมนู/สิทธิ์ขัดกัน)

**Files:**
- Create: `frontend/e2e/admin-audit-verify/nav-search-roles.spec.ts`
- Evidence: `.audit/browser-verify/nav-*.png`

**Interfaces:**
- Consumes: `app/admin/layout.tsx:86-92,224,404-429`, `e2e/utils/login`
- Produces: คำตัดสิน NAV-01/NAV-02 ว่าพังจริงหรือไม่

- [ ] **Step 1: NAV-01** — viewport 360px เปิดปุ่มค้นหา พิมพ์คำ กด Enter/เลือกผล จดว่าไปปลายทางได้ไหม เทียบกับ 1280px (command palette)
- [ ] **Step 2: NAV-02** — login เป็น AGENT เปิด `/admin/bookings` (หรือ Appointments ตามเมนู) ตรง + เปิด URL ตรง จดว่าเห็นเมนูแต่เข้าไม่ได้จริงไหม
- [ ] **Step 3: Matrix** — เติมช่อง NAV-01/NAV-02 ใน matrix พร้อมหลักฐาน
- [ ] **Step 4: Run** — `npm run test:e2e -- nav-search-roles` (หรือจดผล manual ถ้า auth ติด)
- [ ] **Step 5: Commit** — `git commit -m "chore(verify): NAV-01 mobile search + NAV-02 role matrix evidence"`

### Task 3: SAFE-01 + SAFE-02 + SAFE-03 (logout + ยืนยันตอนรอ + ลบซ้ำ)

**Files:**
- Create: `frontend/e2e/admin-audit-verify/safe-pending.spec.ts`
- Evidence: `.audit/browser-verify/safe-*.png`

- [ ] **Step 1: SAFE-01** — เทียบ logout จาก sidebar vs UserMenu: มีถามก่อนไหม, กด Tab/Enter ได้ไหม
- [ ] **Step 2: SAFE-02** — เปิด ConfirmDialog จำลอง pending (เน็ตช้า/throttle) ลองกด Cancel, ปุ่มกากบาท, Escape, คลิกฉากหลัง จดว่าปิดได้ไหม
- [ ] **Step 3: SAFE-03** — หน้า requests กดลบ 2 ครั้งติดตอนเน็ตช้า นับคำสั่ง DELETE ที่ออกไป (นับจำนวน ไม่ดู token)
- [ ] **Step 4: Matrix + commit** — `git commit -m "chore(verify): SAFE-01/02/03 logout + pending-dismiss + double-delete evidence"`

### Task 4: A11Y-01 + A11Y-02 (เมนูมือถือ + เตือนหมดเวลา)

**Files:**
- Create: `frontend/e2e/admin-audit-verify/a11y-drawer-session.spec.ts`

- [ ] **Step 1: A11Y-01** — viewport 360px เปิด sidebar กด Tab รัวๆ จดว่าโฟกัสหลุดไปลิงก์หลังฉากไหม, กด Escape ปิดได้ไหม
- [ ] **Step 2: A11Y-02** — เปิด SessionTimeoutWarning (หรือจำลอง) จดว่ามีชื่อ dialog ให้โปรแกรมอ่านจอไหม สี/ข้อความต่างจาก modal กลางไหม
- [ ] **Step 3: Matrix + commit** — `git commit -m "chore(verify): A11Y-01 drawer + A11Y-02 session warning evidence"`

### Task 5: NET-01 (ผลเก่าทับผลใหม่)

**Files:**
- Create: `frontend/e2e/admin-audit-verify/net-race.spec.ts`

- [ ] **Step 1** — หน้า requests พิมพ์ค้นหารัวๆ / สลับ filter เร็ว + throttle เน็ตช้า จดว่าผลสุดท้ายตรงกับคำค้นล่าสุดไหม
- [ ] **Step 2: Matrix + commit** — `git commit -m "chore(verify): NET-01 stale-response race evidence"`

### Task 6: สรุป matrix + รายงานส่งมอบ

**Files:**
- Modify: `docs/VERIFY-admin-browser-matrix.md` (เติมผลครบ)
- Create: `docs/VERIFY-admin-browser-report.md` (คำตัดสิน P1 ทีละข้อ)

- [ ] **Step 1: รวมผล** — ทุกข้อ P1 มีคำตัดสิน (พังจริง/ไม่พัง/ต้องเทสเพิ่ม) + ลิงก์หลักฐาน
- [ ] **Step 2: Self-review** — placeholder scan (ไม่มี TBD), matrix ไม่มีช่องว่างโดยไม่มีเหตุผล
- [ ] **Step 3: Run** — `npm run lint` + ลิสต์สเปกที่รันผ่าน/ล้มเหลว
- [ ] **Step 4: Commit** — `git commit -m "chore(verify): complete admin browser verification matrix + report"`

---

## Self-Review

- [x] Spec coverage: PRD ข้อ 1-4 map ถึง Task 1-6 (P1 ครบ 8 ข้อ)
- [x] Placeholder scan: ไม่มี TBD/TODO ทุก step ระบุไฟล์ คำสั่ง ผลที่คาด
- [x] Type consistency: ชื่อ spec/evidence/matrix ใช้ชื่อเดียวกันทั้งแผน

## Execution Handoff

Subagent-Driven — fresh subagent ต่อ task (Task 2-5 ทำขนานได้) review ระหว่าง task
