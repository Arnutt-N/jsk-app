# Live-Chat Remediation PRD — 6-Expert Review Panel

> Source: workflow wf_238fdb57-7a9. Verdict: APPROVE WITH CHANGES (drove PRD v1 -> v2). Generated 2026-06-22.

## คำตัดสินรวม

**APPROVE WITH CHANGES** — PRD ฉบับนี้แข็งแรงผิดปกติสำหรับเอกสารประเภท "แปลง audit เป็นแผน" แต่มี BLOCKER เชิงเทคนิค 1 กลุ่มและ over-claim 2 จุดหลักที่ต้องแก้ก่อนส่ง /prp-plan

- **Traceability เป็นจุดแข็งจริง**: Coverage auditor ยืนยัน 37/37 finding IDs (H1-H5, M1-M21, L1-L11) ถูก map ครบทุกข้อ ไม่มี missing, ไม่มี phantom ID — backbone นี้เชื่อถือได้ จึงไม่ใช่เหตุให้ block
- **แต่ "frontend-only / backend-unchanged" ไม่จริงทั้งหมด**: Technical reviewer พบว่า H2 (operator presence picker) ต้องแก้ backend จริง (presence ถูกส่ง send_personal ครั้งเดียวตอน auth ไม่มี broadcast) — และ PRD เองก็ขัดแย้งตัวเองในเรื่องนี้ (ยอมรับว่าอาจต้อง REST roster endpoint) ทำให้ headline "Feasibility HIGH / frontend-only" เป็น over-claim
- **A11y มีช่องโหว่ระดับ BLOCKER**: Accessibility lens พบ WCAG 2.2 AA criteria สำคัญ 4 ข้อ (SC 2.4.11 Focus Appearance, SC 1.4.3 Contrast, SC 4.1.3 Status Messages, prefers-reduced-motion guard) ที่ไม่อยู่ในเฟสใดเลย และ metric "axe=0" ให้ความมั่นใจเกินจริง (axe จับได้แค่ ~30-40% ของ WCAG)
- **Metrics ส่วนใหญ่เป็น output proxy ไม่ใช่ outcome** และ open question 2 ข้อ (offline transfer, SLA threshold) เป็น blocker ของ Phase 6 ที่ถูก mislabel — ทั้งหมดแก้ได้ในระดับเอกสาร ไม่ต้อง rewrite

---

## ผลตรวจ 2 คำกล่าวอ้างหลัก

### (a) Coverage 37/37 — ยืนยันแล้วว่าครบ ✅
Coverage auditor ตรวจ ID-by-ID เทียบ Phase table (บรรทัด 129-134), Phase Details (139-166), และ MoSCoW (77-85): **ทั้ง 37 IDs ถูก assign อย่างน้อย 1 เฟส, ไม่มี missing, ไม่มี phantom ID (ไม่มี M22+/L12+/H6+), และ severity arithmetic สอดคล้อง (5H/21M/11L=37)**. อย่างไรก็ตามมี **ความไม่สอดคล้องระหว่างตาราง MoSCoW กับ Phase table**: M4 หายจาก MoSCoW (อยู่แต่ใน Phase 1), M14 ถูกจัดทั้ง "Should" และ MVP พร้อมกัน (ขัดกันโดยตรง). สรุป: coverage ครบจริง แต่ priority mapping ยังไม่ clean

### (b) Frontend-only / backend-unchanged — ไม่จริงทั้งหมด ❌
Technical reviewer **ไม่ยืนยัน** claim นี้ พบหลักฐานขัดแย้ง:
- `ws_live_chat.py:178-182` ใช้ `send_personal()` ไม่ใช่ `broadcast_to_all()` — operator คนแรกไม่ได้รับ presence update เมื่อคนที่สอง login → roster ใน picker เป็น stale ตั้งแต่วินาทีแรก
- `websocket_manager.py:327-358` `get_online_admins()` คืนแค่ `{id, status, active_chats}` ไม่มี `display_name` → picker ต้อง secondary lookup จาก `/admin/users`
- PRD เองยอมรับ (บรรทัด 29, 48, 113) ว่าอาจต้อง REST roster endpoint

