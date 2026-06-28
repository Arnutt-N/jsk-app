# Live-Chat Console — Audit Remediation

> Remediation PRD แปลงผลจาก multi-expert ECC frontend audit (7 lenses, 33 agents) ของหน้า `admin/live-chat` ให้เป็นแผนงานที่จัดเฟส วัดผลได้ และพร้อมส่งต่อ `/prp-plan`
> ขอบเขตที่ผู้ใช้เลือก: **ทั้งหมด 37 ปัญหา (แบ่งเฟส) · Quick wins ก่อน · รองรับ offline transfer (Phase 6 มี backend dependency)**

## Revision Log

- **v2 (2026-06-22)** — แก้ตามผล 6-expert PRD review panel (verdict: APPROVE WITH CHANGES):
  - **B1 (BLOCKER)**: ยกเลิก claim "frontend-only/backend-unchanged" — ผู้ใช้เลือก *รองรับ offline transfer* → Phase 6 มี backend dependency ที่ scope ชัด (presence broadcast + display_name enrichment + roster endpoint + transfer error-code mapping)
  - **B2 (BLOCKER)**: เพิ่มงาน WCAG 2.2 AA ที่หายไป (W1-W5: Focus Appearance, Color Contrast, Status Messages, prefers-reduced-motion, Target Size 24px) + ปรับ metric "axe=0" เป็น "filter แรก + manual SC checklist"
  - **MAJOR**: แก้ evidence H3 (value object ไม่ใช่ state), ขยาย scope H1/H5/M8, ระบุ file-ownership/branch strategy แทน parallelism ที่มองโลกสวย, เพิ่ม outcome metrics + baseline task, tag open questions เป็น phase blockers
  - **MINOR**: แยก Phase 6 (Must) / Phase 7 (Could), formalize split-ID (M11a/M11b), แก้ MoSCoW (เพิ่ม M4, M14 bucket เดียว), แก้ตัวเลขนับ
- **v1 (2026-06-22)** — ฉบับแรกจาก `/ecc:prp-prd`
- **Source artifacts**: audit = workflow `wf_d4b6b46a-e89`; review = workflow `wf_238fdb57-7a9`

## Problem Statement

หน้า Live-Chat Console (`frontend/app/admin/live-chat/`) เป็นเครื่องมือหลักที่ operator ใช้คุยกับลูกค้า LINE แบบเรียลไทม์ แต่ audit พบ 37 ปัญหา: ปัญหา **accessibility ระดับใช้งานไม่ได้สำหรับผู้ใช้ keyboard/screen reader** (ปุ่ม Send ไม่มีชื่อ), **ปัญหา performance ที่ทำให้ทั้งหน้า re-render เกินจำเป็น**, และ **ช่องโหว่ UX ในการทำงานหลาย operator** (โอนสายด้วยการพิมพ์ ID, ไม่มีเวลารอในคิว). ต้นทุนของการไม่แก้คือ operator ทำงานช้า/ผิดพลาดเงียบ ๆ, ผู้ใช้ที่มีข้อจำกัดด้านการเข้าถึงใช้งานไม่ได้ (เสี่ยงด้านการปฏิบัติตามมาตรฐานหน่วยงานรัฐ), และลูกค้ารอนานโดยไม่มีใครเห็น

## Evidence

