# Plan: Phase 5 — React/Perf Hardening

## Summary

ปิด finding กลุ่ม "กันพังวงแคบ + micro-perf" ของหน้า Live-Chat Console ทั้ง 6 ID: **M10** (component-level ErrorBoundary หุ้ม panel แต่ละช่อง), **M11b** (AbortController/stale-guard ใน analytics fetch), **M12** (memoize `useConversations` ให้ filter รอบเดียว), **M13** (stable props ให้ `ConversationItem` memo ทำงานจริง), **L8** (เลิกใช้ `key={i}` ในตาราง operator), **L9** (micro-perf หลายจุด: rAF throttle scroll, preformat timestamp, parallel REST fallback, Map-index conversation update, lazy sticker images, เลิก double-fire onConnectionChange, rename hook, ลบ API_BASE ซ้ำ). งานทั้งหมดเป็น **frontend ล้วน, internal — ไม่เปลี่ยน UX ที่ผู้ใช้มองเห็น** (เป้าหมายคือ render/work ลดลง + กัน panel เดียวล่มทั้งหน้า)

## User Story

ในฐานะ operator ที่เปิดหน้า live-chat ทั้งวันและสลับหลายห้องพร้อมกัน ฉันต้องการให้หน้าทำงานลื่น ไม่ re-render เกินจำเป็น และถ้า panel ใดpanel หนึ่ง (เช่น ChatArea) เกิด render error ฉันยังควรใช้ ConversationList เพื่อสลับห้องต่อได้ โดยไม่ต้อง reload ทั้งหน้า (ซึ่งจะตัดการเชื่อมต่อ WebSocket และ reset state ทุกอย่าง)

## Problem → Solution

| Finding | Problem (file:line) | Solution |
|---------|---------------------|----------|
| M10 | `page.tsx:27-30` หุ้มแค่ `Suspense`; admin `layout.tsx:208-210` คืน `children` ตรง ๆ สำหรับ `isLiveChat` → live-chat อยู่นอก inline `ErrorBoundary` ของ layout (`layout.tsx:390`). Route-level `app/admin/error.tsx` ไม่มี (มีแต่ Next.js default). render error ใน ChatArea → ล่มทั้งหน้า รวม WebSocket provider | หุ้ม `LiveChatShell` panel หลัก ๆ ด้วย component-level `ErrorBoundary` (reuse `components/ui/ErrorBoundary.tsx`) ภายใน `LiveChatProvider` เพื่อให้ panel เดียว recover ได้โดยไม่ remount provider/WebSocket |
| M11b | `analytics/page.tsx:41-71` `fetchData` (Promise.all 2 fetch) ไม่มี AbortController; cleanup ที่ `:70` แค่ `clearTimeout`; deps มี `dateRange.from/to` → ถ้า response เก่ามาช้ากว่า อาจ overwrite ข้อมูลใหม่ (stale-response race) | เพิ่ม `AbortController` ใน `useEffect` แล้ว `abort()` ใน cleanup + ส่ง `signal` เข้า fetch + กลืน `AbortError` |
| M12 | `_hooks/useConversations.ts:5-24` ไม่มี `useMemo`; รัน `Array.filter` 3 ครั้งทุก call (`filtered` + `waitingCount` + `activeCount`) | รวมเป็น single-pass `useMemo` keyed `[conversations, query]` (search filter + นับ waiting/active ในลูปเดียว) |
| M13 | `ConversationList.tsx:224-228` inline arrow `onClick`/`onMenuClick` สร้างใหม่ทุก render → ลบล้าง `React.memo` ของ `ConversationItem` (`ConversationItem.tsx:17`) | ส่ง action ที่ stable ลงไป (selectConversation, setActiveActionMenu ซึ่ง stable อยู่แล้ว) + ห่อ handler ภายในด้วย `useCallback` ที่ผูกกับ `conversation.line_user_id` ผ่าน data-attr/param เพื่อคง identity |
| L8 | `analytics/page.tsx:192` `key={i}` ในตาราง operator stats | ใช้ key จาก `operator_name` (fallback index) |
| L9 | micro-perf หลายจุด (ดู task L9.1–L9.8) | rAF throttle scroll, preformat timestamp, Promise.all REST fallback, Map-index conversation update, lazy sticker images, ลบ double-fire onConnectionChange, rename hook, รวม API_BASE |

## Metadata

- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/livechat-audit-remediation.prd.md`
- **PRD Phase**: Phase 5 — React/Perf Hardening (Should bucket, "ErrorBoundary + abort + memo hooks")
- **Estimated Files**: 9 changed + 2 new test files = 11
- **Parallel/Depends**: PARALLEL with Phase 2; DEPENDS Phase 1 (rebase หลัง P1 merge สำหรับ `ChatArea.tsx`)

## UX Design

N/A — internal. ไม่มี visual change ที่ผู้ใช้เห็นในทางบวก ยกเว้น M10 ซึ่งเปลี่ยน *พฤติกรรมตอน error*: เดิม render error = หน้าขาว/หน้าล่มทั้งหมด → ใหม่ = panel เดียวแสดง fallback card ("เกิดข้อผิดพลาด / ลองใหม่") ส่วน panel อื่นยังใช้งานได้

```
BEFORE (render error in ChatArea):                AFTER (M10):
┌────────────┬──────────────┐                     ┌────────────┬──────────────┐
│ Conv List  │   <crash>    │                     │ Conv List  │ [⚠ error]    │
│ (also gone │  whole page  │                     │ (STILL     │  ลองใหม่      │
│  — WS drop)│  white screen│                     │  USABLE)   │ (WS alive)   │
└────────────┴──────────────┘                     └────────────┴──────────────┘
```

## Mandatory Reading

| Priority | File | Lines | Why |
|----------|------|-------|-----|
| P0 | `frontend/components/ui/ErrorBoundary.tsx` | 1-107 | reuse class — รองรับ render-prop & static fallback; M10 ต้องห่อด้วยตัวนี้ ไม่สร้างใหม่ |
| P0 | `frontend/app/admin/live-chat/_components/LiveChatShell.tsx` | 1-85 | จุดที่ ConversationList/ChatArea/CustomerPanel ถูก compose — ที่วาง ErrorBoundary (M10) |
| P0 | `frontend/app/admin/live-chat/_hooks/useConversations.ts` | 1-24 | ตัวที่ต้อง memoize (M12) + rename (L9.7) |
| P0 | `frontend/app/admin/live-chat/_components/ConversationList.tsx` | 36-54, 217-230 | ใช้ hook + inline arrows (M13); 4th `closedCount` filter ที่ :54 |
| P0 | `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | 8-24, 128-138 | `memo` boundary + onClick/onMenuClick props (M13) |
| P0 | `frontend/app/admin/live-chat/analytics/page.tsx` | 33-71, 191-196 | fetch race (M11b), `key={i}` (L8), `API_BASE` (L9.8) |
| P1 | `frontend/app/admin/live-chat/_components/ChatArea.tsx` | 70, 264, 281-305 | scroll setState (L9.1), timestamp source (L9.2) |
| P1 | `frontend/app/admin/live-chat/_components/MessageBubble.tsx` | 8-18, 136-139 | timestamp formatting (L9.2) |
| P1 | `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | 84, 319-354, 549-566, 568-587, 718-728, 759-791 | API_BASE (L9.8), Map-index (L9.4), parallel REST (L9.3), formatTime (L9.2 source); **`value` ที่ :759 ยังไม่ memoize — เป็นของ Phase 1 (H3) อย่าแตะ** |
| P1 | `frontend/hooks/useLiveChatSocket.ts` | 166-178 | onConnectionChange double-fire (L9.6) |
| P1 | `frontend/app/admin/live-chat/_components/StickerPicker.tsx` | 10-45 | CDN images lazy/size (L9.5) |
| P2 | `frontend/lib/constants/__tests__/categories.test.ts` | 1-53 | test structure reference (vitest, describe/it, Thai labels) |

## Patterns to Mirror

### ErrorBoundary reuse (render-prop fallback)
```tsx
// SOURCE: frontend/components/ui/ErrorBoundary.tsx:8-12, 43-54
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
}
// render() → if typeof fallback === 'function' return fallback(this.state.error, this.handleReset)
// ใช้แบบ: <ErrorBoundary fallback={<PanelError label="แชท" />}>...</ErrorBoundary>
```
Default fallback (no prop) แสดง card กลางจอ — ใหญ่เกินสำหรับ panel แคบ จึงควรส่ง `fallback` แบบกระชับ

### useMemo single-pass (existing pattern in same component)
```tsx
// SOURCE: frontend/app/admin/live-chat/_components/ConversationList.tsx:41-47
const filteredConversations = useMemo(() => {
  if (!filterStatus) return filtered;
  return filtered.filter((c) => {
    const status = c.session?.status || 'CLOSED';
    return status === filterStatus;
  });
}, [filtered, filterStatus]);
```
Mirror: hook ใหม่ return memoized object เดียว

### memo'd item + stable props
```tsx
// SOURCE: frontend/app/admin/live-chat/_components/ConversationItem.tsx:17
export const ConversationItem = memo(function ConversationItem({ ... }) { ... });
// SOURCE: ConversationList.tsx:224-228 (ANTI-PATTERN — inline arrows defeat memo)
onClick={() => { selectConversation(conversation.line_user_id); setActiveActionMenu(null); }}
onMenuClick={() => setActiveActionMenu(activeActionMenu === conversation.line_user_id ? null : conversation.line_user_id)}
```

### AbortController in effect cleanup (project hook pattern reference)
```typescript
// SOURCE: ~/.claude/rules/typescript/patterns.md (useDebounce — effect cleanup discipline)
useEffect(() => {
  const handler = setTimeout(() => setDebouncedValue(value), delay)
  return () => clearTimeout(handler)
}, [value, delay])
// Mirror: return () => { clearTimeout(timer); controller.abort(); }
```

### Existing AbortController usage in repo (verify before implementing)
```
// SEARCH: grep -rn "AbortController" frontend/app frontend/hooks frontend/lib
// ถ้าพบ — mirror error-swallow แบบเดียวกัน (err?.name === 'AbortError' → return เงียบ)
```

### Test structure (vitest)
```typescript
// SOURCE: frontend/lib/constants/__tests__/categories.test.ts:1-33
import { describe, it, expect } from 'vitest'
describe('CATEGORIES', () => {
  it('มี 4 หมวดหมู่', () => { expect(CATEGORIES).toHaveLength(4) })
})
```

### logger (no console.log)
```typescript
// SOURCE: frontend/app/admin/live-chat/analytics/page.tsx:10,62
import { logger } from '@/lib/logger';
logger.error("Failed to fetch analytics", error);
```

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `frontend/app/admin/live-chat/_components/LiveChatShell.tsx` | UPDATE | M10 — ห่อ panel ด้วย ErrorBoundary |
| `frontend/app/admin/live-chat/_components/PanelErrorFallback.tsx` | CREATE | M10 — compact fallback UI ใช้ซ้ำ 3 panel |
| `frontend/app/admin/live-chat/_hooks/useConversationStats.ts` | CREATE | M12 + L9.7 — hook ใหม่ memoized (rename จาก useConversations) |
| `frontend/app/admin/live-chat/_hooks/useConversations.ts` | UPDATE | L9.7 — re-export `useConversationStats` เพื่อ backward-compat ระหว่าง migrate (หรือ delete หลังแก้ caller) |
| `frontend/app/admin/live-chat/_components/ConversationList.tsx` | UPDATE | M13 (stable props), M12 (ใช้ hook ใหม่), L9.7 (rename import) |
| `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | UPDATE | M13 — เปลี่ยน prop signature เป็น id-based callback |
| `frontend/app/admin/live-chat/analytics/page.tsx` | UPDATE | M11b (AbortController), L8 (key), L9.8 (API_BASE) |
| `frontend/app/admin/live-chat/_components/ChatArea.tsx` | UPDATE | L9.1 (rAF scroll), L9.2 (preformat timestamp) |
| `frontend/app/admin/live-chat/_components/MessageBubble.tsx` | UPDATE | L9.2 — รับ `formattedTime` prop แทน format ในตัว |
| `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | UPDATE | L9.3 (parallel REST), L9.4 (Map-index), L9.8 (export API_BASE) |
| `frontend/hooks/useLiveChatSocket.ts` | UPDATE | L9.6 — ลบ onConnect/onDisconnect ที่ double-fire |
| `frontend/app/admin/live-chat/_components/StickerPicker.tsx` | UPDATE | L9.5 — lazy + width/height |
| `frontend/app/admin/live-chat/_hooks/__tests__/useConversationStats.test.ts` | CREATE | unit test M12 |
| `frontend/app/admin/live-chat/_context/__tests__/conversationUpdate.test.ts` | CREATE | unit test L9.4 (Map-index merge ลำดับถูก) |

## NOT Building

- **ไม่แตะ `value` memoization ที่ `LiveChatContext.tsx:759-791`** — เป็น H3 ของ Phase 1 (owner phase = 1). ถ้า Phase 1 ยัง merge ไม่เสร็จ ให้ rebase
- **ไม่แตะ `ChatArea.tsx` live-region / aria** — H4/W3 เป็นของ Phase 1 (owner). แก้เฉพาะ scroll handler + timestamp source
- **ไม่เปลี่ยน virtualization logic** (VIRTUALIZATION_THRESHOLD / visibleWindow) — นอก scope
- **ไม่ refactor LiveChatContext เป็น hooks** — เป็น Phase 8
- **ไม่แตะ backend** — Phase 5 frontend ล้วน
- **ไม่เพิ่ม route-level `app/admin/live-chat/error.tsx`** — M10 ระบุ component-level ใน page เพื่อให้ provider/WebSocket รอด (route error.tsx จะ remount provider)
- **ไม่เปลี่ยน design token / สี** — เป็น Phase 3/4
- **ไม่ทำ StickerPicker เป็น real sticker API** — แค่ perf hint บน mock images

## Step-by-Step Tasks

### Task 1 — M10: component-level ErrorBoundary รอบ panel

**ACTION**: CREATE `PanelErrorFallback.tsx` + UPDATE `LiveChatShell.tsx`

**IMPLEMENT**:
1. สร้าง `frontend/app/admin/live-chat/_components/PanelErrorFallback.tsx`:
   ```tsx
   'use client';
   import { AlertTriangle, RefreshCw } from 'lucide-react';
   interface PanelErrorFallbackProps { label: string; reset: () => void; }
   export function PanelErrorFallback({ label, reset }: PanelErrorFallbackProps) {
     return (
       <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center thai-text" role="alert">
         <AlertTriangle className="w-8 h-8 text-danger" />
         <p className="text-sm text-text-secondary">เกิดข้อผิดพลาดในส่วน{label}</p>
         <button onClick={reset} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-danger/10 hover:bg-danger/20 text-danger transition-colors cursor-pointer">
           <RefreshCw className="w-3.5 h-3.5" /> ลองใหม่
         </button>
       </div>
     );
   }
   ```
2. ใน `LiveChatShell.tsx` import `ErrorBoundary` จาก `@/components/ui/ErrorBoundary` + `PanelErrorFallback`. ห่อ `<ConversationList />`, `<ChatArea />`, และ `<CustomerPanel .../>` แต่ละตัวด้วย `ErrorBoundary` พร้อม render-prop fallback:
   ```tsx
   {(!isMobileView || !selectedId) && (
     <ErrorBoundary fallback={(_e, reset) => <ConvListErrorShell reset={reset} />}>
       <ConversationList />
     </ErrorBoundary>
   )}
   ```
   - ConversationList กว้างคงที่ (`w-full md:w-80`) — fallback ต้องห่อใน wrapper กว้างเท่ากันเพื่อไม่ให้ layout พัง; สร้าง `ConvListErrorShell` เล็ก ๆ inline หรือใช้ `<aside className="w-full md:w-80 ...">` ครอบ `PanelErrorFallback`
   - ChatArea/CustomerPanel ใช้ `flex-1`/fixed width — fallback ใช้ `PanelErrorFallback` ตรง ๆ

**MIRROR**: `ErrorBoundary` render-prop signature (ErrorBoundary.tsx:48-49)

**IMPORTS**: `ErrorBoundary` from `@/components/ui/ErrorBoundary`; `PanelErrorFallback` (new local)

**GOTCHA**:
- ErrorBoundary จับเฉพาะ **render-time error** ไม่จับ async (fetch) — ตรงกับ comment ที่ layout.tsx:388. นี่ถูกต้องสำหรับ scope M10
- ต้องอยู่ **ภายใน** `LiveChatProvider` (ซึ่ง LiveChatShell อยู่ใน provider แล้วผ่าน page.tsx:18-22) — provider/WebSocket ไม่ถูก reset เมื่อ panel reset เพราะ ErrorBoundary อยู่ใต้ provider
- `handleReset` ของ ErrorBoundary มี MAX_RETRIES=3 — เพียงพอ
- อย่าห่อ `<TransferDialog>` (modal — ถ้าพังควรเห็นทั้งหน้า) และ `<NotificationToast>`

**VALIDATE**: `npx tsc --noEmit` + manual: โยน error ใน ChatArea (ชั่วคราว `throw new Error('test')`) แล้วยืนยัน ConversationList ยังคลิกได้

---

### Task 2 — M12 + L9.7: memoized single-pass conversation stats hook + rename

**ACTION**: CREATE `useConversationStats.ts`, UPDATE `useConversations.ts`, UPDATE `ConversationList.tsx`

**IMPLEMENT**:
1. สร้าง `frontend/app/admin/live-chat/_hooks/useConversationStats.ts`:
   ```typescript
   'use client';
   import { useMemo } from 'react';
   import type { Conversation } from '../_types';

   export interface ConversationStats {
     filtered: Conversation[];
     waitingCount: number;
     activeCount: number;
     closedCount: number;
   }

   export function useConversationStats(conversations: Conversation[], query: string): ConversationStats {
     return useMemo(() => {
       const q = query.trim().toLowerCase();
       const isTagFilter = q.startsWith('#') || q.startsWith('tag:');
       const tagQuery = isTagFilter ? q.replace(/^tag:/, '').replace(/^#/, '').trim() : '';
       const filtered: Conversation[] = [];
       let waitingCount = 0;
       let activeCount = 0;
       let closedCount = 0;
       for (const conv of conversations) {
         const status = conv.session?.status;
         if (status === 'WAITING') waitingCount++;
         else if (status === 'ACTIVE') activeCount++;
         else closedCount++; // ไม่มี session หรือ CLOSED
         let match = true;
         if (q) {
           if (isTagFilter) {
             match = (conv.tags || []).some((tag) => tag.name.toLowerCase().includes(tagQuery));
           } else {
             match =
               (conv.display_name || '').toLowerCase().includes(q) ||
               conv.line_user_id.toLowerCase().includes(q);
           }
         }
         if (match) filtered.push(conv);
       }
       return { filtered, waitingCount, activeCount, closedCount };
     }, [conversations, query]);
   }
   ```
   - **GOTCHA — closedCount logic**: เดิม `ConversationList.tsx:54` ใช้ `!c.session || c.session.status === 'CLOSED'`. ใน hook ใหม่ `else` ครอบ "ไม่มี status (no session)" + "CLOSED" + status อื่น ๆ ที่ไม่ใช่ WAITING/ACTIVE → ต้องตรงกับเดิม: status เป็น `'WAITING'|'ACTIVE'|'CLOSED'` เท่านั้น (ดู `_types`) ดังนั้น else = no-session หรือ CLOSED = ถูกต้อง
2. `useConversations.ts` → re-export เพื่อ backward-compat ชั่วคราว:
   ```typescript
   export { useConversationStats, useConversationStats as useConversations } from './useConversationStats';
   export type { ConversationStats } from './useConversationStats';
   ```
   (ลบไฟล์เดิมทิ้งแล้ว re-export — caller เดียวคือ ConversationList ซึ่งแก้ใน step 3 ให้ใช้ชื่อใหม่ จากนั้นจะลบ re-export ได้ใน cleanup)
3. ใน `ConversationList.tsx`:
   - เปลี่ยน import: `import { useConversationStats } from '../_hooks/useConversationStats';`
   - `const { filtered, waitingCount, activeCount, closedCount } = useConversationStats(conversations, searchQuery);`
   - **ลบ** บรรทัด `const closedCount = conversations.filter(...)` ที่ `:54`

**MIRROR**: useMemo pattern (ConversationList.tsx:41-47); type-from-interface (typescript/coding-style)

**IMPORTS**: `useMemo` from react; `Conversation` type from `../_types`

**GOTCHA**:
- PRD note: ConversationList อ่าน conversations ผ่าน Zustand selector — benefit เป็นบางส่วน (hook ลด work ภายใน component นี้ แต่ component ยัง re-render เมื่อ store เปลี่ยน). **บันทึกข้อจำกัดนี้ใน PR description** ตามที่ scope ระบุ
- ชื่อ hook ใหม่ `useConversationStats` แก้ปัญหา L9 "rename useConversations (no hook inside)" — ชื่อเดิมสื่อว่าคืน conversations แต่จริง ๆ คืน stats; ตอนนี้มี `useMemo` ข้างใน = เป็น hook จริง

**VALIDATE**: `npx vitest run` (test Task 9) + `npx tsc --noEmit` + `npx eslint frontend/app/admin/live-chat/_hooks/useConversationStats.ts frontend/app/admin/live-chat/_components/ConversationList.tsx`

---

### Task 3 — M13: stable props ให้ ConversationItem memo ทำงาน

**ACTION**: UPDATE `ConversationItem.tsx` + `ConversationList.tsx`

**IMPLEMENT**:
1. เปลี่ยน prop signature ของ `ConversationItem` ให้รับ id-based callback (เพื่อให้ parent ส่ง handler ที่ stable ตัวเดียว ไม่สร้าง closure ต่อ item):
   ```tsx
   // ConversationItem.tsx:8-15
   interface ConversationItemProps {
     optionId: string;
     conversation: Conversation;
     selected: boolean;
     formattedTime?: string;
     onSelect: (lineUserId: string) => void;       // เดิม onClick: () => void
     onMenuToggle: (lineUserId: string) => void;   // เดิม onMenuClick: () => void
   }
   ```
   - ภายใน component ห่อด้วย `useCallback` ที่ผูก `conversation.line_user_id`:
     ```tsx
     const handleSelect = React.useCallback(() => onSelect(conversation.line_user_id), [onSelect, conversation.line_user_id]);
     const handleMenuToggle = React.useCallback(() => onMenuToggle(conversation.line_user_id), [onMenuToggle, conversation.line_user_id]);
     ```
   - ใช้ `handleSelect` ที่ root `onClick` (line 52) และที่ menu item "ดูประวัติแชท" (line 142 — เดิมเรียก `onClick()`)
   - ใช้ `handleMenuToggle` ในปุ่ม MoreVertical (line 129-133 — เดิมเรียก `onMenuClick()`)
2. ใน `ConversationList.tsx` ลบ inline arrow ที่ :224-228 แล้วส่ง handler stable:
   ```tsx
   // ก่อน return: define handlers ระดับ component (selectConversation, setActiveActionMenu stable จาก context/store)
   const handleSelect = React.useCallback((id: string) => {
     selectConversation(id);
     setActiveActionMenu(null);
   }, [selectConversation, setActiveActionMenu]);
   const handleMenuToggle = React.useCallback((id: string) => {
     setActiveActionMenu(useLiveChatStore.getState().activeActionMenu === id ? null : id);
   }, [setActiveActionMenu]);
   ...
   <ConversationItem
     key={conversation.line_user_id}
     optionId={`conversation-option-${conversation.line_user_id}`}
     conversation={conversation}
     selected={selectedId === conversation.line_user_id}
     formattedTime={conversation.last_message?.created_at ? formatTime(conversation.last_message.created_at) : undefined}
     onSelect={handleSelect}
     onMenuToggle={handleMenuToggle}
   />
   ```
   - **GOTCHA — activeActionMenu toggle**: เดิม `onMenuClick` อ่าน `activeActionMenu` (subscribe) ทำให้ closure เปลี่ยนทุกครั้งที่ activeActionMenu เปลี่ยน. ใช้ `useLiveChatStore.getState().activeActionMenu` ภายใน callback แทน (อ่าน ณ เวลาเรียก) เพื่อให้ callback stable — pattern เดียวกับ `getStore()` ใน LiveChatContext.tsx:87

**MIRROR**: `getStore()` ใน LiveChatContext.tsx:87 (อ่าน state โดยไม่ subscribe)

**IMPORTS**: `useLiveChatStore` มีใน ConversationList อยู่แล้ว (line 7)

**GOTCHA**:
- `formattedTime` ยัง compute ต่อ item ใน parent — ยังเปลี่ยน identity ทุก render เพราะเป็น string ใหม่? ไม่ — string เทียบด้วยค่า ใน memo shallow compare ดังนั้น OK ตราบใดที่ค่าเท่าเดิม
- `selected` (boolean) + `conversation` (อ้างอิงเดิมถ้า store ไม่เปลี่ยน item) → memo จะ skip re-render ของ item ที่ไม่เปลี่ยน เมื่อ handler stable แล้ว

**VALIDATE**: `npx tsc --noEmit` + manual React DevTools Profiler: พิมพ์ใน search → เฉพาะ item ที่ match/unmatch เปลี่ยนเท่านั้น re-render (ไม่ใช่ทุก item)

---

### Task 4 — M11b: AbortController ใน analytics fetch

**ACTION**: UPDATE `analytics/page.tsx`

**IMPLEMENT**: แก้ `fetchData` ให้รับ `signal` + แก้ `useEffect` ให้สร้าง `AbortController` และ abort ใน cleanup:
```tsx
const fetchData = useCallback(async (signal?: AbortSignal) => {
  try {
    const query = `?from_date=${dateRange.from}&to_date=${dateRange.to}`;
    const [analyticsRes, operatorsRes] = await Promise.all([
      fetch(`${API_BASE}/admin/live-chat/analytics${query}`, { signal }),
      fetch(`${API_BASE}/admin/live-chat/analytics/operators${query}`, { signal }),
    ]);
    if (analyticsRes.ok) { const data = await analyticsRes.json(); setSummary(data.summary); setDailyStats(data.daily_stats); }
    if (operatorsRes.ok) { const data = await operatorsRes.json(); setOperatorStats(data); }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return; // stale/unmounted — เงียบ
    logger.error("Failed to fetch analytics", error);
  }
}, [dateRange.from, dateRange.to]); // ลบ API_BASE (ดู L9.8 — กลายเป็น module/import const)

useEffect(() => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => { void fetchData(controller.signal); }, 0);
  return () => { window.clearTimeout(timer); controller.abort(); };
}, [fetchData]);
```

**MIRROR**: effect cleanup discipline (typescript/patterns.md useDebounce); logger usage (analytics:62)

**IMPORTS**: ไม่มีใหม่ (AbortController/DOMException เป็น global)

**GOTCHA**:
- `abort()` ใน cleanup **นอก** async fn (อยู่ใน return ของ effect) — ตรงตาม finding M11b ("aborted in useEffect cleanup, not inside the async fn")
- เมื่อ dateRange เปลี่ยน → effect re-run → cleanup เก่า abort → fetch เก่าถูกยกเลิก → ไม่ overwrite ด้วย stale data
- ต้องเช็ค `AbortError` ก่อน log ไม่งั้น log spam ทุกครั้งที่เปลี่ยน date

**VALIDATE**: `npx tsc --noEmit` + `npx eslint frontend/app/admin/live-chat/analytics/page.tsx` + manual: เปลี่ยน date เร็ว ๆ → ไม่มี stale chart flash, ไม่มี console error

---

### Task 5 — L8: เลิก key={i} ในตาราง operator

**ACTION**: UPDATE `analytics/page.tsx:191-196`

**IMPLEMENT**:
```tsx
operatorStats.map((op, i) => (
  <tr key={op.operator_name ?? `op-${i}`} className="hover:bg-slate-50/50">
```
**GOTCHA**: `operator_name` อาจซ้ำ/undefined (เช่น "System") → fallback `op-${i}` แต่ list นี้ static (อ่านอย่างเดียว ไม่ reorder/insert) จึง index acceptable เป็น fallback. ถ้ามี id จริงใน payload ในอนาคต ค่อยใช้ id

**VALIDATE**: `npx eslint frontend/app/admin/live-chat/analytics/page.tsx` (react/no-array-index-key warning หาย ถ้า rule เปิด)

---

### Task 6 — L9.2: preformat timestamp (เลิก new Date + toLocaleTimeString ต่อ render)

**ACTION**: UPDATE `ChatArea.tsx` + `MessageBubble.tsx`

**IMPLEMENT**:
1. `MessageBubble.tsx`: เพิ่ม prop `formattedTime: string` (interface :8-18), เปลี่ยน :137-139 จาก:
   ```tsx
   {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
   ```
   เป็น:
   ```tsx
   {formattedTime}
   ```
2. `ChatArea.tsx`: ใน `.map` (:283-305) คำนวณ `formattedTime` ครั้งเดียวต่อ message แล้วส่งเข้า MessageBubble:
   ```tsx
   const formattedTime = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
   ...
   <MessageBubble ... formattedTime={formattedTime} />
   ```
   - เนื่องจาก MessageBubble เป็น `memo` การส่ง string ที่ค่าเท่าเดิมจะไม่ trigger re-render เพิ่ม; ประโยชน์หลักคือ format ทำใน map (เฉพาะ visible window) ไม่ทำซ้ำใน body ของ memo'd component ทุกครั้งที่ re-render ด้วยเหตุอื่น

**MIRROR**: prop pass-down เหมือน `senderLabel`/`showSender` ที่ ChatArea ส่งให้ MessageBubble อยู่แล้ว (:298-302)

**GOTCHA**: format ทำเฉพาะ `messages.slice(visibleWindow...)` (visible เท่านั้น) — สอดคล้อง virtualization. อย่า preformat ทั้ง `messages` array (เปลือง)

**VALIDATE**: `npx tsc --noEmit` (MessageBubble จะ error ถ้า caller ไม่ส่ง `formattedTime` — บังคับ wire ครบ)

---

### Task 7 — L9.1: rAF throttle scroll setState

**ACTION**: UPDATE `ChatArea.tsx:70, 264`

**IMPLEMENT**: เลิก `setScrollTop` ทุก scroll event (ทุก frame) → throttle ด้วย rAF:
```tsx
const scrollRafRef = useRef<number | null>(null);
const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
  const top = e.currentTarget.scrollTop;
  if (scrollRafRef.current != null) return;
  scrollRafRef.current = requestAnimationFrame(() => {
    scrollRafRef.current = null;
    setScrollTop(top);
  });
}, []);
useEffect(() => () => { if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current); }, []);
// ...
onScroll={handleScroll}
```
**MIRROR**: `requestAnimationFrame` ที่มีใน ChatArea แล้ว (:124-128)

**IMPORTS**: `useCallback`, `useRef` (มีอยู่แล้วใน ChatArea import :3)

**GOTCHA**:
- `e.currentTarget` ใน React synthetic event ถูก nullify หลัง event handler — อ่าน `e.currentTarget.scrollTop` เข้า local `top` **ก่อน** เข้า rAF callback (ทำแล้วด้านบน)
- `scrollTop` ใช้คำนวณ `visibleWindow` (virtualization) — throttle 1 frame ไม่กระทบความถูกต้อง (overscan=12 รองรับ)
- cleanup cancel rAF กัน setState หลัง unmount

**VALIDATE**: `npx tsc --noEmit` + manual: scroll history ยาว (>200 msg) → ไม่ janky, virtualization ยังถูก

---

### Task 8 — L9.3 + L9.4 + L9.8: LiveChatContext micro-perf

**ACTION**: UPDATE `LiveChatContext.tsx`

**IMPLEMENT**:
- **L9.8 (API_BASE)**: `LiveChatContext.tsx:84` `const API_BASE = '/api/v1'` — export มัน: `export const API_BASE = '/api/v1';` แล้วใน `analytics/page.tsx` ลบ local `const API_BASE` (:39) → `import { API_BASE } from '../_context/LiveChatContext';`
  - **GOTCHA**: ถ้า import ข้าม module ทำให้ analytics ดึง provider code มาทั้งก้อน (bundle) ให้ย้าย `API_BASE` ไปไฟล์ shared เล็ก ๆ แทน เช่น `frontend/app/admin/live-chat/_lib/constants.ts` แล้วทั้งสองที่ import จากนั่น (แนะนำ — เลี่ยง bundle bloat). ใช้ทางนี้
- **L9.3 (parallel REST fallback)**: `LiveChatContext.tsx:556-557` และ `:580-581` มี sequential `await fetchChatDetail(...); await fetchConversations();` → รวมเป็น parallel:
  ```typescript
  await Promise.all([fetchChatDetail(s.selectedId, true), fetchConversations()]);
  ```
  ทำทั้ง 2 จุด (sendMessage REST fallback + sendMedia)
  - **GOTCHA**: ตรวจว่า 2 fn ไม่พึ่งผลของกัน — `fetchChatDetail` โหลด messages ของห้อง, `fetchConversations` โหลด list; อิสระต่อกัน → parallel ปลอดภัย
- **L9.4 (Map-index conversation update)**: `handleConversationUpdate` (:319-354) ทำ `[...conversations]` + `findIndex` + `splice` ทุก WS frame = O(n) ต่อ frame. ปรับให้คำนวณ index เร็วขึ้น:
  ```typescript
  const list = getStore().conversations;
  const idx = list.findIndex((c) => c.line_user_id === data.line_user_id);
  // ...สร้าง updated เหมือนเดิม...
  if (idx === -1) {
    getStore().setConversations([updated, ...list]);
  } else {
    // ย้าย updated ขึ้นบนสุดโดยไม่ splice copy ทั้ง array สองรอบ
    const next = [updated];
    for (let i = 0; i < list.length; i++) { if (i !== idx) next.push(list[i]); }
    getStore().setConversations(next);
  }
  ```
  - **GOTCHA — ขอบเขตจริง**: นี่ยังเป็น O(n) (หลีกเลี่ยงไม่ได้เพราะต้องสร้าง array ใหม่สำหรับ immutability ของ Zustand). การปรับลดจาก "spread + splice (สอง pass + จัดสรร array ซ้ำ)" เหลือ single-pass build ลด allocation/work ต่อ frame. **อย่า over-engineer เป็น Map<string,Conversation> store เพราะจะแตะ Zustand store shape (นอก scope)**. ถ้า single-pass ไม่คุ้มความเสี่ยง regression ให้ทำแค่: เลิก `[...getStore().conversations]` clone แรก (เพราะสร้าง array ใหม่อยู่แล้วทีหลัง) — ลบ clone ที่ :322 แล้วใช้ `getStore().conversations` ตรง ๆ ใน findIndex (read-only)

**MIRROR**: `Promise.all` (analytics:45-48); `getStore()` (LiveChatContext:87)

**GOTCHA**: handleConversationUpdate มี deps `[]` (stable) — อย่าเพิ่ม deps ที่ทำให้ identity เปลี่ยน

**VALIDATE**: `npx tsc --noEmit` + `npx vitest run` (test Task 10) + manual: ส่งข้อความผ่าน REST fallback (ปิด WS) → ทั้ง detail + list อัปเดต

---

### Task 9 — L9.5: lazy + size hint ให้ sticker images

**ACTION**: UPDATE `StickerPicker.tsx:42`

**IMPLEMENT**:
```tsx
<img src={s.url} alt={`Sticker ${s.id}`} loading="lazy" width={64} height={64} className="w-full h-full object-contain" />
```
**MIRROR**: web/performance.md (image dimensions + lazy below-the-fold)

**GOTCHA**: 8 CDN images จาก line-scdn — `loading="lazy"` + explicit `width/height` กัน CLS และ defer load จนกว่า picker จะเปิด. คง `eslint-disable @next/next/no-img-element` ที่มีอยู่ (:41)

**VALIDATE**: `npx eslint frontend/app/admin/live-chat/_components/StickerPicker.tsx`

---

### Task 10 — L9.6: เลิก onConnectionChange double-fire

**ACTION**: UPDATE `useLiveChatSocket.ts:166-178`

**IMPLEMENT**: ปัจจุบัน `onConnectionChange` ถูกเรียกทั้งจาก `onConnect`/`onDisconnect` callback (:171-172) **และ** จาก `useEffect` ที่ watch `connectionState` (:176-178) → double-fire. `connectionState` จาก `useWebSocket` เป็น source of truth ที่ครอบทุก state (connecting/authenticating/reconnecting) อยู่แล้ว → ลบ onConnect/onDisconnect ที่ map ไป onConnectionChange:
```typescript
const { send, connectionState, isConnected, reconnect } = useWebSocket({
  url: wsUrl,
  adminId,
  token,
  onMessage: handleMessage,
  // ลบ onConnect/onDisconnect — connectionState effect ด้านล่างครอบคลุมแล้ว
});

