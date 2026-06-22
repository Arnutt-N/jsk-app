# Plan: Phase 3 — Design System Unify

## Summary

Phase 3 ปิดช่องว่าง "design system ที่สอง" ในหน้า Live-Chat Console โดยกวาด hardcoded color (`slate-*`, raw hex `#xxxxxx`, brand-mismatch `#6366f1`) และ micro-font ที่ bypass type scale ให้กลับมาใช้ design token เดียวจาก `globals.css` (`@theme`). ครอบ 6 finding: **M1** (analytics page rebuild บน token + chart vars), **M6** (CustomerPanel เพิ่ม visual hierarchy + จัดการ N/A), **L2** (avatar fallback indigo → brand blue), **L3** (เพิ่ม `--text-2xs` แทน `text-[9px/10px/11px]`), **L4** (analytics page ใช้ `ds-*` utility ให้สอดคล้องกับ console), **L5** (emoji/sticker cell → token surface). เป้าหมายเชิงวัดผล: `grep` หา hardcoded `slate-*` / raw hex ใน `frontend/app/admin/live-chat/**` = **0** (ยกเว้นไฟล์ที่เฟสอื่นเป็นเจ้าของ — ดู NOT Building).

## User Story

ในฐานะ **operator/agent** ที่ใช้หน้า live-chat ทั้งวันและสลับไปดูหน้า analytics ฉันต้องการให้ **ทุกหน้าใน console ดูเป็นระบบเดียวกัน (สี typography ระยะห่าง สอดคล้อง)** เพื่อให้ **ลดความสับสนทางสายตา อ่านข้อมูลได้เร็ว และ dark mode ทำงานถูกต้องทุกหน้า** — ปัจจุบันหน้า analytics ดูเหมือนคนละแอป (พื้นเทาม่วง `#f8f7fa`, ตัวอักษร slate, กราฟสีฟ้าคนละเฉด) และ dark mode พัง เพราะ hardcode สีขาว/slate ตายตัว

## Problem → Solution

| Finding | Problem (หลักฐาน file:line) | Solution |
|---------|-----------------------------|----------|
| **M1** | `analytics/page.tsx` ใช้ design system ที่สอง: `bg-[#f8f7fa]` (:74), `text-slate-800/500/400/600/900` ทั่วไฟล์, `border-slate-100/60` (:128,151,171), chart hardcode `#3b82f6`/`#64748b`/`#60a5fa`/`#f1f5f9` (:133-163) — ใช้ token = 0 | Rebuild บน `bg-bg`, `ds-panel`/`ds-kpi`, `text-text-primary/secondary/tertiary`, `border-border-default`; ขับ Recharts ผ่าน `var(--color-*)` เหมือน `DashboardCharts.tsx:20-26` |
| **M6** | `CustomerPanel.tsx` มี 6 บล็อก `bg-gray-50 rounded-xl p-3` เหมือนกันหมด (:160-175,181,192,202,215,225) ไม่มีลำดับชั้น, header ทุกอันเป็น `text-[10px] uppercase text-text-tertiary`, มี 3 stat tile เป็น "N/A" (:162,167,172) | เพิ่มลำดับชั้น: เลื่อน identity เด่น, จัด metadata รอง, แยกบล็อก actionable (Notes/Export), ลบ/ซ่อน N/A tile ที่ไม่มีข้อมูลจริง |
| **L2** | avatar fallback hardcode indigo `background=6366f1` — `ConversationItem.tsx:58`, `CreateChatSheet.tsx:199,224`; แต่ brand จริง = blue `#3b82f6` | เปลี่ยน `6366f1` → `3b82f6` (brand-500) ทั้ง 3 จุด ผ่าน shared constant |
| **L3** | micro fonts `text-[9px]`/`text-[10px]`/`text-[11px]` (26 จุดทั้ง live-chat) bypass fluid type scale | เพิ่ม `--text-2xs` ใน `@theme` แล้วแทนด้วย `text-2xs` ในไฟล์ scope Phase 3 |
| **L4** | analytics page ไม่มีความสัมพันธ์เชิงโครงสร้างกับ console (ไม่ใช้ `ds-*`) | ใช้ `ds-page`/`ds-panel`/`ds-kpi`/`ds-section-title`/`thai-text` (รวมงานเดียวกับ M1) |
| **L5** | emoji/sticker cell ขนาด 32px (`w-8 h-8`) + `hover:bg-gray-100`/`hover:bg-gray-50` — `EmojiPicker.tsx:13,19`; `StickerPicker.tsx:25,39` | เปลี่ยนเป็น `w-10 h-10`, `bg-surface`/`hover:bg-muted` |

## Metadata

- **Complexity**: Medium
- **Source PRD**: `D:/genAI/jsk-app/.claude/PRPs/prds/livechat-audit-remediation.prd.md`
- **PRD Phase**: Phase 3 — Design System Unify (parallel กับ Phase 4; depends on Phase 1)
- **Estimated Files**: 6 (analytics/page.tsx, CustomerPanel.tsx, ConversationItem.tsx, CreateChatSheet.tsx, EmojiPicker.tsx, StickerPicker.tsx, globals.css) + 1 shared constant (CREATE) + 1 test (CREATE)

