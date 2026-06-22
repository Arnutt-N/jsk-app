# Live-Chat Console — Multi-Expert ECC Frontend Audit

> Source: workflow wf_d4b6b46a-e89 (7 lenses, 33 agents, adversarially verify-filtered). 5 HIGH / 21 MEDIUM / 11 LOW. Generated 2026-06-22.

I'll consolidate this multi-expert audit. Let me first apply the filtering rules (drop `verified.isReal === false`, apply `adjustedSeverity`, dedupe across lenses), then write the report.

Let me work through the data systematically.

**Filtering analysis:**

DROPPED (isReal === false):
- "Stale closure: onConnectionChange captures wsStatus" (React arch) — isReal false → but note it reappears as LOW in performance lens
- "Context setters are thin wrappers over getStore()" (React arch) — isReal false
- "Effect chain: selectedId change triggers two sequential effects" (React arch) — isReal false
- "Virtualization activates only above 200 messages" (performance) — isReal false

SEVERITY ADJUSTMENTS (verified CRITICAL/HIGH):
- Analytics off-system design: HIGH→MEDIUM
- Toolbar hit area: HIGH→MEDIUM
- transition-all: HIGH→LOW
- No exit animation: HIGH→MEDIUM
- aria-live chat-log: CRITICAL→HIGH
- CustomerPanel mobile overlay no dialog: CRITICAL→HIGH
- CreateChatSheet labels: HIGH→MEDIUM
- Toolbar icon buttons no names: HIGH→HIGH (kept)
- Color-only status: HIGH→MEDIUM
- LiveChatContext duplicates state: HIGH→MEDIUM
- No ErrorBoundary: HIGH→MEDIUM
- Analytics fetch no AbortController: HIGH→MEDIUM
- key={i}: HIGH→LOW
- Context value not memoized: CRITICAL→HIGH
- handleConversationUpdate splice: HIGH→LOW
- useConversations no memo: HIGH→MEDIUM
- inline arrows defeat memo: HIGH→MEDIUM
- Transfer numeric ID: CRITICAL→HIGH
- Kebab menu dead actions: HIGH→MEDIUM
- Waiting queue no wait-time: HIGH→MEDIUM
- Claim race: HIGH→MEDIUM

Now let me write the consolidated report.

---

## บทสรุปผู้บริหาร (TL;DR)

- **คุณภาพโดยรวมดีถึงดีมากในแกนหลัก** ของ live-chat console: design system มีรากฐาน token ที่ตั้งใจจริง (globals.css), การจัดการ connection/reconnect, optimistic send + retry, focus trap ใน TransferDialog, และ near-bottom auto-scroll ล้วนเป็นงานที่ใส่ใจ ไม่ใช่ template ทั่วไป
- **ไม่มีปัญหาระดับ CRITICAL ที่ยืนยันได้** — ทุก finding ที่เดิมตั้งเป็น CRITICAL ถูก skeptic ปรับลงเป็น HIGH เพราะไม่มีมิติ security หรือ data-loss (เป็น admin tool ภายใน ไม่ใช่ public surface)
- **Top risk #1 (HIGH, ทำงานจริงไม่ได้สำหรับผู้พิการ):** ปุ่ม icon-only ใน `MessageInput` ทั้งชุด (รวมปุ่ม Send และ expand) ไม่มี accessible name เลย — keyboard/screen-reader operator ส่งข้อความไม่ได้อย่างมั่นใจ
- **Top risk #2 (HIGH, UX การทำงานจริง):** Transfer บังคับให้ operator จำและพิมพ์ "operator ID เป็นตัวเลข" โดยไม่มี roster/presence — เสี่ยงโอนผิดคนแบบเงียบ ๆ ทั้งที่ข้อมูล presence มีอยู่แล้วใน socket (`PRESENCE_UPDATE`) แต่ไม่ได้ wire
- **Top risk #3 (HIGH, performance + a11y):** `LiveChatContext.Provider` ส่ง `value` object ใหม่ทุก render (ไม่ห่อ `useMemo`) ทำให้ consumer ทั้งหมด re-render; และ chat-log scroll container ใส่ `aria-live="polite"` ผิดที่ ทำให้ screen reader ประกาศข้อความถล่มทลายตอนสลับห้อง
- **ธีมร่วมที่พบซ้ำหลาย lens:** (1) มี "ระบบสีคู่ขนาน" — analytics page + TransferDialog ใช้ `slate-*`/raw-hex นอก token system, (2) มี false affordance หลายจุด (kebab menu 6/7 ปุ่มไม่ทำงาน, N/A stats, notes ที่ไม่ save), (3) ขาด exit animation ทั้งฟีเจอร์

---

## คะแนนรายมิติ

