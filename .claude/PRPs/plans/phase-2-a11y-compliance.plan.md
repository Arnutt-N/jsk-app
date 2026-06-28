# Plan: Phase 2 — A11y Compliance (WCAG 2.2 AA)

## Summary

ปิดช่องว่าง accessibility ของหน้า `admin/live-chat` ให้ผ่าน WCAG 2.2 AA ใน flow หลัก โดยมี **NVDA + Chrome เป็น baseline conformance target**. งานครอบ 8 finding: H5 (mobile drawer ไม่มี dialog semantics/focus trap), M7 (presence dot สี-ล้วน ไม่มีชื่อสถานะ), M8 (label ใน CreateChatSheet ไม่ associate), M9 (Internal Notes textarea ไม่มี label), W1 (SC 2.4.11 Focus Appearance — ไม่มี `focus-visible` เลย), W2 (SC 1.4.3 Contrast — micro fonts + status colors), W3 (SC 4.1.3 Status Messages — แยก live region), และ a11y ส่วนของ M21 (focus-ring บน interactive, break-words). หลักการหลัก: **MIRROR `TransferDialog.tsx`** ซึ่งมี focus trap + Escape + `role="dialog"` ครบอยู่แล้ว และ **reuse design token + utility `.focus-ring`** ที่มีใน `globals.css` แทนการ hardcode.

## User Story

**As** operator/agent ของหน่วยงานยุติธรรมชุมชนที่ใช้ keyboard ล้วนหรือ screen reader (NVDA),
**I want** ทุกปุ่ม/ฟอร์ม/dialog/สถานะ มีชื่อที่อ่านออกเสียงได้, focus มองเห็นชัด, และ overlay กักโฟกัสไว้,
**So that** ฉันทำ flow หลัก (เปิด customer panel → อ่านสถานะ → สร้างแชท → โอน → ปิด) ได้ครบโดยไม่ต้องใช้เมาส์ และไม่หลงโฟกัสไปยังพื้นหลัง.

## Problem → Solution

| Finding | Problem (จาก audit, file:line) | Solution |
|---------|--------------------------------|----------|
| **H5** | `LiveChatShell.tsx:64-76` — mobile CustomerPanel overlay เป็นแค่ backdrop `<div>` + `onClick` ปิด: ไม่มี `role="dialog"`/`aria-modal`/`aria-labelledby`, ไม่ย้ายโฟกัสเข้า, Tab หลุดไปพื้นหลัง, กด Escape ไม่ปิด | สร้าง `MobileDrawer.tsx` wrapper (focus trap + Escape + focus restore + `role="dialog"`) ใช้ **เฉพาะ** `isMobileView` — mirror โครง `useEffect` ของ `TransferDialog.tsx:16-41` |
| **M7** | presence dot เป็นสีล้วน ไม่มีข้อความ/ARIA ที่ `ConversationItem.tsx:62-66`, `ChatHeader.tsx:77-79`, `CustomerPanel.tsx:100` | เพิ่ม `statusLabel` helper + `<span className="sr-only">` ข้างจุด (และ feed เข้า `aria-label` ของ `role="option"` ใน ConversationItem) |
| **M8** | `CreateChatSheet.tsx:162-271` — `<label>` (162,249,262) ไม่มี `htmlFor`; `Input`/`Textarea` ไม่มี `id`; error `<p>` (274) ไม่มี `role="alert"` | เพิ่ม `id`/`htmlFor` คู่กัน (รองรับ `id` prop ใน `Input`/`Textarea` ผ่าน `...props` ที่มีอยู่แล้ว), `role="alert"` บน error, `aria-required`/`aria-invalid` |
| **M9** | `CustomerPanel.tsx:217-221` — Internal Notes textarea ไม่มี `id`/label/`aria-label` | เพิ่ม `id` + ผูก `<label htmlFor>` (heading ที่บรรทัด 216 กลายเป็น `<label>`) |
| **W1** | SC 2.4.11 — `grep focus-visible` ใน live-chat = 0; ใช้ `focus:ring-brand-500/40` (opacity 40% คอนทราสต์ต่ำ) | แทนด้วย utility `.focus-ring` ที่มีใน `globals.css:553` (`focus-visible:ring-2 ring-brand-500/50 ring-offset-2`) บน interactive ทุกตัวในไฟล์ scope |
| **W2** | SC 1.4.3 — micro fonts (`text-[9px/10px/11px]`) + status color บนพื้นจาง อาจไม่ถึง 4.5:1 (text) / 3:1 (UI) | audit + แก้: ยก `bg-online/15 text-online` → token ที่คอนทราสต์พอ, เปลี่ยน `text-[9px]` ที่เป็น text สำคัญ → `text-[11px]` ขั้นต่ำ, ตรวจ `--color-away` (amber บนขาว) |
| **W3** | SC 4.1.3 — `ChatArea.tsx:263` ใส่ `aria-live="polite"` บน virtualization container (messages ปนกับ typing/connection) | แยก 3 live region: messages = `role="log" aria-live="polite" aria-relevant="additions"`; connection/typing/session = `aria-live` แยกออกมาเป็น region ของตัวเอง |
| **M21 (a11y)** | focus-ring ไม่ครบบน interactive, ข้อความยาวไม่ break | ครอบคลุมโดย W1 (focus-ring) + เพิ่ม `break-words` บนชื่อ/ข้อความที่ truncate ในจุดที่ scope แตะ |

## Metadata

