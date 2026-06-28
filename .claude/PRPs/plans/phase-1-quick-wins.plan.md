# Plan: Live-Chat Phase 1 — Quick Wins (MVP)

## Summary

Phase 1 ของ Live-Chat remediation: ปิด HIGH/MEDIUM ที่ "ผลกระทบสูง–ความเสี่ยงต่ำ" ให้เร็วที่สุด + ตั้ง performance baseline. ครอบคลุม 9 finding: **H1** (accessible name ทุกปุ่ม composer), **H3+M3** (memoize Context `value` + ลบ dead `ChatState`), **H4+W3** (ย้าย `aria-live` ออกจาก scroll/virtualization container → dedicated `role="log"`), **M5** (status accent hardcoded → design token), **M4+W5** (hit area ≥ 24px SC 2.5.8), **M14** (ship "mark as read" + ซ่อน/disable ปุ่ม dead ใน kebab menu) และ **task แรก = capture React DevTools Profiler baseline** สำหรับ scenario "พิมพ์ 1 ตัวอักษรใน MessageInput".

งานทั้งหมดเป็น **frontend-only** ไม่แตะ backend, ไม่แตะ schema, ไม่แตะ WebSocket/Zustand architecture. เป็นการ "ขัดเงา + ปิดช่องโหว่" ตามที่ audit ยืนยันว่าแกนหลักแข็งแรงดีอยู่แล้ว.

## User Story

**As** เจ้าหน้าที่ operator/agent ของหน่วยงานยุติธรรมชุมชน ที่อาจใช้ keyboard ล้วนหรือ screen reader (NVDA)
**I want** ปุ่มทุกปุ่มในแถบพิมพ์ข้อความมีชื่อที่ screen reader อ่านได้, ข้อความใหม่ถูกประกาศโดยไม่ทำให้ทั้งหน้า re-render, ปุ่มเล็กพอจะกดได้, และเมนูบนรายการสนทนาไม่มีปุ่มหลอก
**So that** ฉันตอบลูกค้าได้เร็วและถูกต้องโดยเครื่องมือไม่กีดกันผู้ใช้ที่มีข้อจำกัดด้านการเข้าถึง

## Problem → Solution

| # | Problem (audit finding) | Evidence (file:line) | Solution |
|---|--------------------------|----------------------|----------|
| H1 | ปุ่ม composer 7 ตัว (Emoji/Stickers/Upload×2/QuickReplies/Canned/Sound) ใช้แค่ `title=` — NVDA มักไม่อ่าน; ปุ่ม Send render แค่ `<Send/>` ไม่มีชื่อ; ปุ่ม expand ไม่มีชื่อ | `MessageInput.tsx:127-157, :195-201, :204-213` | `title`→`aria-label` ทุกปุ่ม; `aria-pressed` ปุ่ม toggle stateful; `aria-expanded` ปุ่ม expand; `aria-label="Send message"`; `aria-hidden` ทุก Lucide SVG |
| H3 | `value` object literal ใหม่ทุก render ส่งเข้า `<Provider>` → consumer ทุกตัว re-render (state object 731-757 memoized แล้ว — **ไม่ต้องแตะ**) | `LiveChatContext.tsx:759-791` | `useMemo` ครอบ `value` ด้วย deps ครบทุก field |
| M3 | `ChatState` wrapper ซ้ำซ้อนกับ Zustand; **ไม่มี consumer อ่าน `context.state`** เลย — dead code | `LiveChatContext.tsx:26-47, :731-757` | ลบ `ChatState` interface + `state` field + การ subscribe slice ที่ใช้สร้าง `state` เท่านั้น |
| H4+W3 | `aria-live="polite"` วางบน scroll/virtualization container → screen reader อ่านทุก node ที่ virtualizer mount/unmount (ผิด SC 4.1.3) | `ChatArea.tsx:260-265` | ลบ `aria-live` ออกจาก container; เพิ่ม visually-hidden `<div role="log" aria-live="polite" aria-relevant="additions">` นอก scroll container; update ใน store action `addMessage` เมื่อ `direction==='INCOMING'` |
| M5 | status accent hardcoded green/amber/rose | `ConversationList.tsx:238-251`, `ChatArea.tsx:178-191`, `ConversationItem.tsx:100` | map → token `online`/`away`/`offline`/`danger` (mirror `ConversationItem.tsx:63-65` ที่ทำถูกแล้ว) |
| M4+W5 | hit area เล็กกว่า SC 2.5.8 (24px): btnClass p-2 ~36px (ผ่าน), sound p-2 w-4 ~32px (ผ่าน), expand p-1 w-3 ~20px (**ไม่ผ่าน**), toast dismiss p-0.5 ~22px (**ไม่ผ่าน**) | `MessageInput.tsx:195-201`, `NotificationToast.tsx:79-85` | ทำให้ทุกปุ่ม ≥ 24px (เป้า 40px ที่ทำได้) |
| M14 | kebab menu 7 รายการ — ทำงานจริงแค่ 'ดูประวัติแชท'; pin/mark-read/mute/archive/spam/delete แค่ปิดเมนู (false affordance) | `ConversationItem.tsx:148-190` | ship 'mark as read' จริง (reset unread ผ่าน `selectConversation`-style update); ปุ่มที่เหลือ disable + ป้าย "เร็ว ๆ นี้" |
| Baseline | ไม่มี baseline ก่อนแก้ → วัด metric "re-render = 0" ไม่ได้ | — | task แรก: capture Profiler baseline ของ scenario "พิมพ์ 1 ตัว" บันทึกเป็น report |

## Metadata