useEffect(() => {
  onConnectionChange?.(connectionState);
}, [connectionState, onConnectionChange]);
```
**GOTCHA**:
- ตรวจว่า `useWebSocket` ตั้ง `connectionState='connected'` เมื่อ connect จริง (ไม่ใช่แค่ socket open) — อ่าน `frontend/lib/websocket/client.ts` / `useWebSocket` hook ยืนยันก่อนลบ. ถ้า `onConnect` ทำงานอื่นนอกจาก onConnectionChange (เช่น re-auth/join room) **ห้ามลบ** — ลบเฉพาะการ map ไป `onConnectionChange`
- ถ้า useWebSocket จำเป็นต้องมี onConnect/onDisconnect เพื่อ side-effect อื่น ให้คงไว้แต่ลบบรรทัด `onConnectionChange?.(...)` ออกจากมัน เก็บไว้แค่ใน effect

**VALIDATE**: `npx tsc --noEmit` + manual: ต่อ/ตัด WS → wsStatus เปลี่ยนครั้งเดียวต่อ transition (เพิ่ม temporary log ใน onConnectionChange เพื่อนับ แล้วลบออก)

---

### Task 11 — Unit test: useConversationStats (M12)

**ACTION**: CREATE `_hooks/__tests__/useConversationStats.test.ts`

**IMPLEMENT**: ทดสอบ pure logic ของ filter+count. เนื่องจากเป็น hook (useMemo) ใช้ `renderHook` จาก `@testing-library/react` ถ้ามีใน repo; ถ้าไม่มี ให้ refactor logic เป็น pure fn `computeConversationStats(conversations, query)` แล้ว hook wrap ด้วย useMemo — test pure fn ตรง ๆ (แนะนำ: แยก pure fn เพื่อ testability + เลี่ยง dependency บน RTL)
```typescript
import { describe, it, expect } from 'vitest';
import { computeConversationStats } from '../useConversationStats';
// fixtures: 1 WAITING, 1 ACTIVE, 1 CLOSED, 1 no-session
describe('computeConversationStats', () => {
  it('นับ waiting/active/closed ถูกต้องในรอบเดียว', () => { ... expect(stats.waitingCount).toBe(1); ... });
  it('กรองด้วย display_name (case-insensitive)', () => { ... });
  it('กรองด้วย line_user_id', () => { ... });
  it('กรองด้วย tag เมื่อ query ขึ้นต้น # หรือ tag:', () => { ... });
  it('คืนทั้งหมดเมื่อ query ว่าง', () => { ... });
  it('no-session นับเป็น closed', () => { ... });
});
```

**MIRROR**: categories.test.ts:1-33 (describe/it/expect, Thai test names)

**GOTCHA**: export ทั้ง `computeConversationStats` (pure) และ `useConversationStats` (hook wrapper) จาก useConversationStats.ts

**VALIDATE**: `npx vitest run frontend/app/admin/live-chat/_hooks/__tests__/useConversationStats.test.ts`

---

### Task 12 — Unit test: conversation update ordering (L9.4)

**ACTION**: CREATE `_context/__tests__/conversationUpdate.test.ts`

**IMPLEMENT**: ดึง logic การจัดเรียง (move-to-top) เป็น pure helper `reorderConversationsToTop(list, idx, updated)` ใน LiveChatContext (หรือ `_lib`) แล้ว test ว่า updated ขึ้นบนสุด + รักษาลำดับที่เหลือ + ไม่ duplicate
```typescript
describe('reorderConversationsToTop', () => {
  it('ย้าย item ที่อัปเดตขึ้นบนสุด คงลำดับที่เหลือ', () => { ... });
  it('ไม่ทำให้ item ซ้ำ', () => { ... });
});
```
**GOTCHA**: ถ้าการแยก helper เพิ่มความเสี่ยง ให้ทดสอบผ่านผลลัพธ์ของ single-pass build แทน. ถ้าไม่แยก helper ได้ → ข้าม test นี้และพึ่ง manual VALIDATE ใน Task 8 (บันทึกใน PR)

**VALIDATE**: `npx vitest run`

## Testing Strategy

| Test | File | Asserts |
|------|------|---------|
| computeConversationStats counts | `useConversationStats.test.ts` | waiting/active/closed นับถูก single-pass |
| filter by name/id/tag/empty | `useConversationStats.test.ts` | match logic ตรงกับเดิม |
| no-session → closed | `useConversationStats.test.ts` | closedCount รวม no-session |
| reorder to top | `conversationUpdate.test.ts` | updated บนสุด, no dup, order คงเหลือ |

**Edge cases checklist**:
- [ ] query ว่าง → filtered = ทั้งหมด, counts ครบ
- [ ] query เป็น `#vip` / `tag:vip` → กรองด้วย tag
- [ ] conversation ไม่มี session → closedCount +1, ไม่ active/waiting
- [ ] AbortController: เปลี่ยน date 2 ครั้งเร็ว → response แรกไม่ overwrite (manual; abort ทำงาน)
- [ ] M10: render error ใน ChatArea → ConversationList ยังคลิกสลับห้องได้, WS ไม่ drop
- [ ] M13: พิมพ์ใน search → item ที่ค่าไม่เปลี่ยนไม่ re-render (Profiler)
- [ ] scroll throttle: virtualization ยังแสดง message ถูกต้องหลัง throttle
- [ ] onConnectionChange fire ครั้งเดียวต่อ transition