| มิติ | ECC skill | คะแนน (1-5) | สรุปสั้น |
|------|-----------|:-----------:|----------|
| Design System & Visual Direction | frontend-design-direction / design-system | 4 | Console แข็งแรงและมีตัวตน แต่ analytics + TransferDialog เป็นระบบสีคู่ขนาน |
| Design-engineering polish | frontend-design (polish rubric) | 4 | งานละเอียดดี แต่ติด hit area เล็ก, `transition-all`, ขาด tabular-nums |
| Motion / Animation | motion-foundations / motion-patterns | 3 | reduced-motion + compositor-friendly ดีมาก แต่ไม่มี exit animation เลย |
| Accessibility (WCAG 2.2 AA) | frontend-a11y | 3 | รากฐานดี (listbox, aria-label) แต่ icon buttons ไม่มีชื่อ + aria-live ผิดที่ |
| React architecture & patterns | react-patterns | 3 | WS layer + Zustand store ดี แต่ Provider เป็น god-component + dead duplicated wrapper |
| React/Next.js performance | react-performance | 3 | memo + fine-grained selector วางถูก แต่ context value ไม่ memoize ลบล้างทั้งหมด |
| Product / UX (operator lens) | product-lens | 3 | core loop ครบ แต่ transfer/triage/concurrency/customer-panel ยังขาดของจริง |

---

## ปัญหาเรียงตามความสำคัญ

### CRITICAL
ไม่มี finding ที่ยืนยันแล้วอยู่ระดับ CRITICAL — finding ที่เดิมตั้ง CRITICAL ทั้งหมด (aria-live, mobile overlay, transfer-by-ID, context value) ถูกปรับลงเป็น HIGH เนื่องจากไม่มีความเสี่ยงด้าน security/data-loss และเป็น admin tool ภายใน

### HIGH

**H1. ปุ่ม icon-only ใน composer ไม่มี accessible name (รวมปุ่ม Send และ expand)**
- file: `app/admin/live-chat/_components/MessageInput.tsx:127-157, 195-201, 204-213`
- หลักฐาน: ปุ่ม Emoji/Stickers/Upload Image/Upload File/Quick Replies/Canned/Sound toggle ใช้แค่ `title` ไม่มี `aria-label`; ปุ่ม expand (195-201) และปุ่ม Send (204-213) ไม่มีทั้ง `title` และ `aria-label` — render แค่ `<Send className="w-5 h-5" />` ไม่มี text node ใด ๆ. ทุก Lucide SVG ไม่มี `aria-hidden`
- แนวทางแก้: เปลี่ยน `title` เป็น `aria-label` ทุกปุ่ม; ปุ่ม stateful เพิ่ม `aria-pressed`; ปุ่ม Send ใส่ `aria-label="Send message"`; ปุ่ม expand ใส่ `aria-label` แบบ toggle; ใส่ `aria-hidden="true"` บน SVG icon (frontend-a11y — WCAG 4.1.2 Name/Role/Value, Level A)
- lens: Accessibility

**H2. Transfer บังคับพิมพ์ operator ID เป็นตัวเลข — ไม่มี roster/presence**
- file: `app/admin/live-chat/_components/TransferDialog.tsx:61-62`
- หลักฐาน: ช่องเดียวเป็น `<input type="number" placeholder="Enter operator ID" />`, validate แค่ `operatorId > 0`, `transferSession(toOperatorId)` (`LiveChatContext.tsx:636`) รับ integer ที่พิมพ์ตรง ๆ. ไม่มี roster ใน chat UI — แต่ข้อมูล online operators ไหลผ่าน socket แล้ว (`PRESENCE_UPDATE → PresencePayload.operators {id,status,active_chats}`, `lib/websocket/types.ts:118-123`) เพียงแต่ `LiveChatContext` ไม่ได้ wire `onPresenceUpdate`
- แนวทางแก้: แทนช่องตัวเลขด้วย searchable operator picker จาก presence/endpoint (ชื่อ, avatar, online/away, จำนวน chat ที่ถืออยู่) โดยใช้ presence ที่มีอยู่แล้ว และเก็บช่อง ID ไว้เป็น advanced fallback (product-lens Mode 3 — friction สูงสุดในเส้นทาง escalation; พิมพ์ผิดทำให้โอนผิดคนแบบเงียบ)
- lens: Product/UX

**H3. `LiveChatContext.Provider` ส่ง `value` ใหม่ทุก render — consumer ทั้งหมด re-render**
- file: `app/admin/live-chat/_context/LiveChatContext.tsx:759-793`
- หลักฐาน: `value` เป็น object literal ส่งตรงเข้า Provider ไม่ห่อ `useMemo`. Provider subscribe ทั้ง 18 store slices (144-163) + React state (wsStatus, isMobileView, typingUsersCount, focusedMessageId) จึง re-render บ่อย → ทุก `useLiveChatContext()` consumer (ChatArea, ConversationList, LiveChatShell, CustomerPanel) re-render โดยไม่จำเป็น
- แนวทางแก้: ห่อ `value` ด้วย `useMemo` พร้อม deps ครบ หรือแยกเป็น data-context กับ action-context (react-performance rerender-5)
- lens: Performance (จุดนี้ React-arch lens ก็ชี้สาเหตุเดียวกันในรูปการ duplicate state — ดู M3)

