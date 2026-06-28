# Plan: Phase 7 — Operator UX Enhancements (Could)

## Summary

ลด cognitive load ของ operator console บนหน้า `admin/live-chat` โดยปิด 4 finding ที่จัดอยู่ใน MoSCoW bucket "Could": **M18** (รวมระบบควบคุม mode/session ที่ทับซ้อนกันให้เหลือ mental model เดียว), **M19** (ชี้แจง/รวม quick replies vs canned responses), **M20** (persist Internal Notes + ซ่อน stat/ปุ่ม dead ที่เป็น false affordance), **L10** (มาตรฐานป้ายเป็นภาษาไทย + ทำ incoming toast คลิกได้ + แสดงชื่อลูกค้า). งานทั้งหมดเป็น **frontend ล้วน** — ไม่มี backend dependency (ไม่มี notes endpoint อยู่ และ Q3 ตัดสินใจคง quick replies เป็น system preset).

**Q3 default (จาก PRD):** คง quick replies เป็น **system preset** — *ไม่* สร้าง UI ให้ operator/admin แก้เอง (จะ fold เข้า canned-response ในอนาคต นอกขอบเขตเฟสนี้). M19 จึงเป็นงาน **clarify/merge ของ UI ปัจจุบัน** ไม่ใช่ทำให้ configurable.

**M20 persistence:** ไม่มี backend notes endpoint (`grep -i note backend/app/api/v1/endpoints/admin_live_chat.py` = 0 matches) และ Phase 7 เป็น frontend-only ตาม PRD → **persist ผ่าน `localStorage`** (mirror pattern จาก `hooks/useTheme.ts`, `hooks/useNotificationSound.ts`) แบบ key ต่อ `line_user_id` + debounced autosave + saved indicator.

## User Story

**As** เจ้าหน้าที่ operator ที่เปิดหน้า live-chat ทั้งวัน สลับหลายห้องสนทนา
**I want** ระบบควบคุม mode/session ที่ชัดเจน (ไม่ขัดกันเอง), บันทึกโน้ตลูกค้าที่ไม่หายเมื่อปิด panel, ป้ายภาษาเดียวกัน และ toast แจ้งเตือนที่กดเปิดห้องได้
**So that** ทำงานเร็วขึ้น ไม่สับสนกับปุ่มที่ทับซ้อน ไม่เสียโน้ตที่พิมพ์ และกระโดดไปตอบลูกค้าได้ทันทีจากการแจ้งเตือน

## Problem → Solution

| Finding | Problem (current) | Solution (this plan) |
|---------|-------------------|----------------------|
| M18 | `ChatHeader.tsx:96-123` มี segmented Bot\|Manual toggle (เรียก `toggleMode` → `/mode`) *พร้อมกับ* `SessionActions` Claim/Transfer/Done (`:127-133`) — สองระบบควบคุมที่ทับซ้อน mental model. mode ถูก derive จาก session lifecycle อยู่แล้ว (claim→ACTIVE, close→`chat_mode:'BOT'` ที่ `LiveChatContext.tsx:418`) | ขับ mode อัตโนมัติจาก session: **ซ่อน manual segmented toggle ระหว่างมี session (`WAITING`/`ACTIVE`)** เพื่อไม่ให้ขัดกับ Claim/Done; แสดง toggle เฉพาะตอนไม่มี session (free BOT/HUMAN) + เพิ่ม helper text อธิบาย |
| M19 | `QuickReplies.tsx:3-10` มี 6 string เป็น module constant แก้ไม่ได้ + ทับซ้อนกับ canned response; `MessageInput.tsx:140-150` มีสอง picker คล้ายกัน (Zap=Quick Replies vs MessageSquareText=Canned) | คง quick replies เป็น preset (Q3) แต่ **แยกความหมายให้ชัด**: เปลี่ยน label/title/aria ให้สื่อว่า Zap = "ข้อความด่วน (ค่าตั้งต้นระบบ)" กับ MessageSquareText = "ข้อความสำเร็จรูป (แก้ไขได้)"; ทำให้สอง picker ปิดกันเอง (mutual exclusivity) เพื่อลดความสับสน |
| M20 | `CustomerPanel.tsx:162/167/172` hardcode `N/A` (Chats/Rating/Joined); `:217-221` Internal Notes textarea ไม่มี `value`/`onChange`/save (โน้ตหายเมื่อปิด panel); `:113-140` ปุ่ม VIP/View Profile/Bell disabled (false affordance) | persist Notes ผ่าน `localStorage` ต่อ `line_user_id` (debounced autosave + "บันทึกแล้ว" indicator); **ซ่อน** stat ที่เป็น `N/A` และปุ่ม disabled จนกว่าจะมีข้อมูลจริง |
| L10 | ป้าย EN/TH ปนกัน (`SessionActions.tsx:27-37` = Claim/Transfer/Done อังกฤษ, vs เมนูไทยที่อื่น); incoming toast ใช้ `'New Message'` generic ไม่ใช่ชื่อลูกค้า (`LiveChatContext.tsx:293-299`) และ `NotificationToast` ไม่มี `onClick` | มาตรฐานป้ายเป็น **ไทย** (รับสาย/โอนสาย/ปิดสาย + mode labels); toast ใช้ชื่อลูกค้า (`conversations[].display_name`) + เพิ่ม `line_user_id` ลง `ToastNotification` → ทำ toast คลิกได้ → `selectConversation(lineUserId)` |