- **Audit หลักฐานตรงจาก source (file:line ครบ):** multi-expert audit 7 lenses → finder รวม 41 issue → verify เชิงโต้แย้งตัด false positive 4 ข้อ + ปรับ severity ที่เป่าเกิน → **เหลือ 37 ที่ยืนยันแล้ว (5 HIGH / 21 MEDIUM / 11 LOW)**
- **H1:** `MessageInput.tsx:204-213` ปุ่ม Send render แค่ `<Send className="w-5 h-5" />` ไม่มี `aria-label`/text + อีก 6+ ปุ่ม toolbar ใช้แค่ `title` (NVDA มักไม่อ่าน)
- **H3:** `LiveChatContext.tsx:759-791` **`value` เป็น object literal ใหม่ทุก render** (หมายเหตุ: `state` object 731-757 ถูก `useMemo` แล้ว — ปัญหาอยู่ที่ตัว `value` ทั้งก้อนที่ส่งเข้า Provider) → consumer ทุกตัว re-render
- **H2:** `TransferDialog.tsx:61-62` `<input type="number" placeholder="Enter operator ID">`
- **ผลตรวจ backend (จาก PRD review):** `claim_session` กันแย่งสายแล้ว (atomic UPDATE+rowcount `:279-296`), `_require_active_session_owner` กัน operator คนอื่นพิมพ์แล้ว (`:343-361`) — *แต่* presence ถูกส่งผ่าน `send_personal()` ครั้งเดียวตอน auth (`ws_live_chat.py:178-182`) **ไม่มี broadcast ต่อเนื่อง** และ `get_online_admins()` ไม่คืน `display_name` → H2 ต้องแตะ backend

## Proposed Solution

แก้ทั้ง 37 ปัญหา + ปิดช่องว่าง WCAG 5 ข้อ (W1-W5) แบบ **จัดเป็น 8 เฟส เรียง Quick wins ก่อน**. งานส่วนใหญ่ (Phase 1-5, 7-8) เป็น **frontend ล้วน**; เฉพาะ **Phase 6 (multi-operator) มี backend dependency ที่ scope แคบและชัดเจน** เพื่อให้ presence picker ทำงานจริง. เลือกแนวนี้แทนการ "rewrite ใหม่ทั้งหน้า" เพราะ audit + review ยืนยันว่าสถาปัตยกรรมหลัก (WebSocket layer, Zustand store, optimistic send, reconnect, claim/ownership guards) แข็งแรงดีอยู่แล้ว — เป็นการ "ขัดเงา + ปิดช่องโหว่"

## Key Hypothesis

We believe การปิดทั้ง 37 finding + 5 WCAG gap (a11y + perf + operator UX) จะ ทำให้ Live-Chat Console ใช้งานได้สำหรับทุก operator (รวมผู้ใช้ keyboard/screen reader) และลดความผิดพลาด/ความช้าในการทำงานหลายคน for operator ของหน่วยงานยุติธรรมชุมชน.
We'll know we're right when:
- **(a11y outcome)** keyboard-only + NVDA operator ทำ flow หลัก (send/claim/transfer/close) สำเร็จครบ, และ manual WCAG 2.2 AA checklist ผ่านทุก SC ที่ระบุ
- **(perf outcome)** ใน scenario "พิมพ์ 1 ตัวอักษรใน MessageInput" → CustomerPanel/ConversationList re-render = 0 ครั้ง (เทียบ baseline ที่ capture ใน Phase 1)
- **(multi-operator outcome)** ใน 2-client test: operator คนที่ 2 เห็นสถานะ "already-claimed" ภายใน < 1 วินาที และเลือกปลายทางโอนจากชื่อได้ (ไม่ต้องพิมพ์ ID)

## What We're NOT Building

- **ไม่ refactor backend นอกเหนือจาก scope ของ Phase 6** — backend change จำกัดเฉพาะ: (1) `broadcast_to_all(presence_update)` ตอน register/disconnect, (2) เพิ่ม `display_name` ใน presence payload, (3) lightweight roster endpoint สำหรับ operator offline (หรือ reuse `/admin/users`), (4) แปลง `transfer_session` ValueError → HTTP 400/403. ไม่แตะ schema/migration/auth/ส่วนอื่นของ backend
- **ไม่ rewrite สถาปัตยกรรมหน้า** — คงโครง WebSocket/Zustand/optimistic-send/claim-guard เดิม
- **ไม่เพิ่มฟีเจอร์ใหม่ที่ไม่อยู่ใน audit** (เช่น AI suggestion, sentiment) — เป็น remediation
- **ไม่ทำ unit-test coverage ใหม่ทั้งหน้า** — เพิ่มเทสเฉพาะจุดที่แก้ logic (memoization, ownership check, transfer flow)