**H4. chat-log scroll container ใส่ `aria-live="polite"` ผิดที่ — ประกาศถล่ม**
- file: `app/admin/live-chat/_components/ChatArea.tsx:260-265`
- หลักฐาน: container ที่ `overflow-y-auto` มี `aria-live="polite"` บนตัวมันเอง ภายในมี message bubbles + virtualization padding (มี `aria-hidden`) + date separator + sentinel. virtualEnabled ทำให้ visibleWindow คำนวณใหม่ทุก scroll (เพิ่ม/ลบ bubble เข้า-ออก DOM ใน live region) และสลับห้อง = แทนที่ list ทั้งก้อน → screen reader queue ข้อความจำนวนมากเป็น "wall of speech". (หมายเหตุ skeptic: polite จะ queue ไม่ interrupt; padding divs มี aria-hidden อยู่แล้ว)
- แนวทางแก้: ลบ `aria-live` ออกจาก scroll container; เพิ่ม `<div role="log" aria-live="polite" aria-atomic="false">` แบบ visually-hidden นอก scroll container ที่ถือเฉพาะข้อความ incoming ล่าสุด อัปเดตใน `addMessage` action เมื่อ `direction === 'INCOMING'` (frontend-a11y — WCAG 4.1.3 Status Messages)
- lens: Accessibility

**H5. CustomerPanel overlay บนมือถือ ไม่มี dialog role / focus trap / Escape**
- file: `app/admin/live-chat/_components/LiveChatShell.tsx:64-76` (+ `CustomerPanel.tsx`)
- หลักฐาน: มือถือ render panel ใน backdrop `<div className="fixed inset-0 z-40 bg-black/40 ...">` ทำตัวเป็น modal เต็มจอ แต่ไม่มี `role="dialog"`/`aria-modal`/`aria-labelledby`, ไม่ย้าย focus เข้า panel, Tab หลุดไป background. หัวข้อ "Customer Info" เป็น `<span>` ไม่ใช่ heading. (มีปุ่มปิด `aria-label="Close customer panel"` และปิดด้วยคลิก backdrop ได้)
- แนวทางแก้: ห่อด้วย `role="dialog" aria-modal="true" aria-labelledby` (เฉพาะเมื่อ `isMobileView`), promote heading, ย้าย focus เข้าตอนเปิด, คืน focus ตอนปิด, เพิ่ม Escape handler (frontend-a11y — WCAG 2.1.1/2.1.2/2.4.3/4.1.2)
- lens: Accessibility

### MEDIUM

**M1. Analytics page เป็น "ระบบ design ที่สอง" (slate + raw hex นอก token system)**
- file: `app/admin/live-chat/analytics/page.tsx:74, 78-79, 128, 133-163, 171-196, 211-214`
- หลักฐาน: bg `bg-[#f8f7fa]`, `text-slate-800/500/400/600/900`, `border-slate-100/60`, chart hardcode `#3b82f6`/`#64748b`/`#60a5fa`/`#f1f5f9`. ไฟล์นี้ใช้ design token 0 ตัว (ไม่มี `bg-bg`/`text-text-*`/`border-border-default`/`ds-panel`/`ds-kpi`) ขณะที่ surface อื่น ๆ ใช้ token แพร่หลาย; `--color-slate` ไม่เคยถูกประกาศ
- แนวทางแก้: rebuild บน token เดิม (`bg-bg`, `ds-panel`/`ds-kpi`, `text-text-primary/secondary/tertiary`, `border-border-default`) และขับ Recharts จาก `--chart-1..8` แทน hex (design-system dim 1 + dim 4)
- lens: Design System

**M2. ไม่มี exit animation ทั้งฟีเจอร์ — message/toast/dropdown หายแบบกระตุก**
- file: `app/admin/live-chat/_components/NotificationToast.tsx:57-91` (+ MessageBubble `.msg-in/.msg-out`, ConversationItem dropdown `ConversationItem.tsx:139`)
- หลักฐาน: `.toast-slide` (globals.css:719-729) เป็น entrance-only; `removeNotification()` unmount ทันที. `.msg-in/.msg-out` (globals.css:725-726) entrance-only. dropdown `{menuOpen && ...}` ใช้ `animate-in` แล้ว unmount ทันทีไม่มี fade-out
- แนวทางแก้: ใช้ `motion` ที่มีใน package อยู่แล้ว (`"motion": "^12.38.0"`, AnimatePresence ถูกใช้ใน 12 ไฟล์อื่น) — ห่อ toast list ด้วย `<AnimatePresence>` + `motion.div` key + initial/animate/exit; ใช้กับ dropdown/message removal ด้วย (motion-patterns Rule 2)
- lens: Motion (Design-engineering lens ก็ชี้ toast exit เช่นกัน — merged)

**M3. `LiveChatContext` duplicate ทั้ง Zustand state เป็น dead wrapper + value ไม่ memoize**
- file: `LiveChatContext.tsx:25-47 (ChatState), 144-163 (20+ subscriptions), 731-759 (state useMemo + value)`
- หลักฐาน: `ChatState` ซ้ำ `LiveChatState` field-for-field; provider subscribe 18-20 slice ทีละตัวแล้ว pack เป็น `state`. แต่ grep พบว่า **ไม่มี consumer ตัวใดอ่าน `context.state` เลย** (`state.` ใน _components = no matches) — เป็น dead code ล้วน; consumer ทุกตัวอ่าน slice ตรงจาก `useLiveChatStore` อยู่แล้ว
- แนวทางแก้: ลบ `ChatState` wrapper ทิ้ง, เหลือ context ไว้สำหรับ derived + action เท่านั้น, แล้ว memoize value (รวมกับ H3) (react-patterns — State Location Decision Tree)
- lens: React architecture (สัมพันธ์กับ H3 จาก Performance lens — merged เป็นปัญหา Provider เดียวกัน)