## UX Design

**M1/L4 — analytics page (Before → After)**

```
BEFORE                                  AFTER
┌────────────────────────────────────┐ ┌────────────────────────────────────┐
│ bg #f8f7fa (เทาม่วง คนละโทน console) │ │ bg-bg (โทนเดียวกับ console)          │
│ Live Chat Analytics  [slate-800]     │ │ Live Chat Analytics [text-primary]   │
│ ┌────┐┌────┐┌────┐┌────┐  raw cards  │ │ ┌────┐┌────┐┌────┐┌────┐  ds-kpi     │
│ │slate││slate││...│ border-slate-100  │ │ │ds-kpi (token border + dark mode)│   │
│ └────┘└────┘└────┘└────┘             │ │ └────┘└────┘└────┘└────┘             │
│ chart stroke #3b82f6 / grid #f1f5f9  │ │ chart stroke var(--color-chart-1)    │
│  (dark mode = พื้นขาว ตัวจม)          │ │  (dark mode ทำงานถูก)                │
└────────────────────────────────────┘ └────────────────────────────────────┘
```

**M6 — CustomerPanel hierarchy (Before → After)**

```
BEFORE (6 บล็อกเทาเหมือนกันหมด)        AFTER (มีลำดับชั้น)
┌──────────────────────────┐          ┌──────────────────────────┐
│ [avatar] DisplayName       │          │ [avatar] DisplayName  ◀ เด่น│
│ Refresh · View Profile     │          │ Refresh · View Profile     │
│ ┌──┐┌──┐┌──┐ N/A N/A N/A   │          │ (ลบ N/A tile ที่ไม่มีข้อมูล) │
│ ── ทุกบล็อกเทา p-3 เท่ากัน ──│          │ ── metadata รอง (เทา) ──    │
│ [gray] LINE ID             │          │ [muted] LINE ID + Session  │
│ [gray] Session             │          │ [muted] Activity           │
│ [gray] Activity            │          │ ── actionable (เด่นกว่า) ── │
│ [gray] Notes               │          │ [surface+border] Notes     │
│ [gray] Export              │          │ [surface+border] Export    │
└──────────────────────────┘          └──────────────────────────┘
```

L2/L3/L5 = ไม่มี layout เปลี่ยน (token swap + cell size) → N/A — internal

## Mandatory Reading

| Priority | File | Lines | Why |
|----------|------|-------|-----|
| **P0** | `frontend/app/globals.css` | 6-228 (`@theme`), 230-248 (`:root` fluid type), 297-350 (`ds-*` components) | source of truth ของ token ทุกตัว + ตำแหน่งเพิ่ม `--text-2xs`; ห้ามคิดชื่อ token เอง |
| **P0** | `frontend/app/admin/components/DashboardCharts.tsx` | 20-26, 40, 58, 82, 100 | **canonical chart-token pattern** — `CHART_COLORS = { grid: 'var(--color-border-subtle, #f1f5f9)', ... }` คือสิ่งที่ M1 ต้อง mirror เป๊ะ |
| **P0** | `frontend/app/admin/live-chat/analytics/page.tsx` | 1-222 | ไฟล์เป้าหมาย M1/L4 — rebuild ทั้งไฟล์ |
| **P0** | `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | 80-252 | ไฟล์เป้าหมาย M6/L3 |
| **P1** | `frontend/app/admin/reports/page.tsx` | 110-119 | ทางเลือก chart-color array (`CHART_COLORS`/`PIE_COLORS`) — แต่ใช้ `DashboardCharts` pattern (var()) เพราะ dark-mode-safe กว่า |
| **P1** | `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | 56-61 | จุด L2 (indigo avatar) + ตัวอย่าง token usage ที่ถูกแล้ว (`bg-online`, `text-sidebar-*`) |
| **P1** | `frontend/app/admin/live-chat/_components/EmojiPicker.tsx` / `StickerPicker.tsx` | ทั้งไฟล์ | จุด L5 |
| **P1** | `frontend/app/admin/live-chat/_components/CreateChatSheet.tsx` | 195-228 | จุด L2 (2 indigo avatars) |
| **P2** | `frontend/lib/constants/categories.ts` + `__tests__/categories.test.ts` | ทั้งไฟล์ | mirror สำหรับ shared constant + test (AAA + Thai test names) |

## Patterns to Mirror

### 1. Recharts color via CSS var with fallback (สำหรับ M1)

```tsx
// SOURCE: frontend/app/admin/components/DashboardCharts.tsx:20-26
const CHART_COLORS = {
    grid: 'var(--color-border-subtle, #f1f5f9)',
    tick: 'var(--color-text-tertiary, #64748b)',
    cursor: 'var(--color-muted, #f8fafc)',
    bar: 'var(--color-brand-500, #7367F0)',
    area: 'var(--color-success, #28C76F)',
};
// usage:  <CartesianGrid stroke={CHART_COLORS.grid} />  (line 40)
//         <Bar fill={CHART_COLORS.bar} />               (line 58)
```