- **Complexity**: Medium
- **Source PRD**: `D:/genAI/jsk-app/.claude/PRPs/prds/livechat-audit-remediation.prd.md`
- **PRD Phase**: Phase 2 — A11y Compliance (WCAG 2.2 AA)
- **Estimated Files**: 9 (1 CREATE: `MobileDrawer.tsx`; 8 UPDATE: `LiveChatShell.tsx`, `CustomerPanel.tsx`, `CreateChatSheet.tsx`, `ConversationItem.tsx`, `ChatHeader.tsx`, `ChatArea.tsx`, `components/ui/Input.tsx`*, `components/ui/Textarea.tsx`*) + 1 test CREATE (`_components/__tests__/a11y.test.tsx`). *Input/Textarea แตะเฉพาะถ้าจำเป็น — ดู Task 3 GOTCHA (น่าจะไม่ต้องแตะ เพราะ `...props` รองรับ `id` อยู่แล้ว)*

## UX Design

**H5 — Mobile CustomerPanel: Before → After**

```
BEFORE (LiveChatShell.tsx:64-76)                AFTER (MobileDrawer wrapper)
┌─────────────────────────────┐                ┌─────────────────────────────┐
│ backdrop <div> onClick=close │                │ role=dialog aria-modal=true │
│   inner <div> stopProp       │                │   aria-labelledby=drawer-ttl│
│     <CustomerPanel/>         │                │   • focus moves to panel    │
│                              │                │   • Tab cycles INSIDE only  │
│ ✗ Tab escapes to background  │                │   • Escape closes           │
│ ✗ Escape does nothing        │                │   • focus restored on close │
│ ✗ no role / no name (NVDA    │                │   <CustomerPanel/>          │
│   announces nothing)         │                │ (desktop path UNCHANGED)    │
└─────────────────────────────┘                └─────────────────────────────┘
```

**M7 — Presence dot (screen-reader view)**

```
BEFORE:  [avatar][●green]  สมชาย       → NVDA: "สมชาย, option"   (no status)
AFTER:   [avatar][●green]  สมชาย       → NVDA: "สมชาย, ออนไลน์, option"
                  └ <span class="sr-only">ออนไลน์</span>  (visual dot unchanged)
```

ส่วนอื่น (M8/M9/W1/W2/W3/M21) = visual แทบไม่เปลี่ยน (focus ring คมขึ้น, contrast ดีขึ้นเล็กน้อย) — หลักคือ semantics สำหรับ AT.

## Mandatory Reading

| Priority | File | Lines | Why |
|----------|------|-------|-----|
| **P0** | `frontend/app/admin/live-chat/_components/TransferDialog.tsx` | 12-72 | **Reference pattern** สำหรับ H5 — focus trap, Escape, `role="dialog"`, `firstFieldRef.current?.focus()`, cleanup. MobileDrawer ต้อง mirror โครงนี้ |
| **P0** | `frontend/app/admin/live-chat/_components/LiveChatShell.tsx` | 64-82 | จุดที่ H5 อยู่ — ต้องห่อ mobile branch ด้วย MobileDrawer; desktop branch (`'hidden md:flex'`) ต้องไม่เปลี่ยน |
| **P0** | `frontend/app/globals.css` | 108-111, 553-555 | status tokens (`--color-online/away/offline`) + `.focus-ring` utility (มีอยู่แล้ว — W1 reuse ตัวนี้) |
| **P0** | `frontend/app/admin/live-chat/_components/CreateChatSheet.tsx` | 159-294 | M8 — labels/inputs/error ที่ต้อง associate |
| **P1** | `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | 100, 214-222 | M7 (status dot บรรทัด 100) + M9 (Notes textarea 217-221) |
| **P1** | `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | 42-67 | M7 — status dot ใน `role="option"` (เพิ่ม status ใน `aria-label` ของ option) |
| **P1** | `frontend/app/admin/live-chat/_components/ChatHeader.tsx` | 46, 77-80 | M7 — `statusColor` dot บน avatar button |
| **P1** | `frontend/app/admin/live-chat/_components/ChatArea.tsx` | 183, 260-265, 307, 311-329 | W3 — แยก live region (messages vs connection vs typing) |
| **P1** | `frontend/components/ui/Input.tsx` | 57-118 | M8 — ยืนยันว่า `id`/`aria-*` ส่งผ่าน `...props` (บรรทัด 97) ไป `<input>` ได้ |
| **P1** | `frontend/components/ui/Textarea.tsx` | 43-65 | M8 — ยืนยันว่า `id`/`aria-*` ส่งผ่าน `...props` (บรรทัด 56) ไป `<textarea>` ได้ |
| **P2** | `frontend/components/ui/__tests__/CalendarPickerTH.test.tsx` | 1-45 | Test pattern (vitest + @testing-library, `getByLabelText`/`getByRole`) สำหรับ a11y test ใหม่ |
| **P2** | `frontend/vitest.config.ts` | ทั้งไฟล์ | include glob = `**/__tests__/**/*.test.{ts,tsx}`, alias `@`, jsdom |

## Patterns to Mirror

### 1. Focus trap + Escape + focus restore (สำหรับ MobileDrawer — H5)

```tsx
// SOURCE: frontend/app/admin/live-chat/_components/TransferDialog.tsx:16-46
useEffect(() => {
  if (!open) return;
  firstFieldRef.current?.focus();

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { onClose(); return; }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };
  document.addEventListener('keydown', trapFocus);
  return () => document.removeEventListener('keydown', trapFocus);
}, [open, onClose]);
// ...
<div ... role="dialog" aria-modal="true" aria-label="Transfer session">
```