## Metadata

- **Complexity**: Medium
- **Source PRD**: `D:/genAI/jsk-app/.claude/PRPs/prds/livechat-audit-remediation.prd.md`
- **PRD Phase**: Phase 7 — Operator UX (Could) · Findings M18, M19, M20, L10
- **Estimated Files**: 7 (ChatHeader.tsx, SessionActions.tsx, QuickReplies.tsx, MessageInput.tsx, CustomerPanel.tsx, NotificationToast.tsx, LiveChatContext.tsx) + 1 store (liveChatStore.ts สำหรับ field `lineUserId` บน toast) + 1 hook ใหม่ (`useCustomerNotes.ts`) + tests
- **Depends on**: Phase 6 (ตาม PRD — flow multi-operator ต้องนิ่งก่อน). `CustomerPanel.tsx` owner = Phase 2; Phase 7 rebase หลัง P2/P3/P5 merge (ดู File Ownership ใน PRD).

## UX Design

```
M18 — ChatHeader mode control (Before → After)
BEFORE (two overlapping systems always visible):
┌──────────────────────────────────────────────────────────────┐
│ [avatar] ชื่อ · Manual Mode      [ ⚡Bot | 👤Manual ] | [Claim]│  ← toggle + Claim ขัดกัน
└──────────────────────────────────────────────────────────────┘

AFTER (mode auto-driven by session; toggle hidden during session):
┌──────────────────────────────────────────────────────────────┐
│ no session:  [avatar] ชื่อ · โหมดบอท   [ ⚡บอท | 👤เจ้าหน้าที่ ]│  ← toggle shown (free choice)
│ WAITING:     [avatar] ชื่อ · รอรับสาย                  [รับสาย]│  ← toggle hidden, helper under name
│ ACTIVE:      [avatar] ชื่อ · กำลังสนทนา        [โอนสาย][ปิดสาย]│  ← toggle hidden
└──────────────────────────────────────────────────────────────┘

M20 — CustomerPanel (Before → After)
BEFORE: [Chats N/A][Rating N/A][Joined N/A]  + Notes textarea (lost on close)  + [View Profile⊘][Bell⊘][VIP⊘]
AFTER:  (stats grid hidden — no real data)   + Notes textarea (autosaved ✓ บันทึกแล้ว) + (disabled buttons hidden)

L10 — Toast (Before → After)
BEFORE: ┌ 💬 New Message ───────────── x ┐   (not clickable)
AFTER:  ┌ 💬 [ชื่อลูกค้า] ───────────── x ┐   (click body → open that conversation)
```

## Mandatory Reading