Red-team lens ยืนยันซ้ำ: "frontend-only" + "Feasibility HIGH" เป็น over-claim เพราะ capability ที่ user-facing ที่สุด (H2) มี backend dependency ที่ยังไม่ resolve. **สรุป: backend ต้องแก้จริงสำหรับ Phase 6 — claim นี้ต้องปรับ**

---

## BLOCKER (ต้องแก้ก่อนเริ่ม)

### B1. H2 ต้องแก้ backend — "frontend-only" สำหรับ Phase 6 เป็นเท็จ
**Lenses:** Technical (BLOCKER), Red-Team (MAJOR), Delivery (MAJOR risk)
**ปัญหา:** PRD อ้างว่า H2 แก้ได้แค่ "wire onPresenceUpdate" ฝั่ง frontend แต่ backend ส่ง presence_update ผ่าน `send_personal()` ครั้งเดียวตอน auth ไม่มี continuous broadcast เมื่อ operator join/leave ทำให้ roster stale เสมอ
**Fix:**
1. เลือกหนึ่งใน: (a) จำกัด Phase 6 transfer เป็น **online-only** แล้วประกาศ offline transfer = out of scope (ทำให้ frontend-only เป็นจริง) หรือ (b) เพิ่ม backend change เป็น **named dependency ของ Phase 6**: `broadcast_to_all(presence_update)` ใน `ws_live_chat.py` ทุกครั้งที่ register/disconnect เปลี่ยน + enrichment step lookup `display_name` จาก `/admin/users`
2. ปรับ headline จาก "Feasibility HIGH / frontend-only" → ระบุว่า Phase 6 feasibility = MEDIUM และมี backend dependency
3. ขยาย "What We're NOT Building" บรรทัด 29 ให้ครอบคลุม backend change 2 อย่าง ไม่ใช่แค่ offline roster
**Evidence:** `ws_live_chat.py:178-182` (send_personal); `websocket_manager.py:327-358` (schema ไม่มี display_name); `_redis_register_presence:441-458`

### B2. WCAG 2.2 AA criteria 4 ข้อหายจากทุกเฟส — metric "axe=0" ให้ความมั่นใจเกินจริง
**Lenses:** Accessibility (BLOCKER ×3), Red-Team (MINOR), Product (NIT)
**ปัญหา:** Phase ทั้งหมดไม่ครอบคลุม (1) **SC 2.4.11 Focus Appearance** — grep `focus-visible` ในทั้ง live-chat = 0 matches, ใช้ `focus:ring-brand-500/40` (opacity 40% contrast ต่ำ); (2) **SC 1.4.3 Color Contrast** — PRD ไม่กล่าวถึงเลยทั้งฉบับ; (3) **SC 4.1.3 Status Messages** — `ChatArea.tsx:263` วาง aria-live บน scrollable virtualization container (anti-pattern); (4) **prefers-reduced-motion** — `animate-*` ใช้ 10+ จุด, ไม่มี `useReducedMotion` hook, globals.css media query ถูก Tailwind override. metric "axe=0" จับได้แค่ ~30-40% ของ WCAG
**Fix:**
1. เพิ่มงาน explicit: Focus Appearance audit (แทน `focus:ring-brand-500/40` ด้วย `focus-visible:ring-2 focus-visible:ring-brand-600`), Color Contrast audit (4.5:1 text / 3:1 UI), สร้าง `useReducedMotion` hook ใน Phase 4
2. แก้ aria-live: messages container → `role="log" aria-live="polite" aria-relevant="additions"` แยก live region สำหรับ typing/connection/session
3. ปรับ Success Metrics: axe = filter แรกเท่านั้น ไม่ใช่เกณฑ์เดียว เพิ่ม manual checklist ระบุ SC ที่ตรวจ
**Evidence:** grep `focus-visible` = 0; `MessageInput.tsx:191`; `ChatArea.tsx:263`; grep `animate-ping|pulse|spin|bounce` = 10+; `globals.css:744-753`