**M4. ปุ่ม icon-only ใน composer (toolbar) hit area ต่ำกว่า 40px**
- file: `MessageInput.tsx:93-94, 154-156, 195-201`
- หลักฐาน: `btnClass` ใช้ `p-2` รอบ icon `w-5 h-5` = ~36px; sound toggle `p-2` รอบ `w-4 h-4` = ~32px; expand toggle `p-1` รอบ `w-3 h-3` = ~20px (ตัวร้ายสุด)
- แนวทางแก้: เพิ่ม padding ให้ ≥40px (`p-2.5` หรือ `min-w-[40px] min-h-[40px] flex items-center justify-center`); ปุ่ม expand ขยาย hit area ด้วย pseudo-element (frontend-design — Hit Areas; WCAG 2.5.5/2.5.8)
- lens: Design-engineering polish

**M5. สี status accent drift ไป hardcoded green/amber/rose ทั้งที่มี semantic token**
- file: `ConversationList.tsx:238-251` (+ `ChatArea.tsx:178-191`, `ConversationItem.tsx:100`)
- หลักฐาน: summary bar ใช้ `text-green-400`/`amber-400`/`bg-white/20`; empty-state pill ใช้ `green-50/red-50/amber-50`; unread badge `bg-rose-500` — ทั้งที่ globals.css มี `--color-online/away/offline` และ `bg-danger` และ `ConversationItem.tsx:63-65` ใช้ `bg-online/away/offline` ถูกต้องอยู่แล้วไม่กี่บรรทัดถัดไป
- แนวทางแก้: map active→`online`, waiting→`away`, offline→`offline`, unread→`danger` (design-system dim 1)
- lens: Design System

**M6. CustomerPanel เป็นกองการ์ดเทาเหมือนกันหมด — ไม่มี hierarchy/depth**
- file: `CustomerPanel.tsx:159-241`
- หลักฐาน: 6 บล็อก `bg-gray-50 rounded-xl p-3` ติดกัน, padding/radius/surface เท่ากันหมด, ทุก header เป็น `text-[10px] uppercase ... text-text-tertiary`, 3 stat tile hardcode `N/A` — ตรงกับ pattern "flat layouts, uniform radius/spacing/shadows" ที่ design-quality ห้าม นั่งติดข้าง sidebar ที่ layering หนา
- แนวทางแก้: promote identity block เป็น primary, รวม metadata รองใต้ panel เดียวด้วย divider, แยก treatment ส่วน actionable (Notes/Export), ลบ/gate N/A tiles (design-system dim 2/9)
- lens: Design System

**M7. status indicator สื่อด้วยสีอย่างเดียว (color-only)**
- file: `ConversationItem.tsx:62-66` (+ `ChatHeader.tsx:77-79`, `CustomerPanel.tsx:100`)
- หลักฐาน: presence dot เป็น `<div>` มีแค่ class สี (`isActive ? 'bg-online' : isWaiting ? 'bg-away' : 'bg-offline'`) ไม่มี text/aria-label/title; `role="option"` ครอบมีแค่ `aria-selected`. (หมายเหตุ skeptic: summary bar ที่ ConversationList:238-252 มี text กำกับอยู่แล้ว ไม่ใช่ color-only — เป็น decoration)
- แนวทางแก้: ใส่ `<span className="sr-only">` ระบุ Active/Waiting/Offline หรือใส่ statusLabel ลงใน `aria-label` ของ `role="option"` (frontend-a11y — WCAG 1.4.1 Level A)
- lens: Accessibility

**M8. CreateChatSheet form labels ไม่ผูกกับ input ผ่าน htmlFor/id**
- file: `CreateChatSheet.tsx:162-270`
- หลักฐาน: 3 `<label>` (163, 249, 262) ไม่มี `htmlFor`; `<Input>`/`<Textarea>` ไม่มี `id`. `Input.tsx`/`Textarea.tsx` ใช้ `forwardRef + {...props}` ไม่มี `useId`/auto-associate. (มี placeholder ช่วยบางส่วน)
- แนวทางแก้: เพิ่ม `htmlFor`+`id` คู่กัน, error `<p>` (274) เพิ่ม `role="alert"`, ช่องค้นหาที่ติด `*` เพิ่ม `aria-required="true"` (frontend-a11y — WCAG 1.3.1/4.1.2)
- lens: Accessibility

**M9. CustomerPanel "Internal Notes" textarea ไม่มี label**
- file: `CustomerPanel.tsx:217-221`
- หลักฐาน: `<textarea placeholder="Add notes about this customer..." rows={3} />` ไม่มี id/label/aria-label
- แนวทางแก้: เพิ่ม `id` + `<label className="sr-only">` หรือ `aria-labelledby` ชี้ section heading (frontend-a11y — WCAG 3.3.2)
- lens: Accessibility

