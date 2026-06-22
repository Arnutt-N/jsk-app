# Live-Chat 8 PRP Plans — 12-Expert Review Panel

> Source: workflow wf_634ea6c6-886 (8 per-plan + 3 cross-cutting). Verdict: READY WITH FIXES after 7 BLOCKERs. snippet faithfulness 99%. Generated 2026-06-22.

# คำตัดสินรวมและการตรวจสอบ Review Panel — Live-Chat Remediation (Phase 1–8)

## 1. คำตัดสินรวม

**Verdict: NOT READY (READY WITH FIXES หลังปิด 4 BLOCKER)**

เหตุผลหลัก: ในระดับ per-plan แผนทั้ง 8 เฟสมีคุณภาพสูงมาก (snippet faithfulness 96/97 = 99% ถูกต้อง, ทุกเฟสได้ verdict ready-with-fixes) ปัญหาเกือบทั้งหมดในระดับ per-plan เป็น MAJOR/MINOR ที่แก้ได้ด้วยการเพิ่มคำสั่งให้ชัด ไม่ใช่ rework เชิงสถาปัตยกรรม **แต่** การตรวจ cross-cutting เปิดเผยปัญหาเชิงโครงสร้าง 6 BLOCKER ที่ทำให้ "implement ตามลำดับตอนนี้ไม่ได้":

- 2 BLOCKER จาก conflict review: ไฟล์ `useConversations.ts`, `ConversationItem.tsx`, `ConversationList.tsx` ถูกแก้โดย 4–5 เฟส **โดยไม่อยู่ใน PRD File Ownership table เลย** และ Phase 6 เขียนแผนโดย assume pre-Phase-5 state (จะ fail ทันทีที่ import เพราะ hook ถูก rename + เปลี่ยน signature ไปแล้ว)
- 4 BLOCKER จาก testing review: ไม่มี Playwright spec ใดแตะ `/admin/live-chat` เลย แต่ทุกเฟสอ้าง "smoke ผ่าน / no regression"; finding ความเสี่ยงสูง (H3 memoization, M16 claim contention, Phase 8 ack-timeout) ไม่มี automated test พิสูจน์
- 1 BLOCKER ที่ตรวจพบเพิ่มจากการ cross-check: **Phase 8 contract test กำหนด 31 keys แต่ Phase 1 M3 ลบ `state` field ออกจาก value object** → contract ที่ถูกต้องคือ 30 keys ไม่ใช่ 31 (ดูรายละเอียด BLOCKER-7)

แผนเหล่านี้ "พร้อมเขียนโค้ด" ในระดับเฟสเดี่ยว แต่ "ยังไม่พร้อม orchestrate เป็นชุด" จนกว่าจะปิด ownership table + test baseline ก่อน

---

## 2. 3 การตรวจหลัก

### (1) Snippet / Pattern Faithfulness — 96/97 verified ถูกต้อง (99%)

นี่คือจุดแข็งที่สุดของทั้ง panel รวม snippetCheck ทุกเฟส:

| Plan | checked | accurate | wrong |
|------|---------|----------|-------|
| Phase 1 | 9 | 9 | 0 |
| Phase 2 | 14 | 14 | 0 |
| Phase 3 | 9 | 8 | **1** |
| Phase 4 | 14 | 14 | 0 |
| Phase 5 | 12 | 11 | **1** |
| Phase 6 | 6 | 6 | 0 |
| Phase 7 | 14 | 14 | 0 |
| Phase 8 | 8 | 8 | 0 |
| **รวม** | **86** | **84** | **2** |

**2 รายการที่ผิด (อันตรายที่สุด — ต้องแก้ก่อน implement):**

1. **Phase 3 / Pattern 4 + Task 1 GOTCHA (รายงานผิดเชิงเหตุผล ไม่ใช่เลขบรรทัด):** อ้างว่า `--text-xs..3xl` ถูก reference ผ่าน `@theme` แต่ความจริง globals.css **ไม่มี `@theme` inline block** — fluid-type tokens อยู่ใน `:root` (231-238) เท่านั้น. `text-xs` ทำงานเพราะเป็น Tailwind v4 **default token** ที่ `:root` override ค่า ส่วน `--text-2xs` เป็นชื่อใหม่ที่ไม่มี default utility **จึงต้องประกาศใน `@theme`** ถ้า dev เชื่อเหตุผลผิดแล้วใส่ใน `:root` เฉย ๆ จะไม่ได้ class เลย (silent failure). Action ถูก แต่เหตุผลผิด → ต้องเขียน rationale ใหม่