> **GOTCHA**: TransferDialog ไม่ restore focus (มันอยู่ใน DOM ตลอด). MobileDrawer ต้อง **เพิ่ม** focus restore เพราะมัน mount/unmount: เก็บ `document.activeElement` ตอนเปิด แล้ว `.focus()` คืนตอน unmount. และ querySelector ต้องครอบ focusable มากกว่า `button, input` (panel มี `<textarea>`, `<a>`) — ใช้ selector ที่ครบกว่า.

### 2. Status token + presence dot ที่มีอยู่ (สำหรับ M7)

```tsx
// SOURCE: frontend/app/admin/live-chat/_components/ConversationItem.tsx:62-66
<div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar-bg ${
  isActive ? 'bg-online' : isWaiting ? 'bg-away' : 'bg-offline'
}`} />
```

แก้เป็น (เพิ่ม sr-only sibling; visual dot คงเดิม):

```tsx
// status label helper (วางบนสุดของไฟล์หรือ shared util)
const status = isActive ? 'ออนไลน์' : isWaiting ? 'กำลังรอ' : 'ออฟไลน์';
// ...
<div aria-hidden className={`... ${isActive ? 'bg-online' : isWaiting ? 'bg-away' : 'bg-offline'}`} />
<span className="sr-only">{status}</span>
```

> **GOTCHA**: `sr-only` มาจาก Tailwind core (มีอยู่ — ไม่มี custom utility ใน globals.css แต่ Tailwind v4 ให้มาเอง). อย่าทำ utility ซ้ำ.

### 3. Label/input association ที่ถูกต้องอยู่แล้ว (สำหรับ M8 — reference TransferDialog เป็นตัวอย่างที่ทำถูก)

```tsx
// SOURCE: frontend/app/admin/live-chat/_components/TransferDialog.tsx:61-62  (ทำถูกแล้ว — เลียนแบบ)
<label className="..." htmlFor="transfer-operator">Operator ID</label>
<input ref={firstFieldRef} id="transfer-operator" name="operatorId" ... />
```

`Input`/`Textarea` ส่ง `...props` ไปยัง element จริง → ใส่ `id`/`aria-required` ได้ตรง:

```tsx
// SOURCE: frontend/components/ui/Input.tsx:89-98  (props spread ลงไปถึง <input>)
<input ref={ref} className={cn(...)} {...props} />
```

### 4. `.focus-ring` utility ที่มีอยู่ (สำหรับ W1)

```css
/* SOURCE: frontend/app/globals.css:553-555 */
.focus-ring {
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2;
}
```

> W1 = แทน `focus:ring-brand-500/40` (และ `outline-none` เปล่า ๆ) ด้วยการเติม class `focus-ring` บน interactive element. TransferDialog ใช้ `focus-ring` อยู่แล้วบนปุ่ม (`:66-67`) — แต่ input ของมัน (`:62,64`) ยังใช้ `focus:ring-brand-500/40` → แก้ด้วย (อยู่นอก scope แต่ MIRROR ให้สม่ำเสมอเฉพาะถ้าสะดวก; โฟกัส scope = CustomerPanel/CreateChatSheet/MessageInput textarea ที่ใช้ `/40`).

### 5. Test structure (สำหรับ a11y test)

```tsx
// SOURCE: frontend/components/ui/__tests__/CalendarPickerTH.test.tsx:1-18
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