> ทำไม `var()` ไม่ใช่ `#hex` array: ค่า token เปลี่ยนตาม dark mode (`.dark` overrides ใน globals.css:756-778) — array hex ตายตัวจะพังใน dark mode. Recharts รับ string เป็น stroke/fill ได้ → ส่ง `var(--color-chart-1)` ตรง ๆ

### 2. ds-* component utilities (สำหรับ M1/L4)

```css
/* SOURCE: frontend/app/globals.css:298-336 */
.ds-page { @apply space-y-6; }
.ds-panel { @apply rounded-2xl border border-gray-100 bg-white shadow-sm dark:bg-gray-800 dark:border-gray-700 dark:shadow-none; }
.ds-panel-header { @apply flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700; }
.ds-panel-body { @apply p-5; }
.ds-kpi { @apply rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-800 dark:border-gray-700 dark:shadow-none dark:hover:shadow-none; }
.ds-section-title { @apply text-xs font-semibold tracking-wide text-gray-500; }
```

### 3. Token usage ที่ "ถูกต้องแล้ว" ในไฟล์ scope เดียวกัน (mirror สำหรับ M6/L5)

```tsx
// SOURCE: frontend/app/admin/live-chat/_components/CustomerPanel.tsx:81,100,194-196
<aside className="w-72 bg-surface border-l border-border-default ...">
<div className={`... ${isActive ? 'bg-online' : isWaiting ? 'bg-away' : 'bg-offline'}`} />
<span className={`... ${isActive ? 'bg-online/15 text-online' : isWaiting ? 'bg-away/15 text-away' : 'bg-gray-100 text-text-tertiary'}`}>
// → ใช้ bg-surface / border-border-default / text-text-* / bg-online เป็นมาตรฐานของ panel นี้
```

### 4. Fluid type scale custom property (สำหรับ L3 — ตำแหน่งและรูปแบบที่ต้องเติม)

```css
/* SOURCE: frontend/app/globals.css:231-238 — :root block ที่มี --text-xs..3xl อยู่แล้ว */
:root {
  --text-xs: clamp(0.6875rem, 0.65rem + 0.125vw, 0.75rem);  /* 11px→12px */
  --text-sm: clamp(0.8125rem, 0.775rem + 0.125vw, 0.875rem);
  /* ... เพิ่ม --text-2xs ที่นี่ (เล็กกว่า --text-xs) */
}
```

> Tailwind v4 อ่าน `--text-*` ใน `@theme` เพื่อ generate `text-{name}` utility. **GOTCHA**: token เหล่านี้อยู่ใน `:root` (บรรทัด 231) ไม่ใช่ `@theme` (6-228) — Tailwind v4 generate `text-xs` ได้เพราะมันถูก reference ผ่าน `@theme`. เพื่อให้ `text-2xs` ใช้งานได้ ต้องเพิ่มใน **`@theme` block** เป็น `--text-2xs: ...;` (ไม่ใช่ `:root`) เพราะ class generation อ่านจาก `@theme`. ตรวจด้วย build จริง (Task 7 VALIDATE)

### 5. Shared constant + test structure (สำหรับ L2)

```ts
// SOURCE: frontend/lib/constants/categories.ts (pattern), __tests__/categories.test.ts:11-19
export const CATEGORIES = [ /* ... */ ] as const;
// test:
import { describe, it, expect } from 'vitest'
describe('CATEGORIES', () => {
  it('มี 4 หมวดหมู่', () => { expect(CATEGORIES).toHaveLength(4) })
})
```

### 6. Error handling / logger (existing convention ในไฟล์ scope)

```tsx
// SOURCE: frontend/app/admin/live-chat/analytics/page.tsx:61-63
} catch (error) {
    logger.error("Failed to fetch analytics", error);
}
// → คง logger pattern เดิม ห้าม console.log; ไม่แก้ logic fetch ใน Phase 3 (token-only)
```

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `frontend/app/globals.css` | UPDATE | เพิ่ม `--text-2xs` ใน `@theme` (L3) — **owner = Phase 3** per PRD File Ownership; ประสานกับ Phase 4 ก่อนแก้ |
| `frontend/lib/constants/live-chat-avatar.ts` | CREATE | shared constant `AVATAR_FALLBACK_BG = '3b82f6'` + helper สร้าง ui-avatars URL (DRY 3 จุด L2) |
| `frontend/lib/constants/__tests__/live-chat-avatar.test.ts` | CREATE | unit test ยืนยัน bg = brand blue ไม่ใช่ indigo + URL ถูก encode (L2 regression guard) |
| `frontend/app/admin/live-chat/analytics/page.tsx` | UPDATE | rebuild บน token + ds-* + chart vars (M1, L4) |
| `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | UPDATE | hierarchy + ลบ N/A + text-2xs (M6, L3) |
| `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | UPDATE | avatar fallback ใช้ shared helper (L2) + text-2xs micro fonts (L3) |
| `frontend/app/admin/live-chat/_components/CreateChatSheet.tsx` | UPDATE | avatar fallback 2 จุดใช้ shared helper (L2) |
| `frontend/app/admin/live-chat/_components/EmojiPicker.tsx` | UPDATE | cell `w-10 h-10` + `hover:bg-muted` (L5) |
| `frontend/app/admin/live-chat/_components/StickerPicker.tsx` | UPDATE | container `bg-surface`, header `bg-muted`, cell hover `bg-muted` (L5) |