- **Complexity**: Medium
- **Source PRD**: `D:/genAI/jsk-app/.claude/PRPs/prds/livechat-audit-remediation.prd.md`
- **PRD Phase**: Phase 1 — Quick Wins (MVP)
- **Estimated Files**: 6 source + 2 test + 1 baseline report = 9
- **File ownership (จาก PRD)**: Phase 1 เป็น **owner** ของ `MessageInput.tsx` และ `ChatArea.tsx` (Phase 2/4/5 rebase หลัง P1 merge)
- **NOT in this phase**: W1 (focus-visible ทั้งหน้า) = Phase 2; W2 (contrast audit) = Phase 2; motion/AnimatePresence = Phase 4; TransferDialog picker = Phase 6

## UX Design

**M14 kebab menu — Before / After**

```
BEFORE (false affordance — 6 ปุ่มหลอก)        AFTER (1 จริง + 1 ใหม่ + 5 disabled)
┌────────────────────────┐                    ┌────────────────────────────┐
│ 👁  ดูประวัติแชท        │ ← works            │ 👁  ดูประวัติแชท            │ ← works
│ 📌  ปักหมุด             │ ← noop             │ ✓✓  ทำเครื่องหมายว่าอ่าน    │ ← WORKS (new)
│ ✓✓  ทำเครื่องหมายว่าอ่าน │ ← noop             │ ────────────────────────── │
│ 🔇  ปิดเสียงแจ้งเตือน    │ ← noop             │ 📌  ปักหมุด        เร็ว ๆ นี้│ ← disabled+label
│ 📦  ซ่อนสนทนา           │ ← noop             │ 🔇  ปิดเสียง       เร็ว ๆ นี้│ ← disabled+label
│ ──────────────────────  │                    │ 📦  ซ่อนสนทนา      เร็ว ๆ นี้│ ← disabled+label
│ 🛡  ทำเครื่องหมายสแปม    │ ← noop             │ ────────────────────────── │
│ 🗑  ลบ                  │ ← noop             │ 🛡  สแปม           เร็ว ๆ นี้│ ← disabled+label
└────────────────────────┘                    │ 🗑  ลบ             เร็ว ๆ นี้│ ← disabled+label
                                               └────────────────────────────┘
```

**H4+W3 live region — N/A visual** (visually-hidden `role="log"` — ไม่เห็นด้วยตา แต่ NVDA ประกาศ "ข้อความใหม่จาก <ชื่อ>")

## Mandatory Reading

| Priority | File | Lines | Why |
|----------|------|-------|-----|
| P0 | `frontend/app/admin/live-chat/_components/MessageInput.tsx` | 93-94, 122-214 | H1 + M4/W5 หลัก — `btnClass`, ปุ่มทั้งหมด, Send, expand |
| P0 | `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | 25-81, 143-163, 730-794 | H3 (value memo) + M3 (ลบ ChatState + slice ที่ feed state) |
| P0 | `frontend/app/admin/live-chat/_components/ChatArea.tsx` | 26-65, 246-309 | H4/W3 (ย้าย aria-live) + M5 (empty-state pill 175-195) |
| P0 | `frontend/app/admin/live-chat/_store/liveChatStore.ts` | 9-16, 44-50, 86-118, 130, 193-202 | H4/W3 (เพิ่ม `liveMessage` state + update ใน addMessage) |
| P1 | `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | 4, 25-31, 42-67, 100, 126-194 | M5 (line 100 rose→danger; 63-65 = correct reference) + M14 (kebab menu) |
| P1 | `frontend/app/admin/live-chat/_components/ConversationList.tsx` | 36-38, 217-253 | M5 (summary bar green/amber 238-251); ส่ง prop `onMarkRead` ลง ConversationItem |
| P1 | `frontend/app/admin/live-chat/_components/NotificationToast.tsx` | 79-85 | M4/W5 (dismiss button p-0.5 ~22px) |
| P1 | `frontend/app/globals.css` | 29-40, 64-67, 108-111 | ยืนยัน token: `online`/`away`/`offline`/`danger`/`warning`/`info` มีครบ |
| P2 | `frontend/lib/constants/__tests__/roles.test.ts` | 1-103 | test structure (describe/it/expect, AAA) ที่ต้อง mirror |
| P2 | `frontend/vitest.config.ts` + `vitest.setup.ts` | ทั้งไฟล์ | test runner: `**/__tests__/**/*.test.{ts,tsx}`, jsdom, RTL + jest-dom พร้อม |

## Patterns to Mirror

### 1. Status dot ที่ใช้ token ถูกแล้ว (M5 reference)

```tsx
// SOURCE: ConversationItem.tsx:62-66 — นี่คือรูปแบบที่ถูกต้อง ให้เลียนแบบทุกที่
<div
  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar-bg ${
    isActive ? 'bg-online' : isWaiting ? 'bg-away' : 'bg-offline'
  }`}
/>
```

Token classes ที่มีจริง (ยืนยันจาก `globals.css`): `bg-online bg-away bg-offline bg-danger bg-warning bg-info text-online text-away text-offline text-danger` (+ `/NN` opacity เช่น `bg-online/10`). **ห้ามใช้** `green-*`/`amber-*`/`rose-*`/`red-*` raw.

### 2. useMemo pattern ที่มีอยู่แล้วในไฟล์เดียวกัน (H3)

```ts
// SOURCE: LiveChatContext.tsx:731-757 — 'state' ทำถูกแล้ว เลียน deps-array แบบนี้กับ 'value'
const state: ChatState = useMemo(() => ({ conversations, selectedId, /* ... */ }), [
  conversations, selectedId, /* ...ทุก field... */,
]);
```

### 3. Store action ที่ immutable + set((s)=>...) (H4/W3)

```ts
// SOURCE: liveChatStore.ts:130 — addMessage ปัจจุบัน
addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