2. **Phase 5 / Task 3 step 2 (M13) — double-count งานที่ทำเสร็จแล้ว:** แผนเสนอเพิ่ม `optionId` และ `formattedTime` props เป็นงานใหม่ แต่ของจริง ConversationList.tsx:220,223 **ส่งทั้งสอง prop อยู่แล้ว** เหลือแค่ `onClick/onMenuClick` (224-228) ที่ต้องเปลี่ยนเป็น `onSelect/onMenuToggle`. ถ้า dev ทำตามจะ duplicate งานและสับสน line reference

### (2) Cross-Plan Coverage — ครบทุก ID (no orphan) แต่มี ownership conflict

ครอบคลุม H1–H5, M1–M21 (รวม split M11a/M11b), L1–L11, W1–W5 ครบถ้วน **ไม่มี ID ใดไร้เจ้าของ**. แต่พบ **double-ownership / scope overlap** ที่ยังไม่ถูกแก้:

- **W3 (SC 4.1.3):** ถูกอ้างเป็นเจ้าของทั้ง Phase 1 (`H4+W3`) และ Phase 2 (Task 6) — PRD phase table ระบุ W3 อยู่ Phase 2 เท่านั้น, Phase 1 ควรเป็น H4 ล้วน. ทั้งสองแก้ aria-live ใน ChatArea.tsx ไฟล์เดียวกัน → เสี่ยง nested live region (double-announce)
- **M21:** split a11y(P2)/motion(P4) จริง แต่ PRD ไม่ formalize เป็น M21a/M21b เหมือน M11a/M11b → `focus-ring` และ `break-words` ถูกอ้างทั้งสองเฟส
- **W1@MessageInput:191:** ไม่มีเฟสไหน commit ทำจริง (P1 ห้ามแตะ, P2 กำกวม, P4 สมมติว่ามีคนทำแล้ว) → **เสี่ยงตกหล่น**
- **CustomerPanel stat grid:** P3 (M6) และ P7 (M20) ต่างสั่งลบ grid เดียวกัน → redundant + line drift

### (3) Cross-Phase File Conflicts — พบ incompatible same-file edits จริง (BLOCKER)

ไฟล์ที่ 4–5 เฟสแตะแต่ **ไม่อยู่ใน PRD File Ownership table** = แหล่ง conflict ที่ไม่มีกฎคุม:

| ไฟล์ | เฟสที่แตะ | ความรุนแรง |
|------|-----------|------------|
| `useConversations.ts` | P5 (rename→useConversationStats), P6 (assume เก่า) | **BLOCKER** |
| `ConversationItem.tsx` | P1, P3, P4, P5, P6 (5 เฟส) | **BLOCKER** |
| `ConversationList.tsx` | P1, P3, P4, P5, P6 | **BLOCKER (ร่วม)** |
| `MessageBubble.tsx` | P4 (isNew), P5 (formattedTime) | MINOR (additive) |
| `ChatArea.tsx` | P1, P2 (live region ทับ) | MINOR–MAJOR |
| `globals.css` | P3 owner, P6/P7 แอบเพิ่ม token | MAJOR |
| `CustomerPanel.tsx` | P2 owner, P3/P7 ลบ stat grid ซ้ำ | MINOR |

---

## 3. BLOCKER (7 รายการ — ต้องปิดก่อน implement)

**BLOCKER-1 — `useConversations.ts` P5↔P6 incompatible (conflict)**
Phase 5 rename `useConversations`→`useConversationStats` (เปลี่ยน signature 2 param, เพิ่ม `closedCount`, ใส่ useMemo). Phase 6 รัน *หลัง* P5 แต่ Task 12 เขียนแผนอ้างชื่อ/signature/return เก่า (3 param sortBy, ไม่มี closedCount) → import fail ทันที. **แก้:** ใส่ hook นี้ใน ownership table (owner=P5); Phase 6 target `useConversationStats(conversations, query, sortBy)` + return shape ใหม่; หรือย้าย M15 sort ไปอยู่ P5 ตั้งแต่แรก