## NOT Building (out-of-scope)

- **TransferDialog.tsx** (มี `bg-slate-900/40`, `border-slate-100/60`, `text-slate-*` 8 จุด) — **owner = Phase 1/Phase 6** ตาม PRD; Phase 3 **ไม่แตะ**. หมายเหตุ: success metric "grep slate = 0 ทั่ว live-chat/**" จะยังไม่ผ่าน 100% จนกว่า Phase 1/6 ปิด TransferDialog — บันทึกเป็น cross-phase dependency (ดู Risks)
- ไม่แตะ data-fetching logic / state / props ของ analytics หรือ CustomerPanel (token + markup hierarchy เท่านั้น)
- ไม่ทำ focus-visible / WCAG contrast tuning ของ Phase 2 (W1/W2) แม้จะแตะไฟล์เดียวกัน — คงพฤติกรรม focus เดิมไว้
- ไม่เพิ่ม animation/motion (Phase 4 W4/M2) — ไม่แตะ `animate-*` class
- ไม่ทำ "mark as read" / dead-button gating (Phase 1 M14) — แม้ CustomerPanel มีปุ่ม disabled, Phase 3 แค่ปรับ hierarchy ไม่เปลี่ยน enable/disable
- ไม่ refactor `LiveChatContext` (Phase 8)

## Step-by-Step Tasks

### Task 1 — เพิ่ม `--text-2xs` token (L3 enabler)

- **ACTION**: UPDATE `frontend/app/globals.css`
- **IMPLEMENT**: ใน `@theme` block (ระหว่างบรรทัด 6-228, วางใกล้ Typography section ~บรรทัด 171-174) เพิ่ม:
  ```css
  /* Micro typography (live-chat badges, stat captions) */
  --text-2xs: clamp(0.625rem, 0.6rem + 0.1vw, 0.6875rem); /* 10px → 11px */
  ```
- **MIRROR**: Pattern 4 (globals.css:231-238 fluid type)
- **IMPORTS**: none
- **GOTCHA**: ต้องอยู่ใน `@theme` (ไม่ใช่ `:root`) เพื่อให้ Tailwind v4 generate class `text-2xs`. ค่าต้อง **เล็กกว่า** `--text-xs` (11→12px) — ใช้ 10→11px. อย่าลบ/ย้าย token เดิม
- **VALIDATE**: `cd D:/genAI/jsk-app/frontend && npx tsc --noEmit` (css ไม่กระทบ tsc แต่รัน guard), แล้ว `npm run build` ต้องไม่ error และ class `text-2xs` ถูกใช้ได้ (ยืนยันใน Task 7)

### Task 2 — สร้าง shared avatar-fallback constant (L2)