// SOURCE: liveChatStore.ts:193-199 — addNotification สร้าง id/timestamp แบบ immutable (mirror สำหรับ liveMessage seq)
addNotification: (notification) => set((s) => ({
  notifications: [...s.notifications, { ...notification, id: `toast-${Date.now()}-...`, timestamp: Date.now() }],
})),
```

### 4. Button accessible-name pattern ที่มีในโปรเจกต์แล้ว (H1)

```tsx
// SOURCE: ChatArea.tsx:198-202 — ปุ่มที่ทำ a11y ถูกแล้ว (aria-label + title อยู่ด้วยกันได้)
<button
  className="relative p-2 rounded-xl ..."
  aria-label={`${waitingCount} conversations waiting`}
  title={`${waitingCount} รอรับเรื่อง`}
>
  <Bell className="w-5 h-5" />
</button>
```

> **GOTCHA**: ปุ่ม Bell นี้ยังขาด `aria-hidden` บน `<Bell>` SVG — Phase 1 จะเพิ่มเฉพาะใน MessageInput ตาม scope; ปุ่มอื่นนอก MessageInput ปล่อยให้ Phase 2.

### 5. Test structure (P2 — mirror roles.test.ts)

```ts
// SOURCE: lib/constants/__tests__/roles.test.ts:1-13 — describe/it/expect + AAA, import จาก ../
import { describe, it, expect } from 'vitest'
// component test เพิ่ม: import { render, screen } from '@testing-library/react'
//                       import userEvent from '@testing-library/user-event'
describe('subject', () => {
  it('describes observable behavior', () => {
    // Arrange / Act / Assert
  })
})
```

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `frontend/app/admin/live-chat/_components/MessageInput.tsx` | UPDATE | H1 (aria-label/pressed/expanded/hidden), M4/W5 (expand hit area) |
| `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | UPDATE | H3 (memo value), M3 (ลบ dead ChatState) |
| `frontend/app/admin/live-chat/_store/liveChatStore.ts` | UPDATE | H4/W3 (state `liveMessage` + update ใน addMessage), M14 (action mark-read ถ้าจำเป็น) |
| `frontend/app/admin/live-chat/_components/ChatArea.tsx` | UPDATE | H4/W3 (ลบ aria-live + เพิ่ม role=log region), M5 (empty-state pill) |
| `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | UPDATE | M5 (line 100), M14 (kebab menu) |
| `frontend/app/admin/live-chat/_components/ConversationList.tsx` | UPDATE | M5 (summary bar), wire `onMarkRead` prop ลง ConversationItem |
| `frontend/app/admin/live-chat/_components/NotificationToast.tsx` | UPDATE | M4/W5 (dismiss hit area) |
| `frontend/app/admin/live-chat/_components/__tests__/MessageInput.test.tsx` | CREATE | unit test H1 accessible names + M4 (a11y assertions) |
| `frontend/app/admin/live-chat/_store/__tests__/liveChatStore.test.ts` | CREATE | unit test H4/W3 (addMessage sets liveMessage เฉพาะ INCOMING) + M14 mark-read |
| `D:/genAI/jsk-app/.claude/PRPs/reports/phase-1-profiler-baseline.md` | CREATE | Task 0 baseline evidence |

## NOT Building

- **W1 focus-visible ทั้งหน้า** — Phase 2 (`MessageInput.tsx:191` ยังคง `focus:ring-brand-500/40` ใน Phase 1)
- **W2 contrast audit** — Phase 2
- **Motion / AnimatePresence / exit animation** ของ toast/dropdown — Phase 4 (Phase 1 คง `toast-slide`, `animate-in` เดิม)
- **TransferDialog operator picker** (H2) — Phase 6 (Phase 1 มี interim mitigation อยู่แล้วใน TransferDialog — ไม่แตะ)
- **ฟังก์ชันจริงของ pin/mute/archive/spam/delete** — Phase 1 แค่ disable + ป้าย; ของจริงไม่อยู่ใน audit scope
- **เปลี่ยน virtualization logic** ใน ChatArea — แค่ย้าย aria-live ออก
- **MessageBubble / ChatHeader / CustomerPanel** — ไม่อยู่ใน scope Phase 1

## Step-by-Step Tasks

### Task 0 — Capture Profiler baseline (FIRST, no code change)

- **ACTION**: บันทึก React DevTools Profiler baseline ของ scenario "พิมพ์ 1 ตัวอักษรใน MessageInput"
- **IMPLEMENT**:
  1. `npm run dev`, เปิด `/admin/live-chat`, เลือก 1 conversation (ให้ `currentChat` มีค่า)
  2. เปิด React DevTools → Profiler → ติ๊ก "Record why each component rendered"
  3. กด Record → พิมพ์ 1 ตัวอักษรใน textarea → Stop
  4. บันทึกใน `D:/genAI/jsk-app/.claude/PRPs/reports/phase-1-profiler-baseline.md`: รายชื่อ component ที่ re-render + "why" (คาดว่าจะเห็น `ConversationList`, `ConversationItem`, `CustomerPanel`, `ChatArea` re-render เพราะ `value` object ใหม่ — H3) + commit count
  5. ถ้าไม่มี React DevTools ใน environment ให้ instrument ชั่วคราวด้วย `useEffect(() => console.count('ComponentName render'))` ใน `ConversationList`, `ConversationItem`, `ChatArea`, `CustomerPanel` (แล้ว **ลบออกก่อน commit**) และบันทึก count ก่อน/หลัง
- **MIRROR**: รูปแบบ report ใน `.claude/PRPs/reports/`
- **IMPORTS**: none
- **GOTCHA**: ต้องทำ **ก่อน** Task 2 (H3) เพราะ baseline คือ "ก่อนแก้ memo"; เก็บ "after" count ตอน validation Task 8
- **VALIDATE**: ไฟล์ `phase-1-profiler-baseline.md` มีรายชื่อ component + count

### Task 1 — H1 + M4/W5: MessageInput accessible names + expand hit area

- **ACTION**: ทุกปุ่มใน `MessageInput.tsx` มี accessible name; SVG ทุกตัว `aria-hidden`; expand button ≥ 24px
- **IMPLEMENT** (แทน `title=` ด้วย `aria-label=` ทุกปุ่ม; เก็บ `title` ไว้ได้เพื่อ tooltip — ทั้งสองอยู่ด้วยกันได้):
  - `:127` Emoji → `aria-label="แทรกอิโมจิ" aria-pressed={showEmojiPicker}`; `<Smile className="w-5 h-5" aria-hidden />`
  - `:130` Stickers → `aria-label="แทรกสติกเกอร์" aria-pressed={showStickerPicker}`; `<Sticker ... aria-hidden />`
  - `:133` Upload Image → `aria-label="อัปโหลดรูปภาพ"`; `<ImageIcon ... aria-hidden />`
  - `:136` Upload File → `aria-label="แนบไฟล์"`; `<Paperclip ... aria-hidden />`
  - `:140` Quick Replies → `aria-label="ข้อความด่วน" aria-pressed={showQuickReplies}`; `<Zap ... aria-hidden />`
  - `:148` Canned → `aria-label="ข้อความสำเร็จรูป" aria-pressed={showCannedPicker}`; `<MessageSquareText ... aria-hidden />`
  - `:154` Sound → `aria-label={soundEnabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'} aria-pressed={!soundEnabled}`; SVG `aria-hidden`
  - `:195-201` expand → `aria-label={inputExpanded ? 'ย่อกล่องข้อความ' : 'ขยายกล่องข้อความ'} aria-expanded={inputExpanded}`; เปลี่ยน `p-1` → `p-1.5 -m-0.5` หรือ wrap ให้ปุ่มได้ ≥ 24px target (ใช้ `min-w-6 min-h-6 flex items-center justify-center`); SVG `aria-hidden`
  - `:204-213` Send → เพิ่ม `aria-label="ส่งข้อความ"`; `<Send className="w-5 h-5" aria-hidden />`
- **MIRROR**: `ChatArea.tsx:198-202` (aria-label + title ด้วยกัน)
- **IMPORTS**: ไม่เพิ่ม
- **GOTCHA**: `aria-pressed` ใช้กับปุ่ม toggle ที่มีสถานะ (Emoji/Sticker/QuickReplies/Canned/Sound) เท่านั้น — Upload ไม่ใช่ toggle; expand เป็น expand/collapse ใช้ `aria-expanded` ไม่ใช่ `aria-pressed`. **ห้ามแตะ** `focus:ring-brand-500/40` ที่ `:191` (Phase 2)
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/MessageInput.tsx` && unit test Task 9

### Task 2 — H3: Memoize Context `value`

- **ACTION**: ครอบ `value` object (`LiveChatContext.tsx:759-791`) ด้วย `useMemo`
- **IMPLEMENT**:
  - เปลี่ยน `const value: LiveChatContextValue = { ... };` → `const value = useMemo<LiveChatContextValue>(() => ({ ... }), [<deps>]);`
  - deps array ต้องมีทุก field ที่อ้างใน object: `state, wsStatus, isMobileView, typingUsersCount, focusedMessageId, isHumanMode, selectedConversation` + ทุก setter/method ที่เป็น `useCallback` (`setSearchQuery, setFilterStatus, setInputText, setShowCustomerPanel, setActiveActionMenu, setShowTransferDialog, setShowCannedPicker, setSoundEnabled, selectConversation, jumpToMessage, clearFocusedMessage, fetchConversations, fetchChatDetail, sendMessage, sendMedia, claimSession, closeSession, transferSession, toggleMode, loadOlderMessages, reconnect, retryMessage, startTyping, formatTime`)
- **MIRROR**: `LiveChatContext.tsx:731-757` (state useMemo)
- **IMPORTS**: `useMemo` import อยู่แล้ว (`:8`)
- **GOTCHA**: `useMemo` ต้องอยู่ก่อน `return` JSX และ **หลัง** การประกาศทุก callback (ลำดับ hook). `reconnect`, `retryMessage`, `startTyping` มาจาก `useLiveChatSocket` — ตรวจว่า hook นั้นคืน stable reference (เป็น useCallback ภายใน hook); ถ้าไม่ stable การ memo จะไม่ช่วยเต็มที่ แต่ก็ไม่พัง. ESLint `react-hooks/exhaustive-deps` จะเตือนถ้า deps ขาด — ใส่ให้ครบตาม warning
- **VALIDATE**: `npx tsc --noEmit` && `npx eslint app/admin/live-chat/_context/LiveChatContext.tsx` (0 exhaustive-deps warning)

### Task 3 — M3: ลบ dead `ChatState`

- **ACTION**: ลบ `ChatState` interface + `state` field + subscription slice ที่ใช้สร้าง `state` เท่านั้น
- **IMPLEMENT**:
  - **ตรวจก่อน**: รัน `grep -rn "\.state\." app/admin/live-chat/_components app/admin/live-chat/_hooks` — ยืนยัน 0 consumer (PRD ระบุ 0). ถ้าพบ ให้ refactor consumer นั้นไปอ่าน Zustand store ก่อน
  - ลบ `interface ChatState { ... }` (`:26-47`)
  - ลบ `state: ChatState;` จาก `LiveChatContextValue` (`:50`)
  - ลบ `const state: ChatState = useMemo(...)` block (`:731-757`)
  - ลบ `state,` key จาก `value` object (`:760`)
  - ลบ slice subscriptions ที่ **ใช้เพื่อสร้าง `state` เท่านั้น** (`:144-163`) — แต่ **เก็บไว้** field ใดที่ยังถูกใช้ที่อื่นในไฟล์: ตรวจทีละตัว. `conversations`+`selectedId` ใช้ใน `selectedConversation` memo (`:712-714`) → **เก็บ**; `currentChat` ใช้ใน `isHumanMode` (`:716`) → **เก็บ**. ที่เหลือ (`messages, loading, backendOnline, filterStatus, searchQuery, inputText, sending, claiming, showCustomerPanel, activeActionMenu, showTransferDialog, showCannedPicker, soundEnabled, pendingMessages, failedMessages, hasMoreHistory, isLoadingHistory`) → ตรวจ usage; ตัวที่ไม่ถูกใช้ที่อื่น ลบได้
- **MIRROR**: —
- **IMPORTS**: ถ้าลบ `useMemo` ของ state แล้วยังมี `selectedConversation` useMemo อยู่ → คง `useMemo` import
- **GOTCHA**: นี่คือจุดเสี่ยงสูงสุดของ Phase 1 — ลบ subscription ผิดตัวจะทำให้ค่าค้าง. ทำ Task 3 **หลัง** Task 2 และรัน flow หลัก (send/claim/select) หลังแก้. ถ้าไม่แน่ใจ field ไหนถูกใช้ ให้ `grep` ชื่อ field ในไฟล์ก่อนลบ
- **VALIDATE**: `npx tsc --noEmit` (ไม่มี unused/undefined) && manual: เลือก conversation, พิมพ์, ส่ง — ทำงานปกติ

### Task 4 — H4/W3: Store `liveMessage` announcement state

- **ACTION**: เพิ่ม state สำหรับ live region + update ใน `addMessage` เมื่อ INCOMING
- **IMPLEMENT** ใน `liveChatStore.ts`:
  - เพิ่มใน `LiveChatState`: `liveMessage: string` (`:50` กลุ่ม UI extensions)
  - เพิ่ม `initialState`: `liveMessage: '',`
  - แก้ `addMessage` (`:130`):
    ```ts
    addMessage: (message) => set((s) => ({
      messages: [...s.messages, message],
      liveMessage: message.direction === 'INCOMING'
        ? `ข้อความใหม่จาก ${message.operator_name || s.currentChat?.display_name || 'ผู้ใช้'}`
        : s.liveMessage,
    })),
    ```
  - (ตัวเลือก) action `clearLiveMessage: () => set({ liveMessage: '' })` ถ้าต้องการ reset
- **MIRROR**: `liveChatStore.ts:130` + immutable pattern `:193-199`
- **IMPORTS**: ไม่เพิ่ม
- **GOTCHA**: ใช้ string เดียว (last announcement) พอสำหรับ `aria-live="polite"`; ถ้า 2 ข้อความเหมือนกันติดกัน screen reader อาจไม่ประกาศซ้ำ — ยอมรับได้ใน Phase 1. **ห้าม** ใส่ทั้ง array ลง region (จะอ่านยาว)
- **VALIDATE**: `npx tsc --noEmit` && unit test Task 10

### Task 5 — H4/W3: ChatArea live region (ลบ aria-live จาก container)

- **ACTION**: ลบ `aria-live="polite"` จาก scroll container (`:263`); เพิ่ม visually-hidden `role="log"` region
- **IMPLEMENT** ใน `ChatArea.tsx`:
  - ลบบรรทัด `aria-live="polite"` ที่ `:263` (เหลือ `ref`, `className`, `onScroll`)
  - subscribe store: `const liveMessage = useLiveChatStore((s) => s.liveMessage);` (กลุ่ม `:26-41`)
  - เพิ่มก่อน `<MessageInput>` (นอก scroll container, `:329-330`):
    ```tsx
    <div role="log" aria-live="polite" aria-relevant="additions" className="sr-only">
      {liveMessage}
    </div>
    ```
- **MIRROR**: Tailwind `sr-only` (built-in utility — ยืนยัน: ใช้ใน `ChatArea` ได้, ไม่ต้องนิยามใน globals.css)
- **IMPORTS**: `useLiveChatStore` import อยู่แล้ว (`:9`)
- **GOTCHA**: region ต้องอยู่ **นอก** `messagesContainerRef` div และ **ไม่ถูก virtualize**; ต้อง render ตลอด (ไม่ conditional) เพื่อให้ screen reader monitor. `sr-only` คือ Tailwind built-in — ถ้า build ไม่เจอ ให้ใช้ inline `className="absolute w-px h-px overflow-hidden whitespace-nowrap"` แทน
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/ChatArea.tsx` && DOM inspect: scroll container ไม่มี aria-live; มี `role="log"` 1 ตัว

### Task 6 — M5: Status accents → design token

- **ACTION**: แทน hardcoded green/amber/rose/red ด้วย token
- **IMPLEMENT**:
  - `ConversationItem.tsx:100`: `bg-rose-500` → `bg-danger`
  - `ConversationList.tsx:238-251` (summary bar):
    - `text-green-400` + dot `bg-green-400` (animate-ping + solid) → `text-online` / `bg-online`
    - `text-amber-400` + `bg-amber-400` → `text-away` / `bg-away`
    - `text-sidebar-text-muted` + `bg-white/20` (offline) → คง `text-sidebar-text-muted` แต่ dot → `bg-offline` (หรือคง `bg-white/20` ถ้าบน dark sidebar อ่านง่ายกว่า — เลือก `bg-offline`)
  - `ChatArea.tsx:175-195` (empty-state connection pill): map ternary green/red/amber →
    - connected: `bg-online/10 text-online border-online/20`, dot `bg-online` (+ `animate-ping` คง — motion เป็น Phase 4)
    - disconnected: `bg-danger/10 text-danger border-danger/20`, dot `bg-danger`
    - else: `bg-away/10 text-away border-away/20`, dot `bg-away`
- **MIRROR**: `ConversationItem.tsx:62-66` (online/away/offline) + `ChatArea.tsx:137-144` (connectionStatus ที่ใช้ `bg-online/10 text-online` ถูกแล้ว)
- **IMPORTS**: none
- **GOTCHA**: dark-mode variants (`dark:bg-green-500/10` ฯลฯ) ใน empty-state pill — token เป็น single value (ไม่มี dark variant ในชุด online/away/offline) → ลบ `dark:` duplicate ออก (token ปรับเองตาม theme ถ้านิยามไว้ — ตรวจ globals.css `.dark` scope; ถ้า token ไม่เปลี่ยนตาม theme ให้คงความอ่านง่ายด้วย `/10` opacity ซึ่งใช้ได้ทั้งสอง theme). อย่าทิ้ง border/contrast
- **VALIDATE**: `grep -rn "green-\|amber-\|rose-\|red-" app/admin/live-chat/_components/{ConversationItem,ConversationList,ChatArea}.tsx` → เหลือเฉพาะที่อยู่นอก scope (เช่น empty-state อื่น) ; build เขียว

### Task 7 — M4/W5: NotificationToast dismiss hit area

- **ACTION**: dismiss button ≥ 24px
- **IMPLEMENT** `NotificationToast.tsx:79-85`: `p-0.5` → `p-1.5` (หรือเพิ่ม `min-w-6 min-h-6 inline-flex items-center justify-center`); คง `aria-label="Dismiss notification"` (มีแล้ว); เพิ่ม `aria-hidden` บน `<X>` SVG
- **MIRROR**: hit-area pattern เดียวกับ expand button (Task 1)
- **IMPORTS**: none
- **GOTCHA**: toast กว้าง `w-80` คงที่ — เพิ่ม padding ไม่ทำ layout พัง; **อย่า** เพิ่ม motion (Phase 4)
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/NotificationToast.tsx`

### Task 8 — M14: kebab menu — ship "mark as read" + disable ปุ่ม dead

- **ACTION**: ทำ 'ทำเครื่องหมายว่าอ่านแล้ว' ให้ทำงานจริง; ปุ่ม noop ที่เหลือ disable + ป้าย "เร็ว ๆ นี้"
- **IMPLEMENT**:
  - ใน `ConversationList.tsx`: เพิ่ม handler reset unread ของ conversation นั้น (mirror logic `LiveChatContext.tsx:451-454`):
    ```ts
    const markConversationRead = useLiveChatStore((s) => s.setConversations);
    const conversationsRef = useLiveChatStore((s) => s.conversations);
    const handleMarkRead = (lineUserId: string) => {
      markConversationRead(conversationsRef.map((c) =>
        c.line_user_id === lineUserId ? { ...c, unread_count: 0 } : c));
    };
    ```
    (หรือเพิ่ม action `markRead(id)` ใน store แล้วเรียก — สะอาดกว่า; ดู Task 8b)
  - ส่ง prop `onMarkRead={() => handleMarkRead(conversation.line_user_id)}` ลง `<ConversationItem>` (`:218-229`)
  - ใน `ConversationItem.tsx`:
    - เพิ่ม `onMarkRead: () => void;` ใน `ConversationItemProps`
    - 'ดูประวัติแชท' (`:141-147`) — คงไว้ (works)
    - ย้าย/ทำ 'ทำเครื่องหมายว่าอ่านแล้ว' (`:155-161`) ขึ้นเป็นรายการที่ 2: `onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMarkRead(); }}`
    - ปุ่ม pin/mute/archive/spam/delete → `<button disabled className="... opacity-50 cursor-not-allowed" aria-disabled="true">` + เพิ่ม `<span className="ml-auto text-[9px] text-text-tertiary">เร็ว ๆ นี้</span>`; ลบ `cursor-pointer hover:bg-muted` (ไม่ควร hover ปุ่ม disabled)
- **IMPLEMENT 8b (store action — แนะนำ)** ใน `liveChatStore.ts`:
  ```ts
  markRead: (id: string) => set((s) => ({
    conversations: s.conversations.map((c) => c.line_user_id === id ? { ...c, unread_count: 0 } : c),
  })),
  ```
  เพิ่มใน `LiveChatActions` interface ด้วย แล้วใน ConversationList เรียก `const markRead = useLiveChatStore((s) => s.markRead)`
- **MIRROR**: `LiveChatContext.tsx:451-454` (reset unread); `liveChatStore.ts:126,130` (immutable map)
- **IMPORTS**: ไม่เพิ่ม lucide (icons มีครบ); ถ้าทำ 8b ไม่ต้อง import เพิ่ม
- **GOTCHA**: `aria-disabled`+`disabled` กัน focus/click; ป้าย "เร็ว ๆ นี้" ต้องไม่ทำให้ปุ่มหลุด layout (`ml-auto`). อย่าลบปุ่มออก — ผู้ใช้ระบุ "hide/disable with soon affordance"
- **VALIDATE**: `npx tsc --noEmit` && unit test Task 10 (markRead) && manual: คลิก mark-read → unread badge หาย

### Task 9 — Unit test: MessageInput accessible names (H1/M4)

- **ACTION**: สร้าง `_components/__tests__/MessageInput.test.tsx`
- **IMPLEMENT** (AAA, mirror `roles.test.ts`):
  - render `<MessageInput>` ด้วย props ครบ (mock callbacks เป็น `vi.fn()`, `isHumanMode={true}`)
  - `it('exposes accessible names for all composer buttons')`: `expect(screen.getByRole('button', { name: 'ส่งข้อความ' })).toBeInTheDocument()` + Emoji/Sticker/Upload/QuickReplies/Canned/Sound/expand
  - `it('marks toggle buttons with aria-pressed')`: query Emoji → `toHaveAttribute('aria-pressed')`
  - `it('hides decorative icons from a11y tree')`: ตรวจ SVG ไม่มี role (หรือ container ไม่มี accessible text จาก SVG)
- **MIRROR**: `roles.test.ts:1-13`; RTL `render`/`screen`/`getByRole`
- **IMPORTS**: `import { render, screen } from '@testing-library/react'`; `import { describe, it, expect, vi } from 'vitest'`; `import { MessageInput } from '../MessageInput'`
- **GOTCHA**: `MessageInput` ใช้ `useLiveChatStore` (Zustand) — store เป็น global singleton, ทำงานใน jsdom ได้โดยไม่ต้อง mock (ค่า default `inputExpanded=false` ฯลฯ); ไม่ต้อง wrap Provider เพราะอ่านจาก store ตรง. ถ้า child picker (EmojiPicker ฯลฯ) พังตอน render — ปิดด้วยการคง default store state (ทุก picker false)
- **VALIDATE**: `npx vitest run app/admin/live-chat/_components/__tests__/MessageInput.test.tsx`

### Task 10 — Unit test: store liveMessage + markRead (H4/W3, M14)

- **ACTION**: สร้าง `_store/__tests__/liveChatStore.test.ts`
- **IMPLEMENT**:
  - `beforeEach`: reset store `useLiveChatStore.setState(initialState)` (export `initialState` หรือ reset ทีละ field)
  - `it('sets liveMessage on INCOMING message')`: `addMessage({direction:'INCOMING', operator_name:'Somchai', ...})` → `expect(getState().liveMessage).toContain('Somchai')`
  - `it('does NOT change liveMessage on OUTGOING message')`: ตั้งค่าเริ่ม → addMessage OUTGOING → liveMessage ไม่เปลี่ยน
  - `it('markRead resets unread_count for the target conversation only')`: setConversations 2 ตัว unread>0 → markRead(id1) → id1=0, id2 คงเดิม
- **MIRROR**: `roles.test.ts` structure; Zustand `useLiveChatStore.getState()/setState()`
- **IMPORTS**: `import { describe, it, expect, beforeEach } from 'vitest'`; `import { useLiveChatStore } from '../liveChatStore'`
- **GOTCHA**: Zustand persists ข้าม test — `setState` reset ใน `beforeEach` เสมอ. Message type ต้อง cast/สร้างให้ครบ field ที่ required (ดู `@/lib/websocket/types` Message)
- **VALIDATE**: `npx vitest run app/admin/live-chat/_store/__tests__/liveChatStore.test.ts`

### Task 11 — Capture "after" baseline + close metric

- **ACTION**: เก็บ Profiler count หลังแก้ H3 เทียบ Task 0
- **IMPLEMENT**: ทำ scenario "พิมพ์ 1 ตัว" ซ้ำ → บันทึก "after" ใน `phase-1-profiler-baseline.md`. เป้า: `ConversationList`/`ConversationItem`/`CustomerPanel` re-render = 0 ใน scenario
- **VALIDATE**: report มี before/after; after = 0 re-render ของ component ที่ไม่เกี่ยว input

## Testing Strategy

### Unit test table

| Test file | Subject | Cases |
|-----------|---------|-------|
| `__tests__/MessageInput.test.tsx` | H1/M4 | (1) accessible name ทุกปุ่ม composer + Send + expand; (2) aria-pressed บน toggle; (3) aria-expanded บน expand; (4) SVG aria-hidden |
| `_store/__tests__/liveChatStore.test.ts` | H4/W3, M14 | (1) liveMessage set บน INCOMING; (2) liveMessage ไม่เปลี่ยนบน OUTGOING; (3) markRead reset เฉพาะ target |

### Edge-case checklist

- [ ] พิมพ์ข้อความขณะ `isHumanMode=false` → composer disabled (opacity-60 pointer-events-none คงเดิม) แต่ปุ่มยังมี accessible name
- [ ] ข้อความ INCOMING 2 ข้อความติดกันจากคนเดียวกัน → live region อาจไม่ประกาศซ้ำ (ยอมรับใน Phase 1)
- [ ] mark-read บน conversation ที่ unread=0 อยู่แล้ว → ไม่พัง, ไม่เปลี่ยน
- [ ] kebab menu ปุ่ม disabled → กด/focus ไม่ทำอะไร, ไม่ปิดเมนูโดยไม่ตั้งใจ
- [ ] empty-state connection pill ทั้ง 3 สถานะ (connected/disconnected/connecting) → สีถูก token
- [ ] dark mode: status token อ่านได้ทั้ง light/dark
- [ ] ลบ ChatState แล้ว → select/send/claim/transfer/close flow ไม่ regress (manual)

## Validation Commands

รันจาก `D:/genAI/jsk-app/frontend`:

```bash
npx tsc --noEmit
# EXPECT: 0 errors (ไม่มี unused ChatState, value memo type ถูก)