---

## MAJOR (ควรแก้)

### กลุ่ม 1 — ความถูกต้องเชิงเทคนิคของ Evidence
- **M-A: H3 useMemo line citation ผิด** (Technical MAJOR). PRD อ้าง `LiveChatContext.tsx:759-793 ไม่ห่อ useMemo` แต่จริง `state` object (731-757) และ `selectedConversation` (712) ถูก useMemo แล้ว — ปัญหาจริงคือ **value object (759-791) เป็น object literal ใหม่ทุก render**. Fix: แก้ Evidence ให้ชี้ที่ value object ทั้งก้อน ไม่ใช่ "state ไม่ห่อ" เพื่อไม่ให้ implementer หา bug ผิดที่
- **M-B: transfer_session ใช้ ValueError ไม่ใช่ HTTPException** (Technical NIT→ยกระดับ). `live_chat_service.py:375-378` raise ValueError (กลายเป็น 500) ถ้า Phase 6 ใช้ transfer flow ต้องตรวจ endpoint แปลงเป็น 400/403

### กลุ่ม 2 — A11y scope กว้างกว่าที่ documented (Accessibility ทั้งหมด MAJOR)
- **H1 scope แคบไป**: PRD ระบุแค่ Send + Expand แต่มี icon-only buttons อีก 6+ ตัว (Emoji/Stickers/Upload/Quick Replies/Canned/Sound) ใช้แค่ `title` (NVDA มักไม่อ่าน). Fix: ครอบคลุมทุกปุ่ม toolbar + `aria-expanded` สำหรับ toggle
- **M8 CreateChatSheet**: grep `htmlFor` = 0, error เป็น `<p>` ไม่มี `role="alert"`. Fix: เพิ่ม id/htmlFor ทุก label + role=alert
- **H5 CustomerPanel mobile**: `LiveChatShell.tsx:64-76` mobile overlay เป็น div+onClick ไม่มี role/aria-modal/focus trap/Escape. Fix: สร้าง MobileDrawer wrapper (role=dialog) ใช้ TransferDialog เป็น reference pattern
- **SC 2.5.8 Target Size**: PRD ใช้ 40px (best practice) แต่ requirement จริงคือ 24×24px; `NotificationToast.tsx:82` (p-0.5 = 22px) และ `MessageInput.tsx:195` (p-1 = 20px) ไม่ผ่าน

### กลุ่ม 3 — Parallelism / file collision ต่ำกว่าความจริง
**Lenses:** Technical (MAJOR), Delivery (MAJOR), Red-Team (MINOR)
PRD อ้าง "จุดทับซ้อนเดียว MessageInput/CustomerPanel (P2 vs P4)" แต่จริง: **CustomerPanel แตะ 3 เฟส (2,3,5), MessageInput แตะ 3 เฟส (1,2,4)** และ split findings M5/M11/M21 กระจายข้ามเฟส. Fix: ระบุ file ownership ต่อเฟส + branch strategy (เฟส dependent rebase จาก owner phase) + serialize เฟสที่ชนไฟล์เดียวกัน แทน claim parallel เกินจริง

### กลุ่ม 4 — Metrics เป็น output proxy ไม่ใช่ outcome
**Lenses:** Product (MAJOR ×2), Red-Team (MAJOR ×3), Delivery (MINOR)
- **Success Metrics ไม่มี outcome ผูก pain**: ไม่มีตัววัด speed / claim-contention / wait-time ตามที่ Problem Statement อ้าง (operator ช้า/ผิดพลาดเงียบ/ลูกค้ารอ). Fix: เพิ่ม 1-2 outcome metric (เวลา claim+ส่งข้อความแรกด้วย keyboard ก่อน/หลัง, จำนวน claim-contention/สัปดาห์) หรือประกาศตรงๆ ว่า outcome วัดใน follow-up
- **"re-renders reduced" / "axe ลดลงชัด" non-falsifiable**: ไม่มี baseline, threshold, scenario. Fix: นิยาม scenario เจาะจง (พิมพ์ 1 ตัวอักษรใน MessageInput → CustomerPanel render 0 ครั้ง), capture baseline เป็น first task ของ Phase 1
- **Key Hypothesis ทดสอบได้ครึ่งเดียว**: ครึ่ง "ลดความผิดพลาด multi-operator" ไม่มี "We'll know" ที่ falsify ได้. Fix: เพิ่มเงื่อนไข 2-client test (operator 2 เห็น already-claimed <1s)
- **"37/37 closed via checklist"**: วัด closure ไม่ใช่ correctness. Fix: ผูกแต่ละ closure กับ verification metric ของมัน + "no regression in vitest/Playwright"