| Priority | File | Lines | Why |
|----------|------|-------|-----|
| P0 | `frontend/app/admin/live-chat/_components/ChatHeader.tsx` | 30-153 | M18 host — segmented toggle (96-123) + SessionActions (127-133) + mode label (87-89) |
| P0 | `frontend/app/admin/live-chat/_components/SessionActions.tsx` | 16-42 | L10 EN labels (27/33/36); M18 session-driven buttons |
| P0 | `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | 113-176, 214-222 | M20 — disabled buttons, N/A stats, dead Notes textarea |
| P0 | `frontend/app/admin/live-chat/_components/NotificationToast.tsx` | 59-92 | L10 — toast row needs onClick + customer name |
| P0 | `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | 288-310, 415-421, 447-460 | L10 toast creation (293-299); M18 close→BOT (418); `selectConversation` (447) |
| P1 | `frontend/app/admin/live-chat/_store/liveChatStore.ts` | 9-16, 193-202 | `ToastNotification` interface + `addNotification` reducer — add `lineUserId` field |
| P1 | `frontend/app/admin/live-chat/_components/QuickReplies.tsx` | 1-31 | M19 — preset constants + bar markup |
| P1 | `frontend/app/admin/live-chat/_components/MessageInput.tsx` | 118-150 | M19 — two pickers (Zap 140-147 / MessageSquareText 148-150); mutual-exclusivity |
| P1 | `frontend/hooks/useTheme.ts` + `frontend/hooks/useNotificationSound.ts` | full | localStorage hook pattern to mirror for `useCustomerNotes` |
| P2 | `frontend/app/admin/live-chat/_types.ts` | (CurrentChat/Session) | confirm `display_name`, `session.status`, `chat_mode` shapes used by M18/L10 |

## Patterns to Mirror

### localStorage hook pattern (for M20 notes persistence)
```ts
// SOURCE: frontend/hooks/useTheme.ts (pattern reference — read full file before implementing)
// Mirror: read initial value lazily from localStorage, guard SSR (typeof window),
// write back in an effect, expose [value, setValue]. useNotificationSound.ts shows the
// same shape with a settings key. New hook keys notes per conversation:
//   const KEY = (lineUserId: string) => `livechat:notes:${lineUserId}`
```

### Zustand notification reducer (extend with lineUserId)
```ts
// SOURCE: frontend/app/admin/live-chat/_store/liveChatStore.ts:9-16
export interface ToastNotification {
  id: string
  title: string
  message: string
  avatar?: string
  type: 'message' | 'system'
  timestamp: number
}
// ADD: lineUserId?: string   // present only for clickable 'message' toasts

// SOURCE: frontend/app/admin/live-chat/_store/liveChatStore.ts:193-199
addNotification: (notification) => set((s) => ({
  notifications: [...s.notifications, {
    ...notification,
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  }],
})),
// No reducer change needed — spread already carries optional lineUserId through.
```

### Toast creation site (L10 — use customer name + lineUserId)
```tsx
// SOURCE: frontend/app/admin/live-chat/_context/LiveChatContext.tsx:292-299
if (message.line_user_id !== selectedIdRef.current) {
  getStore().addNotification({
    title: message.operator_name || 'New Message',   // ← BUG: operator_name on INCOMING is wrong; generic fallback
    message: message.content?.substring(0, 100) || 'New message received',
    avatar: undefined,
    type: 'message',
  });
}
// FIX: resolve display name from conversations store by message.line_user_id,
//      pass lineUserId so the toast can open the room.
```

### Session-driven control (M18 — mode already derives from session)
```tsx
// SOURCE: frontend/app/admin/live-chat/_components/ChatHeader.tsx:42-46
const isBot = currentChat?.chat_mode === 'BOT';
const isActive = currentChat?.session?.status === 'ACTIVE';
// SOURCE: ChatHeader.tsx:127-133 — SessionActions renders Claim (WAITING) / Transfer+Done (ACTIVE)
// SOURCE: LiveChatContext.tsx:415-421 — onSessionClosed sets chat_mode:'BOT', session:undefined
// → Derive: hasSession = !!currentChat?.session; hide segmented toggle when hasSession.
```

### Disabled / false-affordance buttons to hide (M20)
```tsx
// SOURCE: frontend/app/admin/live-chat/_components/CustomerPanel.tsx:113-115 (View Profile, disabled)
// SOURCE: CustomerPanel.tsx:127-140 (Bell + VIP Star, disabled)
// SOURCE: CustomerPanel.tsx:159-175 (stats grid: Chats/Rating/Joined all N/A)
// → Remove these JSX blocks (do not just disable). Keep Copy LINE ID (line 120-126) which works.
```