**BLOCKER-2 — `ConversationItem.tsx` prop signature P5↔P6 (conflict)**
P5 เปลี่ยน prop เป็น breaking: `onClick→onSelect(id)`, `onMenuClick→onMenuToggle(id)`. P6 (Task 8/11) แก้ ConversationItem โดยอ้าง prop เดิม ไม่กล่าวถึง signature ใหม่. ไฟล์นี้ถูก 5 เฟสแตะแต่ไม่อยู่ใน ownership table. **แก้:** เพิ่ม ConversationItem+ConversationList เข้า ownership table พร้อม owner-chain P1→P3→P4→P5→P6 (serialize, ห้าม merge ขนาน); P6 วาง badge/contender บน id-based signature ของ P5

**BLOCKER-3 — ไม่มี Playwright spec แตะ /admin/live-chat (testing, ทุกเฟส)**
ทุกเฟสใช้ `npx playwright test` + EXPECT "smoke ผ่าน" แต่ e2e/ ไม่มี spec live-chat เลย → "no regression" ตรวจสอบไม่ได้. **แก้:** สร้าง `e2e/live-chat-smoke.spec.ts` (login→list โหลด→select→ChatArea render→MessageInput accessible→transfer dialog role) **ก่อนเริ่ม Phase 1** เป็น regression baseline จริง

**BLOCKER-4 — H3 memoization ไม่มี automated test (testing, P1)**
อ้างว่า typing 1 ตัว → re-render = 0 แต่ตรวจด้วย Profiler manual เท่านั้น. **แก้:** `LiveChatContextMemo.test.tsx` — spy render count ของ ConversationList ผ่าน React.memo, dispatch `setInputText('a')`, assert render count === 1

**BLOCKER-5 — M16 claim contention ไม่มี automated test (testing, P6)**
concurrent scenario พึ่ง 2-client manual ที่ reproduce ไม่สม่ำเสมอ. **แก้:** `claimContention.test.ts` — mock `onSessionClaimed` กับ operatorId ≠ currentUser → assert `claimContenders[lineUserId]` set; fire `onSessionClosed` → assert cleared; mark 2-client test เป็น required (ไม่ใช่ optional)

**BLOCKER-6 — Phase 8 ack-timeout test ครอบไม่ครบ race (testing, P8)**
ขาด: ack มาหลัง timeout (ไม่ควร set failed), retry tempId ใหม่, HTTP fallback ต้องคง `Promise.all` parallel (ไม่ revert งาน P5). **แก้:** เพิ่ม 3 cases ใน `useMessageFlow.test.tsx` ตามรายละเอียด testing review

**BLOCKER-7 — Phase 8 contract key count ขัดกับ Phase 1 M3 (cross-check)**
Phase 8 Task 0 list **31 keys รวม `state`** แต่ Phase 1 M3 **ลบ `state` field ออกจาก value object**. ถ้า Phase 8 baseline ถูก capture หลัง P1 merge contract ที่ถูกต้องคือ **30 keys**. นอกจากนี้ contract test ที่เช็คแค่ `Object.keys().length` จะ pass ด้วย undefined values ทุก key. **แก้:** ยืนยัน key count หลัง M3 (น่าจะ 30); เปลี่ยน assertion เป็น existence + type (`expect(typeof value.sendMessage).toBe('function')`) + negative assertion (ไม่มี extra key)

---

## 4. MAJOR (จัดกลุ่ม, dedup แล้ว)

