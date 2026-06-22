# Plan: Phase 4 — Motion & Polish

## Summary

เพิ่ม **exit animation** (toast + dropdown), สร้าง **`useReducedMotion` hook** ที่ guard ทั้ง CSS `animate-*` และ JS `scrollIntoView`, รวม **motion duration/easing tokens** ให้เป็นชุดเดียว, และเก็บงาน **polish** (tabular-nums, focus-ring, break-words, inset image/avatar outline, typing-bounce keyframe, transition-all → specific properties, layout-shift animation, entrance-replay gate, send-icon optical centering) ของหน้า `admin/live-chat`.

หัวใจของเฟสนี้คือ "ทำให้รู้สึกเนียน" โดย **คุม performance** (animate เฉพาะ compositor-friendly properties) และ **เคารพ `prefers-reduced-motion` จริง**. ใช้ `motion` (`^12.38.0`) ที่ติดตั้งแล้ว (`from 'motion/react'`) — **จำกัด `AnimatePresence` ไว้เฉพาะ toast list และ ConversationItem dropdown เท่านั้น** ห้ามแตะ virtualized message list ใน `ChatArea.tsx` (จะชนกับ virtualizer measurement: `scrollTop`/`viewportHeight`/`topPadding`/`bottomPadding`).

## User Story

ในฐานะ **operator** ที่เปิดหน้า live-chat ทั้งวัน ฉันต้องการให้ **toast/เมนู dropdown ปิดแบบนุ่ม ไม่กระตุก**, **ตัวเลข counter/นาฬิกาไม่ดิ้นไปมา** เวลาค่าเปลี่ยน, และ **ถ้าฉันตั้งค่า OS เป็น reduced-motion ระบบต้องไม่ขยับ/เลื่อนเอง** เพื่อให้ทำงานต่อเนื่องโดยไม่ล้า/ไม่เวียนหัว.

## Problem → Solution