describe('ComponentName', () => {
  it('renders accessible name', () => {
    render(<Component ... />);
    expect(screen.getByLabelText('...')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
```

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `frontend/app/admin/live-chat/_components/MobileDrawer.tsx` | **CREATE** | H5 — wrapper component (focus trap + Escape + focus restore + `role="dialog"`) ห่อ mobile CustomerPanel |
| `frontend/app/admin/live-chat/_components/LiveChatShell.tsx` | UPDATE | H5 — ใช้ MobileDrawer ในสาขา `isMobileView`; desktop คงเดิม |
| `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | UPDATE | M7 (status dot `:100`), M9 (Notes textarea `:217`), W1 (`focus:ring-brand-500/40` `:219`), aria-labelledby สำหรับ drawer title `:84` |
| `frontend/app/admin/live-chat/_components/CreateChatSheet.tsx` | UPDATE | M8 — `htmlFor`/`id` (162,249,262), `role="alert"` (274), `aria-required` |
| `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | UPDATE | M7 — status ใน `aria-label` ของ `role="option"` + sr-only |
| `frontend/app/admin/live-chat/_components/ChatHeader.tsx` | UPDATE | M7 — sr-only status ข้าง dot `:77-79` |
| `frontend/app/admin/live-chat/_components/ChatArea.tsx` | UPDATE | W3 — แยก live region (messages `role=log`, connection/typing แยก); W2 status color audit |
| `frontend/components/ui/Input.tsx` | UPDATE *(conditional)* | M8 — ถ้า `id`/`aria-*` ไม่ผ่าน (มันผ่านอยู่แล้วผ่าน `...props`) → ไม่ต้องแตะ. ดู Task 3 |
| `frontend/components/ui/Textarea.tsx` | UPDATE *(conditional)* | เช่นเดียวกับ Input |
| `frontend/app/admin/live-chat/_components/__tests__/a11y.test.tsx` | **CREATE** | unit test: MobileDrawer dialog semantics + Escape; CreateChatSheet label association |

## NOT Building

- **ไม่แตะ desktop CustomerPanel rendering** — H5 เฉพาะ mobile overlay (`isMobileView`). Desktop path (`'hidden md:flex'`) ต้องเหมือนเดิมเป๊ะ.
- **ไม่ทำ exit animation / motion** — เป็น Phase 4 (M2/M11a/W4). MobileDrawer ใช้ mount/unmount ตรง ๆ ไม่ใส่ `AnimatePresence`.
- **ไม่ทำ `prefers-reduced-motion` / `useReducedMotion` hook** — Phase 4 (W4). คง `animate-ping/pulse/spin` ที่มีอยู่ ไม่แตะในเฟสนี้.
- **ไม่ทำ MessageInput button aria-label / Send name** — เป็น Phase 1 (H1) owner; เฟสนี้แตะ `MessageInput.tsx` เฉพาะ **rebase หลัง Phase 1 merge** ถ้าจำเป็นสำหรับ W1 textarea focus (`:191`). ตาม File Ownership: MessageInput owner = Phase 1.
- **ไม่ refactor `LiveChatContext` / store** — Phase 8.
- **ไม่ทำ operator picker / presence / transfer error mapping** — Phase 6.
- **ไม่เปลี่ยน TransferDialog logic** — ใช้เป็น reference อย่างเดียว (อาจปรับ `focus:ring-/40` → `focus-ring` ถ้าสะดวก แต่ไม่ใช่ deliverable หลัก).
- **ไม่เพิ่ม `@axe-core/playwright`** — axe automation เป็น metric ของ PRD (filter แรก) แต่ setup harness อยู่นอก scope เฟสนี้ (manual NVDA checklist คือ acceptance หลัก).

## Step-by-Step Tasks

### Task 1 — H5: สร้าง `MobileDrawer.tsx` (focus trap + Escape + focus restore + dialog semantics)

- **ACTION**: CREATE `frontend/app/admin/live-chat/_components/MobileDrawer.tsx`
- **IMPLEMENT**:
  - Props: `{ open: boolean; onClose: () => void; titleId: string; children: React.ReactNode; label?: string }`.
  - `if (!open) return null;`
  - `useEffect` (deps `[open, onClose]`):
    1. เก็บ `const previouslyFocused = document.activeElement as HTMLElement | null;`
    2. ย้ายโฟกัสเข้า drawer: `drawerRef.current?.focus()` (ตั้ง `tabIndex={-1}` บน panel container) หรือ focus element แรกที่ focusable.
    3. handler `trapFocus` mirror TransferDialog (`Escape` → `onClose()`; `Tab`/`Shift+Tab` วน) — แต่ querySelector ครบกว่า: `'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'`.
    4. cleanup: remove listener **และ** `previouslyFocused?.focus()` (focus restore).
  - markup: backdrop `<div onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm">` + panel `<div ref={drawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()} className="absolute right-0 top-0 h-full w-[88%] max-w-sm focus:outline-none">{children}</div>`.
- **MIRROR**: `TransferDialog.tsx:16-46` (focus trap/Escape) — Pattern #1
- **IMPORTS**: `import React, { useEffect, useRef } from 'react';`
- **GOTCHA**: ต้อง focus restore (TransferDialog ไม่มีเพราะอยู่ใน DOM ตลอด). `aria-modal="true"` + `aria-labelledby` ต้องชี้ id ที่มีจริงใน CustomerPanel header (ดู Task 2). อย่าใส่ animation (Phase 4).
- **VALIDATE**: `npx tsc --noEmit` && `npx eslint app/admin/live-chat/_components/MobileDrawer.tsx`

### Task 2 — H5/M7/M9/W1: แก้ `LiveChatShell.tsx` + `CustomerPanel.tsx`

- **ACTION**: UPDATE `LiveChatShell.tsx` (`:64-76`) และ `CustomerPanel.tsx`
- **IMPLEMENT**:
  - **Shell**: replace mobile branch. desktop คงเดิม:
    ```tsx
    {selectedId && showCustomerPanel && (
      isMobileView ? (
        <MobileDrawer open onClose={() => setShowCustomerPanel(false)} titleId="customer-panel-title">
          <CustomerPanel currentChat={currentChat} onClose={() => setShowCustomerPanel(false)} />
        </MobileDrawer>
      ) : (
        <div className="hidden md:flex h-full">
          <CustomerPanel currentChat={currentChat} onClose={() => setShowCustomerPanel(false)} />
        </div>
      )
    )}
    ```
    import `MobileDrawer`.
  - **CustomerPanel `:84`**: ให้ header span มี `id="customer-panel-title"` (สำหรับ `aria-labelledby`).
  - **M7 `:100`**: เพิ่ม `aria-hidden` บน dot div + `<span className="sr-only">{isActive ? 'ออนไลน์' : isWaiting ? 'กำลังรอ' : 'ออฟไลน์'}</span>` ถัดจากมัน.
  - **M9 `:216-221`**: เปลี่ยน heading `<p>` → `<label htmlFor="customer-notes">Internal Notes</label>` (คง class เดิม) และเพิ่ม `id="customer-notes"` บน `<textarea>`.
  - **W1 `:219`**: แทน `focus:ring-2 focus:ring-brand-500/40` → `focus-ring` (utility) บน textarea (และบน buttons ที่ยังไม่มี เช่น `:85`, `:104-115`, `:120-140`, `:228-239`, `:246`).
- **MIRROR**: Pattern #2 (M7), #4 (W1)
- **IMPORTS**: `import { MobileDrawer } from './MobileDrawer';` ใน Shell
- **GOTCHA**: `CustomerPanel` มี `if (!currentChat) return null;` (`:22`) — `titleId` element อยู่ภายใน; ถ้า currentChat null, drawer ไม่ควรเปิด (Shell guard ด้วย `selectedId && showCustomerPanel`). อย่าเปลี่ยน `aside` เป็น `div` (semantics เดิมโอเค). status colors บนพื้น `/15` (`:194-196`) → ตรวจ contrast ใน Task 7 (W2).
- **VALIDATE**: `npx tsc --noEmit` && `npx eslint app/admin/live-chat/_components/LiveChatShell.tsx app/admin/live-chat/_components/CustomerPanel.tsx`

### Task 3 — M8: แก้ `CreateChatSheet.tsx` label/input association + error alert

- **ACTION**: UPDATE `CreateChatSheet.tsx` (`:159-294`)
- **IMPLEMENT**:
  - label "ค้นหาผู้ใช้" (`:162`): `<label htmlFor="cc-user-query">` + `<Input id="cc-user-query" aria-required="true" ... />` (`:166`).
  - label "ข้อความเริ่มต้น" (`:249`): `<label htmlFor="cc-initial-message">` + `<Textarea id="cc-initial-message" ... />` (`:252`).
  - label "เหตุผล" (`:262`): `<label htmlFor="cc-reason">` + `<Input id="cc-reason" ... />` (`:265`).
  - error `<p>` (`:274-278`): เพิ่ม `role="alert"` (และ optional `aria-live="assertive"`).
  - ปุ่มผลลัพธ์ค้นหา (`:190-213`) + ปุ่ม "เปลี่ยน" (`:237`) + ปุ่มส่ง: เติม `focus-ring` (W1) ถ้ายังไม่มี.
- **MIRROR**: Pattern #3 (TransferDialog `htmlFor`/`id`)
- **IMPORTS**: ไม่มีเพิ่ม
- **GOTCHA**: **ไม่ต้องแก้ `Input.tsx`/`Textarea.tsx`** — ทั้งคู่ spread `...props` ลงถึง element จริง (`Input.tsx:97`, `Textarea.tsx:56`) ดังนั้น `id`/`aria-required`/`aria-invalid` ผ่านได้เลย. ยืนยันด้วย tsc (type `InputHTMLAttributes` รวม `id`). ถ้า (และเฉพาะถ้า) test เผยว่า prop ไม่ผ่าน ค่อยแตะ ui component.
- **VALIDATE**: `npx tsc --noEmit` && `npx eslint app/admin/live-chat/_components/CreateChatSheet.tsx`

### Task 4 — M7: status label ใน `ConversationItem.tsx` (role=option aria-label)

- **ACTION**: UPDATE `ConversationItem.tsx` (`:42-67`)
- **IMPLEMENT**:
  - คำนวณ `const statusLabel = isActive ? 'ออนไลน์' : isWaiting ? 'กำลังรอ' : 'ออฟไลน์';`
  - เพิ่ม `aria-label` บน root `role="option"` (`:43-53`): `aria-label={`${conversation.display_name}, ${statusLabel}${conversation.unread_count > 0 ? `, ${conversation.unread_count} ข้อความใหม่` : ''}`}`.
  - dot (`:62-66`): เติม `aria-hidden`.
- **MIRROR**: Pattern #2
- **IMPORTS**: ไม่มีเพิ่ม
- **GOTCHA**: คอมโพเนนต์ `memo` — การเพิ่ม derived string ใน render ไม่กระทบ memo (props เดิม). อย่าเพิ่ม `sr-only` span ซ้ำซ้อนกับ `aria-label` (label บน option override children สำหรับ AT) — ใช้ `aria-label` อย่างเดียวที่นี่.
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/ConversationItem.tsx`

### Task 5 — M7: status label ใน `ChatHeader.tsx`

- **ACTION**: UPDATE `ChatHeader.tsx` (`:46, 77-80`)
- **IMPLEMENT**:
  - `const statusLabel = isActive ? 'ออนไลน์' : currentChat ? 'กำลังรอ' : 'ออฟไลน์';` (ตรงกับ `statusColor` `:46`).
  - dot span (`:77-79`): เติม `aria-hidden` + ตามด้วย `<span className="sr-only">{statusLabel}</span>`.
  - ปุ่ม avatar (`:65-69` `aria-label="Toggle customer panel"`): เติม `focus-ring` (W1).
- **MIRROR**: Pattern #2, #4
- **IMPORTS**: ไม่มีเพิ่ม
- **GOTCHA**: ปุ่ม mode toggle (`:97-122`) มี `aria-pressed` ถูกต้องแล้ว — แค่เติม `focus-ring`. อย่าเปลี่ยน `aria-pressed` logic.
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/ChatHeader.tsx`

### Task 6 — W3: แยก live regions ใน `ChatArea.tsx`

- **ACTION**: UPDATE `ChatArea.tsx`
- **IMPLEMENT**:
  - **Messages region** (`:260-265`): เปลี่ยน scroll container ออกจากการเป็น live region (มัน virtualized + มี padding spacers → ประกาศมั่ว). แทนที่:
    - ลบ `aria-live="polite"` ออกจาก `messagesContainerRef` div (`:263`).
    - ห่อ "รายการข้อความที่มองเห็น" (`:281-305` map output) ด้วย element `role="log" aria-live="polite" aria-relevant="additions" aria-label="ข้อความสนทนา"`. (วาง role=log บน wrapper รอบ map; ตัว spacers `aria-hidden` อยู่แล้ว `:267,306`.)
  - **Connection region**: inline connection warning (`:311-329`) และ empty-state pill (`:175-195`, `:222-229`) → ใส่ `role="status" aria-live="polite"` บน container ของข้อความสถานะการเชื่อมต่อ (เอา `aria-live="polite"` เดิมที่ `:183` คงไว้แต่ทำให้เป็น `role="status"`). แยกชัดจาก messages.
  - **Typing region**: `<TypingIndicator visible={...} />` (`:307`) — ตรวจว่า component มี `aria-live`; ถ้าไม่มี ห่อด้วย `<div role="status" aria-live="polite" className="sr-only">{typingUsersCount > 0 ? 'กำลังพิมพ์' : ''}</div>` (visual indicator คงเดิม).
- **MIRROR**: W3 requirement ใน PRD (`:112`)
- **IMPORTS**: ไม่มีเพิ่ม
- **GOTCHA**: **อย่าวาง `role="log"` บน scroll container ที่ virtualized** — เมื่อ virtual window เลื่อน DOM nodes mount/unmount ทำให้ AT อ่านซ้ำทุก node. วาง role=log บน wrapper ของ visible slice เท่านั้น และยอมรับ limitation ว่า virtualized history ยาวจะไม่ประกาศย้อนหลัง (acceptable — ประกาศเฉพาะข้อความใหม่ที่ append ด้านล่าง คือเป้าของ SC 4.1.3). ตรวจว่าไม่มี 2 live region ซ้อนกัน (nested aria-live = double announce).
- **VALIDATE**: `npx tsc --noEmit` && `npx eslint app/admin/live-chat/_components/ChatArea.tsx`

### Task 7 — W2: Contrast audit + fix (micro fonts + status colors)

- **ACTION**: UPDATE (เฉพาะจุดที่ fail) ในไฟล์ scope
- **IMPLEMENT** (audit ก่อน แก้เท่าที่ fail 4.5:1 text / 3:1 UI):
  - คำนวณ contrast ของ token: `--color-online hsl(142 71% 45%)` ≈ #22c35e, `--color-away hsl(38 92% 50%)` ≈ #f59e0b, `--color-offline hsl(220 10% 46%)` ≈ #6b7280.
  - **Status pill** `CustomerPanel.tsx:194-196` (`bg-online/15 text-online`, `bg-away/15 text-away`): `text-away` (amber #f59e0b) บนพื้น amber/15 บนขาว → **< 4.5:1 (fail)**. แก้: ใช้ token เข้มขึ้นสำหรับ text เช่น `text-amber-700` / เพิ่ม token `--color-away-text` หรือใช้ `text-online`→`text-emerald-700`. (ถ้า design token ไม่มี dark variant ให้ใช้ Tailwind `-700` shade ที่ผ่าน — สอดคล้อง ChatArea ที่ใช้ `text-amber-700` `:314` อยู่แล้ว.)
  - **Micro fonts**: `text-[9px]` (mode badge `ConversationItem.tsx:88`) เป็น decorative+icon → ยอมรับได้ถ้า contrast ผ่าน; ตรวจ `text-[10px]` ที่เป็น text สำคัญ (`CustomerPanel` stat labels `:163,168,173`, tags `:149`) — labels บน `text-text-tertiary` ตรวจ ≥ 4.5:1 (token `text-tertiary` ควรผ่านบนพื้น gray-50; ยืนยัน). ถ้า fail → ยก shade.
  - **เอกสาร audit**: เขียนตารางผลในรายงาน completion (fg/bg/ratio/verdict) — ไม่ต้องสร้างไฟล์ .md ใหม่.
- **MIRROR**: ChatArea `text-amber-700` `:314` (สถานะที่ contrast ผ่าน)
- **IMPORTS**: ไม่มีเพิ่ม
- **GOTCHA**: `/15` opacity background รวมกับ `text-<same>` มักทำให้ contrast text ต่ำกว่ามาตรฐาน — แก้ที่ **สี text** ไม่ใช่ opacity bg. อย่าทำลาย dark mode (มีหลายจุด `dark:`); ใช้ shade ที่มี dark variant หรือ token. ถ้าจะเพิ่ม token ใหม่ใน `globals.css` → ประสาน Phase 3 (owner = globals.css) — เลี่ยงถ้าทำได้ด้วย Tailwind shade ที่มีอยู่.
- **VALIDATE**: `npx eslint <changed files>` && manual contrast check (DevTools / WebAIM)

### Task 8 — M21 (a11y): break-words + focus-ring sweep ที่เหลือ

- **ACTION**: UPDATE ไฟล์ scope ที่ยังขาด
- **IMPLEMENT**:
  - เติม `break-words` (หรือ `[overflow-wrap:anywhere]`) บนชื่อ/ข้อความที่ truncate และอาจมีคำยาวไม่เว้นวรรค: `ConversationItem.tsx:73,84`, `CustomerPanel.tsx:102,184`, `ChatHeader.tsx:84`. (เสริม `truncate` เดิม — ไม่แทนที่.)
  - กวาด `focus-ring` ให้ครบทุก interactive ในไฟล์ scope ที่ยังใช้ `outline-none` เปล่า หรือ `focus:ring-*/40`: ปุ่มใน `ConversationItem` menu (`:128,141-190`), `CustomerPanel` (`:85,104,113,120-140,185,228-247`).
- **MIRROR**: Pattern #4
- **IMPORTS**: ไม่มีเพิ่ม
- **GOTCHA**: `gradient-active` selected item ใน ConversationItem มี ring แล้ว — เติม `focus-ring` ต้องไม่ชนกับ `shadow-lg`. ปุ่ม `opacity-0 group-hover:opacity-100` (menu trigger `:134`) ยังต้อง focus-visible ได้ด้วย keyboard → เพิ่ม `focus-visible:opacity-100` ด้วย (ไม่งั้น focus มองไม่เห็น).
- **VALIDATE**: `npx eslint <changed files>`

### Task 9 — Tests: MobileDrawer + CreateChatSheet a11y

- **ACTION**: CREATE `frontend/app/admin/live-chat/_components/__tests__/a11y.test.tsx`
- **IMPLEMENT**:
  - **MobileDrawer**: render with `open`; assert `getByRole('dialog')` มี `aria-modal="true"` และ `aria-labelledby`; fireEvent `keyDown` Escape → `onClose` ถูกเรียก; assert โฟกัสย้ายเข้า drawer (`document.activeElement` อยู่ใน drawer).
  - **CreateChatSheet**: render with `isOpen`; assert `getByLabelText('ค้นหาผู้ใช้', { exact: false })` หา input เจอ (พิสูจน์ M8 association); assert search input มี `aria-required`.
  - **ConversationItem**: render WAITING conversation; assert `getByRole('option')` มี accessible name ที่รวม "กำลังรอ".
- **MIRROR**: Pattern #5 (`CalendarPickerTH.test.tsx`)
- **IMPORTS**: `import { render, screen, fireEvent } from '@testing-library/react'; import { describe, it, expect, vi } from 'vitest';`
- **GOTCHA**: CreateChatSheet/ConversationItem ใช้ context/store (`useAuth`, `useLiveChatStore`) — ต้อง mock (`vi.mock('@/contexts/AuthContext', ...)`). ถ้า mock ซับซ้อนเกิน ให้ test **MobileDrawer** (standalone, props-only) เป็น must และ test ตัวอื่นเป็น best-effort. label association ของ CreateChatSheet พิสูจน์ผ่าน `getByLabelText` ได้แม้ context mock. Sheet (Radix-like) อาจ portal — ใช้ `screen` (queries document.body).
- **VALIDATE**: `npx vitest run app/admin/live-chat/_components/__tests__/a11y.test.tsx`

## Testing Strategy

### Unit tests (vitest + @testing-library/react)

| Test | Asserts | Finding |
|------|---------|---------|
| `MobileDrawer renders dialog semantics` | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` ชี้ title | H5 |
| `MobileDrawer Escape closes` | keyDown Escape → `onClose()` called | H5 |
| `MobileDrawer moves focus in` | `document.activeElement` อยู่ใน drawer หลัง open | H5 |
| `MobileDrawer restores focus on close` | trigger element ได้ focus คืนหลัง unmount | H5 |
| `CreateChatSheet search input is labelled` | `getByLabelText(/ค้นหาผู้ใช้/)` พบ input | M8 |
| `CreateChatSheet error has alert role` | error render → `getByRole('alert')` | M8 |
| `ConversationItem option name includes status` | WAITING → option accessible name มี "กำลังรอ" | M7 |

### Edge-case checklist (manual NVDA + Chrome — acceptance หลัก)

- [ ] เปิด mobile customer panel (viewport < md) → NVDA ประกาศ "dialog"; Tab วนอยู่ในเฉพาะ panel; Shift+Tab จากตัวแรกไปตัวสุดท้าย; Escape ปิด; โฟกัสกลับไปยังปุ่มที่เปิด (avatar toggle).
- [ ] ConversationList: ลูกศร/Tab อ่านแต่ละ option พร้อมสถานะ (ออนไลน์/กำลังรอ/ออฟไลน์) + จำนวนข้อความใหม่.
- [ ] CreateChatSheet: Tab เข้าทุก field อ่านชื่อ label; error ค้นหาไม่สำเร็จ → NVDA ประกาศทันที (role=alert).
- [ ] ChatHeader avatar dot อ่านสถานะ; mode toggle อ่าน pressed/not-pressed.
- [ ] ส่งข้อความใหม่ → NVDA ประกาศข้อความเข้า (role=log) **โดยไม่** อ่านซ้ำตอน scroll; connection drop → ประกาศแยก (ไม่ปนกับ messages).
- [ ] focus ทุก interactive ในหน้า มองเห็น ring ชัด (W1) — รวมปุ่มเมนู `opacity-0` ที่ต้องโผล่ตอน focus.
- [ ] Contrast: status pill/labels ผ่าน 4.5:1 (text) / 3:1 (UI) — ตรวจด้วย DevTools.
- [ ] Desktop customer panel (≥ md) ทำงานเหมือนเดิม (ไม่ติด focus trap).
- [ ] dark mode: ทุกการแก้ contrast/focus ยังดูถูกต้อง.

## Validation Commands

รันจาก `D:/genAI/jsk-app/frontend`:

```bash
npx tsc --noEmit
# EXPECT: ไม่มี error (0)

npx eslint app/admin/live-chat/_components/MobileDrawer.tsx app/admin/live-chat/_components/LiveChatShell.tsx app/admin/live-chat/_components/CustomerPanel.tsx app/admin/live-chat/_components/CreateChatSheet.tsx app/admin/live-chat/_components/ConversationItem.tsx app/admin/live-chat/_components/ChatHeader.tsx app/admin/live-chat/_components/ChatArea.tsx
# EXPECT: 0 errors, 0 warnings

npx vitest run
# EXPECT: ทุก test ผ่าน (รวม a11y.test.tsx ใหม่); ไม่มี regression ใน 29 เทสเดิม

npm run build
# EXPECT: build สำเร็จ (tsc + next build เขียว)

npx playwright test
# EXPECT: smoke E2E เดิมยังเขียว (ต้องมี dev server / ตาม CI). ไม่มี regression
```

## Acceptance Criteria

1. **H5**: mobile CustomerPanel เป็น `role="dialog" aria-modal="true" aria-labelledby`; focus ย้ายเข้า + วนอยู่ใน + Escape ปิด + focus restore; desktop ไม่เปลี่ยน.
2. **M7**: presence dot ทั้ง 3 จุด (ConversationItem, ChatHeader, CustomerPanel) มีชื่อสถานะที่ AT อ่านได้.
3. **M8**: ทุก label ใน CreateChatSheet associate กับ input ผ่าน `htmlFor`/`id`; error มี `role="alert"`; search input มี `aria-required`.
4. **M9**: Internal Notes textarea มี label associate.
5. **W1**: ทุก interactive ในไฟล์ scope ใช้ `focus-visible` ring (utility `.focus-ring`) — ไม่เหลือ `focus:ring-*/40` / `outline-none` เปล่าในจุดที่แตะ.
6. **W2**: status colors + micro-font labels ที่แตะ ผ่าน 4.5:1 (text) / 3:1 (UI) — มีตาราง audit ใน completion report.
7. **W3**: messages = `role="log"` แยกจาก connection/typing/session live region; ไม่มี nested live region.
8. **M21 (a11y)**: break-words บนชื่อ/ข้อความที่ scope แตะ; focus-ring ครบ.
9. ผ่าน manual NVDA+Chrome walkthrough ของ flow หลัก (checklist ด้านบนครบ).
10. `tsc` + `eslint` + `vitest` + `build` เขียว; ไม่มี regression.

## Completion Checklist

- [ ] Task 1: `MobileDrawer.tsx` สร้าง + focus trap/Escape/restore (H5)
- [ ] Task 2: `LiveChatShell` ใช้ MobileDrawer + CustomerPanel M7/M9/W1 (H5/M7/M9/W1)
- [ ] Task 3: `CreateChatSheet` label/id/role=alert/aria-required (M8)
- [ ] Task 4: `ConversationItem` status ใน option aria-label (M7)
- [ ] Task 5: `ChatHeader` sr-only status + focus-ring (M7/W1)
- [ ] Task 6: `ChatArea` แยก live regions (W3)
- [ ] Task 7: contrast audit + fix + ตาราง (W2)
- [ ] Task 8: break-words + focus-ring sweep (M21 a11y/W1)
- [ ] Task 9: a11y tests สร้าง + ผ่าน
- [ ] manual NVDA+Chrome walkthrough ครบ
- [ ] validation commands ทั้งหมดเขียว

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `role="log"` บน virtualized list อ่านซ้ำตอน scroll | M | กวน NVDA | วาง role=log บน wrapper ของ visible slice เท่านั้น (Task 6 GOTCHA); ยอม limitation history ย้อนหลัง |
| MobileDrawer focus restore พลาด (element หาย/unmount) | M | โฟกัสหลุดไป body | null-guard `previouslyFocused?.focus()`; ทดสอบใน unit test |
| File collision กับ Phase 1 (MessageInput) / Phase 3 (CustomerPanel token) | M | merge conflict | ตาม File Ownership: CustomerPanel owner = Phase 2 (เฟสนี้); rebase หลัง Phase 1 merge ก่อนแตะ MessageInput; เลี่ยงแก้ globals.css (Phase 3 owner) — ใช้ Tailwind shade |
| แก้ contrast แล้ว dark mode พัง | M | UI dark ผิด | ใช้ shade ที่มี dark variant / token; ตรวจทั้งสอง theme (checklist) |
| Input/Textarea ไม่ผ่าน `id` (สมมติฐานผิด) | L | M8 ไม่ทำงาน | tsc + test พิสูจน์; ถ้า fail แก้ ui component (Task 3 GOTCHA) |
| Sheet portal ทำให้ test query ไม่เจอ | L | test แดง | ใช้ `screen` (query document.body); mock context |

## Notes

- **NVDA + Chrome** เป็น baseline (PRD Q4 default). VoiceOver อยู่นอก scope.
- **File Ownership** (จาก PRD): `CustomerPanel.tsx` owner = Phase 2 (เฟสนี้) — Phase 3/5/7 rebase ตามหลัง. `MessageInput.tsx` owner = Phase 1 — **เฟสนี้ไม่แตะ MessageInput** เว้นแต่ rebase หลัง P1 merge สำหรับ W1 textarea (`:191` ใช้ `/40`); ถ้าจำเป็นให้ทำเป็น follow-up เล็ก ๆ หลัง P1.
- **`.focus-ring`** มีอยู่แล้ว (`globals.css:553`) — reuse, ไม่สร้างใหม่. `sr-only` มาจาก Tailwind core — ไม่สร้างใหม่.
- Status tokens (`--color-online/away/offline`) มีครบ (`globals.css:108-111`) — M7 reuse สำหรับ visual; เพิ่มเฉพาะ "text" สำหรับ contrast (W2) ถ้า fail.
- axe automation (`@axe-core/playwright`) เป็น metric ระดับ PRD (filter แรก) แต่ harness setup อยู่นอก scope เฟสนี้ — acceptance หลักคือ manual NVDA checklist + unit tests.
- Parallel: เฟสนี้ทำคู่กับ Phase 5 ได้ (PRD `Parallel = with 5`) — แต่ serialize เฉพาะไฟล์ที่ชน owner.