## Success Metrics

| Metric | Target | How Measured | ประเภท |
|--------|--------|--------------|--------|
| Accessibility (automated) | 0 critical/serious | `@axe-core/playwright` บน `/admin/live-chat` — **filter แรกเท่านั้น** | output |
| WCAG 2.2 AA (manual) | ผ่านทุก SC ที่ระบุ (2.4.11, 1.4.3, 4.1.3, 2.5.8, 1.4.1, 2.1.1/2.1.2, 4.1.2/4.1.3) | manual checklist + NVDA+Chrome walkthrough (flow หลัก) | outcome |
| First-response (keyboard) | ลดลงเทียบ baseline | จับเวลา "claim → ส่งข้อความแรก" ด้วย keyboard ล้วน ก่อน/หลัง | **outcome** |
| Claim contention | operator 2 เห็น already-claimed < 1s | 2-client manual/e2e test | **outcome** |
| Unnecessary re-renders | 0 ใน scenario ที่นิยาม | React DevTools Profiler เทียบ baseline (capture ใน Phase 1 task แรก) | output |
| Findings closed + verified | 37/37 + W1-W5, แต่ละข้อผูก verification ของตัวเอง | checklist ใน PR + "no regression in vitest/Playwright" | output |
| Design-token compliance | 0 hardcoded `slate-*`/raw hex | `grep` ทั่ว `frontend/app/admin/live-chat/**` | output |
| False-affordance buttons | 0 | ทุกปุ่มที่เห็น ทำงานจริง หรือถูกซ่อน/disable พร้อมป้าย | output |
| Build/CI | เขียว | `npx tsc --noEmit` + `npm run build` + `npx vitest run` + ESLint | gate |

## Open Questions

- [x] **Q1 (RESOLVED): รองรับ offline transfer?** → **ใช่** → Phase 6 มี backend dependency (presence broadcast + roster endpoint). ยกเลิก claim "frontend-only"
- [ ] **Q2 [Blocks Phase 6]: เกณฑ์ SLA เวลารอในคิว** — default ใช้ amber=5 นาที / red=15 นาที (placeholder) จนกว่าหน่วยงานยืนยัน (M15)
- [ ] **Q4 [Blocks Phase 2]: screen reader เป้าหมาย** — default = **NVDA + Chrome** เป็น baseline conformance; เพิ่ม VoiceOver ถ้าต้องรองรับ Mac/iOS operator
- [ ] **Q3 [Blocks Phase 7]: Quick replies (M19)** — operator/admin แก้เองได้ หรือคง preset ของระบบ? (default: คง preset, fold เข้า canned-response ภายหลัง)

---

## Users & Context

**Primary User**
- **Who**: เจ้าหน้าที่ operator/agent ของหน่วยงานยุติธรรมชุมชน ที่รับเรื่องร้องเรียน/แจ้งเบาะแสผ่าน LINE — รวมผู้ที่ใช้ keyboard ล้วนหรือ screen reader (NVDA)
- **Current behavior**: เปิดหน้า live-chat ทั้งวัน, สลับหลายห้องสนทนาพร้อมกัน, claim/โอน/ปิดสาย, ตอบด้วยข้อความ/สติกเกอร์/ไฟล์
- **Trigger**: มีข้อความเข้าจากลูกค้า LINE หรือมี session รอใน WAITING queue
- **Success state**: ตอบลูกค้าได้เร็วและถูกคน, รู้ว่าใครรอนานสุด, ไม่แย่งสายกันเอง, โอนสายเลือกจากชื่อได้, และใช้งานได้แม้พึ่ง keyboard/screen reader

**Job to Be Done**
When มีลูกค้าหลายคนรอในคิวพร้อมกัน, operator ต้องการ เห็นว่าใครรอนานสุด รับสายได้โดยไม่ชนกับเพื่อน และตอบ/โอนได้อย่างมั่นใจ, so that ลูกค้าได้รับการดูแลเร็วและไม่มีใครตกหล่น โดยเครื่องมือไม่กีดกันผู้ใช้ที่มีข้อจำกัดด้านการเข้าถึง.