**M10. ไม่มี ErrorBoundary ครอบ LiveChatProvider/Shell**
- file: `app/admin/live-chat/page.tsx:17-23`
- หลักฐาน: `LiveChatContent` ห่อแค่ `<Suspense>`. live-chat ถูกตัดออกจาก inline ErrorBoundary ของ admin layout (`layout.tsx:208-210 if (isLiveChat) return <>{children}</>`). (หมายเหตุ skeptic: route-level `app/admin/error.tsx` ยัง catch ได้และแสดง UI ภาษาไทยพร้อมปุ่ม retry — ไม่ใช่ crash ดิบ)
- แนวทางแก้: ใส่ component-level ErrorBoundary ใน page เพื่อ recover เฉพาะ panel (เช่น ChatArea) โดยไม่ remount provider/WebSocket ทั้งก้อน (react-patterns — Suspense + Error Boundaries)
- lens: React architecture

**M11. Analytics fetch ไม่มี AbortController — race เมื่อเปลี่ยนช่วงวันที่เร็ว**
- file: `app/admin/live-chat/analytics/page.tsx:41-71`
- หลักฐาน: `fetchData` (Promise.all 2 fetch) ไม่มี signal; useEffect cleanup ทำแค่ `clearTimeout` ไม่ abort fetch ค้าง; deps มี `dateRange.from/to` → response เก่าอาจ resolve ทับใหม่. `setTimeout(0)` ไม่ debounce จริง
- แนวทางแก้: เพิ่ม AbortController + abort ใน **useEffect cleanup** (ไม่ใช่ใน async fn) หรือ ignore-stale flag; หรือย้ายไป TanStack Query (react-patterns — Effect missing cleanup). หมายเหตุ: snippet ใน finding เดิมวาง `return controller.abort()` ผิดที่
- lens: React architecture

**M12. `useConversations` ไม่ memoize — filter + count หลายรอบทุก render**
- file: `app/admin/live-chat/_hooks/useConversations.ts:5-24`
- หลักฐาน: ไม่มี `useMemo`; 3 `Array.filter()` (filtered + waitingCount + activeCount) run ทุกครั้งที่เรียก. (หมายเหตุ skeptic: ConversationList อ่านผ่าน Zustand selector ไม่ใช่ context ตามที่ finding เดิมอ้าง จึง benefit จำกัด; ยังมี closedCount filter ที่ 4 ที่ ConversationList:54 ด้วย — ดู perf notes)
- แนวทางแก้: รวมเป็น single-pass `useMemo` keyed `[conversations, query]` รวม closedCount เข้าด้วย (react-performance — combine passes)
- lens: React performance

**M13. inline arrow props ลบล้าง `React.memo` ของ ConversationItem**
- file: `ConversationList.tsx:217-231 (จริงราว 224-228)`
- หลักฐาน: `onClick`/`onMenuClick` เป็น arrow ใหม่ทุก render; `ConversationItem` ห่อ `memo` (`ConversationItem.tsx:17`) จึง bail-out เสมอ → re-render ทุก item. props อื่น (selected, formattedTime) เป็น primitive
- แนวทางแก้: ส่ง stable action เป็น prop (`onSelect={selectConversation}`, `onMenuOpen={setActiveActionMenu}`) แล้วสร้าง handler ด้วย `useCallback([... , id])` ภายใน item (react-performance rerender-3/5)
- lens: React performance

**M14. kebab menu เป็น false affordance — 6/7 action ไม่ทำงาน**
- file: `ConversationItem.tsx:148-190`
- หลักฐาน: มีแค่ "ดูประวัติแชท" (142) ที่เรียก `onClick()`; pin/mark-read/mute/archive/spam/delete ใช้ handler เดียวกัน `(e)=>{e.stopPropagation(); setMenuOpen(false);}` แค่ปิดเมนู. "mark as read" เป็น triage action สำคัญ และ store reset unread ได้อยู่แล้ว (`selectConversation` LiveChatContext.tsx:451-454)
- แนวทางแก้: wire action จริง หรือซ่อน/disable (`opacity-50 cursor-not-allowed` + ติด "soon"); อย่างน้อย ship "mark as read" และ "pin" (product-lens Mode 2)
- lens: Product/UX (Design-engineering lens ก็ชี้จุดเดียวกัน — merged)

**M15. waiting queue ไม่มีระยะเวลารอ — triage คนรอนานสุดไม่ได้**
- file: `ConversationItem.tsx:78-80`
- หลักฐาน: แสดงแค่ `formattedTime` จาก `last_message.created_at` (เป็น relative-to-last-message); ไม่มี "รอมา 8 นาที"; list เรียงตาม most-recent-message (`handleConversationUpdate` prepend, LiveChatContext.tsx:341-346); `useConversations` ไม่ sort. ลูกค้ารอ 20 นาทีไม่มีข้อความใหม่จะจมลงล่าง. `Session.started_at` มีอยู่แล้ว (`_types.ts:6`)
- แนวทางแก้: WAITING session แสดง elapsed จาก `started_at` เป็น badge ไล่สี (amber→red ตาม SLA) + ตัวเลือก "sort by longest waiting" (product-lens Mode 1 Q2/Q7)
- lens: Product/UX

**M16. ไม่มี lock/feedback ตอน claim — สอง operator แย่ง session เดียวกันได้**
- file: `LiveChatContext.tsx:589-612`
- หลักฐาน: `claimSession()` ผ่าน WS ตั้ง `claiming=true` แล้วรอ `onSessionClaimed` broadcast ไม่มี UI lock บอก operator อื่น และไม่ handle "already claimed". `claiming` เป็น local state จึง disable ปุ่มเฉพาะจอคนกด; toast generic `Operator #${operatorId} claimed a session` (408-412) ไม่บอกว่าห้องไหน. (backend guard กันซ้ำได้ จึงไม่ data-loss — ปัญหาคือ UX contention)
- แนวทางแก้: แสดง "Anan กำลังรับเรื่อง..." inline บน row, disable Claim สำหรับคนอื่น, แพ้ race → in-context message + ใส่ชื่อห้องใน toast (product-lens Mode 3)
- lens: Product/UX