**กลุ่ม A — Hardcoded color / token compliance หลุด gate (validation จะ false-fail)**
- **Phase 1 / M5 (Task 6):** ChatArea connection-warning bar :310-329 มี amber-* hardcoded ที่ grep gate จะ flag แต่ Task 6 ไม่แตะ → แก้ map เป็น token หรือ exclude block ใน grep
- **Phase 6 / Task 7 (H2):** rewrite TransferDialog จะ carry slate-*/amber-* เดิมมา → fail gate ของแผนเอง. ต้องเพิ่ม IMPLEMENT bullet แปลงเป็น token (สอดคล้อง traceability NIT: TransferDialog token-cleanup = Phase 6 ไม่ใช่ Phase 1)
- **Phase 3 / grep gate:** success grep จะ flag hex ใน Recharts var() fallback ที่แผนเองสร้าง → EXPECT:0 เป็นไปไม่ได้ ต้อง refine ให้ exclude var() fallback
- **Phase 4 / transition-all grep:** whole-directory grep EXPECT:0 จะ always-fail เพราะ 6 ไฟล์ out-of-scope ยังมี transition-all → scope grep เป็น 4 ไฟล์ in-scope
- **Phase 6 / globals.css token (M15):** waiting badge ใช้ `text-warning-text`/`text-danger-text` ที่ยังไม่ยืนยันว่ามีใน @theme (P1 ยืนยันแค่ online/away/offline/danger/warning/info) → silent dependency บน P3, อาจต้องแตะ globals.css นอกโควตา owner

**กลุ่ม B — Data semantics / logic ผิด**
- **Phase 6 / H2 (Task 3/6/BE-3):** offline operator ใช้ `workload.active_tasks` (= count open ServiceRequests) แต่ label เป็น "N chats" — คนละค่ากับ live-chat active_chats → operator ตัดสินใจ transfer ผิด. ต้อง relabel หรือไม่แสดงสำหรับ offline
- **Phase 6 / M16 (Task 8):** `onSessionClaimed` ไม่ reset `claiming` flag ของฝ่ายแพ้ — ถ้า loser ได้ SESSION_CLAIMED (ไม่ใช่ ERROR) ปุ่มค้าง "Claiming...". ต้อง reset เมื่อ claimed operator_id ≠ currentUser
- **Phase 5 / M13 (Task 3):** ConversationItem มี 2 menu mechanism (local `menuOpen` + store `onMenuClick`); rename ต้องคง `setMenuOpen` + `e.stopPropagation()` ไว้ มิฉะนั้น dropdown พัง