- **ACTION**: CREATE `frontend/lib/constants/live-chat-avatar.ts`
- **IMPLEMENT**:
  ```ts
  // Brand blue (brand-500 hsl(217 91% 60%) ≈ #3b82f6). ก่อนหน้านี้ avatar fallback
  // hardcode indigo #6366f1 ซึ่งไม่ตรง brand — แก้ให้ใช้ค่าเดียวกันทุกจุด (L2).
  export const AVATAR_FALLBACK_BG = '3b82f6';
  export const AVATAR_FALLBACK_FG = 'fff';

  export function getAvatarFallbackUrl(displayName: string, size = 40): string {
    const name = encodeURIComponent(displayName ?? '');
    return `https://ui-avatars.com/api/?name=${name}&background=${AVATAR_FALLBACK_BG}&color=${AVATAR_FALLBACK_FG}&size=${size}`;
  }
  ```
- **MIRROR**: Pattern 5 (categories.ts `as const` + named export); Pattern 6 (no console.log)
- **IMPORTS**: none
- **GOTCHA**: ConversationItem ใช้ size 40, CreateChatSheet ใช้ size 32 — รองรับด้วย param `size`. encode displayName เสมอ (เดิม ConversationItem ไม่ได้ encode — :58)
- **VALIDATE**: `npx tsc --noEmit`

### Task 3 — เขียน test สำหรับ avatar helper (L2 regression guard)

- **ACTION**: CREATE `frontend/lib/constants/__tests__/live-chat-avatar.test.ts`
- **IMPLEMENT**: ทดสอบ (1) `AVATAR_FALLBACK_BG === '3b82f6'` ไม่ใช่ `'6366f1'`, (2) URL มี `background=3b82f6`, (3) encode ชื่อ Thai/ช่องว่างถูกต้อง, (4) ใส่ size param ได้
  ```ts
  import { describe, it, expect } from 'vitest'
  import { AVATAR_FALLBACK_BG, getAvatarFallbackUrl } from '../live-chat-avatar'

  describe('live-chat avatar fallback', () => {
    it('ใช้สี brand blue ไม่ใช่ indigo เดิม', () => {
      expect(AVATAR_FALLBACK_BG).toBe('3b82f6')
      expect(AVATAR_FALLBACK_BG).not.toBe('6366f1')
    })
    it('ฝัง background brand blue ใน URL', () => {
      expect(getAvatarFallbackUrl('Somchai')).toContain('background=3b82f6')
    })
    it('encode ชื่อที่มีช่องว่าง/ภาษาไทย', () => {
      const url = getAvatarFallbackUrl('นาย ก')
      expect(url).toContain(encodeURIComponent('นาย ก'))
      expect(url).not.toContain(' ')
    })
    it('รับ size param', () => {
      expect(getAvatarFallbackUrl('A', 32)).toContain('size=32')
    })
  })
  ```
- **MIRROR**: `__tests__/categories.test.ts:11-19` (AAA + ชื่อ test ภาษาไทย)
- **IMPORTS**: `vitest`, `../live-chat-avatar`
- **GOTCHA**: ไม่มี
- **VALIDATE**: `npx vitest run lib/constants/__tests__/live-chat-avatar.test.ts` → 4 passed

### Task 4 — แก้ avatar fallback ใน ConversationItem + CreateChatSheet (L2)

- **ACTION**: UPDATE `ConversationItem.tsx`, `CreateChatSheet.tsx`
- **IMPLEMENT**:
  - ConversationItem.tsx:57-59 — แทน inline URL ด้วย `src={conversation.picture_url || getAvatarFallbackUrl(conversation.display_name, 40)}`
  - CreateChatSheet.tsx:196-200 — `src={user.picture_url || getAvatarFallbackUrl(user.display_name, 32)}`
  - CreateChatSheet.tsx:221-225 — `src={selectedUser.picture_url || getAvatarFallbackUrl(selectedUser.display_name, 32)}`
- **MIRROR**: Pattern 5
- **IMPORTS**: ทั้งสองไฟล์เพิ่ม `import { getAvatarFallbackUrl } from '@/lib/constants/live-chat-avatar';`
- **GOTCHA**: คง comment `{/* eslint-disable-next-line @next/next/no-img-element */}` ไว้เหนือ `<img>`. อย่าเปลี่ยน `<img>` เป็น `next/image` (จะ break — domain ui-avatars ไม่อยู่ใน next.config)
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/ConversationItem.tsx app/admin/live-chat/_components/CreateChatSheet.tsx` → 0 error; `grep -n 6366f1` ทั้งสองไฟล์ = 0

### Task 5 — Rebuild analytics page บน token + ds-* + chart vars (M1, L4)

- **ACTION**: UPDATE `frontend/app/admin/live-chat/analytics/page.tsx`
- **IMPLEMENT** (token-only, ไม่แตะ fetch/state):
  1. เพิ่ม module-level chart color object (mirror DashboardCharts):
     ```tsx
     const CHART = {
       grid: 'var(--color-border-subtle, #e5e7eb)',
       tick: 'var(--color-text-tertiary, #94a3b8)',
       cursor: 'var(--color-muted, #f1f5f9)',
       line: 'var(--color-chart-1)',
       bar: 'var(--color-chart-2)',
     };
     ```
  2. root wrapper (:74) `bg-[#f8f7fa]` → `bg-bg`; inner (:75) เพิ่ม `ds-page` แทน `space-y-6` หรือคง `space-y-6` ภายใน `max-w-7xl`
  3. heading (:78) `text-slate-800` → `text-text-primary`; subtext (:79) `text-slate-500` → `text-text-secondary`; separator (:88) `text-slate-400` → `text-text-tertiary`; ใส่ `thai-text` ที่ wrapper
  4. `StatCard` (:209-221): outer → ใช้ `ds-kpi` แทน `bg-white p-6 rounded-2xl shadow-sm border border-slate-100/60`; title `text-slate-400` → `text-text-tertiary` (`text-[11px]` → `text-2xs`); value `text-slate-800` → `text-text-primary`
  5. chart panels (:128,151): `bg-white ... border border-slate-100/60` → `ds-panel ds-panel-body` (หรือ `bg-surface border border-border-default`); titles `text-slate-800` → `text-text-primary`
  6. Recharts: `stroke="#f1f5f9"` → `stroke={CHART.grid}`; tick `fill: '#64748b'` → `fill: CHART.tick`; Line `stroke="#3b82f6"`/dot fill → `CHART.line`; Bar `fill="#60a5fa"` → `CHART.bar`; Tooltip cursor `fill: '#f8fafc'` → `CHART.cursor`; Tooltip `contentStyle` เพิ่ม `background: 'var(--color-surface)', color: 'var(--color-text-primary)'`
  7. table (:171-201): `border-slate-100/60`→`border-border-default`; `bg-slate-50`→`bg-muted`; `text-slate-500`→`text-text-tertiary`; `divide-slate-50`→`divide-border-subtle`; `hover:bg-slate-50/50`→`hover:bg-muted/50`; `text-slate-900`→`text-text-primary`; `text-slate-600`→`text-text-secondary`; `text-slate-400`→`text-text-tertiary`