**M17. composer เปิดด้วย HUMAN mode ไม่ผูกกับการเป็นเจ้าของ session**
- file: `MessageInput.tsx:122-188`
- หลักฐาน: composer gate ด้วย `isHumanMode` เท่านั้น (`disabled={!isHumanMode || sending}`); session ACTIVE ที่ `operator_id !== me` ก็ยังพิมพ์/ส่งได้เพราะไม่เทียบ ownership
- แนวทางแก้: เทียบ `currentChat.session.operator_id` กับ user id; ถ้าเป็นของคนอื่น แสดง banner "Claimed by X — take over?" และต้อง take-over ชัดเจน (product-lens Mode 1 Q6)
- lens: Product/UX

**M18. Bot/Manual toggle กับ Claim/Done เป็นสองระบบควบคุมซ้อนกัน ความสัมพันธ์ไม่ชัด**
- file: `ChatHeader.tsx:94-133`
- หลักฐาน: header มีทั้ง segmented Bot|Manual (96-123 เรียก `toggleMode` → `/mode`) และ SessionActions Claim/Transfer/Done (127-133) แยกกัน; operator แยกไม่ออกว่า Manual = claim หรือไม่, close = กลับ Bot หรือไม่ (close handler กลับ BOT อยู่แล้วที่ LiveChatContext.tsx:418)
- แนวทางแก้: รวม mental model — ขับ mode อัตโนมัติจาก session lifecycle (claim→HUMAN, close→BOT) และซ่อน manual toggle ระหว่าง active session หรือเพิ่ม helper text (product-lens Mode 1)
- lens: Product/UX

**M19. Quick replies เป็น 6 string hardcode แก้ไม่ได้ + ซ้ำซ้อนกับ canned response**
- file: `QuickReplies.tsx:3-10`
- หลักฐาน: module constant 6 ตัว, ไม่มี config per-operator/org, ไม่เชื่อม canned-response backend; มี picker 2 ตัว (Zap vs MessageSquareText, MessageInput.tsx:140-150) ที่ดูคล้ายกัน
- แนวทางแก้: รวม quick replies เข้าระบบ canned response หรือแยกความต่างของ 2 picker ให้ชัด (product-lens Mode 4)
- lens: Product/UX

**M20. customer panel แสดงข้อมูล placeholder เหมือนของจริง (N/A, VIP disabled, notes ไม่ save)**
- file: `CustomerPanel.tsx:159-221`
- หลักฐาน: stats hardcode N/A (162/167/172); Internal Notes textarea ไม่มี value/onChange/save (217-221) → พิมพ์แล้วหายตอนปิด; VIP/View Profile disabled (113-140)
- แนวทางแก้: persist Notes (autosave + saved indicator), ลบ/ซ่อน N/A และปุ่ม disabled จนกว่ามีข้อมูลจริง (product-lens Mode 2/3)
- lens: Product/UX

**M21. ปัญหา interaction-state / wrapping เล็ก ๆ ที่ merged จาก polish + a11y lens**
- file: หลายจุดใน `MessageInput.tsx`, `MessageBubble.tsx`, `StickerPicker.tsx`, `EmojiPicker.tsx`, `TypingIndicator.tsx`
- หลักฐานรวม:
  - counters/clock ไม่ใช้ `tabular-nums` → กระตุกเวลาเลขเปลี่ยน (MessageBubble:137; ChatArea:232/237; ConversationItem:100)
  - expand toggle + sticker-tab ไม่มี hover/active/focus (MessageInput:195-201; StickerPicker:26-30)
  - chat image/avatar ไม่มี inset outline → ภาพสีอ่อนกลืน bg-surface (MessageBubble:43, 107-111)
  - main text bubble ไม่มี `break-words` → URL ยาวล้น 65% cap (MessageBubble:124-132)
  - Send/emoji/quick-reply ไม่มี focus-visible ring (MessageInput:204-213; EmojiPicker; QuickReplies)
  - TypingIndicator + EmojiPicker buttons ขาด accessible label/persisted live region (a11y MEDIUM ที่ไม่ verified แต่สอดคล้องกับ polish)
  - duration/easing hardcode กระจาย ไม่มี motion token กลาง (globals.css:667-729; motion-foundations Rule 5)
  - TypingIndicator ใช้ `animate-pulse` แทน dots ไล่จังหวะ (TypingIndicator:10-12)
  - JS `scrollIntoView({behavior:'smooth'})` ไม่อ่าน reduced-motion (ChatArea:83,110)
- แนวทางแก้: ดำเนินการเป็นชุด polish — เพิ่ม `tabular-nums`, `.focus-ring`, image outline, `break-words`, motion token, typing-bounce keyframe, guard reduced-motion ใน JS scroll
- lens: Design-engineering polish + Motion + Accessibility (merged)

### LOW