### Test structure (vitest, AAA)
```ts
// SOURCE pattern: frontend uses vitest (npx vitest run — see CLAUDE.md). Mirror constants tests in
// frontend/lib/constants/__tests__/. Use Arrange-Act-Assert; for hooks use @testing-library/react renderHook.
test('persists notes to localStorage per conversation', () => {
  // Arrange: render useCustomerNotes('U123')
  // Act: setNotes('hello'); advance debounce timer
  // Assert: localStorage.getItem('livechat:notes:U123') === 'hello'
});
```

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `frontend/app/admin/live-chat/_components/ChatHeader.tsx` | UPDATE | M18: hide segmented toggle when session exists; M18/L10: Thai mode label + helper text |
| `frontend/app/admin/live-chat/_components/SessionActions.tsx` | UPDATE | L10: Thai labels (รับสาย/โอนสาย/ปิดสาย + Claiming state) + aria-labels |
| `frontend/app/admin/live-chat/_components/QuickReplies.tsx` | UPDATE | M19: clarify this is a system preset (heading/aria distinct from canned) |
| `frontend/app/admin/live-chat/_components/MessageInput.tsx` | UPDATE | M19: distinct Thai titles/aria for Zap vs MessageSquareText; make the two pickers mutually exclusive |
| `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | UPDATE | M20: wire Notes to `useCustomerNotes`; hide N/A stats + disabled buttons |
| `frontend/app/admin/live-chat/_components/NotificationToast.tsx` | UPDATE | L10: clickable toast body → onSelect(lineUserId); keyboard accessible |
| `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | UPDATE | L10: toast title = customer name + pass lineUserId; wire toast click to selectConversation |
| `frontend/app/admin/live-chat/_store/liveChatStore.ts` | UPDATE | L10: add optional `lineUserId` to `ToastNotification` |
| `frontend/hooks/useCustomerNotes.ts` | CREATE | M20: localStorage-backed notes per conversation + debounce + saved flag |
| `frontend/hooks/__tests__/useCustomerNotes.test.ts` | CREATE | M20: unit test persistence + debounce + per-id isolation |
| `frontend/app/admin/live-chat/_components/__tests__/SessionActions.test.tsx` | CREATE | L10/M18: assert Thai labels render for WAITING/ACTIVE states |

## NOT Building

- **NOT** making quick replies editable/configurable by operator or admin (Q3 default = keep system preset; fold into canned-response is a *future* task, out of scope).
- **NOT** adding a backend notes endpoint / DB column — M20 persistence is localStorage-only (frontend-only phase). A server-synced notes feature is out of scope.
- **NOT** implementing real Chats/Rating/Joined stats or VIP/View Profile/Notifications features — those buttons are *hidden*, not built.
- **NOT** removing `toggleMode` / `/mode` endpoint usage — the toggle still exists when there is no session; we only hide it during a session.
- **NOT** refactoring LiveChatContext into hooks (that is Phase 8).
- **NOT** touching message-list virtualization, WebSocket layer, or claim/ownership guards.
- **NOT** translating raw error/log strings or developer-facing console messages (L10 = user-facing UI labels only).

## Step-by-Step Tasks

### Task 1 — M20: create `useCustomerNotes` hook (localStorage persistence)
- **ACTION**: CREATE `frontend/hooks/useCustomerNotes.ts`.
- **IMPLEMENT**: `useCustomerNotes(lineUserId: string | null)` returns `{ notes: string; setNotes: (v: string) => void; saved: boolean }`. Lazy-init from `localStorage` key `livechat:notes:${lineUserId}` (empty string if none/SSR). On `lineUserId` change, reload value. On `setNotes`, update state immediately, set `saved=false`, debounce ~600ms then write to localStorage and set `saved=true`. Guard `typeof window === 'undefined'`. No-op when `lineUserId` is null.
- **MIRROR**: `frontend/hooks/useTheme.ts` + `frontend/hooks/useNotificationSound.ts` (lazy read, SSR guard, effect write).
- **IMPORTS**: `import { useEffect, useRef, useState, useCallback } from 'react'`.
- **GOTCHA**: keep the debounce timer in a `useRef` and clear it on unmount AND when `lineUserId` changes (otherwise a pending write lands under the wrong key). Reset `saved` to `true` after reload so the indicator does not falsely show "saving" on open.
- **VALIDATE**: `npx tsc --noEmit` then `npx vitest run hooks/__tests__/useCustomerNotes.test.ts`.