- **MIRROR**: Pattern 1 (DashboardCharts.tsx:20-26,40,58), Pattern 2 (ds-* utilities)
- **IMPORTS**: ไม่เพิ่ม (ds-* เป็น class, CHART เป็น local const)
- **GOTCHA**: คง `text-primary`/`bg-primary/8`/`text-orange-600`/`text-emerald-600`/`text-brand-600` ที่บรรทัด 103-123 ไว้ — เป็น token alias ที่ valid อยู่แล้ว (ไม่ใช่ slate/raw hex). `bg-orange-50`/`bg-emerald-50` เป็น Tailwind default palette (ไม่ใช่ hardcode hex/slate) — **ไม่อยู่ใน metric** แต่แนะนำคงไว้เพื่อไม่ขยาย scope. Recharts `contentStyle` ใช้ var() string ได้
- **VALIDATE**: `npx eslint app/admin/live-chat/analytics/page.tsx` → 0; `grep -nE 'slate-|#[0-9a-fA-F]{3,6}' app/admin/live-chat/analytics/page.tsx` → 0

### Task 6 — CustomerPanel hierarchy + ลบ N/A + text-2xs (M6, L3)

- **ACTION**: UPDATE `frontend/app/admin/live-chat/_components/CustomerPanel.tsx`
- **IMPLEMENT**:
  1. **ลบ stat grid N/A** (:158-175 ทั้งบล็อก `grid grid-cols-3`) — ทั้ง 3 tile เป็น "N/A" ไม่มี data source จริง (PRD M6: "remove/gate N/A"). ถ้าต้องการคง placeholder ให้ comment ออกพร้อม TODO อ้างถึง analytics endpoint แทน
  2. **จัดกลุ่มลำดับชั้น**: ทำให้บล็อก actionable (Internal Notes :214-222, Export :224-241) เด่นกว่า metadata: เปลี่ยน `bg-gray-50` ของ 2 บล็อกนี้เป็น `bg-surface border border-border-default` (มีขอบ = ดูเป็น control); ส่วน metadata รอง (LINE ID :181, Session :192, Activity :202) คง `bg-gray-50` แต่เปลี่ยนเป็น token `bg-muted` เพื่อความสม่ำเสมอ
  3. **micro-fonts L3**: ทุก `text-[10px]` header (:163,168,173 ถูกลบไปแล้วใน step 1; เหลือ :182,203,216,226) → `text-2xs`; tag `text-[10px]` (:149) → `text-2xs`; session badge `text-[10px]` (:194) → `text-2xs`
  4. promote identity: เพิ่ม `text-base` ที่ display name (:102 `text-sm` → คง `text-sm` แต่เพิ่มน้ำหนัก visual ด้วย spacing) — optional polish; อย่างน้อยให้บล็อก profile (:91) มี separation ชัด (มี border-b อยู่แล้ว — คง)