**L1. `transition-all` แพร่หลาย** — `MessageInput.tsx:191,207`, `ConversationItem.tsx:47`, `ChatHeader.tsx:99,112`, `ConversationList.tsx:117,125,184`, `globals.css:559`. แก้: ระบุ property ที่ animate จริง เช่น `transition-[transform,background-color,box-shadow]` โดยเฉพาะ textarea ที่ไม่ควร animate ความสูง rows 1→4 (frontend-design — Transition Scope). หมายเหตุ: `.press-down` (globals.css:566) ใช้ `transition-transform` ถูกต้องอยู่แล้ว ไม่นับ. lens: Design-engineering

**L2. Avatar fallback hardcode indigo `#6366f1`** — `ConversationItem.tsx:58`, `CreateChatSheet.tsx:199,224`. brand เป็น blue (`#3b82f6`). แก้: ใช้ brand color หรือ `Avatar` component + gradient `from-brand-400 to-brand-700` (design-system slop-check). lens: Design System

**L3. micro font sizes `text-[9px/10px/11px]` bypass fluid type scale** — `ConversationItem.tsx:78,83,88,100,113,120`, `MessageBubble.tsx:118,137`, `CustomerPanel.tsx`. แก้: นิยาม `--text-2xs` ใน @theme แล้วแทน literal; ตรวจ contrast 9px Thai (design-system dim 2/3). lens: Design System

**L4. Analytics page ไม่มีความสัมพันธ์ทางสายตา/navigation กับ console** — `analytics/page.tsx:73-96`. แก้: ใช้ `ds-page/ds-panel/ds-kpi/ds-section-title` + `thai-text`; นำด้วย metric เด่น (waiting-time SLA) แทน 4-KPI เท่ากันหมด (design-quality). lens: Design System

**L5. emoji cells 32px + bypass token** — `EmojiPicker.tsx:13,19` (`bg-white`/`hover:bg-gray-100`), StickerPicker repeat. แก้: `w-10 h-10` + `bg-surface`/`hover:bg-muted`. lens: Design-engineering

**L6. Toasts/dropdown/list ไม่มี layout shift animation** — toast ตัวล่าง snap ขึ้นเมื่อตัวบนปิด (NotificationToast); ConversationItem reorder กระโดดทันที (ConversationList:216-231). แก้: เมื่อย้ายไป motion ใส่ `layout` prop (motion-patterns). lens: Motion

**L7. entrance animation เล่นซ้ำตอน virtualize re-mount** (caveat) — `.msg-in/.msg-out` ติดทุก bubble; เลื่อนกลับเข้า viewport เล่น slide-in ใหม่. แก้: ใส่ class entrance เฉพาะข้อความใหม่จริง (prop `isNew`). lens: Motion

**L8. `key={i}` ในตาราง operator stats** — `analytics/page.tsx:192`. row เป็น presentational ล้วน จึงไม่มี state-to-row bug จริง เป็นแค่ lint best-practice. หมายเหตุ: fix ที่เสนอ (`op.operator_name ?? ...`) ก็ชนกันได้เพราะ name ซ้ำ/null. lens: React architecture

**L9. micro-optimizations (perf, ผลกระทบจริงต่ำที่ scale ปัจจุบัน)** — รวม: `onScroll` setState ทุก frame (ChatArea:264, แก้ด้วย rAF throttle); MessageBubble สร้าง Date + `toLocaleTimeString` ทุก render (138, แก้ด้วย preformat ใน ChatArea map); REST fallback `await` ต่อเนื่องแทน `Promise.all` (LiveChatContext:550-560,581,414,418,269-272); `handleConversationUpdate` spread+splice O(n) ต่อ WS frame (319-354, ใช้ Map index); `formatTime` ต่อ item ทุก render (718-728); StickerPicker 8 รูป CDN ไม่มี lazy/size hint (11-18,41-43); `onConnectionChange` fire ซ้ำ inline + useEffect (useLiveChatSocket.ts:171-178); `useConversations` ตั้งชื่อ `use` แต่ไม่มี hook (rename เป็น `filterConversations`); `API_BASE` redeclare (analytics:39 vs LiveChatContext:84). lens: React performance + architecture

**L10. ป้ายภาษาผสม EN/TH + toast routing อ่อน** — SessionActions ใช้ EN (Claim/Transfer/Done) ขณะเมนู/banner เป็นไทย (SessionActions:27-37); incoming toast title generic "New Message" แทนชื่อลูกค้า + คลิกไม่ jump (LiveChatContext:293-299, NotificationToast ไม่มี onClick). แก้: standardize ไทย + ทำ toast คลิกได้ไป `selectConversation`. lens: Product/UX

**L11. Send icon ไม่ optically centered + connectionStatus คำนวณ icon/className ที่ไม่ render** — MessageInput:212 (nudge `translate-x-[0.5px]`); ChatArea:134-146 (drift risk, รวม source of truth). lens: Design-engineering

---

## จุดแข็ง