### Task 2 — M20: write unit test for `useCustomerNotes`
- **ACTION**: CREATE `frontend/hooks/__tests__/useCustomerNotes.test.ts`.
- **IMPLEMENT**: tests — (a) reads initial value from localStorage; (b) `setNotes` writes after debounce; (c) `saved` toggles false→true around the write; (d) switching `lineUserId` loads a different key and isolates values; (e) null id is a no-op. Use `vi.useFakeTimers()` + `renderHook`/`act` from `@testing-library/react`.
- **MIRROR**: AAA structure from `frontend/lib/constants/__tests__/`.
- **IMPORTS**: `import { describe, test, expect, vi, beforeEach } from 'vitest'`; `import { renderHook, act } from '@testing-library/react'`.
- **GOTCHA**: clear `localStorage` in `beforeEach`; run pending timers inside `act(() => vi.advanceTimersByTime(600))`.
- **VALIDATE**: `npx vitest run hooks/__tests__/useCustomerNotes.test.ts` → all pass.

### Task 3 — M20: wire Notes + hide N/A stats & disabled buttons in CustomerPanel
- **ACTION**: UPDATE `frontend/app/admin/live-chat/_components/CustomerPanel.tsx`.
- **IMPLEMENT**:
  1. Call `const { notes, setNotes, saved } = useCustomerNotes(currentChat?.line_user_id ?? null)` (after the early `if (!currentChat) return null` it is safe; but hooks must run before any return — call it at top with the nullable id, OR keep the early return and move the hook above it passing `currentChat?.line_user_id ?? null`). **Move the hook call above the `if (!currentChat) return null` guard (line 22).**
  2. Bind textarea (`:217-221`): add `value={notes}`, `onChange={(e) => setNotes(e.target.value)}`. Add a small saved indicator near the "Internal Notes" heading: show "บันทึกแล้ว" with a check icon when `saved`, else "กำลังบันทึก…".
  3. Remove the stats grid block (`:159-175`) entirely (all N/A).
  4. Remove disabled "View Profile" button (`:113-115`), disabled Bell (`:127-133`) and disabled VIP Star (`:134-140`). Keep the working Copy LINE ID button (`:120-126`).
- **MIRROR**: hook usage from Task 1; saved-indicator copy in Thai per L10.
- **IMPORTS**: `import { useCustomerNotes } from '@/hooks/useCustomerNotes';` Drop now-unused icon imports (`Bell`, `Star`, `Calendar`, `MessageSquare`, `ExternalLink` if only used in removed blocks — verify each before removing from the line 5 import).
- **GOTCHA**: React rules of hooks — the hook must be called unconditionally before the `if (!currentChat) return null`. After removing icons, run ESLint to catch unused imports. Do not remove the `Activity`/Session/Export blocks (those use real data).
- **VALIDATE**: `npx tsc --noEmit && npx eslint app/admin/live-chat/_components/CustomerPanel.tsx`.

### Task 4 — L10: add `lineUserId` to ToastNotification + make toast clickable
- **ACTION**: UPDATE `frontend/app/admin/live-chat/_store/liveChatStore.ts` and `frontend/app/admin/live-chat/_components/NotificationToast.tsx`.
- **IMPLEMENT**:
  1. Store: add `lineUserId?: string` to `ToastNotification` (`:9-16`). No reducer change (spread already passes it through, `:193-199`).
  2. NotificationToast: accept a new optional prop `onSelect?: (lineUserId: string) => void`. Wrap the toast body (title + message, NOT the dismiss X button) in a `<button>` / clickable region with `onClick={() => toast.lineUserId && onSelect?.(toast.lineUserId)}`, `type="button"`, full-width text-left, only rendered as clickable when `toast.lineUserId` is present (system toasts stay non-clickable). Keep the dismiss button outside the clickable area to avoid nested interactive elements. Add `cursor-pointer` + hover affordance when clickable.
- **MIRROR**: existing dismiss button (`:79-85`) for button semantics; `cn()` usage (`:69`).
- **IMPORTS**: none new in store; NotificationToast keeps existing imports.
- **GOTCHA**: do NOT nest the dismiss `<button>` inside the body `<button>` (invalid HTML / a11y). Restructure so they are siblings. `aria-live="polite"` container (`:60`) stays.
- **VALIDATE**: `npx tsc --noEmit && npx eslint app/admin/live-chat/_components/NotificationToast.tsx app/admin/live-chat/_store/liveChatStore.ts`.