**Non-Users**
ลูกค้า LINE ปลายทาง (ใช้ LINE app), super-admin ที่ดูแค่รายงาน, ผู้ใช้ public — PRD นี้โฟกัสที่ operator หน้า console เท่านั้น

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Findings | Rationale |
|----------|------------|----------|-----------|
| Must | ทุกปุ่ม/ฟอร์มมี accessible name + dialog/focus semantics | H1, H4, H5, M7, M8, M9 | WCAG 2.2 AA — ใช้งานไม่ได้ถ้าขาด |
| Must | ปิดช่องว่าง WCAG 2.2 AA ที่ค้นพบเพิ่ม | W1, W2, W3, W4, W5 | AA ต้องครบ ไม่ใช่แค่ axe ผ่าน |
| Must | Memoize `LiveChatContext` value + ลบ dead `ChatState` | H3, M3 | perf root cause จุดเดียวแก้สองทาง — quick win คุ้มสุด |
| Must | hit area + status token + ship "mark as read" | M4, M5, M14 | quick win ผลกระทบสูง |
| Must | Operator picker (online+offline) + claim contention + ownership banner | H2, M16, M17 | ป้องกันโอนผิดคน/แย่งสายเงียบ |
| Must | waiting-time badge + sort | M15 | operator triage คิวได้จริง |
| Should | รวมทุกอย่างเข้า design token | M1, M6, L2, L3, L4, L5 | กำจัด "design ที่สอง" |
| Should | Exit animation + motion token + polish | M2, M11a, M21, L1, L6, L7, L11 | ความรู้สึก "เนียน" + compositor-friendly |
| Should | ErrorBoundary + abort + memo hooks | M10, M11b, M12, M13, L8, L9 | กันพังวงแคบ + micro-perf |
| Could | unify mode/session, quick replies, persist notes | M18, M19, M20, L10 | ลด cognitive load |
| Won't | rewrite provider เป็น microservice / broader backend refactor | - | เกินขอบเขต remediation |

> **Split-ID notation (formalized):** `M11a` = motion ส่วน (exit animation, Phase 4); `M11b` = AbortController ส่วน (Phase 5). ใช้รูปแบบนี้เพื่อให้ `/prp-plan` parse ได้

### WCAG Gap Items (เพิ่มจาก PRD review — B2)

| ID | SC | งาน | ไฟล์/หลักฐาน |
|----|-----|-----|------|
| W1 | 2.4.11 Focus Appearance | แทน `focus:ring-brand-500/40` ด้วย `focus-visible:ring-2 focus-visible:ring-brand-600` ทุก interactive | `grep focus-visible = 0`; `MessageInput.tsx:191` |
| W2 | 1.4.3 Contrast | audit 4.5:1 (text) / 3:1 (UI) — โดยเฉพาะ micro fonts + status colors | ทั้งฉบับ PRD ไม่เคยพูดถึง |
| W3 | 4.1.3 Status Messages | แยก live region: `role="log" aria-live="polite" aria-relevant="additions"` (messages) คนละตัวกับ typing/connection/session | `ChatArea.tsx:263` (aria-live บน virtualization container) |
| W4 | (reduced motion) | สร้าง `useReducedMotion` hook + guard `animate-*` 10+ จุด + JS `scrollIntoView` | `grep animate-ping\|pulse\|spin\|bounce = 10+`; `globals.css:744-753` ถูก Tailwind override |
| W5 | 2.5.8 Target Size | requirement จริง = **24×24px** (ไม่ใช่ 40px) — แก้ที่ต่ำกว่า: `NotificationToast.tsx:82` (~22px), `MessageInput.tsx:195` (~20px) | review evidence |

### MVP Scope