### กลุ่ม 5 — Open Questions เป็น Phase-6 blocker ที่ถูก mislabel
**Lenses:** Red-Team (MAJOR), Accessibility (MAJOR), Product (MINOR), Delivery (NIT)
Q1 (offline transfer?) ตัดสินสถาปัตยกรรม H2 + backend dependency; Q2 (SLA threshold M15) จำเป็นต่อ amber/red badge; Q4 (screen reader target) จำเป็นต่อ validate Phase 2. แต่ Phase 6 depends แค่ "2,5" ไม่มี gate. Fix: tag Q1/Q2 = "Blocks Phase 6", Q4 = "Blocks Phase 2", ให้ default ชัด (online-only; amber=5m/red=15m placeholder; NVDA+Chrome baseline)

---

## MINOR / NIT (ย่อ)

- **ตัวเลข 37 off-by-one** (Product MINOR): "audit พบ 37" vs "ตัด false positive 4 → เหลือ 37" → ควรเขียน "พบ 41 → verify → เหลือ 37 (5H/21M/11L)"
- **MoSCoW ไม่ครบ/ขัดแย้ง** (Coverage MAJOR→จัดที่นี่เพราะเอกสารล้วน): M4 หายจาก MoSCoW; M14 เป็นทั้ง Should+MVP — เลือกอย่างเดียว
- **Phase 6 ผสม Must+Could** (Coverage MINOR): H2/M16/M17 (Must) ปนกับ M18/M19/L10 (Could) — แยก 6a/6b หรือใส่ cut-line
- **H2 เป็น HIGH เดียวที่เลื่อนไป Phase 6** (Coverage MINOR): ขัดกับ "quick wins first" — เพิ่ม justification + interim mitigation (guard raw ID input ใน Phase 1)
- **split-ID notation ไม่เป็นทางการ** (Coverage NIT, Red-Team MINOR): M5(ต่อ)/M11-motion/M11-abort/M21 — formalize เป็น M11a/M11b ให้ /prp-plan parse ได้
- **Phase 6 depends ควรรวม Phase 3** (Delivery MINOR): M15 badge สี/M20 ใช้ token จาก Phase 3 มิฉะนั้น hardcode สี
- **virtualization + AnimatePresence** (Delivery MINOR): ถ้า message list windowed, AnimatePresence อาจชน virtualizer measurement — จำกัด AnimatePresence เฉพาะ toast/dropdown
- **grep token scope แคบ** (Red-Team NIT): metric grep แค่ analytics+CustomerPanel แต่ Phase 3/4 แตะ avatar/emoji cells ที่อื่น — ขยายเป็น `live-chat/**`
- **audit provenance ไม่ auditable** (Red-Team MINOR): แสดง file:line แค่ 3/37 — link full audit report
- **WCAG metric ไม่ระบุ SR/tool** (Product NIT, Accessibility): ผูก screen reader target ก่อน Phase 2
- **listbox keyboard pattern** (Accessibility NIT): ConversationList role=listbox แต่ไม่มี Arrow key handler
- **M9 Notes textarea** (Accessibility MINOR): ไม่มี id/htmlFor/aria-label + dependency กับ M20 persist

---

## จุดแข็งของ PRD