## Validation Commands

รันจาก `D:/genAI/jsk-app/frontend`:

```bash
npx tsc --noEmit
# EXPECT: ไม่มี error (MessageBubble บังคับ formattedTime ครบ, prop signature ใหม่ถูก wire)

npx eslint app/admin/live-chat/_components/LiveChatShell.tsx app/admin/live-chat/_components/ConversationList.tsx app/admin/live-chat/_components/ConversationItem.tsx app/admin/live-chat/_components/ChatArea.tsx app/admin/live-chat/_components/MessageBubble.tsx app/admin/live-chat/_components/StickerPicker.tsx app/admin/live-chat/analytics/page.tsx app/admin/live-chat/_hooks/useConversationStats.ts app/admin/live-chat/_context/LiveChatContext.tsx hooks/useLiveChatSocket.ts
# EXPECT: 0 errors (react/no-array-index-key warning หายที่ analytics)

npx vitest run
# EXPECT: เทสเดิมทั้งหมดผ่าน + เทสใหม่ (useConversationStats, conversationUpdate) ผ่าน

npm run build
# EXPECT: build สำเร็จ (tsc + next build เขียว)

npx playwright test
# EXPECT: smoke tests เดิมผ่าน (ไม่ regress flow live-chat)
```

## Acceptance Criteria