**MVP = Phase 1 (Quick wins) ส่งขึ้นได้ทันที** — H3+M3 (memoize value + ลบ dead `ChatState`), H1 (a11y composer — ทุกปุ่ม), H4 (aria-live → role=log), M5 (status token), M4+W5 (hit area ≥24px), M14 (ship "mark as read" + ซ่อนปุ่ม dead). **Task แรกของ Phase 1 = capture Profiler baseline** (สำหรับ metric re-render)

### User Flow (critical path)

`เปิด console → เห็น WAITING queue พร้อมเวลารอ (amber/red) → claim (รู้ทันทีถ้าเพื่อน claim ไปแล้ว <1s) → ตอบด้วย keyboard/NVDA ได้ครบ → โอนโดยเลือกชื่อจาก picker (online+offline) → ปิดสาย` — ทุกขั้นทำด้วย keyboard ล้วนได้

---

## Technical Approach

**Feasibility**: Phase 1-5, 7-8 = **HIGH (frontend-only)**; Phase 6 = **MEDIUM (frontend + backend ที่ scope แคบ)**

**Architecture Notes**
- คงโครงเดิม: WebSocket layer (`lib/websocket/*`, `hooks/useLiveChatSocket.ts`) + Zustand store + optimistic send + claim/ownership guards
- **H2 backend dependency (ยืนยันจาก review):** ปัจจุบัน `ws_live_chat.py:178-182` ส่ง presence ผ่าน `send_personal()` ครั้งเดียวตอน auth → ต้องเพิ่ม `broadcast_to_all(presence_update)` เมื่อ register/disconnect (`websocket_manager.py`); `get_online_admins():327-358` ต้อง enrich `display_name`; เพิ่ม roster endpoint สำหรับ offline targets (หรือ reuse `/admin/users`); ฝั่ง frontend wire `onPresenceUpdate` (ยังไม่ถูก wire) → feed picker
- **transfer error mapping:** `live_chat_service.py:375-378` raise `ValueError` (→ 500) ต้องแปลงเป็น 400/403 ที่ endpoint ก่อนใช้ transfer flow
- M2/M11a ใช้ `motion` (`^12.38.0`) ที่อยู่ใน package แล้ว + `AnimatePresence` — **จำกัดเฉพาะ toast/dropdown** (ไม่ใช้กับ message list ที่ virtualized เพราะชน virtualizer measurement)
- Design token มีครบใน `globals.css` — แค่ map ของที่ hardcode มาใช้

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Memoize context ผิด deps → state ค้าง | M | เพิ่มเทส re-render + ทดสอบ flow หลักหลังแก้ |
| Backend presence broadcast เพิ่ม load / loop | M | broadcast เฉพาะตอน state เปลี่ยน (register/disconnect) ไม่ใช่ทุก heartbeat; throttle ถ้าจำเป็น |
| AnimatePresence ชน virtualization | M | จำกัดเฉพาะ toast/dropdown; ทดสอบ history ยาว + reduced-motion |
| ไม่มี test baseline ก่อนแก้ | M | capture Profiler + flow timing เป็น Phase 1 task แรก |
| Refactor provider 800 บรรทัด (Phase 8) ทำ flow พัง | H | ทำเป็นเฟสสุดท้าย, แตกทีละ hook, เทสครอบก่อน |
| File collision ข้ามเฟส parallel | M | file-ownership ต่อเฟส + branch rebase strategy (ด้านล่าง) |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently (e.g., "with 3" or "-")
  DEPENDS: phases that must complete first (e.g., "1, 2" or "-")
  PRP: link to generated plan file once created
-->