### Task 5 — L10: toast uses customer name + lineUserId, wire click → selectConversation
- **ACTION**: UPDATE `frontend/app/admin/live-chat/_context/LiveChatContext.tsx`.
- **IMPLEMENT**:
  1. At the toast creation site (`:292-299`), resolve the customer display name: look up `getStore().conversations.find(c => c.line_user_id === message.line_user_id)?.display_name`; set `title` to that name (fallback `'ข้อความใหม่'`). Set `lineUserId: message.line_user_id`. (Remove the incorrect `message.operator_name` title — operator_name is not the customer on INCOMING.)
  2. Where `<NotificationToast />` is rendered (find via grep — likely in the live-chat page or layout), pass `onSelect={selectConversation}`. If NotificationToast is rendered outside the provider tree, instead pass a thin handler that calls `selectConversation`. Confirm the render site and wire it.
- **MIRROR**: `selectConversation` (`:447-460`) already updates URL + clears unread — exactly the desired click behavior.
- **IMPORTS**: none new.
- **GOTCHA**: `selectConversation` is stable (`useCallback`, `:447`). Ensure the toast's `onSelect` also dismisses the toast after selecting (call `removeNotification` or rely on auto-timeout) — acceptable to leave auto-dismiss. The conversations lookup must use `getStore()` (live snapshot), not a closed-over `conversations` value.
- **VALIDATE**: `npx tsc --noEmit && npx eslint app/admin/live-chat/_context/LiveChatContext.tsx`.

### Task 6 — L10: Thai labels in SessionActions + test
- **ACTION**: UPDATE `frontend/app/admin/live-chat/_components/SessionActions.tsx`; CREATE `frontend/app/admin/live-chat/_components/__tests__/SessionActions.test.tsx`.
- **IMPLEMENT**: replace EN button text/aria — `Claim`→`รับสาย` (`:27` text + `:24` aria `Claim session`→`รับสาย`), `Claiming...`→`กำลังรับสาย…`, `Transfer`→`โอนสาย` (`:33` + `:32` aria), `Done`→`ปิดสาย` (`:36` + `:35` aria `Close session`→`ปิดสาย`). Keep `role="group"` aria-label as Thai `การจัดการสาย`. Test: render with `session.status='WAITING'` asserts `รับสาย`; with `'ACTIVE'` asserts `โอนสาย` + `ปิดสาย`.
- **MIRROR**: Thai copy convention already in `MessageInput.tsx:102` ("Bot กำลังตอบอัตโนมัติ"); test AAA from `lib/constants/__tests__/`.
- **IMPORTS** (test): `vitest` + `@testing-library/react` (`render`, `screen`).
- **GOTCHA**: keep `thai-no-break` / `thai-text` classes so Thai wraps correctly. Do not change the `focus-ring` class (owned by Phase 2 a11y).
- **VALIDATE**: `npx vitest run app/admin/live-chat/_components/__tests__/SessionActions.test.tsx`.

### Task 7 — M18: drive mode from session, hide manual toggle during a session
- **ACTION**: UPDATE `frontend/app/admin/live-chat/_components/ChatHeader.tsx`.
- **IMPLEMENT**:
  1. Compute `const hasSession = !!currentChat?.session;` (and `const sessionStatus = currentChat?.session?.status;`).
  2. Wrap the segmented Bot|Manual control (`:96-123`) so it renders **only when `!hasSession`** (free mode choice when no live session). During a session, mode is dictated by Claim/Done, so the manual toggle is hidden to remove the conflicting control.
  3. Update the sub-label (`:87-89`): instead of only "Bot Mode"/"Manual Mode" (EN), show Thai context-aware text: no session → "โหมดบอท"/"โหมดเจ้าหน้าที่"; `WAITING` → "รอรับสาย"; `ACTIVE` → "กำลังสนทนา". This is the helper text that replaces the hidden toggle's affordance.
  4. Translate segmented toggle button labels to Thai (`Bot`→`บอท`, `Manual`→`เจ้าหน้าที่`) + aria (`Switch to Bot mode`→`สลับเป็นโหมดบอท`, etc.) for L10 consistency.