- **Design direction มีตัวตนจริง:** navy gradient + texture overlay หลัง sidebar (`ConversationList.tsx:83-85`), selected ใช้ `gradient-active` + colored shadow (`ConversationItem.tsx:48-51`); token foundation ครบใน globals.css (semantic chat colors 101-105, status colors 108-111, dark sidebar scale 133-143, fluid type 231-238)
- **สีใช้เชิงความหมายใน message bubbles:** incoming=surface+border, BOT=muted, admin=gradient — 3 บทบาทแยกชัด (`MessageBubble.tsx:124-130`)
- **Typography คู่ที่ตั้งใจ + Thai-aware** (`--font-heading` vs `--font-sans`, `.thai-text/.thai-no-break`)
- **Connection/reconnect resilience ดีเยี่ยม:** floating banner (`LiveChatShell.tsx:36-53`), inline queue warning (`ChatArea.tsx:311-329`), connection pill + aria-live
- **Optimistic send ครบวงจร:** pending/failed/retry + 10s ack-timeout flip เป็น failed (`MessageBubble.tsx:140-156`, `LiveChatContext.tsx:514-566`)
- **Dual-transport:** ทุก action critical ลอง WS แล้ว fallback REST + surface error จริงผ่าน `readErrorMessage`
- **Scroll behavior สำหรับ history ยาว:** near-bottom auto-scroll, IntersectionObserver paging + scroll-position preservation ผ่าน rAF, jump-to-message
- **Motion foundation:** global `prefers-reduced-motion` override ครอบทุก animation (globals.css:744-753); keyframes animate เฉพาะ transform/opacity
- **React infra ถูกต้อง:** Zustand immutable updates + fine-grained selectors; `React.memo` วางถูกตำแหน่ง (โครงสร้างดี รอแก้ inline props/value memoize); WebSocket cleanup + callback refs จัดการถูก; search/typing debounce + cleanup ถูก
- **A11y รากฐานดี:** icon button ส่วนใหญ่มี `aria-label`, ConversationList เป็น Listbox pattern ถูกต้อง (`role=listbox/option`, `aria-activedescendant`, keyboard nav), TransferDialog มี focus trap + Escape, ProfileDropdown ARIA ครบ
- **Mobile operator considered:** single-pane switching, back button, dismissible drawer

---

## แผนลงมือ (Quick wins → Larger refactors)

**Quick wins (≤ ครึ่งวัน, แก้จุดเดียว ผลกระทบสูง):**
1. **H3 + M3 รวมกัน:** ห่อ `value` ของ `LiveChatContext` ด้วย `useMemo` และลบ dead `ChatState` wrapper — แก้ทั้ง perf และ cohesion ในจุดเดียว (LiveChatContext.tsx:25-47, 731-793)
2. **H1:** เปลี่ยน `title`→`aria-label` ทุกปุ่ม composer + `aria-label` ปุ่ม Send/expand + `aria-hidden` บน SVG (MessageInput.tsx)
3. **H4:** ย้าย `aria-live` ออกจาก scroll container ไป dedicated `role="log"` visually-hidden region (ChatArea.tsx:260-265 + addMessage action)
4. **M5:** map status accent → semantic token (`online/away/offline/danger`) — find/replace ตรง ๆ
5. **M4 + M21(บางส่วน):** เพิ่ม padding ปุ่ม composer ≥40px + `tabular-nums` + `.focus-ring` + `break-words` บน bubble
6. **M14:** ship "mark as read" (store reset unread มีอยู่แล้ว) + ซ่อน/disable kebab item ที่ยังไม่ทำงาน

**Medium (1-2 วัน):**
7. **H5 + M8 + M9 + M7:** ชุด a11y form/dialog — mobile dialog semantics + focus trap, label association (CreateChatSheet, CustomerPanel notes), sr-only status labels
8. **M1 + M6 + L2/L3/L4:** rebuild analytics page + CustomerPanel บน token system (`ds-*`, semantic colors), เก็บ avatar/font literal
9. **M11 + M2:** ชุด polish/motion — ย้าย toast/dropdown/message ไป `AnimatePresence` (มี motion ใน package แล้ว), motion token กลาง, typing-bounce keyframe, image outline
10. **M11 + M12 + M13:** memoize `useConversations` (single-pass รวม closedCount) + ส่ง stable props ให้ ConversationItem; guard reduced-motion ใน JS scroll
11. **M20:** persist Internal Notes + ลบ N/A/disabled placeholders

**Larger refactors (ต้องประสาน backend / รื้อ flow):**
12. **H2 + M16 + M17:** operator picker จาก presence (wire `onPresenceUpdate` ที่มีอยู่แล้ว) + claim lock/contention UX + ownership check บน composer — เป็นชุด "multi-operator correctness"
13. **M15:** waiting-time badge + sort-by-longest-waiting (ใช้ `Session.started_at`)
14. **M18:** unify mode vs session state machine
15. **M10 + M11(AbortController):** component-level ErrorBoundary + แก้ race ของ analytics fetch (พิจารณา TanStack Query)
16. **React-arch refactor:** แตก ~800-line LiveChatProvider เป็น custom hooks (`useConversationSync`, `useMessageFlow`, `useChatRoom`, `useMediaQuery`) — ทำหลัง quick wins เพื่อลดความเสี่ยง

ลำดับแนะนำ: ทำกลุ่ม Quick wins ทั้งหมดก่อน (ผลกระทบสูง/ความเสี่ยงต่ำ) → กลุ่ม a11y/design rebuild → ปิดท้ายด้วย multi-operator correctness และ provider refactor ซึ่งกระทบ flow มากสุด