> **สถานะ:** ทั้ง 8 เฟสมีแผน implementation แล้ว (planned, `/prp-plan` 2026-06-22) — status คง `pending` จนกว่าจะเริ่ม implement จริง

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Quick Wins (MVP) | H1, H3, H4, M3, M4, M5, M14, W5 + capture baseline | pending | - | - | [plan](../plans/phase-1-quick-wins.plan.md) |
| 2 | A11y Compliance | H5, M7, M8, M9, W1, W2, W3 + a11y ใน M21 | pending | with 5 | 1 | [plan](../plans/phase-2-a11y-compliance.plan.md) |
| 3 | Design System Unify | M1, M6, L2, L3, L4, L5 | pending | with 4 | 1 | [plan](../plans/phase-3-design-system-unify.plan.md) |
| 4 | Motion & Polish | M2, M11a, M21, W4, L1, L6, L7, L11 | pending | with 3 | 1 | [plan](../plans/phase-4-motion-polish.plan.md) |
| 5 | React/Perf Hardening | M10, M11b, M12, M13, L8, L9 | pending | with 2 | 1 | [plan](../plans/phase-5-react-perf-hardening.plan.md) |
| 6 | Operator UX (Multi-operator, Must) | H2, M15, M16, M17 + backend (presence broadcast, display_name, roster, transfer 4xx) | pending | - | 2, 3, 5 | [plan](../plans/phase-6-operator-ux-multi-operator.plan.md) |
| 7 | Operator UX (Could) | M18, M19, M20, L10 | pending | - | 6 | [plan](../plans/phase-7-operator-ux-enhancements.plan.md) |
| 8 | Provider Refactor | แตก LiveChatProvider ~800 บรรทัดเป็น custom hooks | done ✅ (2026-06-28) | - | 6 | [plan](../plans/completed/phase-8-provider-refactor.plan.md) · [report](../reports/phase-8-provider-refactor-report.md) |

### File Ownership & Branch Strategy (แก้ MAJOR กลุ่ม 3)

ไฟล์ที่ถูกหลายเฟสแตะ → กำหนด "owner phase" + เฟสอื่น rebase จาก owner:
- **`MessageInput.tsx`**: owner = Phase 1 (a11y+hit area); Phase 2 (W1 focus), Phase 4 (motion) rebase หลัง P1 merge
- **`CustomerPanel.tsx`**: owner = Phase 2 (a11y dialog/labels); Phase 3 (token/hierarchy), Phase 5 (perf), Phase 7 (M20 notes) rebase ตามลำดับ
- **`globals.css`**: owner = Phase 3 (token); Phase 4 (motion token/W4) ประสานก่อนแก้
- **`ChatArea.tsx`**: owner = Phase 1 (H4/W3 live region — **W3 = messages `role="log"` เท่านั้น**); Phase 5 (perf) rebase. หมายเหตุ: Phase 2 ทำ live region แยกสำหรับ typing/connection/session (ไม่แตะ messages region ของ P1) เพื่อเลี่ยง nested live region
- **`useConversations.ts` / `useConversationStats.ts`**: owner = Phase 5 (M12 memoize + L9.7 rename `useConversations`→`useConversationStats`, signature `(conversations, query)`); **Phase 6 (M15 sort) ต้องเพิ่ม param `sortBy` ใน `useConversationStats` ของ P5 — ห้ามอ้าง `useConversations` 3-param แบบเดิม** (จะ break)
- **`ConversationItem.tsx`**: owner-chain **P1 → P3 → P4 → P5 → P6** (serialize, ห้าม merge ขนาน). P5 เปลี่ยน prop signature เป็น breaking (`onClick→onSelect(id)`, `onMenuClick→onMenuToggle(id)`) → P6 ต้องวาง badge/contender บน signature ใหม่ของ P5
- **`ConversationList.tsx`**: owner-chain **P1 → P3 → P4 → P5 → P6** (serialize). `optionId`/`formattedTime` props **มีอยู่แล้ว** (:220,223) — อย่าเพิ่มซ้ำ
- **`MessageBubble.tsx`**: owner = Phase 4 (isNew/motion); Phase 5 (`formattedTime` prop) rebase หลัง P4
- กฎ: เฟส parallel ที่ชน owner file เดียวกัน → serialize เฉพาะไฟล์นั้น (ไม่ใช่ทั้งเฟส)

> **ก่อน implement เฟสใด ๆ อ่าน [PLAN-REVIEW-FIXES.md](../plans/PLAN-REVIEW-FIXES.md)** — errata รวม 7 cross-phase BLOCKERs + 2 snippet corrections จาก plan review (wf_634ea6c6-886). แก้แล้วจึงเริ่มได้