- [ ] M10: panel หนึ่งเกิด render error → panel อื่นใช้งานได้, provider/WebSocket ไม่ remount
- [ ] M11b: เปลี่ยน date range เร็ว ๆ ไม่เกิด stale overwrite; AbortError ไม่ถูก log
- [ ] M12: `useConversationStats` filter/count รอบเดียว (single useMemo); ลบ `closedCount` filter ที่ 4 ใน ConversationList
- [ ] M13: `ConversationItem` memo ทำงาน — handler stable identity (Profiler ยืนยัน item ที่ไม่เปลี่ยนไม่ re-render)
- [ ] L8: ไม่มี `key={i}` ในตาราง operator
- [ ] L9.1 scroll setState throttle ด้วย rAF; L9.2 timestamp preformat ใน ChatArea map; L9.3 REST fallback parallel; L9.4 conversation update single-pass; L9.5 sticker images lazy+size; L9.6 onConnectionChange ไม่ double-fire; L9.7 hook rename เป็น `useConversationStats`; L9.8 API_BASE ไม่ประกาศซ้ำ (shared const)
- [ ] tsc/eslint/vitest/build/playwright เขียวทั้งหมด

## Completion Checklist

- [ ] Task 1–12 เสร็จ
- [ ] เทสใหม่ 2 ไฟล์เพิ่ม + ผ่าน
- [ ] ลบ re-export shim ใน `useConversations.ts` (หรือ delete ไฟล์) หลัง caller ใช้ชื่อใหม่
- [ ] ลบ temporary `throw`/log ที่ใช้ทดสอบ M10/L9.6
- [ ] PR description บันทึก: (1) ข้อจำกัด M12 (ConversationList อ่านผ่าน Zustand selector — benefit บางส่วน), (2) ข้อจำกัด L9.4 (ยัง O(n), ไม่แตะ store shape)
- [ ] ตรวจ owner-file rebase: `ChatArea.tsx` (owner=Phase 1) — rebase หลัง P1 merge ก่อน push

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| M13 prop signature เปลี่ยน → caller อื่นของ ConversationItem พัง | L | M | grep หา caller (มีแค่ ConversationList); tsc บังคับ |
| L9.6 ลบ onConnect ที่มี side-effect ซ่อน (re-auth/join) | M | H | อ่าน useWebSocket/client.ts ก่อนลบ; ลบเฉพาะ map ไป onConnectionChange |
| `ChatArea.tsx` ชน Phase 1 (owner) ตอน rebase | M | M | rebase หลัง P1 merge; แก้เฉพาะ scroll+timestamp ไม่แตะ aria-live |
| L9.4 single-pass refactor ทำ ordering regress | M | M | unit test reorder (Task 12) + manual; ถ้าเสี่ยงทำแค่ลบ clone ซ้ำ |
| L9.8 import API_BASE ข้าม module ทำ bundle โต | L | L | ย้ายไป `_lib/constants.ts` shared แทน import จาก provider |
| M11b เปลี่ยน fetchData deps → effect loop | L | M | ลบ API_BASE จาก deps (เป็น const แล้ว); ทดสอบ |
| renderHook ไม่มีใน repo | M | L | refactor เป็น pure `computeConversationStats` แล้ว test ตรง |