**กลุ่ม C — Test coverage gap (จาก testing review)**
- **Phase 2 / H5:** ขาด focus-restore test (MobileDrawer close → focus กลับ trigger)
- **Phase 4 / W4:** ขาด test ว่า consumer เคารพ reduced=true (TypingIndicator ไม่มี animate-typing-bounce, scrollIntoView behavior:'auto')
- **Phase 5 / M12:** edge case ขาด (session.status undefined, tags=[], query whitespace)
- **Phase 3:** ไม่มี visual regression screenshot (web/testing.md priority #1) สำหรับ analytics rebuild light+dark
- **Phase 6 / BE-4:** ขาด concrete mock pattern, `@audit_action` อาจ require DB session → test fail ด้วย SQLAlchemy error ไม่ใช่ assert mapping

**กลุ่ม D — Self-contradiction / ambiguity ในแผน (single-pass risk)**
- **Phase 8 / Task 4 (useChatRoom):** IMPLEMENT บอกย้าย `useLiveChatSocket` เข้า hook แต่ GOTCHA บอกเก็บไว้ใน provider — ขัดกันเอง, dev ทำตาม IMPLEMENT จะสร้าง circular dep. ต้องเขียน IMPLEMENT ใหม่ให้ socket อยู่ provider, hook รับ params
- **Phase 8 / onConnectionChange:** `wasOffline` อ่าน wsStatus STATE (ไม่ใช่ ref) + config ต้องเป็น per-render plain object — ถ้า memoize จะ regress reconnect toast. ต้องเพิ่ม GOTCHA
- **Phase 4 / Task 6 step 5:** prose มี Date.now() approach ที่ขีดฆ่ากลางประโยค → garbled, ต้องเขียน pseudo-code ใหม่
- **Phase 4 / W4 premise:** อ้างว่า media query ถูก animate-* override (ผิด — `!important` universal selector ชนะ Tailwind อยู่แล้ว) → hook justified แต่ rationale overstate

**กลุ่ม E — Test props/contract under-specified**
- **Phase 1 / Task 9:** MessageInput ต้อง 13 props + GOTCHA สับสน store state กับ props (showCannedPicker/soundEnabled เป็น props ไม่ใช่ store) → enumerate ให้ครบ
- **Phase 7 / Task 4-5:** NotificationToast onSelect render site = LiveChatShell.tsx:33 (ชัดเจน) แต่แผนเขียนกำกวม "likely page or layout" → ระบุ explicit

---

## 5. MINOR / NIT (ย่อ)

**MINOR:** P1 markRead client-only revert risk; P1 role=log placement vs early-return; P3 padding p-2.5 vs p-3 mismatch; P3 StatCard accent ไม่ dark-aware; P5 closedCount filterStatus useMemo ต้องคงไว้; P5 Task 8 single-pass loop risk>reward ต่ำ (ใช้ fallback); P5 API_BASE dep ผูกกับ Task 8 ordering; P6 per-row setInterval(30s) churn (ใช้ shared tick); P6 focus-trap <details> advanced toggle; P7 mutual-exclusivity closeAllPickers line ref ผิด (:188 ไม่ใช่ :68); P7 localStorage try/catch ไม่ครบ (mirror sources ไม่มี); P7 fake timers act() setup; P8 retryMessage/handleMessageFailed signature mismatch; cross: M14 markRead prop chain ↔ P5; useConversations P5↔P6 cross-ref.

**NIT:** P1 aria-pressed=muted ความหมายกำกวม; P1/P3/P4/P8 line-ref off-by-one หลายจุด (175-195, 743-753, Task7→Task8); P2 hex #22c35e→#22c55e; P5 useWebSocket callback over-hedge; P8 ChatArea destructure 18→20 members; P8 firstLoadRef dead state; P6 circular-import fork ยังเปิด.

---

## 6. Scorecard ต่อแผน

| Plan | verdict | confidence | snippet (accurate/checked) | #issues |
|------|---------|-----------|----------------------------|---------|
| Phase 1 — Quick Wins | ready-with-fixes | 8 | 9/9 (100%) | 6 |
| Phase 2 — A11y Compliance | ready-with-fixes | 8 | 14/14 (100%) | 6 |
| Phase 3 — Design System Unify | ready-with-fixes | 7 | 8/9 (89%) | 6 |
| Phase 4 — Motion & Polish | ready-with-fixes | 8 | 14/14 (100%) | 7 |
| Phase 5 — React/Perf Hardening | ready-with-fixes | 7 | 11/12 (92%) | 8 |
| Phase 6 — Operator UX + backend | ready-with-fixes | 7 | 6/6 (100%) | 7 |
| Phase 7 — Operator UX (Could) | ready-with-fixes | 8 | 14/14 (100%) | 7 |
| Phase 8 — Provider Refactor | ready-with-fixes | 8 | 8/8 (100%) | 6 |
| **Cross: Traceability** | pass-with-fixes | — | — | 8 |
| **Cross: Conflict** | pass-with-fixes | — | — | 10 (2 BLOCKER) |
| **Cross: Testing** | **fail** | — | — | 15 (4 BLOCKER) |

---

## 7. จุดแข็ง

- **Snippet fidelity ระดับยอดเยี่ยม (99%):** แทบทุก file:line ที่อ้างตรงกับโค้ดจริง — ลดความเสี่ยง "แก้ผิดที่" ได้มาก. โดยเฉพาะ Phase 2/4/6/7/8 ได้ 100%
- **โครงสร้าง task สม่ำเสมอ:** ทุก task มี ACTION/IMPLEMENT/MIRROR/IMPORTS/GOTCHA/VALIDATE — dev implement ได้โดยไม่ต้อง re-search
- **H3 value-memo boundary คุมถูกต้อง 3 เฟส:** มีแค่ P1 แก้ value memo, P5 และ P8 ระบุชัด "ห้ามแตะ" — ป้องกัน scope creep
- **Coverage ครบ no orphan:** ทุก finding ID มี task จริงรองรับ ไม่ใช่กล่าวถึงลอย ๆ
- **Self-aware เรื่อง trap:** virtualized role=log double-announce, AnimatePresence บน virtual list, circular dep ใน provider, useReducedMotion SSR hydration — ถูก pre-identify พร้อม mitigation
- **NOT-Building sections มีวินัย:** แต่ละเฟส fence ขอบเขตชัด ลด scope creep
- **Validation commands ถูกต้องตาม CLAUDE.md** (tsc/eslint/vitest/build/playwright จาก frontend/, pytest จาก backend WSL)

---

## 8. คำแนะนำขั้นต่อไป

### ขั้นที่ 0 — ปิด BLOCKER ก่อน implement ใด ๆ (orchestration prerequisites)
1. **อัปเดต PRD File Ownership table:** เพิ่ม `useConversations.ts`, `ConversationItem.tsx`, `ConversationList.tsx`, `MessageBubble.tsx` พร้อม owner-chain serialize ตาม DAG (P1→P3→P4→P5→P6) — ปิด BLOCKER-1, BLOCKER-2
2. **สร้าง `e2e/live-chat-smoke.spec.ts` baseline** ก่อนแตะโค้ดเฟสใด — ปิด BLOCKER-3
3. **แก้ Phase 6 Task 12** ให้อ้าง `useConversationStats` (ชื่อใหม่หลัง P5) — ปิด BLOCKER-1
4. **ยืนยัน contract key count ของ Phase 8 = 30 (ไม่ใช่ 31)** หลัง M3 ลบ `state`; เปลี่ยน assertion เป็น type-check — ปิด BLOCKER-7
5. **เพิ่ม automated test:** H3 memo (P1), claim contention (P6), ack-timeout race (P8) — ปิด BLOCKER-4/5/6
6. **ตัดสิน W3 ownership:** Phase 1 = H4 ล้วน (messages role=log), Phase 2 = connection/typing region แยก (ไม่แตะ messages)

### พร้อม implement ทันทีหลังแก้ per-plan issue เล็กน้อย (ไม่มี BLOCKER ผูกพัน)
- **Phase 1** (ปิด MAJOR amber-bar + Task 9 props ก่อน) — เป็น foundation, ทำก่อนสุด
- **Phase 2** (ปิด W3 ownership) — ทำหลัง P1
- **Phase 8** (ปิด BLOCKER-7 contract count + Task 4 contradiction) — pure refactor, แยกอิสระได้

### ต้องแก้ cross-phase ก่อน (ห้าม implement จนกว่า ownership table เสร็จ)
- **Phase 5** — owns `useConversationStats`, ต้องเป็น authority ของ hook rename ก่อน P6
- **Phase 6** — ขึ้นกับ P5 (hook), P3 (token), มี data-semantics bug (active_tasks≠chats) ต้องแก้ก่อน
- **Phase 3** — owns globals.css token, P6/P7 ขึ้นกับ token ที่ P3 ต้องเพิ่ม

### ลำดับ implement ที่แนะนำ (ตาม DAG + ownership chain)
```
0. Prerequisites (ownership table + e2e baseline + BLOCKER tests)
1. Phase 1 (foundation: ChatArea/MessageInput/store/ConversationItem owner)
2. Phase 2 (a11y) ∥ Phase 8 (refactor) — แยกอิสระ
3. Phase 3 (design tokens — globals.css owner, ต้องก่อน P6/P7)
4. Phase 4 (motion) ∥ Phase 5 (perf — owns useConversationStats) — แต่ serialize ConversationItem/MessageBubble
5. Phase 6 (operator UX + backend — ขึ้นกับ P3 token + P5 hook)
6. Phase 7 (Could — ขึ้นกับ P3 stat-grid removal)
```
หมายเหตุ: P4∥P5 และ P2∥P8 รันขนานได้ระดับเฟส **แต่** ไฟล์ร่วม (ConversationItem, MessageBubble, ChatArea) ต้อง serialize-rebase ไม่ merge ขนาน — นี่คือเงื่อนไขสำคัญที่ ownership table ต้องระบุให้ชัดก่อนเริ่ม