### Phase Details

**Phase 1: Quick Wins** *(MVP)*
- **Goal**: ปิด HIGH/MEDIUM ผลกระทบสูง-ความเสี่ยงต่ำให้เร็วที่สุด + ตั้ง baseline
- **Scope**: capture Profiler/timing baseline (task แรก); H3+M3 (memoize `value` object 759-791 + ลบ dead `ChatState`); H1 (`aria-label` **ทุกปุ่ม composer 6+ ตัว** + Send/expand + `aria-expanded` toggle + `aria-hidden` SVG); H4+W3 (ย้าย `aria-live` → dedicated `role="log"`); M5 (status → semantic token); M4+W5 (hit area ≥24px, เป้า 40px ที่ทำได้); M14 (ship "mark as read" + ซ่อนปุ่ม dead)
- **Success signal**: build เขียว, axe ลดลง, Profiler ยืนยัน re-render = 0 ใน scenario, ปุ่ม composer มีชื่อใน NVDA, baseline บันทึกแล้ว
- **Interim mitigation:** กัน raw numeric ID input ของ TransferDialog (validation + confirm) จนกว่า Phase 6 จะมาแทนด้วย picker

**Phase 2: A11y Compliance**
- **Goal**: หน้า live-chat ผ่าน WCAG 2.2 AA ใน flow หลัก (NVDA+Chrome baseline)
- **Scope**: H5 (MobileDrawer wrapper `role="dialog"`+focus trap+Escape — ใช้ TransferDialog เป็น reference); M7 (sr-only status label); M8 (`htmlFor`/`id` ทุก label ใน CreateChatSheet + `role="alert"` error); M9 (label Notes textarea); W1 (focus-visible ทั้งหน้า); W2 (contrast audit); W3 (แยก live regions)
- **Success signal**: axe = 0 critical/serious, manual WCAG checklist ผ่าน, keyboard-only ทำ send/claim/transfer/close ครบ

**Phase 3: Design System Unify**
- **Goal**: ทุก surface ใช้ token เดียว
- **Scope**: M1 (analytics page → `ds-*`/`--chart-*`), M6 (CustomerPanel hierarchy + ลบ N/A), L2/L3/L4/L5
- **Success signal**: `grep` hardcoded `slate-*`/raw hex ทั่ว `live-chat/**` = 0

**Phase 4: Motion & Polish**
- **Goal**: เพิ่ม exit animation + ความเนียน โดยคุม performance + เคารพ reduced-motion
- **Scope**: M2 (toast/dropdown ผ่าน `AnimatePresence` — **ไม่แตะ message list**), M11a, W4 (`useReducedMotion` hook + guard), M21 (tabular-nums, focus-ring, break-words, typing-bounce), L1/L6/L7/L11
- **Success signal**: ปิด/ลบ element มี exit นุ่ม, reduced-motion เคารพจริง, ไม่มี layout-bound animation

**Phase 5: React/Perf Hardening**
- **Goal**: กันพังวงแคบ + ลด re-render/work
- **Scope**: M10 (component-level ErrorBoundary), M11b (AbortController ใน analytics fetch cleanup), M12 (memoize `useConversations` single-pass), M13 (stable props), L8, L9
- **Success signal**: panel เดียว error ไม่ล่มทั้งหน้า, Profiler work ลดลง

**Phase 6: Operator UX (Multi-operator, Must)**
- **Goal**: ทำงานหลาย operator ถูกต้อง — รองรับโอนทั้ง online+offline
- **Frontend scope**: H2 (wire `onPresenceUpdate` + operator picker แทนพิมพ์ ID), M16 (claim contention UI + จัดการ already-claimed), M17 (ownership banner), M15 (waiting-time badge + sort)
- **Backend dependency (scope แคบ):** `broadcast_to_all(presence_update)` ตอน register/disconnect; enrich `display_name` ใน presence payload; roster endpoint (offline) หรือ reuse `/admin/users`; transfer endpoint แปลง ValueError → 400/403
- **Success signal**: 2-client test — operator 2 เห็น already-claimed <1s; โอนเลือกจากชื่อได้ (online+offline); คิวเรียงตามเวลารอ