| Finding | Problem (หลักฐาน file:line) | Solution |
|---------|-----------------------------|----------|
| **M2 / M11a** | ไม่มี exit animation ที่ใดเลย — `NotificationToast.tsx:24-27` `dismissToast` เรียก `removeNotification` → DOM unmount ทันที (ไม่มี fade-out); `.toast-slide` (`globals.css:719-729`) เป็น entrance-only; `ConversationItem.tsx:139` dropdown `{menuOpen && (...)}` unmount ทันที | ครอบ toast list + dropdown ด้วย `AnimatePresence` + `motion.div` (initial/animate/**exit**) |
| **W4** | ใช้ `animate-*` 10+ จุด, ไม่มี `useReducedMotion` hook, `globals.css:744-753` media query ถูก Tailwind `animate-*` utilities override; JS `scrollIntoView({behavior:'smooth'})` ที่ `ChatArea.tsx:83,110` ไม่เคารพ reduced-motion | สร้าง `hooks/useReducedMotion.ts`, gate `animate-*` className และ behavior ของ scrollIntoView ผ่าน hook |
| **M21** | polish bundle ขาด: ไม่มี `tabular-nums` บน clock/counter (`MessageBubble.tsx:137`, `ChatArea.tsx:232/237`, `ConversationItem.tsx:100`); expand toggle/sticker-tab ไม่มี focus-ring; chat image/avatar (`MessageBubble.tsx:43,107`) ไม่มี inset outline; text bubble (`MessageBubble.tsx:124-132`) ไม่มี `break-words`; TypingIndicator (`TypingIndicator.tsx:10-12`) ใช้ `animate-pulse` แทน bounce; ไม่มี central motion token (มี `--duration-*`/`--ease-*` ใน `@theme:216-227` แต่ live-chat CSS `globals.css:713-729` ยัง hardcode `0.3s`/`0.4s`) | เพิ่ม utility/className ตามจุด + เพิ่ม `@keyframes typing-bounce` + map live-chat keyframes ไปใช้ token |
| **L1** | `transition-all` กว้างเกิน → animate layout props ได้: `MessageInput.tsx:191,207`; `ConversationItem.tsx:47`; `ChatHeader.tsx:99,112`; `ConversationList.tsx:117,125,184`; `globals.css:559` (`.hover-lift`) — หมายเหตุ `.press-down` (`globals.css:565-567`) ใช้ `transition-transform` อยู่แล้ว (ถูกต้อง) | แทน `transition-all` ด้วย property ที่จำเป็นจริง (`transition-colors`/`transition-[transform,box-shadow,opacity]`) |
| **L6** | toast stack/list reorder กระโดด ไม่มี layout-shift animation | ใช้ `layout` prop ของ `motion.div` บน toast item |
| **L7** | entrance class (`.msg-in`/`.msg-out`) replay ทุกครั้งที่ virtualize re-mount row | gate entrance class ให้เฉพาะข้อความที่ "ใหม่จริง" ผ่าน prop `isNew` |
| **L11** | Send icon ไม่ optically centered ในปุ่ม (`MessageInput.tsx:212`) | shift icon เล็กน้อย (`translate-x`) ให้ดูอยู่กลางเชิงสายตา |

## Metadata

- **Complexity**: Medium
- **Source PRD**: `D:/genAI/jsk-app/.claude/PRPs/prds/livechat-audit-remediation.prd.md`
- **PRD Phase**: Phase 4 — Motion & Polish (parallel with Phase 3; depends on Phase 1)
- **Estimated Files**: 8 (7 UPDATE + 1 CREATE)

## UX Design

**Before → After (toast dismiss):**
```
BEFORE                              AFTER
┌──────────────┐                   ┌──────────────┐
│ 🔔 New msg  ✕│ ── click ✕ ──>    │ 🔔 New msg  ✕│ ── click ✕ ──>  (fade+slide-right 200ms)
└──────────────┘   [POOF gone]     └──────────────┘                  ┌ ─ ─ ─ ─ ─ ─ ┐  (opacity→0)
                   (instant unmount)                                  └ ─ ─ ─ ─ ─ ─ ┘  then unmount
```

**Before → After (reduced-motion ON):**
```
BEFORE: ตั้ง OS reduce-motion → animate-ping/pulse ยังเด้ง, chat auto-scroll ยัง smooth (เวียนหัว)
AFTER : useReducedMotion=true → animate-* ไม่ใส่, scrollIntoView behavior='auto' (เลื่อนทันที ไม่ไหล)
```

## Mandatory Reading

| Priority | File | Lines | Why |
|----------|------|-------|-----|
| P0 | `app/admin/live-chat/_components/NotificationToast.tsx` | 24-27, 57-92 | จุดแก้ exit animation (M2) + layout reorder (L6) + target size guard |
| P0 | `app/admin/live-chat/_components/ConversationItem.tsx` | 42-67, 139-192 | dropdown exit (M2) + transition-all (L1) + tabular-nums บน unread (M21) |
| P0 | `components/ui/PageTransition.tsx` | 1-31 | **pattern อ้างอิง** การใช้ `motion/react` + variants + cubic-bezier ในโปรเจกต์นี้ |
| P0 | `app/globals.css` | 216-227, 552-567, 713-753 | token ที่มีอยู่ (`--duration-*`/`--ease-*`), `.focus-ring`/`.press-down`, live-chat keyframes, reduced-motion media query |
| P1 | `app/admin/live-chat/_components/MessageBubble.tsx` | 43, 101, 107-111, 124-138 | entrance class (L7), inset outline + break-words + tabular-nums (M21) |
| P1 | `app/admin/live-chat/_components/ChatArea.tsx` | 80-114, 281-305 | scrollIntoView guard (W4), tabular-nums บน stat (M21), ส่ง `isNew` ลง MessageBubble (L7) |
| P1 | `app/admin/live-chat/_components/MessageInput.tsx` | 93-94, 191, 195, 204-213 | transition-all (L1), focus-ring + target size (M21), send icon centering (L11) |
| P1 | `app/admin/live-chat/_components/TypingIndicator.tsx` | 5-17 | typing-bounce keyframe แทน animate-pulse (M21) + reduced-motion guard (W4) |
| P2 | `app/admin/live-chat/_components/ChatHeader.tsx` | 96-123 | transition-all → duration only (L1) |
| P2 | `app/admin/live-chat/_components/ConversationList.tsx` | 109-141, 180-194 | transition-all (L1) บน search input / filter buttons / search-result buttons |
| P2 | `hooks/useTheme.ts` | (ทั้งไฟล์) | pattern ของ custom hook + `'use client'` + localStorage/matchMedia listener ในโปรเจกต์ |

## Patterns to Mirror

### 1. motion/react import + variants (มีในโปรเจกต์แล้ว)
```tsx
// SOURCE: components/ui/PageTransition.tsx:1-18
'use client';
import { motion } from 'motion/react';
const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
};
```
> ใช้ `from 'motion/react'` (ไม่ใช่ `framer-motion`). `AnimatePresence` import จาก path เดียวกัน: `import { AnimatePresence, motion } from 'motion/react'`.

### 2. matchMedia custom hook (mirror สำหรับ useReducedMotion)
```ts
// SOURCE: hooks/useTheme.ts (โครง 'use client' + useState + useEffect listener)
// hooks ในโปรเจกต์เป็น 'use client', คืน state ตรง ๆ, cleanup listener ใน useEffect return
```
> `useReducedMotion` ต้อง mirror โครงนี้: `useState<boolean>` + `matchMedia('(prefers-reduced-motion: reduce)')` + `addEventListener('change')` + cleanup. (หมายเหตุ: `motion` ก็ export `useReducedMotion` มาให้ แต่ PRD W4 ระบุ "สร้าง hook (หรือ reuse motion's)" — เราสร้าง local hook เพื่อใช้ guard CSS className/JS ได้อิสระจาก motion components.)

### 3. existing accessible-button + aria-label pattern
```tsx
// SOURCE: app/admin/live-chat/_components/NotificationToast.tsx:79-85
<button
  aria-label="Dismiss notification"
  onClick={() => dismissToast(toast.id)}
  className="shrink-0 rounded-md p-0.5 text-text-tertiary hover:text-text-primary"
>
  <X className="h-3.5 w-3.5" />
</button>
```
> ห้าม regress aria-label เดิม. (Note: target size ของปุ่มนี้ ~22px เป็นงาน W5/Phase 1 — ในเฟสนี้ **ไม่แก้ขนาด** เว้นแต่ Phase 1 ยังไม่ merge; ดู GOTCHA Task 8.)

### 4. design token usage (duration/ease มีอยู่แล้ว)
```css
/* SOURCE: app/globals.css:216-227 */
--duration-slow: 300ms;     /* = msg-in/out ปัจจุบัน 0.3s */
--duration-slower: 500ms;
--ease-out: cubic-bezier(0, 0, 0.2, 1);
```
> live-chat keyframes (`globals.css:725-729`) ปัจจุบัน hardcode `0.3s`/`0.4s` — แทนด้วย `var(--duration-slow)` / token ใหม่ `--duration-toast`.

### 5. test structure (vitest)
```ts
// SOURCE: lib/constants/__tests__ (AAA pattern, describe/it/expect, vitest)
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
// Arrange → Act → Assert
```
> unit test ของ `useReducedMotion` mock `window.matchMedia` ก่อน render hook.

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `hooks/useReducedMotion.ts` | **CREATE** | W4 — central reduced-motion source สำหรับ JS guard |
| `app/admin/live-chat/_components/NotificationToast.tsx` | UPDATE | M2 (exit), L6 (layout reorder) |
| `app/admin/live-chat/_components/ConversationItem.tsx` | UPDATE | M2 (dropdown exit), L1 (transition-all), M21 (tabular-nums) |
| `app/admin/live-chat/_components/MessageBubble.tsx` | UPDATE | L7 (isNew gate), M21 (inset outline, break-words, tabular-nums) |
| `app/admin/live-chat/_components/ChatArea.tsx` | UPDATE | W4 (scrollIntoView guard), L7 (pass isNew), M21 (tabular-nums stats) |
| `app/admin/live-chat/_components/MessageInput.tsx` | UPDATE | L1 (transition-all), M21 (focus-ring), L11 (send icon centering) |
| `app/admin/live-chat/_components/TypingIndicator.tsx` | UPDATE | M21 (typing-bounce), W4 (reduced-motion guard) |
| `app/admin/live-chat/_components/ChatHeader.tsx` | UPDATE | L1 (transition-all → duration) |
| `app/admin/live-chat/_components/ConversationList.tsx` | UPDATE | L1 (transition-all) |
| `app/globals.css` | UPDATE | M21 (typing-bounce keyframe + `--duration-toast` token), W4 (keep media query), L1 (`.hover-lift` transition-all) |

> **File ownership note (PRD:170-177):** `globals.css` owner = Phase 3 → **ประสานก่อนแก้** (เพิ่ม keyframe/token block ใหม่ ไม่แก้ token เดิมของ Phase 3). `MessageInput.tsx` owner = Phase 1 → **rebase หลัง P1 merge** ก่อนแตะ. `ChatArea.tsx` owner = Phase 1 → rebase หลัง P1 merge.

## NOT Building

- **ไม่แตะ virtualized message list ใน `ChatArea.tsx`** ด้วย `AnimatePresence`/`motion` (ชน virtualizer measurement: `visibleWindow`/`scrollTop`/`topPadding`). exit animation จำกัด **toast + dropdown เท่านั้น**.
- **ไม่ทำ a11y ของ M21** (sr-only, role) — นั่นอยู่ Phase 2 ("a11y ใน M21", PRD:162). เฟสนี้ทำเฉพาะ **visual/motion polish** ของ M21.
- **ไม่แก้ target size (W5)** — เป็น Phase 1 (`NotificationToast.tsx:82`, `MessageInput.tsx:195`). เฟสนี้แตะ focus-ring/centering เท่านั้น เว้นกรณี Phase 1 ยังไม่ merge (ดู GOTCHA).
- **ไม่แก้ W1 focus-visible ทั้งหน้า** — เป็น Phase 2. เฟสนี้เพิ่ม `.focus-ring` เฉพาะ expand toggle + sticker tab ตามที่ M21 ระบุ.
- **ไม่เพิ่ม motion library ใหม่** — ใช้ `motion@^12.38.0` ที่มีแล้ว.
- **ไม่ refactor store/context** — Phase 5/8.

## Step-by-Step Tasks

### Task 1 — CREATE `useReducedMotion` hook (W4 core)
- **ACTION**: CREATE `D:/genAI/jsk-app/frontend/hooks/useReducedMotion.ts`
- **IMPLEMENT**:
```ts
'use client';
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** Returns true when the user has requested reduced motion at the OS level. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
```
- **MIRROR**: `hooks/useTheme.ts` (`'use client'` + useState + matchMedia listener + cleanup)
- **IMPORTS**: `react` only
- **GOTCHA**: เริ่มที่ `false` (ไม่ใช่ `mql.matches`) เพื่อเลี่ยง SSR hydration mismatch — sync ค่าจริงใน `useEffect`. ใช้ `addEventListener('change')` (modern API) ไม่ใช่ `addListener` (deprecated).
- **VALIDATE**: `npx tsc --noEmit` && `npx eslint hooks/useReducedMotion.ts`

### Task 2 — Toast exit + layout animation (M2, L6)
- **ACTION**: UPDATE `NotificationToast.tsx`
- **IMPLEMENT**:
  1. `import { AnimatePresence, motion } from 'motion/react'` + `import { useReducedMotion } from '@/hooks/useReducedMotion'`.
  2. ครอบ `notifications.map(...)` ด้วย `<AnimatePresence initial={false}>`.
  3. เปลี่ยน item `<div className="toast-slide ...">` (line 62-65) เป็น `<motion.div>` พร้อม:
     - `layout` (L6 — reorder เนียน)
     - `initial={{ opacity: 0, x: reduced ? 0 : 32 }}`
     - `animate={{ opacity: 1, x: 0 }}`
     - `exit={{ opacity: 0, x: reduced ? 0 : 32 }}`
     - `transition={{ duration: reduced ? 0 : 0.2, ease: [0, 0, 0.2, 1] }}`
     - ลบ className `toast-slide` (entrance ย้ายมาที่ motion แล้ว)
  4. `const reduced = useReducedMotion()` ใน component body.
- **MIRROR**: `PageTransition.tsx:1-18` (motion + variants), keep `aria-label` line 80, keep `key={toast.id}` (จำเป็นต่อ AnimatePresence).
- **IMPORTS**: `motion/react`, `@/hooks/useReducedMotion`
- **GOTCHA**: `AnimatePresence` ต้องเห็น `key` ที่เสถียร (`toast.id` ใช้ได้). อย่าลบ `if (notifications.length === 0) return null` ออกจาก parent (AnimatePresence จัดการ children ภายใน). exit ใช้ `x` (transform) ไม่ใช่ `right`/`margin` (compositor-friendly).
- **VALIDATE**: `npx tsc --noEmit` && `npx eslint app/admin/live-chat/_components/NotificationToast.tsx`

### Task 3 — Dropdown exit animation (M2)
- **ACTION**: UPDATE `ConversationItem.tsx`
- **IMPLEMENT**:
  1. `import { AnimatePresence, motion } from 'motion/react'` + `useReducedMotion`.
  2. แทน `{menuOpen && (<div className="... animate-in fade-in slide-in-from-top-1 duration-150">...)}` (line 139-192) ด้วย:
     ```tsx
     <AnimatePresence>
       {menuOpen && (
         <motion.div
           initial={{ opacity: 0, y: reduced ? 0 : -4 }}
           animate={{ opacity: 1, y: 0 }}
           exit={{ opacity: 0, y: reduced ? 0 : -4 }}
           transition={{ duration: reduced ? 0 : 0.15, ease: [0, 0, 0.2, 1] }}
           className="absolute right-0 top-full mt-1 w-44 bg-surface rounded-xl shadow-2xl border border-border-default overflow-hidden z-50"
         >
           ...เมนูเดิม...
         </motion.div>
       )}
     </AnimatePresence>
     ```
     (ลบ Tailwind `animate-in fade-in slide-in-from-top-1 duration-150` — ย้ายไป motion).
- **MIRROR**: Task 2.
- **IMPORTS**: `motion/react`, `@/hooks/useReducedMotion`
- **GOTCHA**: เมนูอยู่ใน `memo` component — `motion` ทำงานปกติใน memo. ใช้ `y` (transform) ไม่ใช่ `top`. คง `onClick`/`stopPropagation` ของทุกปุ่มในเมนูเดิม.
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/ConversationItem.tsx`

### Task 4 — ConversationItem polish: transition-all + tabular-nums (L1, M21)
- **ACTION**: UPDATE `ConversationItem.tsx`
- **IMPLEMENT**:
  1. line 47: `transition-all` → `transition-colors` (root option div — animate แค่ bg/text/border color).
  2. line 100 unread badge: เพิ่ม `tabular-nums` ลง className (เลขนับไม่ดิ้น).
- **MIRROR**: existing className strings.
- **IMPORTS**: none
- **GOTCHA**: line 47 มี `gradient-active`/`shadow-lg` ตอน selected — `transition-colors` ยังให้ background-color/color เปลี่ยนนุ่ม; shadow snap ทันทีเป็นที่ยอมรับได้ (L1 = เลี่ยง animate layout, ไม่ใช่ต้อง animate ทุกอย่าง). line 134 menu button ใช้ `transition-opacity` อยู่แล้ว — ไม่ต้องแก้.
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/ConversationItem.tsx`

### Task 5 — MessageBubble polish: inset outline + break-words + tabular-nums + isNew gate (M21, L7)
- **ACTION**: UPDATE `MessageBubble.tsx`
- **IMPLEMENT**:
  1. **L7**: เพิ่ม prop `isNew?: boolean` ลง `MessageBubbleProps` (interface line 8-18). เปลี่ยน line 101 className ให้ใส่ `msg-in`/`msg-out` **เฉพาะเมื่อ `isNew`**:
     ```tsx
     className={`flex items-end gap-2 px-4 ${incoming ? 'justify-start' : 'justify-end flex-row-reverse'} ${isNew ? (incoming ? 'msg-in' : 'msg-out') : ''}`}
     ```
  2. **M21 break-words**: bubble div (line 124-131) เพิ่ม `break-words` (และ `whitespace-pre-wrap` ถ้ายังไม่มี — ตรวจ: ปัจจุบันไม่มี) → ป้องกัน URL ยาวล้น.
  3. **M21 inset outline**: chat image (line 43) เพิ่ม `outline outline-1 -outline-offset-1 outline-black/5`; avatar (line 107-111) เพิ่ม `outline outline-1 -outline-offset-1 outline-black/10` (ขอบ inset ไม่กิน layout).
  4. **M21 tabular-nums**: timestamp span (line 137) เพิ่ม `tabular-nums` (นาฬิกาไม่ดิ้น).
- **MIRROR**: existing className concat style ในไฟล์.
- **IMPORTS**: none
- **GOTCHA**: `break-words` = `overflow-wrap: break-word` (ปลอดภัยกว่า `break-all`). image/avatar ใช้ `<img>` (eslint-disabled) — outline ใช้ได้ปกติ. `isNew` เป็น optional → default undefined = ไม่มี entrance (เลี่ยง replay บน virtualize remount).
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/MessageBubble.tsx`

### Task 6 — ChatArea: scrollIntoView reduced-motion guard + pass isNew + tabular-nums (W4, L7, M21)
- **ACTION**: UPDATE `ChatArea.tsx`
- **IMPLEMENT**:
  1. `import { useReducedMotion } from '@/hooks/useReducedMotion'`; `const reduced = useReducedMotion()`.
  2. **W4** line 83: `messagesEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })`.
  3. **W4** line 110: `target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })`.
  4. เพิ่ม `reduced` ลง dep array ของ effect ที่ line 85 (`[messages.length, reduced]`) และ line 114 (`[..., reduced]`).
  5. **L7** track "new since mount": เก็บ `const prevLenRef = useRef(messages.length)` ; ใน render คำนวณ `isNew` = index ของ message ≥ ค่า length ก่อนหน้า. วิธีเรียบง่ายที่ตรงตาม PRD: ส่ง `isNew={message.created_at && (Date.now() - new Date(message.created_at).getTime() < 5000)}` **ไม่** — ใช้แทนด้วย index-based: ถือว่าข้อความ "ใหม่จริง" เมื่อ `idx >= mountedCountRef.current`. กำหนด `const mountedCountRef = useRef<number>(0)` และ set `mountedCountRef.current = messages.length` ใน effect หลัง paint แรกของแต่ละ selectedId; ส่ง `isNew={idx >= mountedCountRef.current}` ใน `<MessageBubble>` (line 292-303).
  6. **M21** line 232, 237 stat numbers: เพิ่ม `tabular-nums` ลง `text-2xl font-bold` className.
- **MIRROR**: existing `useMemo`/`useEffect` + `useRef` ในไฟล์ (line 67-71).
- **IMPORTS**: `@/hooks/useReducedMotion`
- **GOTCHA**: **ห้ามแตะ virtualization logic** (`visibleWindow`, `scrollTop`, `topPadding`/`bottomPadding` line 148-163, 267, 306). `isNew` ต้องคำนวณจาก absolute `idx` (line 284) ไม่ใช่ `visibleIdx`. reset `mountedCountRef` เมื่อ `selectedId` เปลี่ยน (ใช้ effect dep `[selectedId]`) เพื่อไม่ให้ entrance เล่นตอนสลับห้อง. อย่าทำ `isNew` ด้วยเวลา (`Date.now`) เพราะ history เก่าที่ created_at เพิ่งมาถึงจะ false-positive.
- **VALIDATE**: `npx tsc --noEmit` && `npx eslint app/admin/live-chat/_components/ChatArea.tsx`

### Task 7 — TypingIndicator: typing-bounce + reduced-motion (M21, W4)
- **ACTION**: UPDATE `TypingIndicator.tsx` + `globals.css`
- **IMPLEMENT**:
  1. `globals.css` (ใน `@layer utilities`, ใกล้ live-chat block line 713-729): เพิ่ม
     ```css
     @keyframes typing-bounce {
       0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
       40% { transform: translateY(-3px); opacity: 1; }
     }
     .animate-typing-bounce { animation: typing-bounce 1.2s var(--ease-in-out) infinite; }
     ```
  2. `TypingIndicator.tsx`: `import { useReducedMotion } from '@/hooks/useReducedMotion'`; `const reduced = useReducedMotion()`. แทน `animate-pulse` (line 10-12) ด้วย `${reduced ? '' : 'animate-typing-bounce'}` (3 จุด, คง `style={{ animationDelay }}`).
- **MIRROR**: keyframe block ที่มีอยู่ (`globals.css:714-729`) + token usage `var(--ease-in-out)` (`@theme:227`).
- **IMPORTS**: `@/hooks/useReducedMotion`
- **GOTCHA**: `transform: translateY` = compositor-friendly (ไม่ animate height/top). delay เดิม 0/150/300ms คงไว้. `globals.css` owner = Phase 3 → เพิ่ม block ใหม่ ไม่แก้บรรทัดเดิม (เลี่ยง conflict).
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/TypingIndicator.tsx`

### Task 8 — MessageInput: transition-all + focus-ring + send icon centering (L1, M21, L11)
- **ACTION**: UPDATE `MessageInput.tsx`
- **IMPLEMENT**:
  1. **L1** line 191 textarea: `transition-all` → `transition-colors` (animate border/bg/ring color เท่านั้น).
  2. **L1** line 207 send button: `transition-all` → `transition-[background-color,box-shadow,transform]` (keep `active:scale-95` ทำงาน).
  3. **M21 focus-ring**: expand toggle (line 195-201) เพิ่ม class `focus-ring` (จาก `globals.css:553`); sticker tab → **ตรวจ**: sticker toggle อยู่ที่ line 130 (`btnClass(showStickerPicker)`). เพิ่ม `focus-ring` ลงใน `btnClass` helper (line 93-94) ครั้งเดียว → ครอบทุก toolbar button รวม sticker:
     ```tsx
     const btnClass = (active: boolean) =>
       `p-2 rounded-lg transition-colors focus-ring ${active ? 'bg-brand-50 text-brand-600' : 'text-text-tertiary hover:text-text-primary hover:bg-muted'}`;
     ```
     (ได้ทั้ง focus-ring + เปลี่ยน `transition-colors` ในตัว — เดิม btnClass ใช้ `transition-colors` อยู่แล้ว ✓).
  4. **L11** send icon (line 212): เพิ่ม `className="w-5 h-5 translate-x-[1px]"` (optical centering — ลูกศร Send มี whitespace ขวาน้อยกว่าซ้าย).
- **MIRROR**: `.focus-ring` utility (`globals.css:553-555`).
- **IMPORTS**: none
- **GOTCHA**: **`MessageInput.tsx` owner = Phase 1 (PRD:173) → rebase หลัง P1 merge ก่อนแตะ.** ถ้า Phase 1 ยังไม่ merge ตอนทำเฟสนี้: Phase 1 อาจแก้ line 191 focus ring (W1) + line 195/212 target size (W5) — ประสาน/ rebase อย่า overwrite. line 191 ถ้า Phase 1 เปลี่ยน `focus:ring-2 focus:ring-brand-500/40` → `focus-visible:` แล้ว ให้คงของ Phase 1 และแก้แค่ `transition-all`→`transition-colors`.
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/MessageInput.tsx`

### Task 9 — ChatHeader + ConversationList: transition-all → specific (L1)
- **ACTION**: UPDATE `ChatHeader.tsx`, `ConversationList.tsx`
- **IMPLEMENT**:
  1. `ChatHeader.tsx` line 99, 112 mode buttons: `transition-all duration-200` → `transition-colors duration-200` (animate bg/text/shadow-color; gradient-active toggle = color change).
  2. `ConversationList.tsx`: line 117 search input `transition-all` → `transition-colors`; line 125 filter button `transition-all` → `transition-colors`; line 184 search-result button `transition-all` → `transition-colors`.
- **MIRROR**: existing className.
- **IMPORTS**: none
- **GOTCHA**: ตรวจ `ConversationList.tsx` line 100 ("เริ่มแชทใหม่" button) ก็มี `transition-all` — แก้เป็น `transition-colors` ด้วย (ครบทุก `transition-all` ในไฟล์ตาม PRD). ใช้ Grep `transition-all` ในไฟล์ก่อนแก้เพื่อจับให้ครบ.
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/ChatHeader.tsx app/admin/live-chat/_components/ConversationList.tsx`

### Task 10 — globals.css: motion tokens + .hover-lift transition-all (M21, L1)
- **ACTION**: UPDATE `globals.css`
- **IMPLEMENT**:
  1. **M21 central token**: ใน `@theme` block (หลัง line 221) เพิ่ม `--duration-toast: 200ms;` (token เฉพาะ toast/dropdown exit; JS motion ใช้ค่าโดยตรง 0.2/0.15 แต่ CSS keyframes อ้าง token). map live-chat CSS keyframe durations ให้ใช้ token:
     - line 725 `.msg-in { animation: slide-in-left 0.3s ease-out; }` → `var(--duration-slow) var(--ease-out)`
     - line 726 `.msg-out { ... 0.3s ... }` → `var(--duration-slow) var(--ease-out)`
     - line 729 `.toast-slide { ... 0.4s ... }` → คง class ไว้เผื่อ fallback แต่ map → `var(--duration-toast) var(--ease-out)` (toast หลักย้ายไป motion แล้ว; class เหลือเป็น dead → **ลบทิ้งได้** ถ้า Task 2 ลบ className ครบ — ลบ `.toast-slide` + `@keyframes toast-slide` หลังยืนยันไม่มี consumer ด้วย Grep).
  2. **L1** line 559 `.hover-lift { @apply transition-all duration-200 ease-out; }` → `@apply transition-[transform,box-shadow] duration-200 ease-out;` (animate แค่ lift+shadow).
- **MIRROR**: token block `@theme:216-227`.
- **IMPORTS**: none
- **GOTCHA**: **`globals.css` owner = Phase 3 → ประสานก่อนแก้ (PRD:175).** เพิ่ม token/keyframe ใหม่ปลอดภัย; แก้ keyframe duration เป็น token = semantic-equivalent (0.3s=`--duration-slow`, 0.4s≈`--duration-toast` ปรับเป็น 200ms ถือเป็น intentional tightening). อย่าลบ reduced-motion media query (line 744-753) — ยังเป็น CSS-side guard. ก่อนลบ `.toast-slide`/`.hover-lift` ของเดิม ตรวจ Grep ทั่ว `app/`+`components/` ว่าไม่มี consumer อื่นนอก live-chat.
- **VALIDATE**: `npm run build` (ยืนยัน Tailwind v4 parse `@theme` + `@apply` ผ่าน)

## Testing Strategy

### Unit tests (vitest)

| Test file | Target | Cases |
|-----------|--------|-------|
| `hooks/__tests__/useReducedMotion.test.ts` (CREATE) | `useReducedMotion` | (1) คืน `false` เมื่อ `matchMedia.matches=false`; (2) คืน `true` เมื่อ `matches=true`; (3) update เมื่อ `change` event ยิง; (4) ไม่ crash เมื่อ `matchMedia` undefined (SSR-safe) |

ตัวอย่างโครง (mirror AAA + vitest):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
  };
  vi.stubGlobal('matchMedia', () => mql);
  return { mql, fire: (m: boolean) => listeners.forEach((cb) => cb({ matches: m } as MediaQueryListEvent)) };
}

describe('useReducedMotion', () => {
  beforeEach(() => vi.unstubAllGlobals());
  it('returns true when OS prefers reduced motion', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });
  it('reacts to change events', () => {
    const { fire } = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    act(() => fire(true));
    expect(result.current).toBe(true);
  });
});
```

> Visual/motion ของ toast/dropdown/typing — ตาม web/testing.md ใช้ **visual signal manual + Playwright** มากกว่า brittle markup assertion. ไม่บังคับ unit test สำหรับ component motion (เสี่ยง flaky).

### Edge-case checklist
- [ ] reduced-motion ON → toast/dropdown exit เป็น fade-only (ไม่มี slide); typing dots นิ่ง; chat scroll = instant (ไม่ smooth).
- [ ] toast 3 อันซ้อน → ปิดอันกลาง → 2 อันที่เหลือ reflow ด้วย `layout` ไม่กระโดด (L6).
- [ ] dropdown เปิด/ปิดเร็ว ๆ → ไม่ค้าง (AnimatePresence จัดการ).
- [ ] message list ยาว >200 (virtualize ON) → scroll ขึ้น-ลง → MessageBubble **ไม่** replay entrance (L7 isNew gate).
- [ ] สลับห้อง (selectedId เปลี่ยน) → ข้อความห้องใหม่ไม่เล่น entrance ทั้งชุด.
- [ ] URL ยาวมากในข้อความ → break-words ตัดบรรทัด ไม่ล้น bubble (M21).
- [ ] นาฬิกา/counter หลายค่า → ความกว้างคงที่ (tabular-nums).
- [ ] keyboard focus expand toggle / sticker tab → เห็น focus-ring (M21).

## Validation Commands

รันจาก `D:/genAI/jsk-app/frontend`:

```bash
npx tsc --noEmit
# EXPECT: 0 errors

npx eslint hooks/useReducedMotion.ts app/admin/live-chat/_components/NotificationToast.tsx app/admin/live-chat/_components/ConversationItem.tsx app/admin/live-chat/_components/MessageBubble.tsx app/admin/live-chat/_components/ChatArea.tsx app/admin/live-chat/_components/MessageInput.tsx app/admin/live-chat/_components/TypingIndicator.tsx app/admin/live-chat/_components/ChatHeader.tsx app/admin/live-chat/_components/ConversationList.tsx
# EXPECT: 0 errors / 0 warnings

npx vitest run
# EXPECT: all pass incl. hooks/__tests__/useReducedMotion.test.ts (29 existing + 2-4 new)

npm run build
# EXPECT: tsc + next build success; Tailwind v4 parses @theme token + typing-bounce keyframe

npx playwright test
# EXPECT: smoke tests green (no regression on live-chat render)
```

ตรวจซ้ำว่าไม่มี `transition-all` หลงเหลือใน scope:
```bash
# EXPECT: no matches (หรือเฉพาะที่จงใจคงไว้พร้อมคอมเมนต์)
```
Grep `transition-all` ใน `app/admin/live-chat/**` ผ่าน Grep tool.

## Acceptance Criteria

- [ ] M2/M11a: toast + ConversationItem dropdown มี **exit animation** (fade+transform) ก่อน unmount.
- [ ] W4: `hooks/useReducedMotion.ts` มีอยู่; `animate-*` (typing) + `scrollIntoView` (ChatArea:83,110) เคารพ reduced-motion.
- [ ] M21: tabular-nums บน clock/counter; focus-ring บน expand toggle + sticker tab; inset outline บน chat image+avatar; break-words บน text bubble; `@keyframes typing-bounce` ใช้แทน animate-pulse; live-chat keyframe ใช้ `--duration-*`/`--ease-*` token.
- [ ] L1: ไม่มี `transition-all` ใน MessageInput/ConversationItem/ChatHeader/ConversationList/`.hover-lift` (`.press-down` คงเดิม).
- [ ] L6: toast stack reorder ด้วย `layout` prop ไม่กระโดด.
- [ ] L7: entrance ไม่ replay บน virtualize remount (gate ด้วย `isNew`).
- [ ] L11: Send icon optically centered.
- [ ] **ไม่แตะ** virtualized message list ด้วย AnimatePresence.
- [ ] build/lint/tsc/vitest/playwright เขียวทั้งหมด.

## Completion Checklist

- [ ] Task 1-10 เสร็จ + VALIDATE ต่อ task ผ่าน
- [ ] unit test useReducedMotion เพิ่มแล้ว + ผ่าน
- [ ] manual edge-case checklist เดินครบ (toggle OS reduced-motion จริง)
- [ ] Grep ยืนยัน 0 `transition-all` ตกค้างใน scope
- [ ] Grep ยืนยัน `.toast-slide`/dead keyframe ไม่มี consumer ก่อนลบ
- [ ] rebase หลัง Phase 1 merge (MessageInput.tsx, ChatArea.tsx); ประสาน globals.css กับ Phase 3 owner
- [ ] PR diff = motion/polish เท่านั้น (ไม่มี logic/store change)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AnimatePresence ชน virtualizer ถ้าเผลอใช้กับ message list | M | High | จำกัด toast/dropdown เท่านั้น (NOT Building); MessageBubble ใช้ CSS class ไม่ใช่ motion |
| `isNew` คำนวณผิด → entrance ไม่เล่นเลย หรือ replay | M | Med | ใช้ index-based vs `mountedCountRef`, reset ตาม selectedId; manual test scroll + สลับห้อง |
| globals.css conflict กับ Phase 3 (owner) | M | Med | เพิ่ม block ใหม่เท่านั้น, ประสานก่อน merge, แก้ keyframe เป็น token (semantic-equivalent) |
| MessageInput/ChatArea conflict กับ Phase 1 (owner) | M | Med | rebase หลัง P1 merge; คงของ Phase 1 (W1 focus, W5 size) ทับด้วย L1/M21 อย่างระวัง |
| reduced-motion hook SSR hydration mismatch | L | Low | init `false`, sync ใน useEffect (Task 1 GOTCHA) |
| ลบ `.toast-slide`/`.hover-lift` แล้วมี consumer อื่นนอก scope | L | Med | Grep ทั่ว app/+components/ ก่อนลบ; ถ้ามี consumer → คง class, แก้แค่ค่า |

## Notes

- `motion` ใช้ entry `motion/react` (ไม่ใช่ `framer-motion`) ตามที่โปรเจกต์ใช้อยู่ (`PageTransition.tsx:3`, อีก 12 ไฟล์).
- design token `--duration-*`/`--ease-*` **มีครบแล้ว** (`globals.css:216-227`) — งาน M21 "central token" = map ของ hardcode มาใช้ + เพิ่ม `--duration-toast` ตัวเดียว.
- `.press-down` (`globals.css:565-567`) ใช้ `transition-transform` ถูกต้องอยู่แล้ว — **ไม่แตะ** (PRD ระบุ).
- ChatArea aria-live container (line 263) เป็นงาน W3/Phase 1-2 — เฟสนี้ไม่แตะ.
- ไม่มี `tabular-nums`/`focus-ring`/`break-words`/`isNew` ใช้ใน live-chat components ปัจจุบัน (ยืนยันด้วย Grep — พบเฉพาะ TransferDialog/SessionActions ซึ่งนอก scope task เหล่านี้).
- ผู้ดำเนินการควรเปิด React DevTools + toggle OS reduced-motion (Windows: Settings → Accessibility → Visual effects → Animation effects OFF) เพื่อ verify W4 จริง.