- **MIRROR**: Pattern 3 (bg-surface/border-border-default ที่ใช้อยู่ในไฟล์เดียวกัน :81)
- **IMPORTS**: ลบ import ที่ไม่ใช้แล้วถ้ามี (เช่น `MessageSquare`, `Calendar` ถ้า stat grid ถูกลบและไม่ถูกใช้ที่อื่น — ตรวจก่อนลบ; `Star` ยังใช้ที่ปุ่ม VIP :139 → คงไว้)
- **GOTCHA**: หลังลบ stat grid ต้องตรวจ unused import — `MessageSquare`(:161) และ `Calendar`(:171) ใช้แค่ใน grid → ESLint จะ error `no-unused-vars`. ลบออกจาก import line 5. `Clock`,`User` ยังใช้ใน Activity (:205,209) → คง. อย่าแตะปุ่ม disabled (Phase 1 M14 owns)
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/CustomerPanel.tsx` → 0 (รวม no-unused-vars); `grep -nE 'slate-|text-\[(9|10|11)px\]' CustomerPanel.tsx` → 0

### Task 7 — EmojiPicker + StickerPicker cell tokens (L5)

- **ACTION**: UPDATE `EmojiPicker.tsx`, `StickerPicker.tsx`
- **IMPLEMENT**:
  - EmojiPicker.tsx:13 — `bg-white` → `bg-surface`
  - EmojiPicker.tsx:19 — `w-8 h-8 ... hover:bg-gray-100` → `w-10 h-10 ... hover:bg-muted`
  - StickerPicker.tsx:23 — `bg-white` → `bg-surface`
  - StickerPicker.tsx:25 — header `bg-gray-50` → `bg-muted`
  - StickerPicker.tsx:26 — tab button `bg-white` → `bg-surface`
  - StickerPicker.tsx:39 — cell `hover:bg-gray-50` → `hover:bg-muted` (cell เป็น `aspect-square` แล้ว, w-10/h-10 ไม่จำเป็นเพราะ grid ควบคุม — แต่ถ้าต้องการ min size ให้คง aspect-square)
- **MIRROR**: Pattern 3
- **IMPORTS**: none
- **GOTCHA**: ห้ามแตะ `animate-scale-in` (Phase 4). `gray-100`/`gray-50` เป็น token (`--color-gray-*` ใน @theme) ทางเทคนิค — แต่ PRD L5 สั่งให้ใช้ semantic `bg-muted`/`hover:bg-muted` เพื่อ dark-mode parity → ทำตาม
- **VALIDATE**: `npx eslint app/admin/live-chat/_components/EmojiPicker.tsx app/admin/live-chat/_components/StickerPicker.tsx` → 0

### Task 8 — Full validation sweep + token-compliance grep

- **ACTION**: รัน validation ทั้งชุด
- **IMPLEMENT**: รันคำสั่งใน "Validation Commands" ครบ; ยืนยัน `text-2xs` ถูก generate (build ผ่าน + ไม่มี class ที่ resolve เป็น nothing)
- **MIRROR**: —
- **IMPORTS**: —
- **GOTCHA**: ถ้า `npm run build` รายงาน `text-2xs` ไม่ถูก generate (utility ไม่มีผล) → ย้าย `--text-2xs` จาก `:root` ไป `@theme` (Task 1 GOTCHA)
- **VALIDATE**: ดู Validation Commands

## Testing Strategy

| Test file | Type | Asserts | Finding |
|-----------|------|---------|---------|
| `lib/constants/__tests__/live-chat-avatar.test.ts` (CREATE) | unit | `AVATAR_FALLBACK_BG === '3b82f6'` (ไม่ใช่ 6366f1), URL มี `background=3b82f6`, encode Thai/space, size param | L2 |
| grep gate (CI / manual) | static | 0 hardcoded `slate-*`/raw hex ใน scope files | M1, M6, L2, L5 |
| `npx vitest run` (full) | regression | 16 ไฟล์เทสเดิมยังผ่าน (ไม่ break) | all |

**Edge-case checklist**
- [ ] Dark mode: analytics page อ่านได้ (พื้น/ตัวอักษร/กราฟ) — token-driven, ตรวจด้วยตา (toggle `.dark`)
- [ ] CustomerPanel หลังลบ stat grid: ไม่มี layout gap ค้าง, scroll ปกติ
- [ ] avatar fallback: user ไม่มี picture_url → เห็นวงกลม brand-blue (ไม่ใช่ indigo)
- [ ] `text-2xs` render จริง (ไม่ resolve เป็น 0/inherit) — inspect badge ใน ConversationItem/CustomerPanel
- [ ] emoji/sticker cell 40px กดง่ายขึ้น (target size) — ตรวจด้วยตา
- [ ] ไม่มี unused import error หลังลบ N/A grid (MessageSquare/Calendar)

## Validation Commands

รันจาก `D:/genAI/jsk-app/frontend`:

```bash
npx tsc --noEmit
# EXPECT: ไม่มี error (exit 0)

npx eslint app/admin/live-chat/analytics/page.tsx app/admin/live-chat/_components/CustomerPanel.tsx app/admin/live-chat/_components/ConversationItem.tsx app/admin/live-chat/_components/CreateChatSheet.tsx app/admin/live-chat/_components/EmojiPicker.tsx app/admin/live-chat/_components/StickerPicker.tsx lib/constants/live-chat-avatar.ts
# EXPECT: 0 problems (รวม no-unused-vars หลังลบ N/A grid)

npx vitest run
# EXPECT: ทุกไฟล์ผ่าน รวม live-chat-avatar.test.ts (4 passed) — total ไฟล์เดิม + 1 ใหม่

npm run build
# EXPECT: build สำเร็จ; class text-2xs generate ได้ (ไม่มี warning utility ว่าง)

npx playwright test
# EXPECT: smoke E2E ผ่าน (ไม่ regress) — ต้องมี dev server รัน

# Token-compliance gate (success metric):
grep -rnE 'slate-|#[0-9a-fA-F]{3,6}|6366f1' app/admin/live-chat/analytics/page.tsx app/admin/live-chat/_components/CustomerPanel.tsx app/admin/live-chat/_components/ConversationItem.tsx app/admin/live-chat/_components/CreateChatSheet.tsx app/admin/live-chat/_components/EmojiPicker.tsx app/admin/live-chat/_components/StickerPicker.tsx
# EXPECT: 0 matches (TransferDialog ถูกยกเว้น — owner Phase 1/6)