**Phase 7: Operator UX (Could)**
- **Goal**: ลด cognitive load
- **Scope**: M18 (unify Bot/Manual กับ Claim/Done), M19 (quick replies — ตาม Q3), M20 (persist Notes), L10 (ป้ายภาษา + toast คลิกได้)
- **Success signal**: mental model เดียว, notes ไม่หาย

**Phase 8: Provider Refactor**
- **Goal**: ลดความเสี่ยงระยะยาวของ god-component
- **Scope**: แตก `LiveChatContext` ~800 บรรทัดเป็น `useConversationSync`, `useMessageFlow`, `useChatRoom`, `useMediaQuery`
- **Success signal**: <400 บรรทัด/ไฟล์, flow หลักไม่ regress, เทสผ่าน

### Parallelism Notes

เฟส 2↔5 และ 3↔4 ทำคู่ขนานได้หลัง Phase 1 (คนละมิติเป็นหลัก) แต่ต้องเคารพ **File Ownership** ด้านบน — เฟสที่ชน owner file เดียวกันให้ serialize เฉพาะไฟล์นั้น Phase 6 รอ 2+3+5 (อาศัย a11y semantics + token สำหรับ badge + perf เสถียร) Phase 7,8 ปิดท้ายหลัง flow นิ่ง

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| ขอบเขต | 37 ข้อ + W1-W5 แบ่งเฟส | เฉพาะ HIGH / HIGH+MEDIUM | ผู้ใช้เลือกเต็ม + review เพิ่ม WCAG gap |
| จัดลำดับ | Quick wins ก่อน | a11y-first / UX-first | ผู้ใช้เลือก — เก็บผลเร็ว เสี่ยงต่ำ |
| Offline transfer (Q1) | **รองรับ** | online-only | ผู้ใช้เลือก → Phase 6 มี backend dependency |
| Backend scope | จำกัด 4 อย่างใน Phase 6 | ไม่แตะ backend (v1 ที่ผิด) / full-stack refactor | review พิสูจน์ presence ไม่ broadcast — ต้องแก้ แต่ scope แคบ |
| สถาปัตยกรรม | คงเดิม + ขัดเงา | rewrite | audit+review ยืนยันแกนหลักแข็งแรง |
| Motion lib | `motion` ที่มีแล้ว, จำกัด toast/dropdown | lib ใหม่ / ใช้กับ message list | ลด bundle + เลี่ยงชน virtualizer |
| a11y metric | axe = filter แรก + manual SC checklist | axe=0 อย่างเดียว | axe จับได้ ~30-40% ของ WCAG |

---

## Research Summary

**Market Context**
มาตรฐาน operator console สมัยใหม่ (Intercom, Zendesk, LINE OA Manager) ถือ keyboard accessibility, presence-based assignment, waiting-time/SLA visibility เป็นพื้นฐาน — finding ที่พบเป็น hygiene ไม่ใช่ฟีเจอร์ล้ำ

**Technical Context**
- Frontend: Next.js 16 / React 19 / TS, Zustand + Context, `motion` v12, design token ใน `globals.css`
- Backend (ตรวจ 2 รอบ — audit + review): guards ครบ (`claim_session` atomic, `_require_active_session_owner`) แต่ **presence ไม่ broadcast ต่อเนื่อง** (`ws_live_chat.py:178-182` send_personal) และ `get_online_admins` ไม่มี `display_name` → Phase 6 ต้องแก้ backend scope แคบ
- สรุป: remediation ส่วนใหญ่ frontend; Phase 6 = frontend + backend ที่ scope ชัด

---

*Generated: 2026-06-22 (v2 — post-review)*
*Status: DRAFT - BLOCKER B1/B2 resolved; pending Q2/Q3/Q4 defaults confirmation*