## Notes

- **ลำดับแนะนำ**: Task 2 (hook) → Task 3 (M13, พึ่ง prop ใหม่) ก่อน เพราะเกี่ยวเนื่องกัน; Task 1 (M10) อิสระทำได้ทุกเมื่อ; Task 4-5 (analytics) อิสระ; Task 6 (timestamp) ก่อน Task 7 (scroll) เพราะแตะ ChatArea ไฟล์เดียวกัน; Task 8 (context) ทำเดี่ยว; Task 10 (socket) ต้องอ่าน useWebSocket ก่อน
- **H3 boundary**: `value` ที่ LiveChatContext.tsx:759 **ยังไม่ memoize** ณ ตอนนี้ — เป็นของ Phase 1. งาน Phase 5 ที่แตะ LiveChatContext (L9.3/L9.4/L9.8) ไม่เกี่ยวกับ value object; ถ้า merge หลัง Phase 1 ให้ rebase ให้ตรง
- **ภาษา UI**: fallback/error string ใช้ไทย ตาม pattern เดิม (ErrorBoundary.tsx, LiveChatShell.tsx); code identifier เป็นอังกฤษ
- **เลี่ยง over-engineering L9.4**: ถ้า single-pass มีความเสี่ยง ทางถอยคือลบแค่ array clone ซ้ำ (`[...getStore().conversations]`) ที่ :322 — ได้ประโยชน์ allocation โดยเสี่ยงต่ำ
- ไม่มี `app/admin/live-chat/error.tsx` และไม่ควรเพิ่ม (จะ remount provider — ขัดเป้าหมาย M10)
