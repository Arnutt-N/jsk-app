# Live-Chat Frontend Reassembly (PR C — architecture-review candidate #4)

> **Status:** REVIEWED 2026-07-30 — verified against code (all line refs exact); approved with 4 minor plan amendments (see plan doc)
> **Branch:** `refactor/live-chat-frontend`
> **Predecessors:** PR A #172 (report_service), PR B #173 (apiFetch adapter) — both merged.

## Problem Statement

โมดูล live-chat frontend ผ่านการ refactor ใหญ่มาแล้ว (Phase 8: แยก provider 805 บรรทัด → composition root + 6 hooks) แต่ยังเหลือจุดเสียดทาน 3 จุดที่ทำให้แก้ไข/ทดสอบยาก:

1. **`ChatArea.tsx` (534 บรรทัด)** ผสม 5 ความรับผิดชอบในไฟล์เดียว: virtualization windowing, RAF scroll throttling, IntersectionObserver history paging, auto-scroll heuristics, และ connection UI — logic scroll/virtualization ทดสอบแบบ unit ไม่ได้เลย (ปัจจุบันไม่มี unit test สำหรับ ChatArea)
2. **`LiveChatContext.tsx` (419 บรรทัด)** มี business logic ของ WS session events (~100 บรรทัด: claimed/closed/transferred/presence/error/typing) เขียน inline ในตัว provider composition root
3. **Dual state:** `wsStatus`, `onlineOperators`, `claimContenders`, `typingUsersCount` อยู่ใน Context-local `useState` ขณะที่ state อื่นอยู่ใน Zustand store — **component ต้อง subscribe สองแหล่ง ทำให้เกิด re-render ที่ควบคุมยากและไม่มี single source of truth**

## Evidence

- Architecture review (candidates 1-6) ระบุข้อนี้เป็น candidate #4; แผนแม่อนุมัติแล้ว: `~/.qoder/plans/pale-storm-wagtail.md` (PR C section)
- `ChatArea.tsx:24-32` — comment ยอมรับว่า fixed-row-height windowing เป็น "safety net" ที่สู้กับ variable-height bubbles; มี `console.log` debug หลงเหลือ (L169, L205, L435-440)
- `LiveChatContext.tsx:196-308` — WS handlers inline ในการเรียก `useLiveChatSocket` (onSessionClaimed L221-252, onError L271-305 ฯลฯ)
- `LiveChatContext.tsx:95-100` — 4 local useState ที่ควรอยู่ใน store
- Precedent: Phase 8 provider refactor (PR #116) พิสูจน์แล้วว่า extraction แบบ contract-preserving ทำได้โดย CI เขียว — contract test `LiveChatContext.contract.test.tsx` ยังใช้เป็น guard ได้

## Proposed Solution

### Changes by component:

| Component | ปัจจุบัน | เปลี่ยนเป็น |
|---|---|---|
| `_components/ChatArea.tsx` (534) | virtualization + RAF scroll + IO paging + auto-scroll inline | เรียก `useVirtualScroll` hook; เหลือ render + composition (~300 บรรทัด) |
| `_hooks/useVirtualScroll.ts` | — (ไม่มี) | ใหม่ — windowing, scrollTop RAF, history sentinel IO, auto-scroll, focused-message jump, viewport ResizeObserver |
| `_context/LiveChatContext.tsx` (419) | WS session handlers inline + 4 local useState | เรียก `useSessionEvents` hook; local useState 4 ตัวย้ายเข้า store (~250-280 บรรทัด) |
| `_hooks/useSessionEvents.ts` | — (ไม่มี) | ใหม่ — handlers: connectionChange, typing, sessionClaimed, sessionClosed, sessionTransferred, presenceUpdate, error |
| `_store/liveChatStore.ts` (252) | ไม่มี ws/presence/claim state | เพิ่ม `wsStatus`, `onlineOperators`, `claimContenders`, `typingUsersCount` + setters |

### NOT changed (contract จะถูกรักษาไว้):

- Context value **34 fields เดิมทุกตัว** — ชื่อ, ชนิด, semantics เหมือนเดิม (guard ด้วย contract test)
- `useLiveChatSocket` / `useWebSocket` (`frontend/hooks/`) — ไม่แตะ
- `useMessageFlow`, `useConversationSync`, `useChatRoom`, `useLiveChatActions` — ไม่แตะ
- Backend / WS protocol — ไม่แตะ
- พฤติกรรม UI ทุกอย่าง (scroll, claim, transfer, presence, typing indicator, toast ภาษาไทย)

## Key Hypothesis

ถ้าแยก scroll/virtualization และ session-event logic ออกเป็น hooks ที่มีขอบเขตชัด + รวม state เป็น single source ใน Zustand แล้ว: (1) contract test + memo test + claim test เดิมผ่านโดยไม่แก้ expectation, (2) พฤติกรรมใน browser เหมือนเดิมทุกจุด, (3) โค้ดใหม่ unit-test ได้โดยไม่ต้อง mount ChatArea ทั้งตัว

## What We're NOT Building

- ไม่เขียน virtualization engine ใหม่ (ไม่เปลี่ยนเป็น react-virtuoso/variable-height) — ย้ายโค้ดเดิมเท่านั้น
- ไม่เพิ่ม feature ใหม่ให้ live-chat
- ไม่ migrate live-chat ไปใช้ `apiFetch` (คนละ PR — `liveChatApi.ts` ค่อยทำภายหลัง)
- ไม่แก้ `useLiveChatSocket`/`useWebSocket` แม้จะไม่มี unit test (นอก scope)

## Success Metrics

- `ChatArea.tsx` ≤ ~320 บรรทัด; `LiveChatContext.tsx` ≤ ~290 บรรทัด
- Context contract test ผ่าน **โดยไม่แก้ไฟล์ test** (ยกเว้น mock setup ที่จำเป็นจากการย้าย state เข้า store)
- vitest ทั้ง suite เขียว (441+), `tsc --noEmit` clean, `npm run build` ผ่าน, lint 0 error
- Manual browser: ส่งข้อความ, scroll/history paging, claim/close/transfer, presence roster, typing indicator ทำงานเหมือนเดิม

## Open Questions

- ลบ `console.log` debug ใน ChatArea ระหว่างย้ายหรือไม่ → **ลบ** (เป็น debug noise ที่หลงเหลือ ไม่ใช่ behavior)
- `typingUsersRef` (Set) ย้ายเข้า store ด้วยหรือไม่ → ไม่ — เก็บ Set ไว้เป็น ref ภายใน `useSessionEvents`; store เก็บเฉพาะ `typingUsersCount` (derived number)

## Decisions Log

- 2026-07-30: สร้าง PRD จากแผนแม่ที่อนุมัติแล้ว (pale-storm-wagtail PR C) + exploration ยืนยัน line refs ตรงกับโค้ดปัจจุบัน
- Sequencing: store ก่อน → useSessionEvents → useVirtualScroll (ตามความเสี่ยงจากน้อยไปมาก per-commit)