- **MIRROR**: `isBot`/`isActive` derivation (`:42-43`); SessionActions already session-gated.
- **IMPORTS**: no new imports.
- **GOTCHA**: keep `aria-pressed={isBot}` on the toggle. The divider at `:125` should also hide with the toggle (avoid an orphan separator). Do not break the `md:flex` responsive gate.
- **VALIDATE**: `npx tsc --noEmit && npx eslint app/admin/live-chat/_components/ChatHeader.tsx`.

### Task 8 — M19: clarify/merge quick replies vs canned responses
- **ACTION**: UPDATE `frontend/app/admin/live-chat/_components/MessageInput.tsx` and `frontend/app/admin/live-chat/_components/QuickReplies.tsx`.
- **IMPLEMENT**:
  1. MessageInput Zap button (`:140-147`): `title`/aria → `"ข้อความด่วน (ค่าตั้งต้นระบบ)"`. MessageSquareText button (`:148-150`): `title`/aria → `"ข้อความสำเร็จรูป"`. Distinct copy removes the "two similar pickers" confusion.
  2. Make the two mutually exclusive: when opening Quick Replies, ensure canned picker is closed and vice-versa. `toggleQuickReplies` lives in the store; the simplest path: in the Zap onClick also call `onCloseCanned()` (prop already passed), and in the canned toggle (`onToggleCannedPicker`) the parent should close quick replies. Verify store has `closeAllPickers` (`:68`) — call `closeAllPickers()`-style coordination so only one surface is open. Add a small clarifying caption row inside `QuickReplies.tsx` ("ข้อความด่วน — ค่าตั้งต้นของระบบ") so operators understand it is preset (Q3).
- **MIRROR**: existing `btnClass`/`title` pattern (`:127-138`); `closeAllPickers` selector (`:68`).
- **IMPORTS**: none new.
- **GOTCHA**: Q3 = keep preset — do NOT add edit/add/delete UI. Keep `animate-scale-in` (Phase 4 owns motion; leave as-is). Ensure mutual exclusivity does not break the canned picker's own open state managed by the parent page.
- **VALIDATE**: `npx tsc --noEmit && npx eslint app/admin/live-chat/_components/MessageInput.tsx app/admin/live-chat/_components/QuickReplies.tsx`.

### Task 9 — Full validation sweep
- **ACTION**: run the complete project validation matrix from `D:/genAI/jsk-app/frontend`.
- **VALIDATE**: `npx tsc --noEmit` → `npx eslint app/admin/live-chat hooks/useCustomerNotes.ts hooks/__tests__/useCustomerNotes.test.ts` → `npx vitest run` → `npm run build` → `npx playwright test` (with dev server running).

## Testing Strategy

| Test | File | Type | Asserts |
|------|------|------|---------|
| Notes persist after debounce | `hooks/__tests__/useCustomerNotes.test.ts` | unit | localStorage key `livechat:notes:U123` === typed value |
| Notes isolated per conversation | same | unit | switching id loads different value, no bleed |
| `saved` indicator toggles | same | unit | false during typing → true after debounce |
| Null id is no-op | same | unit | no localStorage write, no throw |
| SessionActions Thai labels (WAITING) | `_components/__tests__/SessionActions.test.tsx` | unit | renders `รับสาย` |
| SessionActions Thai labels (ACTIVE) | same | unit | renders `โอนสาย` + `ปิดสาย` |

**Edge-case checklist**
- [ ] Notes textarea with `currentChat === null` → hook called with null id, no crash, no write.
- [ ] Rapid conversation switching → pending debounce timer flushed/cancelled to correct key.
- [ ] Toast with `type:'system'` (no lineUserId) → body NOT clickable; dismiss still works.
- [ ] Toast click → opens correct room + URL updates + unread cleared (via `selectConversation`).
- [ ] M18: no session → toggle visible; WAITING/ACTIVE → toggle hidden, no orphan divider.
- [ ] M19: opening Quick Replies closes Canned picker and vice-versa (only one open).
- [ ] M20: stats grid + VIP/View Profile/Bell buttons absent from DOM (not just disabled).
- [ ] localStorage unavailable (private mode) → hook degrades gracefully (try/catch), UI still works.
- [ ] No `console.log`; no hardcoded `slate-*`/raw hex introduced (Phase 3 token rule).

## Validation Commands

Run from `D:/genAI/jsk-app/frontend`:

```bash
npx tsc --noEmit
# EXPECT: no errors

npx eslint app/admin/live-chat hooks/useCustomerNotes.ts hooks/__tests__/useCustomerNotes.test.ts
# EXPECT: no errors/warnings (no unused imports after CustomerPanel cleanup)

npx vitest run
# EXPECT: all existing tests + new useCustomerNotes + SessionActions tests pass

npm run build
# EXPECT: tsc + next build succeed, no type errors

npx playwright test
# EXPECT: smoke flows pass (requires dev server); no regression in live-chat load
```

## Acceptance Criteria

- **M18**: Manual Bot|Manual segmented toggle is hidden whenever a session exists (`WAITING`/`ACTIVE`); shown only when there is no session. Sub-label reflects session state in Thai. No control conflict between toggle and Claim/Done.
- **M19**: Zap and MessageSquareText pickers have distinct Thai labels/aria; opening one closes the other; quick replies remain a system preset (no edit UI). A caption indicates preset status.
- **M20**: Internal Notes persist across panel close/reopen (localStorage per `line_user_id`) with a visible saved indicator; N/A stats grid and disabled VIP/View Profile/Bell buttons are removed from the DOM.
- **L10**: SessionActions + mode labels are Thai; incoming message toast shows the customer's display name and is clickable, opening that conversation via `selectConversation`; system toasts remain non-clickable.
- Build/lint/tests/Playwright all green; no new hardcoded colors or console logs.

## Completion Checklist

- [ ] Task 1 — `useCustomerNotes.ts` created
- [ ] Task 2 — hook unit tests pass
- [ ] Task 3 — CustomerPanel notes wired + N/A/disabled removed
- [ ] Task 4 — `lineUserId` on ToastNotification + clickable toast
- [ ] Task 5 — toast uses customer name + click wired to selectConversation
- [ ] Task 6 — SessionActions Thai labels + test
- [ ] Task 7 — ChatHeader mode auto-driven, toggle hidden during session + Thai labels
- [ ] Task 8 — quick replies vs canned clarified + mutually exclusive
- [ ] Task 9 — full validation matrix green
- [ ] All 4 findings (M18, M19, M20, L10) verified against acceptance criteria

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Moving `useCustomerNotes` above the `if (!currentChat) return null` guard breaks render or violates hook rules | M | M | Call hook unconditionally with nullable id; hook is a no-op when id null; verify with React strict mode + tsc |
| NotificationToast render site is outside provider scope → `onSelect` cannot reach `selectConversation` | M | M | Task 5 explicitly greps for the render site and wires the prop; if isolated, pass a handler from the page that has context access |
| Hiding the mode toggle during a session removes a path operators relied on to force BOT | L | M | mode reverts to BOT automatically on close (`LiveChatContext.tsx:418`); helper text explains state; toggle returns when no session |
| Removing icon imports in CustomerPanel leaves dangling references / unused-import errors | M | L | Verify each icon's other usages before deleting from import; ESLint gate in Task 3 |
| localStorage write under wrong key during fast conversation switch | M | M | Clear/flush debounce timer on `lineUserId` change in the hook (Task 1 GOTCHA) |
| Mutual-exclusivity change interferes with canned picker state owned by parent page | M | L | Reuse existing `closeAllPickers`/`onCloseCanned` props rather than introducing new state |

## Notes

- **Dependency**: PRD orders Phase 7 after Phase 6 (multi-operator flow stable) and `CustomerPanel.tsx` is owned by Phase 2 — rebase onto P2/P3/P5 before starting Task 3 to avoid collisions on that file.
- **Q3 resolution baked in**: quick replies stay a system preset; the "fold into canned-response" convergence is deliberately deferred (out of scope).
- **No backend work**: confirmed via `grep -i note backend/app/api/v1/endpoints/admin_live_chat.py` (0 matches). If a server-synced notes feature is later desired, `useCustomerNotes` is structured so its storage backend can be swapped for an API call without touching `CustomerPanel`.
- **Design tokens**: all new UI must use existing tokens in `app/globals.css` (`text-text-*`, `bg-surface`, `border-border-default`, `bg-online/away/offline`) — no raw hex/`slate-*` (Phase 3 compliance metric).
- **Thai-first copy** aligns with the project's user-facing language; keep `thai-text`/`thai-no-break` classes on translated labels.