ทั้ง 6 lenses เห็นตรงกันว่า PRD นี้แข็งแรงกว่ามาตรฐานทั่วไป:
- **Evidence-based**: findings มี file:line จริง verify ได้ (H1 `MessageInput.tsx:204-213`); backend guards cited แม่นยำ (`claim_session:279-296` atomic UPDATE+rowcount, `_require_active_session_owner:343-361`) — Technical lens ยืนยันถูกต้อง
- **Severity ถูก adversarially down-graded**: ตัด false positive 4 ข้อ ไม่รับ severity จาก audit ดิบ — แสดง skepticism ต่อ source ตัวเอง
- **Traceability ครบ 37/37, zero phantom** — backbone เชื่อถือได้
- **Phasing เคารพ risk**: Phase 7 (800-line provider refactor, Likelihood H) เลื่อนท้ายสุดถูกต้อง; MVP (Phase 1) surgical และ shippable จริง
- **Anti-goal คม**: ไม่แก้ backend (มีหลักฐาน), ไม่ rewrite, ไม่เพิ่ม AI/sentiment — ปิด scope creep
- **No-dependency claims ตรวจได้**: motion ^12.38.0 มีแล้ว, AnimatePresence ใช้ใน 12 files, tokens ใน globals.css
- **Honest framing**: ระบุตรงว่า findings เป็น "hygiene ไม่ใช่ฟีเจอร์ล้ำ" เทียบ Intercom/Zendesk

---

## คะแนนรายมิติ

| Lens | Verdict | สรุปสั้น |
|------|---------|----------|
| Product Strategist | approve-with-changes | Problem/User/JTBD แข็งแรง แต่ metrics เป็น output proxy ไม่ผูก outcome; ตัวเลข 37 off-by-one |
| Technical / Architecture | **needs-work** | H2 ต้องแก้ backend (BLOCKER); H3 line citation ผิด; parallelism optimistic เกินไป |
| Accessibility (WCAG 2.2 AA) | **needs-work** | WCAG 4 criteria หาย (3 BLOCKER); axe=0 over-confident; H1/M8/H5 scope กว้างกว่า documented |
| Delivery / Planning | approve-with-changes | Phasing sound, MVP shippable; แต่ไม่มี estimate, ขาด baseline, risk register ไม่ครบ, file collision ต่ำเกินจริง |
| Coverage & Traceability | approve-with-changes | 37/37 ครบ, zero phantom (จุดแข็งจริง); แต่ MoSCoW vs Phase ขัดกัน (M4 หาย, M14 double-classified) |
| Adversarial Red-Team | approve-with-changes | grounded ผิดปกติ แต่ over-claim 3 จุด: frontend-only, non-falsifiable metrics, open-questions-ที่จริงเป็น-blocker |

---

## คำแนะนำขั้นต่อไป

**ต้องตอบ open question + แก้ PRD ก่อน ยังไม่ไป /prp-plan ทันที** ตามลำดับ:

1. **ตัดสิน Q1 (offline transfer) ก่อนทุกอย่าง** — เพราะกำหนดว่า B1 จะแก้แบบ (a) online-only หรือ (b) เพิ่ม backend dependency แนะนำ online-only เพื่อรักษา frontend-only ให้เป็นจริง ถ้าเลือก online-only ให้ปรับ headline + scope ทันที
2. **แก้ B1 + B2** (backend dependency ของ Phase 6 และ WCAG 4 criteria + reduced-motion) — สอง BLOCKER นี้ต้อง resolve ก่อน plan
3. **แก้ MAJOR กลุ่ม 1-2** (H3 citation, H1/H5/M8 scope, target size) เพราะกระทบ task breakdown ใน /prp-plan โดยตรง
4. **ตัดสิน Q2 (SLA threshold) + Q4 (NVDA+Chrome baseline)** พร้อม default — mark เป็น Phase entry blocker
5. **ปรับ MoSCoW/metrics/parallelism** (กลุ่ม 3-5) — ทำพร้อมข้อ 2-3 ได้

หลังแก้ BLOCKER + MAJOR กลุ่ม 1-2 และตอบ Q1/Q2/Q4 แล้ว → PRD พร้อมส่ง **/prp-plan**. MINOR/NIT ที่เหลือ fold เข้า plan ได้ ไม่ต้อง block