grep -rnE 'text-\[(9|10|11)px\]' app/admin/live-chat/_components/CustomerPanel.tsx app/admin/live-chat/_components/ConversationItem.tsx
# EXPECT: 0 matches ใน 2 ไฟล์ scope L3 หลัก
```

## Acceptance Criteria

- [ ] M1: analytics page ไม่มี `#f8f7fa`/`slate-*`/raw chart hex; Recharts ขับด้วย `var(--color-*)`; dark mode อ่านได้
- [ ] M6: CustomerPanel ลบ N/A stat tile; บล็อก actionable (Notes/Export) มี border แยกจาก metadata; ไม่มี unused import
- [ ] L2: ทั้ง 3 จุด avatar fallback ใช้ `getAvatarFallbackUrl` (brand blue `3b82f6`); `grep 6366f1` = 0; test ผ่าน
- [ ] L3: `--text-2xs` มีใน `@theme`; `text-[10px]/[11px]/[9px]` ในไฟล์ scope แทนด้วย `text-2xs`
- [ ] L4: analytics ใช้ `ds-page`/`ds-panel`/`ds-kpi` สอดคล้องกับ console
- [ ] L5: emoji/sticker cell ใช้ `bg-surface`/`hover:bg-muted`, cell size ≥ 40px (emoji `w-10 h-10`)
- [ ] tsc + eslint + vitest + build เขียว; playwright smoke ไม่ regress

## Completion Checklist

- [ ] Task 1 — `--text-2xs` ใน `@theme`
- [ ] Task 2 — `live-chat-avatar.ts` constant
- [ ] Task 3 — avatar test (4 passed)
- [ ] Task 4 — avatar fallback แก้ 3 จุด
- [ ] Task 5 — analytics rebuild
- [ ] Task 6 — CustomerPanel hierarchy + N/A + text-2xs
- [ ] Task 7 — Emoji/Sticker picker tokens
- [ ] Task 8 — validation sweep + grep gate = 0
- [ ] PR ระบุ cross-phase note: grep slate=0 ทั่ว `live-chat/**` รอ Phase 1/6 ปิด TransferDialog

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `text-2xs` ไม่ถูก generate (วางผิด `:root` แทน `@theme`) | M | L3 ไม่ทำงาน (font ไม่เปลี่ยน) | Task 1 วางใน `@theme`; Task 8 ยืนยันด้วย build + inspect |
| `globals.css` ชนกับ Phase 4 (W4 motion token) — owner conflict | M | merge conflict | PRD ระบุ globals.css owner=Phase 3; Phase 4 ประสานก่อนแก้ — แก้เฉพาะ Typography section ลดพื้นที่ชน |
| ลบ N/A grid แล้วเหลือ unused import → eslint fail | M | build แดง | Task 6 GOTCHA: ลบ `MessageSquare`,`Calendar` จาก import |
| Recharts ไม่ render `var()` ใน contentStyle บางเบราว์เซอร์เก่า | L | tooltip สีเพี้ยน | fallback hex ใน `var(--x, #hex)`; ตรง grid/tick/cursor มี fallback |
| success metric "slate=0 ทั่ว live-chat/**" ยังไม่ผ่าน 100% (TransferDialog) | H | metric ไม่ครบในเฟสนี้ | ระบุชัดใน NOT Building + PR note ว่า TransferDialog เป็น Phase 1/6 — Phase 3 ปิดเฉพาะ 6 ไฟล์ scope |
| `CustomerPanel.tsx` ถูก Phase 2/5/7 แตะด้วย (multi-owner) | M | rebase conflict | PRD: Phase 2 owns; Phase 3 rebase หลัง Phase 2 merge ตาม File Ownership |

## Notes

- **File Ownership (จาก PRD):** `globals.css` owner = Phase 3 (งานนี้); `CustomerPanel.tsx` owner = Phase 2 → Phase 3 ควร rebase หลัง Phase 2 merge เพื่อเลี่ยง conflict กับ a11y dialog/label changes. ถ้าทำขนานจริง ให้ serialize เฉพาะ `CustomerPanel.tsx`
- **ทำไมใช้ `var(--color-*)` ใน Recharts ไม่ใช่ array hex:** dark mode override token ใน `.dark` (globals.css:756-778) — hex ตายตัวจะพังใน dark; `DashboardCharts.tsx:20-26` พิสูจน์ pattern นี้ใช้งานจริงในโปรเจกต์แล้ว
- **`bg-orange-50`/`bg-emerald-50`/`text-orange-600` ใน analytics StatCard:** เป็น Tailwind default palette (ไม่ใช่ raw hex/slate) — ไม่อยู่ใน success metric grep; คงไว้เพื่อไม่ขยาย scope (semantic icon accent). หากต้องการความบริสุทธิ์ 100% สามารถ map เป็น `bg-warning/10`/`text-warning-text` ภายหลังได้แต่ไม่บังคับในเฟสนี้
- **`gray-*` คือ token จริง** (`--color-gray-*` ใน @theme:70-81) — L5 สั่งใช้ `bg-muted`/`hover:bg-muted` แทนเพราะ semantic + dark-parity ชัดกว่า ไม่ใช่เพราะ gray เป็น hardcode
- **dependency:** Phase 3 depends on Phase 1 (per PRD) — เริ่มได้หลัง Phase 1 merge เพราะ Phase 1 อาจแตะ ConversationItem/CustomerPanel markup