npx eslint app/admin/live-chat/_components/MessageInput.tsx app/admin/live-chat/_components/ChatArea.tsx app/admin/live-chat/_components/ConversationItem.tsx app/admin/live-chat/_components/ConversationList.tsx app/admin/live-chat/_components/NotificationToast.tsx app/admin/live-chat/_context/LiveChatContext.tsx app/admin/live-chat/_store/liveChatStore.ts
# EXPECT: 0 errors, 0 react-hooks/exhaustive-deps warning (โดยเฉพาะ value useMemo)

npx vitest run
# EXPECT: เทสเดิมทั้งหมดผ่าน + MessageInput.test.tsx + liveChatStore.test.ts ผ่าน (สีเขียว)

npm run build
# EXPECT: build สำเร็จ (tsc + next build)

# Design-token compliance (M5)
grep -rn "green-\|amber-\|rose-500\|red-500" app/admin/live-chat/_components/ConversationItem.tsx app/admin/live-chat/_components/ConversationList.tsx
# EXPECT: เหลือเฉพาะนอก scope (ถ้ามี) — status accents ทั้งหมดเป็น token

npx playwright test
# EXPECT: smoke ผ่าน (ต้องมี dev server) — ไม่มี regression
```

## Acceptance Criteria

- [ ] **H1**: ทุกปุ่ม composer (7) + Send + expand มี `aria-label`; toggle มี `aria-pressed`; expand มี `aria-expanded`; ทุก Lucide SVG ใน MessageInput มี `aria-hidden`
- [ ] **H3**: `value` ครอบ `useMemo` deps ครบ; Profiler ยืนยัน `ConversationList`/`CustomerPanel` re-render = 0 ใน scenario "พิมพ์ 1 ตัว"
- [ ] **M3**: `ChatState` interface + `state` field + slice ที่ตายแล้ว ถูกลบ; `grep "\.state\."` ใน components = 0; tsc เขียว
- [ ] **H4+W3**: scroll container ไม่มี `aria-live`; มี `role="log" aria-live="polite" aria-relevant="additions"` 1 ตัวนอก scroll container; update เฉพาะ INCOMING
- [ ] **M5**: 0 hardcoded green/amber/rose/red ใน status accents ของ 3 ไฟล์
- [ ] **M4+W5**: expand button + toast dismiss ≥ 24px
- [ ] **M14**: 'mark as read' ทำงานจริง (unread → 0); 5 ปุ่ม dead เป็น disabled + ป้าย "เร็ว ๆ นี้"
- [ ] **Baseline**: `phase-1-profiler-baseline.md` มี before + after count
- [ ] build/tsc/eslint/vitest เขียว

## Completion Checklist

- [ ] Task 0 baseline captured
- [ ] Task 1 MessageInput a11y + hit area
- [ ] Task 2 value useMemo
- [ ] Task 3 ลบ ChatState (verify 0 consumer ก่อน)
- [ ] Task 4 store liveMessage
- [ ] Task 5 ChatArea live region
- [ ] Task 6 M5 token mapping (3 ไฟล์)
- [ ] Task 7 toast hit area
- [ ] Task 8 kebab mark-read + disable
- [ ] Task 9 MessageInput.test.tsx
- [ ] Task 10 liveChatStore.test.ts
- [ ] Task 11 after-baseline + metric closed
- [ ] validation commands ทั้งหมดผ่าน
- [ ] commit `fix(live-chat): phase 1 quick wins — a11y composer, memoize context, status tokens, mark-read`

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ลบ subscription slice ผิดตัวใน M3 → ค่าค้าง/undefined | M | High | grep usage ทุก field ก่อนลบ; ทำหลัง Task 2; รัน flow หลัก manual; tsc จับ undefined |
| `value` useMemo deps ขาด → stale closure (เช่น setter ไม่อัปเดต) | M | High | ใส่ deps ตาม eslint exhaustive-deps; method เป็น useCallback อยู่แล้ว → stable |
| `reconnect`/`startTyping` จาก useLiveChatSocket ไม่ stable → memo ไม่ลด re-render | L | Med | ยังไม่พัง; ถ้า Profiler ยังเห็น re-render ให้ตรวจ hook (out of Phase 1 scope ถ้าลึก) |
| Tailwind `sr-only` ไม่ทำงานใน build นี้ | L | Med | fallback inline `absolute w-px h-px overflow-hidden whitespace-nowrap` |
| status token ไม่มี dark variant → contrast ตกใน dark mode | L | Med | ใช้ `/10` opacity bg + solid text token (อ่านได้ทั้ง 2 theme); W2 contrast audit เต็มอยู่ Phase 2 |
| MessageInput test พังเพราะ child picker render | L | Low | คง default store (picker ปิด); ไม่ render picker |
| ป้าย "เร็ว ๆ นี้" ทำ kebab layout พัง | L | Low | `ml-auto` + text เล็ก; ตรวจ manual |

## Notes

- **File ownership**: Phase 1 เป็น owner ของ `MessageInput.tsx` + `ChatArea.tsx` — Phase 2 (W1 focus), Phase 4 (motion), Phase 5 (perf) ต้อง rebase หลัง Phase 1 merge (ตาม PRD §File Ownership).
- **ห้ามแตะใน Phase 1**: `focus:ring-brand-500/40` (`MessageInput.tsx:191`) = W1 Phase 2; `animate-ping`/`animate-pulse` = W4 Phase 4; `state` object useMemo ที่ `:731-757` ถ้าตัดสินใจ "เก็บ state" — แต่ scope บอกให้ลบ (M3) → ลบ.
- **Token ยืนยันมีจริง** (`globals.css`): `--color-online` (`:108`), `--color-away` (`:109`), `--color-offline` (`:111`), `--color-danger` (`:35`), `--color-warning` (`:32`), `--color-info` (`:38`) → ใช้ผ่าน Tailwind `bg-online`/`text-away`/ฯลฯ.
- **RTL พร้อมใช้**: `@testing-library/react@16`, `@testing-library/user-event@14`, `@testing-library/jest-dom@6`, jsdom@25; setup auto-cleanup (`vitest.setup.ts`); test glob `**/__tests__/**/*.test.{ts,tsx}`.
- **CI note (จาก memory)**: GitHub Actions ปิดอยู่ — รัน validation matrix ครบ local ก่อน push/merge.
- **Profiler ถ้าไม่มี DevTools**: instrument ชั่วคราว `useEffect(() => console.count('X render'))` แล้วลบก่อน commit.
