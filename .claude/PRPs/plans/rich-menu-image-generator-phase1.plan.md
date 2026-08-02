# Plan: Rich Menu Image Generator — Phase 1 (Render core + ฟอนต์ไทย)

> **REV 4 (2026-08-02)** — แก้ตามรีวิวของ Codex (verdict เดิม NEEDS REWORK / 4/10)
> ปิดบั๊กในสเปก 6 จุดที่ทำให้ implement ตามไม่ได้จริง และ **Task 7 เปลี่ยนจาก optional
> เป็นบังคับและเก็บถาวร** ดู Changelog ท้ายไฟล์
>
> REV 3 ปิด `[DECISION-PENDING]` ครบ (`MIN_FONT_SIZE_PX = 96`, `MAX_LINES = 2`)
> REV 2 แก้หลังรีวิวด้วย 4 agent ขนาน — สมมติฐานเรื่องชื่อฟอนต์ใน REV 1 ผิดข้อเท็จจริง

## Summary

สร้างชั้น core ที่แปลง `{ areas (พร้อม label), colors }` เป็นภาพ PNG ขนาด 2500×1686 (หรือ 2500×843)
ด้วย Canvas 2D ฝั่งเบราว์เซอร์ โดยแยก **ตรรกะจัดวางข้อความ (pure, เทสต์ได้)** ออกจาก
**การวาดจริงบน canvas (ต้องใช้เบราว์เซอร์)** เพราะ jsdom ของ vitest ไม่รองรับ Canvas
เฟสนี้ไม่มี UI ยังไม่ต่อกับหน้าใด ๆ

**คำเตือนสำคัญเรื่องรูปทรงของเฟสนี้**: การแยก pure logic ออกมาทำให้ตรรกะเทสต์ได้จริง
แต่มัน **ย้ายความเสี่ยงเรื่องฟอนต์ทั้งหมดไปกองอยู่ใน `render.ts` ซึ่ง unit test เข้าไม่ถึง**
ถ้าฟอนต์ไทยไม่ถูกโหลด เทสต์ทุกเคสจะยังเขียว แต่ภาพที่ได้ใช้ฟอนต์ผิด — **ด้วยเหตุนี้ Task 4
จึงบังคับให้มี runtime guard (`ensureFontsReady` + `assertCanvasFontApplied`) ไม่ใช่แค่ตรวจด้วยตา**

## User Story

As a **แอดมินที่ไม่มีทักษะกราฟิก**,
I want **ให้ระบบสร้างภาพ Rich Menu จากป้ายข้อความที่ฉันพิมพ์**,
So that **ฉันเผยแพร่เมนูใหม่ได้เองโดยไม่ต้องออกไปทำภาพในโปรแกรมอื่น**.

> Phase 1 ยังไม่ส่งมอบคุณค่านี้ถึงมือผู้ใช้ — เป็นรากฐานที่ Phase 3-4 จะต่อยอด

## Problem → Solution

**Current**: ไม่มีทางสร้างภาพ Rich Menu ในระบบเลย `POST /{id}/upload` รับได้แค่ไฟล์ที่ทำมาแล้ว
**Desired**: มี `renderRichMenuImage()` ที่คืน `Blob` ขนาดถูกต้อง อ่านภาษาไทยออกครบ
พร้อม unit test ครอบตรรกะจัดวาง และ runtime guard ครอบเรื่องฟอนต์

## Metadata

- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/rich-menu-image-generator.prd.md`
- **PRD Phase**: Phase 1 — Render core + ฟอนต์ไทย
- **Estimated Files**: 8 (6 ใน `lib/rich-menu/` + harness page + Playwright spec — **ทั้งหมดเก็บถาวร**)

---

## UX Design

**N/A — internal change** — Phase 1 ไม่มีส่วนติดต่อผู้ใช้ ไม่มี route ใหม่ ผู้ใช้ยังเห็นหน้า
`/admin/rich-menus/new` เหมือนเดิมทุกประการ UX จริงเริ่มที่ Phase 3

---

## ข้อเท็จจริงที่ยืนยันด้วยการรันจริงแล้ว (อย่าเดาใหม่)

```
--font-noto-thai: 'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif
```
- **ชื่อ family ไม่ถูก hash** สิ่งที่ hash คือชื่อ *คลาส* (`.__variable_xxxxxx`)
  พฤติกรรม hash ชื่อ family เป็นของ Next 12/13 ยุคแรก โปรเจกต์นี้ใช้ Next 16.1.1
- ค่านี้เป็น **font stack 4 ตัว มี quote ครอบชื่อ** → assign เข้า `ctx.font` ได้ตรง ๆ
- `notoThai.variable` ถูกวางบน `<html>` (`app/layout.tsx`) → `getComputedStyle(document.documentElement)` อ่านได้

`@font-face` ถูกแยกเป็นหลายไฟล์ตาม `unicode-range` — **ไทยกับ latin คนละไฟล์**:
```
unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC          ← ไฟล์ไทย
unicode-range: U+0000-00FF, ..., U+2000-206F, U+20AC, ...                        ← ไฟล์ latin (มี U+0020 และ U+2026 '…')
```
`'Noto Sans Thai Fallback'` มี `src: local("Arial")` — **Arial ไม่มี glyph ไทยเลย**

ผลตัดคำจริงจาก Node 22.17 (`Intl.Segmenter`):
```
word     'แจ้งเบาะแสยาเสพติด' → ["แจ้ง","เบาะแส","ยา","เสพ","ติด"]
word     'ต่าง ๆ นานาๆ'       → ["ต่าง"," ","ๆ"," ","นา","นาๆ"]   ← "ๆ" ลอยเดี่ยว
word     'ชม.'               → ["ชม"],["."]                      ← "." ลอยเดี่ยว
grapheme 'เก'                → ["เ","ก"]                          ← สระหน้าแยก!
grapheme 'ผู้ใหญ่บ้าน'         → ["ผู้","ใ","ห","ญ่","บ้","า","น"]
'ที่'.length === 3   Array.from('ที่').length === 3   ← ทั้งคู่ไม่ปลอดภัยกับไทย
```

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| **P0** | `frontend/app/admin/image-resize/image-utils.ts` | 92-154 | ต้นแบบเดียวในโปรเจกต์ที่ใช้ Canvas + `toBlob` — pattern ที่ต้องลอก **หมายเหตุ: ฟังก์ชันนี้เองไม่มี unit test** (ชุดเทสต์ครอบเฉพาะ helper บริสุทธิ์) |
| **P0** | `frontend/app/admin/rich-menus/new/page.tsx` | 11-36, 68-180 | `TemplateBounds` 11-16, `TemplateArea` 18-22, `TemplateItem` 24-28, `TemplateGroup` 30-36 (38-41 คือ `TemplateSelection` ไม่เกี่ยว) และ `PRESET_TEMPLATES` 11 แบบ |
| **P0** | `frontend/app/layout.tsx` | 6-13 | `Noto_Sans_Thai` weight 400/500/700, `variable: '--font-noto-thai'`, `subsets: ['thai','latin']` |
| **P1** | `frontend/app/globals.css` | 172 | `--font-sans: var(--font-noto-thai), "Inter", ...` |
| **P1** | `frontend/vitest.config.ts` | ทั้งไฟล์ | `environment: 'jsdom'` (L32), `globals: true` (L33), `include` (L37), alias `@` (L21) |
| **P1** | `frontend/app/admin/image-resize/__tests__/image-utils.test.ts` | 1-22 | รูปแบบ test: import relative `'../image-utils'`, describe/it ตรงไปตรงมา, ไม่มี mock |
| **P1** | `frontend/lib/constants/categories.ts` | ทั้งไฟล์ | **แหล่งป้ายไทยจริงสำหรับ test fixture** — ห้ามแต่งข้อความไทยขึ้นเอง |
| **P2** | `frontend/lib/logger.ts` | 1-28, 55-73 | 1-28 เหตุผล, **55-73 คือตัว `logger.error`** |
| **P2** | `frontend/lib/constants/request-status.ts` | 16-23 | ตัวอย่าง constants module ที่ export `as const` |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| `FontFaceSet.load()` | MDN / CSS Font Loading spec | **พารามิเตอร์ที่ 2 `text` มีค่า default เป็น `" "` (U+0020)** → โหลดเฉพาะ `@font-face` ที่ unicode-range ครอบ U+0020 ซึ่งคือ **ไฟล์ latin** ไฟล์ไทยจะไม่ถูก request เลย **ต้องส่งข้อความไทยเข้าไปเสมอ** |
| `ctx.font` | HTML spec — canvas text | "if the value cannot be parsed as a CSS font value, it must be **ignored**" → ค่าเดิมคงอยู่ (default `10px sans-serif`) **ไม่ throw ไม่ warn** |
| `document.fonts.check()` | MDN | คืน `true` ทั้งกรณี "โหลดแล้ว" **และ** กรณี "ไม่มี @font-face ไหน match เลย" → ใช้เดี่ยว ๆ ไม่ได้ |
| `TextMetrics` | MDN | `fontBoundingBox*` = ค่าระดับ **ฟอนต์** (คงที่ทุกสตริง) / `actualBoundingBox*` = ค่าระดับ **ink ของสตริงนั้น** (แปรผัน) — เลือกผิดจะทำให้แต่ละช่องลอยไม่เท่ากัน |
| `Intl.Segmenter` | MDN + UAX #29 / UAX #14 | word segmentation (UAX #29) **ไม่ใช่** line breaking (UAX #14) — Segmenter ไม่บังคับกฎ "ห้าม break ก่อน ๆ/ฯ/./ปิดวงเล็บ" ต้องเติมเอง |
| `Intl.Segmenter` ข้ามเอนจิน | ICU4C (V8) / ICU-Apple (JSC) / **ICU4X (Firefox 125+)** | dictionary ไทยคนละเวอร์ชัน → แอดมินคนละเบราว์เซอร์ได้จุดขึ้นบรรทัดต่างกัน |
| Next.js private folders | Next.js App Router docs | โฟลเดอร์ขึ้นต้น `_` **ไม่ถูก route** (repo นี้ใช้อยู่แล้ว: `live-chat/_components`, `_context`, `_hooks`, `_lib`) |

---

## Patterns to Mirror

### NAMING_CONVENTION
```typescript
// SOURCE: frontend/app/admin/image-resize/image-utils.ts:1-31 (types/presets) และ :40-42 (constants)
export type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ResizePreset {
  id: string; label: string; width: number; height: number; group: 'line' | 'general';
}

export const RESIZE_PRESETS: ResizePreset[] = [
  { id: 'line-rich-large', label: 'Rich Menu Large', width: 2500, height: 1686, group: 'line' },
];

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;   // ← บรรทัด 40
```
→ `interface` PascalCase, ฟังก์ชัน camelCase, ค่าคงที่ `UPPER_SNAKE_CASE`, union เป็น string literal
→ named export ทั้งหมด ไม่มี default export

### CANVAS_PATTERN
```typescript
// SOURCE: frontend/app/admin/image-resize/image-utils.ts:99-153 (ย่อ — ตัดส่วน decode 105-129 ออก)
const canvas = document.createElement('canvas');
canvas.width = width;
canvas.height = height;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับ Canvas');

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.drawImage(source, 0, 0, width, height);

return new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(
    (blob) => {
      if (blob) resolve(blob);
      else reject(new Error('ไม่สามารถแปลงรูปภาพได้ — ลองเปลี่ยนรูปแบบไฟล์'));
    },
    format,
    isLossy ? safeQuality : undefined,
  );
});
```
→ ตรวจ `!ctx` แล้ว throw ทันที, `toBlob` ห่อด้วย `Promise` เสมอ

### ERROR_HANDLING
```typescript
// SOURCE: frontend/app/admin/image-resize/image-utils.ts:103, 123, 148
if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับ Canvas');
el.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
else reject(new Error('ไม่สามารถแปลงรูปภาพได้ — ลองเปลี่ยนรูปแบบไฟล์'));
```
→ **ข้อความ error เป็นภาษาไทย** เพราะถูกแสดงต่อผู้ใช้ผ่าน toast; throw ทันที ไม่กลืน error

> **หมายเหตุ**: การเช็คขนาด blob หลัง `toBlob` **ไม่มีใน `image-utils.ts`** ตัวอย่างจริงที่ใกล้ที่สุดคือ
> `frontend/app/admin/image-resize/use-image-resize.ts:196-199` ซึ่งเทียบกับ `MAX_MEDIA_UPLOAD_BYTES`
> (10 MB, `image-utils.ts:41`) แล้ว **toast + หยุด ไม่ลด quality แล้วลองใหม่** — เพดาน 1 MB ของ LINE
> จึงไม่มี precedent ให้ลอก ต้องออกแบบเองใน Task 4

### RESOURCE_CLEANUP
```typescript
// SOURCE: frontend/app/admin/image-resize/image-utils.ts:105-140
let bitmap: ImageBitmap | null = null;
try { /* ... */ } finally {
  bitmap?.close();
  if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
}
```
→ ใน `render.ts` ใช้ `ctx.save()` / `ctx.restore()` คู่กันในรูปแบบเดียวกัน

### TEST_STRUCTURE
```typescript
// SOURCE: frontend/app/admin/image-resize/__tests__/image-utils.test.ts:1-22 (ย่อ — ไฟล์จริง import 5 ชื่อ, describe นี้มี 3 it)
import { describe, expect, it } from 'vitest';
import { buildOutputFilename, computeLockedDimension } from '../image-utils';

describe('buildOutputFilename', () => {
  it('strips original extension and appends resize suffix', () => {
    expect(buildOutputFilename('my photo.png', 800, 600, 'webp')).toBe('my photo_resized_800x600.webp');
  });
});
```
→ `describe` ต่อ 1 ฟังก์ชัน, ชื่อ `it` เป็นประโยคอังกฤษ, import relative, ไม่มี mock

### LOGGING_PATTERN
```typescript
// SOURCE: frontend/app/admin/rich-menus/new/page.tsx:9
import { logger } from '@/lib/logger';
```
→ ใน `lib/` ที่เป็น pure function **ไม่ต้อง log** ให้ throw ขึ้นไป; ชั้น component เท่านั้นที่ `logger.error` + `toast`

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `frontend/lib/rich-menu/types.ts` | CREATE | Types ของโมดูล |
| `frontend/lib/rich-menu/text-layout.ts` | CREATE | Pure: segment + ตัดคำไทย + wrap + auto-shrink + truncate — **เทสต์ได้ 100%** |
| `frontend/lib/rich-menu/fonts.ts` | CREATE | อ่าน font stack จาก CSS var + โหลดฟอนต์ไทยให้ถูกไฟล์ + guard |
| `frontend/lib/rich-menu/render.ts` | CREATE | วาด canvas + `toBlob` — บางที่สุดเท่าที่ทำได้ |
| `frontend/lib/rich-menu/__tests__/text-layout.test.ts` | CREATE | Unit test + invariants + Thai fixtures |
| `frontend/lib/rich-menu/__tests__/fonts.test.ts` | CREATE | Unit test ของการ parse CSS var |
| `frontend/app/admin/rich-menus/dev-preview/page.tsx` | CREATE | Harness ที่ Playwright test ขับ — **เก็บถาวร ไม่ลบ** |
| `frontend/e2e/rich-menu-render.spec.ts` | CREATE | Playwright smoke test — ชั้นเดียวที่ตรวจ `render.ts` ได้จริง |

## NOT Building

- **ไม่มี UI / component / route ถาวร** — Phase 3 เท่านั้น
- **ไม่แตะ `new/page.tsx`** — Phase 3-4 เท่านั้น (`git diff` ต้องสะอาด)
- **ไม่แตะ backend** — ทั้ง PRD ไม่มีการแก้ backend
- **ไม่ทำระบบสี/preset/contrast** — Phase 2
- **ไม่ทำไอคอน รูปพื้นหลัง เส้นคั่น** — v2
- **ไม่ลง package ใหม่** — `Intl.Segmenter` และ Canvas เป็น web API มาตรฐาน
  (เหตุผลที่ไม่ลง `canvas` เป็น devDependency สำหรับ vitest: มันต้อง compile native binary ผ่าน
  node-gyp + Cairo/Pango ซึ่งเปราะบนสภาพแวดล้อม WSL/Windows ของโปรเจกต์นี้ — **ไม่ใช่**
  เหตุผลเรื่อง Chromium/Koyeb ซึ่งใช้กับกรณี server-side rendering เท่านั้น)

---

## Step-by-Step Tasks

### Task 1: `frontend/lib/rich-menu/types.ts`

- **ACTION**: นิยาม types ของโมดูล
- **IMPLEMENT**:
  ```typescript
  export interface RichMenuBounds { x: number; y: number; width: number; height: number; }

  /** label อยู่ใน object เดียวกับ bounds — ห้ามใช้ array คู่ขนาน */
  export interface RichMenuAreaLayout {
    id: number;
    bounds: RichMenuBounds;
    label: string;
  }

  export interface RichMenuColors { background: string; text: string; }

  export interface RenderRichMenuOptions {
    width: number;                      // 2500
    height: number;                     // 1686 หรือ 843
    areas: RichMenuAreaLayout[];        // label อยู่ในนี้แล้ว
    colors: RichMenuColors;
    fontFamily: string;                 // font stack เต็มจาก fonts.ts
  }

  /** ผูก font size ไว้แล้วโดยผู้สร้าง — ผู้เรียกไม่ต้องส่ง size ซ้ำ */
  export type MeasureTextFn = (text: string) => number;

  export interface TextSegment { readonly text: string; readonly isWordLike: boolean; }
  ```
- **MIRROR**: `NAMING_CONVENTION`
- **IMPORTS**: ไม่มี
- **GOTCHA**:
  1. **`label` ต้องอยู่ใน `RichMenuAreaLayout` ไม่ใช่ `labels: string[]` แยก** — array คู่ขนาน
     TypeScript บังคับความยาวให้เท่ากันไม่ได้ ถ้าสองเส้นถูกสร้างคนละที่จะได้ป้ายผิดช่องแบบเงียบ ๆ
  2. `MeasureTextFn` **ไม่รับ `fontSizePx`** — ผู้สร้างต้อง bind ขนาดไว้แล้ว (curried)
     ถ้าให้ส่ง size เข้ามาด้วย จะมีตัวเลข 2 ที่ที่หลุดจากกันได้โดย type ไม่จับ
  3. **ห้าม `import` type จาก `app/admin/rich-menus/new/page.tsx`** เหตุผลที่ถูกต้องคือ
     **Phase 1 ห้ามแตะไฟล์นั้น** (acceptance criteria) — *ไม่ใช่* เพราะ `import type` มีต้นทุน runtime
     (`import type` ถูก erase ทั้งหมดตอน compile และโปรเจกต์เปิด `isolatedModules` อยู่แล้ว)
     ⚠️ นี่คือ **debt ที่ยอมรับชั่วคราว** — ดู TODO ใน Notes
- **VALIDATE**: `npx tsc --noEmit` ผ่าน

### Task 2: `frontend/lib/rich-menu/fonts.ts`

- **ACTION**: อ่าน font stack จาก CSS variable และโหลดฟอนต์ **ไทย** ให้ถูกไฟล์จริง
- **IMPLEMENT**:
  ```typescript
  export const THAI_FONT_CSS_VAR = '--font-noto-thai';

  /** ชื่อ family ที่เสถียรข้าม build — ใช้ยืนยันว่าฟอนต์ไทยโหลดจริง */
  export const THAI_FONT_CANONICAL_FAMILY = '"Noto Sans Thai"';

  /** ใช้เมื่ออ่าน CSS var ไม่ได้ — เอาเฉพาะส่วนที่ dev กับ prod ตรงกัน */
  export const FALLBACK_FONT_STACK = `"Noto Sans Thai", system-ui, sans-serif`;

  export const RICH_MENU_FONT_WEIGHT = 700;

  /** ต้องมีทั้งพยัญชนะไทย สระบน/ล่าง วรรณยุกต์ ทัณฑฆาต และ '…' (อยู่ใน subset latin) */
  export const FONT_PROBE_TEXT = 'กขคง ญ์ ปุ๊ ที่ …';

  export function resolveThaiFontFamily(rootStyle: CSSStyleDeclaration): string { ... }
  export async function ensureFontsReady(sampleText: string): Promise<void> { ... }
  export function assertCanvasFontApplied(ctx: CanvasRenderingContext2D, family: string, sizePx: number): void { ... }
  ```

  **`resolveThaiFontFamily`** — คืนค่าดิบ **อย่าตีความ อย่าแตะ quote**:
  ```typescript
  const raw = rootStyle.getPropertyValue(THAI_FONT_CSS_VAR).trim();
  return raw.length > 0 ? raw : FALLBACK_FONT_STACK;
  ```

  **`ensureFontsReady`** — โหลด **family ที่เสถียร** พร้อมข้อความไทย แล้วยืนยันจาก `FontFace[]` ที่คืนมา:
  ```typescript
  if (typeof document === 'undefined' || !document.fonts) return;   // jsdom
  const sample = FONT_PROBE_TEXT + sampleText;    // sampleText = ป้ายจริงทุกป้ายต่อกัน
  const faces = await document.fonts.load(
    `${RICH_MENU_FONT_WEIGHT} 100px ${THAI_FONT_CANONICAL_FAMILY}`,
    sample,
  );
  if (faces.length === 0 || faces.some((f) => f.status !== 'loaded')) {
    throw new Error('โหลดฟอนต์ไทย (Noto Sans Thai) ไม่สำเร็จ — ไม่สามารถสร้างภาพได้');
  }
  await document.fonts.ready;
  ```
  **นี่คือหลักฐานที่แท้จริงว่าฟอนต์ไทยพร้อม** — `load()` คืน array ของ `FontFace` ที่ *match จริง*
  ถ้าไม่มี face ไหนตรงเลย array จะว่าง ซึ่งเป็นสัญญาณที่ `check()` ให้ไม่ได้

  **`assertCanvasFontApplied`** — เหลือหน้าที่เดียว: ยืนยันว่า `ctx.font` ถูก parse สำเร็จ
  ```typescript
  const wanted = `${RICH_MENU_FONT_WEIGHT} ${sizePx}px ${family}`;
  ctx.font = wanted;
  // ถ้า parse ไม่ผ่าน spec สั่งให้ "ignore" → ค่าเดิมคงอยู่ (default '10px sans-serif')
  if (!ctx.font.includes(`${sizePx}px`)) {
    throw new Error('ตั้งค่าฟอนต์บน canvas ไม่สำเร็จ — ไม่สามารถสร้างภาพได้');
  }
  ```
- **MIRROR**: `ERROR_HANDLING` (ข้อความไทย), `NAMING_CONVENTION`
- **IMPORTS**: ไม่มี (web API ล้วน)
- **GOTCHA**:
  1. **ห้าม `.replace(/^['"]|['"]$/g, '')` ลอก quote** — ค่าจริงคือ font stack ที่มี quote หลายคู่
     การลอกหัวท้ายจะได้ quote ไม่บาลานซ์ → `ctx.font` invalid → **ถูกเมินเงียบ ๆ เหลือ `10px sans-serif`**
  2. **⚠️ ค่าของ CSS variable ต่างกันระหว่าง dev กับ production — ห้าม hardcode หรือ pin test กับค่าเดียว**
     ตรวจจาก `.next/` จริงในโปรเจกต์นี้:
     ```
     dev  : --font-noto-thai: 'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif
     prod : --font-noto-thai:"Noto Sans Thai",system-ui,sans-serif
     ```
     quote คนละแบบ ช่องว่างคนละแบบ และ **prod ไม่มี `'Noto Sans Thai Fallback'`**
     → ให้ถือค่านี้เป็น **opaque string** ส่งต่อเข้า `ctx.font` ตรง ๆ ห้ามแยกส่วน ห้ามเทียบเท่ากับค่าคงที่
     ส่วนที่เสถียรข้าม build มีแค่ `"Noto Sans Thai"` ซึ่งใช้เป็น `THAI_FONT_CANONICAL_FAMILY`
  3. **`document.fonts.load(font)` โดยไม่ส่ง text จะไม่เลือกและไม่รอไฟล์ไทย** เพราะ default text คือ
     `" "` (U+0020) ซึ่งอยู่ใน unicode-range ของไฟล์ latin ส่วนไทยเป็น `@font-face` คนละไฟล์ (`U+0E01-0E5B`)
     **หมายเหตุความแม่นยำ**: `layout.tsx` ตั้ง `preload: true` ดังนั้นเบราว์เซอร์อาจ *ดาวน์โหลด* ไฟล์ไทย
     ไว้แล้วจาก preload — แต่ **preload ไม่ใช่การรับประกันความพร้อม** และ `document.fonts.ready`
     ก็ไม่รอไฟล์ที่ `load()` ไม่เคยขอ → **ต้องส่งข้อความไทยเข้าไปเสมอ**
  4. `document.fonts.check()` คืน `true` เมื่อ **ไม่มี face ไหน match เลย** ด้วย →
     **ห้ามใช้เป็นหลักฐานว่าฟอนต์พร้อม** ให้ดู `FontFace[]` ที่ `load()` คืนมาแทน
  5. **การเทียบความกว้าง (width probe) พิสูจน์ไม่ได้ว่าเป็น Noto Sans Thai** — ถ้า Noto ล้มแล้วตกไปใช้
     Leelawadee UI (Windows) หรือ Thonburi (macOS) ความกว้างก็ยังต่างจาก monospace อยู่ดี → guard ผ่านทั้งที่ฟอนต์ผิด
     (REV 3 ใช้วิธีนี้ — REV 4 ถอดออกแล้ว) ใช้ได้แค่เป็น diagnostic รอง ไม่ใช่ gate
  6. `document.fonts` **ไม่มีใน jsdom** → guard ด้วย `typeof document === 'undefined' || !document.fonts`
  7. `ctx.fillText` เป็น **synchronous** — วาดด้วยฟอนต์ที่มี ณ วินาทีนั้น ไม่รอโหลด
- **VALIDATE**: unit test ของ `resolveThaiFontFamily` ผ่าน (Task 6)

### Task 3: `frontend/lib/rich-menu/text-layout.ts` — **หัวใจของเฟสนี้**

- **ACTION**: ตรรกะจัดวางข้อความไทยแบบ pure ทั้งหมด
- **IMPLEMENT**:
  ```typescript
  /** 96px บนภาพ 2500px ≈ 15 CSS px บนจอมือถือ 390pt — ขั้นต่ำที่อ่านไทยออก */
  export const MIN_FONT_SIZE_PX = 96;
  export const MAX_LINES = 2;
  export const FONT_STEP_PX = 2;
  export const THAI_LINE_HEIGHT_RATIO = 1.55;
  export const AREA_PADDING_RATIO = 0.12;
  export const ELLIPSIS = '…';

  export function normalizeLabel(raw: string): string;
  export function splitGraphemes(text: string): string[];
  export function segmentText(text: string, locale?: string): TextSegment[];
  export function toBreakableUnits(segments: readonly TextSegment[]): string[];
  export function wrapText(text: string, maxWidthPx: number, measure: MeasureTextFn): string[];
  export function truncateToWidth(line: string, maxWidthPx: number, measure: MeasureTextFn): string;
  export function fitTextToBox(
    text: string,
    box: { width: number; height: number },
    startFontSizePx: number,
    createMeasure: (fontSizePx: number) => MeasureTextFn,
    metricsFor: (fontSizePx: number) => { ascent: number; descent: number; lineHeight: number },
  ): { fontSizePx: number; lines: string[]; didTruncate: boolean };
  export function initialFontSize(box: { width: number; height: number }): number;
  ```

  **`normalizeLabel`** — ทำความสะอาดที่ boundary:
  ```typescript
  raw.normalize('NFC')
     .replace(/[   ]/g, ' ')     // NBSP → space ปกติ
     .replace(/[​‌‍﻿]/g, '') // ZWSP/ZWNJ/ZWJ/BOM ทิ้ง (แอดมินวางจาก CMS)
     .replace(/[ \t]+/g, ' ')                    // ยุบช่องว่าง แต่ **คง \n ไว้**
     .trim();
  ```

  **`splitGraphemes`** — มี fallback ที่ไม่พึ่ง `Intl.Segmenter` จริง ๆ:
  ```typescript
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text),
                      (s) => s.segment);
  }
  // fallback: regex cluster — พยัญชนะ/สระกินที่ + สระบน/ล่าง/วรรณยุกต์/ทัณฑฆาต ที่ตามมา
  const THAI_CLUSTER = /[ก-ะาำเ-ๆ][ัิ-ฺ็-๎]*/y;
  // ... วนจับทีละ cluster, ตัวที่ไม่ match ให้ตัดทีละ code point ด้วย codePointAt
  ```

  **`segmentText`** — คืน `TextSegment[]` เก็บ `isWordLike` ไว้:
  ```typescript
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(locale ?? 'th', { granularity: 'word' });
    return Array.from(seg.segment(text), (s) => ({ text: s.segment, isWordLike: s.isWordLike ?? false }));
  }
  // fallback: split ตามช่องว่าง; ถ้าไม่มีช่องว่างเลยให้ใช้ splitGraphemes
  // isWordLike = !/^[\s\p{P}]+$/u.test(text)
  ```

  **`toBreakableUnits`** — กฎ UAX #14 ที่ `Intl.Segmenter` ไม่ให้ (แก้ 3 ปัญหาด้วยกฎเดียว):
  ```typescript
  const THAI_LEAD_VOWELS = /[เ-ไ]$/;                   // เ แ โ ใ ไ ที่ท้ายหน่วย
  const NO_BREAK_BEFORE  = /^[ๆฯ๏๚๛ัิ-ฺ็-๎\s.,!?)\]}%:;…]/;

  export function toBreakableUnits(segments: readonly TextSegment[]): string[] {
    const out: string[] = [];
    for (const s of segments) {
      if (s.text === '') continue;
      const prev = out.at(-1);
      const mustJoin =
        prev !== undefined &&
        (THAI_LEAD_VOWELS.test(prev) || NO_BREAK_BEFORE.test(s.text));
      if (mustJoin) {
        out[out.length - 1] = prev + s.text;     // ห้ามใช้ out.at(-1) = ... (assign ไม่ได้)
      } else {
        out.push(s.text);
      }
    }
    return out;
  }
  ```
  **พฤติกรรมที่ต้องนิยามให้ครบ (REV 3 ขาดไป):**
  - **หน่วยแรกเป็นอักขระต้องห้าม** (ป้ายขึ้นต้นด้วย `ๆ`, `.`, combining mark, หรือช่องว่าง) →
    กฎนี้ผนวกเข้ากับหน่วยก่อนหน้าไม่ได้เพราะไม่มีหน่วยก่อนหน้า → **`normalizeLabel` ต้อง trim
    ทุก paragraph หลัง `split('\n')`** และถ้ายังเหลืออักขระต้องห้ามนำหน้า **ให้ปล่อยผ่าน**
    (แสดงตามที่แอดมินพิมพ์) ไม่ throw — การเตือนเป็นงานของ UI ใน Phase 3
  - **การแตกหน่วยที่กว้างเกิน ต้องไม่วน `toBreakableUnits` ซ้ำ** — ไม่งั้นจะจับกลับมาเป็นหน่วยกว้างเกินเดิมอีก
    ให้แปลงหน่วยที่กว้างเกินเป็น visual cluster **ครั้งเดียว** ด้วย `splitGraphemes` แล้วใช้ผลนั้นเลย

  **`wrapText`**:
  1. **`text === ''` → คืน `[]` ทันที** (นิยามชัดเจน ไม่ใช่ `['']` — ดู `fitTextToBox` ที่พึ่งค่านี้)
  2. `split('\n')` แล้ว **`.trim()` ทุก paragraph** — `\n` ที่แอดมินพิมพ์คือจุดขึ้นบรรทัดที่
     authoritative (deterministic ข้ามเบราว์เซอร์) paragraph ที่ trim แล้วว่างให้ข้ามไป
  3. แต่ละท่อน: `segmentText` → `toBreakableUnits` → greedy wrap
  4. **ต้องเรียก `measure(candidateLine)` กับสตริงเต็มบรรทัดที่กำลังจะได้ ทุกครั้ง**
     ห้ามบวกความกว้างของแต่ละ segment สะสม (shaping ของไทยไม่ additive)
  5. ถ้าหน่วยเดียวกว้างเกินกรอบแม้อยู่บนบรรทัดว่าง → **ต้องแตกด้วย `splitGraphemes` จริง ๆ**
     ไม่ใช่แค่ "ใส่ไปเลยแล้วขึ้นบรรทัดใหม่" (นั่นทำให้ loop จบ แต่ข้อความยังล้นกรอบ)
     และ **ห้ามส่งผลลัพธ์กลับเข้า `toBreakableUnits` อีกรอบ** (จะจับกลับเป็นหน่วยเดิม)

  **`truncateToWidth`** — ⚠️ **ต้องตัดระดับ grapheme ไม่ใช่ระดับคำ**:
  ```typescript
  export function truncateToWidth(
    line: string, maxWidthPx: number, measure: MeasureTextFn,
  ): string {
    if (measure(ELLIPSIS) > maxWidthPx) return '';        // แคบจนใส่ '…' ยังไม่ได้
    let units = splitGraphemes(line);                     // ← grapheme ไม่ใช่ segmentText()
    while (units.length > 0 && measure(units.join('').trimEnd() + ELLIPSIS) > maxWidthPx) {
      units.pop();
    }
    return units.join('').trimEnd() + ELLIPSIS;
  }
  ```
  **ทำไมต้องเป็น grapheme**: `segmentText()` คืนหน่วย *ระดับคำ* ป้ายไทยสั้นอย่าง "ประชาสัมพันธ์"
  เป็นคำเดียว ถ้ากว้างเกินเพราะ `…` แค่นิดเดียว → ลบหน่วยเดียวจบ → **เหลือแค่ `"…"`**
  ซึ่งขัดกับสิ่งที่ REV 2 แก้ไว้เอง (หน่วยที่กว้างเกินต้องแตกเป็น grapheme)

  **`fitTextToBox`** — แยกความล้มเหลว "บรรทัดเยอะ" ออกจาก "สูงเกิน" และเติม `…` เฉพาะเมื่อตัดจริง:
  ```typescript
  if (text === '') return { fontSizePx: startFontSizePx, lines: [], didTruncate: false };

  const pad    = Math.round(Math.min(box.width, box.height) * AREA_PADDING_RATIO);
  const availW = Math.max(0, box.width  - pad * 2);
  const availH = Math.max(0, box.height - pad * 2);

  let fontSizePx = Math.max(MIN_FONT_SIZE_PX, startFontSizePx);
  let lines = wrapText(text, availW, createMeasure(fontSizePx));

  const fits = (size: number, ls: string[]): boolean => {
    if (ls.length === 0) return true;
    const m = metricsFor(size);
    // ความสูงบล็อก = (n-1) × lineHeight + ascent + descent  ← ไม่ใช่ n × lineHeight
    const blockH = (ls.length - 1) * m.lineHeight + m.ascent + m.descent;
    const measure = createMeasure(size);
    return ls.length <= MAX_LINES && blockH <= availH && ls.every((l) => measure(l) <= availW);
  };

  // จำนวนรอบสูงสุดพิสูจน์ได้: ceil((start - MIN) / STEP) + 1
  while (fontSizePx > MIN_FONT_SIZE_PX && !fits(fontSizePx, lines)) {
    fontSizePx = Math.max(MIN_FONT_SIZE_PX, fontSizePx - FONT_STEP_PX);   // clamp ทุกรอบ
    lines = wrapText(text, availW, createMeasure(fontSizePx));
  }

  // ── ถึงขนาดต่ำสุดแล้วยังไม่พอดี: ต้องคำนวณว่า "สูงพอให้กี่บรรทัด" ไม่ใช่ตัดเป็น MAX_LINES ดื้อ ๆ
  const m = metricsFor(fontSizePx);
  const maxLinesByHeight = availH < m.ascent + m.descent
    ? 0
    : Math.floor((availH - m.ascent - m.descent) / m.lineHeight) + 1;
  const visibleLineCount = Math.min(MAX_LINES, maxLinesByHeight);

  if (visibleLineCount === 0) {
    return { fontSizePx, lines: [], didTruncate: true };   // ช่องเตี้ยเกินกว่าจะใส่อะไรได้
  }

  const measure = createMeasure(fontSizePx);
  const omittedLines = lines.length > visibleLineCount;
  lines = lines.slice(0, visibleLineCount);

  const lastTooWide = lines.length > 0 && measure(lines[lines.length - 1]) > availW;
  let didTruncate = false;

  if (omittedLines || lastTooWide) {
    lines[lines.length - 1] = truncateToWidth(lines[lines.length - 1], availW, measure);
    didTruncate = true;
  }
  ```
  **สิ่งที่แก้จาก REV 3**: เดิม `fits()` ล้มได้ 3 สาเหตุ (บรรทัดเยอะ / กว้างเกิน / **สูงเกิน**)
  แต่ทางแก้คือ "ตัดเหลือ `MAX_LINES` แล้วเติม `…`" เสมอ ซึ่ง (ก) **ไม่แก้กรณีสูงเกิน** —
  `ctx.clip()` แค่ซ่อนส่วนที่ล้น และ (ข) **เติม `…` ให้ป้าย 1 บรรทัดที่ครบถ้วนอยู่แล้ว**
  ทั้งที่ไม่มีอะไรถูกตัดออกไปเลย

  **`initialFontSize`** — REV 3 ประกาศแต่ signature ไม่เคยให้สูตร ทำให้ implement ไม่ได้จริง:
  ```typescript
  /** สัมประสิทธิ์เริ่มต้น — ปรับได้หลังเห็นภาพจริงใน Task 7 แต่ต้องมีค่าตั้งต้นที่ชัดเจน */
  export const INITIAL_FONT_SIZE_COEFFICIENT = 0.28;

  export function initialFontSize(box: { width: number; height: number }): number {
    const innerMin = Math.min(box.width, box.height) * (1 - 2 * AREA_PADDING_RATIO);
    return Math.max(
      MIN_FONT_SIZE_PX,
      Math.floor(innerMin * INITIAL_FONT_SIZE_COEFFICIENT),
    );
  }
  ```
  ตรวจกับช่องจริง: ช่อง 6 ปุ่ม 833×843 → `min = 833`, `innerMin = 833 × 0.76 ≈ 633`,
  `633 × 0.28 ≈ 177px` → เริ่มที่ 177 แล้วลดลงมาได้ถึง 96 (≈ 41 รอบ) สมเหตุสมผล
- **MIRROR**: `NAMING_CONVENTION`; ทุก export มี explicit return type
- **IMPORTS**: `import type { MeasureTextFn, TextSegment } from './types';`
- **GOTCHA**:
  1. **`text.split(' ')` ใช้กับไทยไม่ได้** — ไม่มีช่องว่าง ทั้งประโยคเป็น token เดียว
  2. **`granularity: 'grapheme'` ยังไม่พอ** — สระหน้า เ แ โ ใ ไ เป็นอักขระ *spacing* ไม่ใช่ combining mark
     UAX #29 แยกเป็น cluster ของตัวเอง (`'เก'` → `["เ","ก"]`) ถูกตามสเปกแต่ผิดตามสายตาคนไทย
     → **ต้องผ่าน `toBreakableUnits()` เสมอ** ไม่งั้นจะได้บรรทัดจบด้วย "เ" ลอย ๆ
  3. **fallback path ห้ามเรียก `Intl.Segmenter`** — สาขานั้นทำงานก็ต่อเมื่อ `Intl.Segmenter` ไม่มี
     (REV 1 เขียนขัดกันเองตรงนี้) ใช้ regex cluster แทน
  4. `str.length`, `Array.from(str)`, `[...str]`, `slice()` **ไม่ปลอดภัยกับไทยทั้งหมด** —
     `'ที่'.length === 3`, `Array.from('ที่').length === 3`, `'แจ้งเบาะแส'.slice(0,5) === 'แจ้งเ'` (สระหน้าค้าง)
     ใช้ `splitGraphemes` + `toBreakableUnits` เท่านั้น
  5. **ไม่มีระบบยัติภังค์ในภาษาไทย** — ห้ามเติม `-` ตอนตัดกลางคำเด็ดขาด
  6. ห้ามเรียก `ctx.measureText` ในไฟล์นี้ — รับ `createMeasure` เข้ามาเท่านั้น
  7. `normalizeLabel` ต้อง **คง `\n` ไว้** (เป็น break hint) แต่ยุบ space/tab
  8. **`NFC` ไม่แก้กรณีพิมพ์สลับลำดับ** (วรรณยุกต์มาก่อนสระบน) เพราะสระบนไทย U+0E34-0E37 มี ccc = 0
     จึงไม่มี canonical ordering → ถ้าจะเตือนต้อง validate เอง `/[่-๋][ิ-ื]/` (เลื่อนไป Phase 3 ที่มี UI)

  9. **`MIN_FONT_SIZE_PX = 96` และ `MAX_LINES = 2` ตัดสินใจแล้ว ห้ามลดลง**
     ภาพกว้าง 2500px ถูกย่อบนจอมือถือ 390pt ≈ **6.4 เท่า** → `96 × (390/2500) ≈ 15 CSS px`
     ซึ่งเป็นขั้นต่ำที่อ่านไทยออก (ค่าเดิม 28px = **4.4 CSS px** — ที่ขนาดนั้นสิ่งที่แยก ข/ช, ด/ค, ผ/ฝ
     คือ "หัว" เล็ก ๆ และวรรณยุกต์ ่/้/๊/๋ ต่างกันแค่จำนวนขีด จะกลายเป็นจุดเดียวกันหมด
     → "มีตัวหนังสือแต่อ่านไม่ออก" ซึ่งแย่กว่าถูกตัดด้วย "…")

  > **ตรวจแล้วว่าไม่บีบเกินไป**: ช่อง large 6 ปุ่ม = 833×843, padding `0.12 × 833 ≈ 100` → availH ≈ 643
  > ส่วน 2 บรรทัดที่ 96px ใช้ `1 × 150 + 102 + 43 ≈ 295` → เหลือที่อีกมาก
  >
  > ⚠️ **`MAX_LINES = 2` เป็น product constraint ไม่ใช่ข้อจำกัดทางเรขาคณิต** — ที่ 96px
  > 3 บรรทัดใช้ ~445px และ 4 บรรทัดใช้ ~595px ซึ่ง **ยังพอดีใน 643px ทั้งคู่** ค่า 2 มาจาก
  > การตัดสินใจว่าป้ายเมนูควรสั้น ไม่ได้มาจากพื้นที่ ถ้าจะเปลี่ยนภายหลังทำได้โดยไม่ผิดเรขาคณิต
  >
  > ⚠️ **96px ≈ 15 CSS px คิดบนจอ 390pt เท่านั้น** — บนจอเล็กสุดที่รองรับ (320pt) จะเหลือ
  > `96 × 320/2500 ≈ 12.3 CSS px` ตัวเลขนี้ยัง **ไม่ได้ผ่านการทดสอบกับผู้ใช้ไทยจริง**
  > ให้ถือเป็นค่าตั้งต้นที่ต้องยืนยันใน usability test ไม่ใช่ข้อพิสูจน์
  >
  > **ผลข้างเคียงที่ยอมรับแล้ว**: ป้ายยาวจะถูกตัดด้วย "…" เร็วขึ้นมาก — และเมื่อถูกตัด
  > **เนื้อหาบางส่วนหายไปจริง** จึงห้ามอ้างว่าค่าชุดนี้รับประกัน "ทุกป้ายอ่านออกครบถ้วน"
  > มันรับประกันแค่ว่า *สิ่งที่แสดง* อ่านออก
  > **การแก้ที่ต้นเหตุอยู่ใน Phase 3** — เตือนแอดมินตั้งแต่ตอนพิมพ์ว่าป้ายจะถูกตัด เพื่อให้เขาย่อป้ายเอง
  > แทนที่ระบบจะย่อฟอนต์เงียบ ๆ แล้วไปเห็นตอนขึ้น LINE แล้ว (ป้ายในเมนู LINE ควรสั้นโดยธรรมชาติอยู่แล้ว)

- **VALIDATE**: unit test ทั้งหมดใน Task 5 ผ่าน

### Task 4: `frontend/lib/rich-menu/render.ts`

- **ACTION**: วาด canvas จริงและแปลงเป็น Blob พร้อม runtime guard เรื่องฟอนต์
- **IMPLEMENT**:
  ```typescript
  export const MAX_RICH_MENU_BYTES = 1024 * 1024;   // LINE จำกัด 1 MB

  export async function renderRichMenuImage(options: RenderRichMenuOptions): Promise<Blob> {
    // 1. ตรวจ options: width/height ต้อง finite และ > 0 ไม่งั้น throw
    // 2. สร้าง canvas + ctx (throw ถ้า !ctx)
    // 3. โหลดฟอนต์ให้ครบก่อน — เรียกเองภายใน ไม่ปล่อยให้ผู้เรียกจำลำดับ
    //    await ensureFontsReady(options.areas.map(a => a.label).join(''));  ← throw ถ้าฟอนต์ไทยไม่โหลด
    // 4. assertCanvasFontApplied(ctx, options.fontFamily, 100)              ← throw ถ้า ctx.font parse ไม่ผ่าน
    // 5. fillStyle = colors.background; fillRect เต็มผืน
    // 6. วนทุก area (ดูโค้ดด้านล่าง)
    // 7. toBlob('image/png') ห่อ Promise
    // 8. ถ้า blob.size > MAX_RICH_MENU_BYTES → throw Error ภาษาไทยพร้อมขนาดจริง
  }
  ```

  **การวาดต่อ area** — ใช้ `fontBoundingBox*` (คงที่) ไม่ใช่ `actualBoundingBox*` (แปรผัน):
  ```typescript
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';        // ตั้งก่อน measure เสมอ

  /** ?? จับได้แค่ null/undefined ไม่จับ NaN — ต้องใช้ Number.isFinite */
  const finiteOr = (v: number | undefined, fallback: number): number =>
    Number.isFinite(v) && (v as number) >= 0 ? (v as number) : fallback;

  const metricsFor = (size: number) => {
    ctx.font = `${RICH_MENU_FONT_WEIGHT} ${size}px ${options.fontFamily}`;
    const m = ctx.measureText('ปุ๊ญ์');
    const ascent  = finiteOr(m.fontBoundingBoxAscent,  size * 1.061);
    const descent = finiteOr(m.fontBoundingBoxDescent, size * 0.450);
    const lineHeight = ascent + descent > 0
      ? Math.ceil((ascent + descent) * 1.03)
      : Math.ceil(size * THAI_LINE_HEIGHT_RATIO);
    return { ascent, descent, lineHeight };
  };

  const createMeasure = (size: number): MeasureTextFn => (text) => {
    ctx.font = `${RICH_MENU_FONT_WEIGHT} ${size}px ${options.fontFamily}`;   // ตั้งใหม่ทุกครั้ง
    return ctx.measureText(text).width;
  };

  for (const area of options.areas) {
    const b = area.bounds;
    const { fontSizePx, lines } = fitTextToBox(
      normalizeLabel(area.label), b, initialFontSize(b), createMeasure, metricsFor,
    );
    const { ascent, descent, lineHeight } = metricsFor(fontSizePx);

    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.width, b.height);
    ctx.clip();                                    // ตาข่ายกันสุดท้าย เผื่อ glyph overhang

    ctx.fillStyle = options.colors.text;
    ctx.font = `${RICH_MENU_FONT_WEIGHT} ${fontSizePx}px ${options.fontFamily}`;

    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const blockH = (lines.length - 1) * lineHeight + ascent + descent;
    const firstBaselineY = cy - blockH / 2 + ascent;

    lines.forEach((line, i) => ctx.fillText(line, cx, firstBaselineY + i * lineHeight));
    ctx.restore();
  }
  ```
- **MIRROR**: `CANVAS_PATTERN`, `ERROR_HANDLING`, `RESOURCE_CLEANUP` (`save`/`restore` เป็นคู่)
- **IMPORTS**:
  ```typescript
  import type { RenderRichMenuOptions, MeasureTextFn } from './types';
  import { ensureFontsReady, assertCanvasFontApplied, RICH_MENU_FONT_WEIGHT } from './fonts';
  import { fitTextToBox, initialFontSize, normalizeLabel, THAI_LINE_HEIGHT_RATIO } from './text-layout';
  ```
- **GOTCHA**:
  1. **ต้องตั้ง `ctx.font` ใหม่ทุกครั้งก่อน `measureText`** — canvas state เป็น global
  2. **`renderRichMenuImage` เรียก `ensureFontsReady` เองภายใน** — ห้ามทำเป็นสัญญาที่บังคับผ่าน JSDoc
     เพราะถ้าผู้เรียกลืม await ผลคือฟอนต์ fallback เงียบ ๆ ที่อาจดูใกล้เคียงพอจะผ่าน QA ผิวเผิน
  3. `actualBoundingBox*` **ผูกกับสตริง** — "ติดต่อ" (มีวรรณยุกต์) กับ "ขอรับ" (ไม่มี) ได้ ascent ต่างกัน
     ถ้าใช้คำนวณ offset ต่อช่อง ป้าย 6 ช่องจะลอยสูงต่ำไม่เท่ากัน **ดูพังกว่า** เอียงเท่ากันทั้งกริด
     → ใช้ `fontBoundingBox*` เท่านั้น ถ้าอยากชดเชย optical ให้บวก **ค่าคงที่ตัวเดียวทั้งภาพ**
  4. MDN ระบุว่า `actualBoundingBoxAscent` วัดจากเส้นที่ `textBaseline` ปัจจุบันชี้อยู่ →
     ต้องตั้ง `textBaseline` **ก่อน** measure เสมอ
  5. **ห้ามใช้ใน server component** — มี `document` ต้องอยู่ใน `"use client"` เท่านั้น
  6. **อย่าตั้ง `canvas.style.width`** — จะเปลี่ยนขนาดที่ export
     และ **ไม่ต้องคูณ devicePixelRatio** เพราะนี่คือ off-screen canvas ที่ขนาดตรงสเปก LINE เป๊ะ
     ไม่ได้แสดงผลบนจอ (คนที่เคยชินกับ on-screen canvas มักเผลอคูณ)
  7. **ห้ามตั้ง `ctx.letterSpacing`** — ค่าที่ไม่ใช่ 0 จะแทรกช่องว่างระหว่าง base กับ combining mark
     ในบางเบราว์เซอร์ ทำให้สระ/วรรณยุกต์ลอยเยื้อง
- **VALIDATE**: `npx tsc --noEmit` ผ่าน + `npx playwright test rich-menu-render` เขียว (Task 7)

### Task 5: `frontend/lib/rich-menu/__tests__/text-layout.test.ts`

- **ACTION**: เทสต์ตรรกะจัดวางด้วย **invariant** ไม่ใช่ค่าคาดหวังตายตัว
- **IMPLEMENT**:

  **fake measure ต้องมี 3 ตัว** ไม่ใช่ตัวเดียว:
  ```typescript
  const THAI_ZERO_WIDTH = /[ัิ-ฺ็-๎]/;

  /** จำลองไทยจริง: combining mark มี advance = 0 */
  const thaiMeasure = (size: number): MeasureTextFn => (t) =>
    Array.from(t).reduce((w, ch) => w + (THAI_ZERO_WIDTH.test(ch) ? 0 : size * 0.55), 0);

  /** จับสมมติฐาน additivity: ความกว้างไม่ใช่ผลรวมของชิ้นส่วน */
  const nonAdditiveMeasure = (size: number): MeasureTextFn => (t) =>
    thaiMeasure(size)(t) + size * 0.08;

  /** จับ off-by-one: ทุกอย่างกว้างสุดขั้ว */
  const hugeMeasure = (size: number): MeasureTextFn => (t) => Array.from(t).length * size * 2;
  ```

  **Thai fixtures — import จาก `@/lib/constants/categories.ts` เป็นหลัก ห้ามแต่งเอง**:
  ```typescript
  export const THAI_FIXTURES = {
    longestReal:  'ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด',  // ป้ายจริง ไม่มีช่องว่าง
    noSpaces:     'แจ้งเบาะแสยาเสพติด',
    withSlash:    'ร้องเรียน/ร้องทุกข์',
    leadVowels:   'ไกล่เกลี่ยระงับข้อพิพาท',      // ไ, เ กลางคำ
    stackedTones: 'ผู้ใหญ่บ้านเปรี๊ยะฟื้นฟู',       // ู+้ ล่าง+บน, ี+๊ สองชั้นบน
    karan:        'สิทธิ์และโทรศัพท์วันจันทร์',      // ์ ทัณฑฆาต
    maiyamok:     'บริการอื่น ๆ',                 // "ๆ" ห้ามขึ้นต้นบรรทัด
    mixedLatin:   'ติดต่อ LINE OA 24 ชม.',
    zwsp:         'แจ้ง​เบาะแส',            // แอดมินวางจาก CMS
    nbsp:         'ขอ ความ ช่วยเหลือ',
    explicitBreak:'แจ้งเบาะแส\nยาเสพติด',         // \n เป็น break hint
    unbreakable:  'ประชาสัมพันธ์',
    empty:        '',
    spacesOnly:   '   ',
  };
  ```

  **Invariant — ⚠️ แยกชุดตามฟังก์ชัน ห้ามรันชุดเดียวกับทั้งสองตัว**

  REV 3 สั่งให้รัน 7 ข้อกับทุกอย่าง ซึ่ง**เป็นไปไม่ได้**: `fitTextToBox` ที่ตัดข้อความย่อม
  ทำให้ grapheme หายและเพิ่ม `…` เข้ามา → ข้อ 1 กับ 4 ขัดกับข้อ 6-7 โดยตรง

  **ชุด A — `wrapText` (ห้ามมีข้อมูลหาย)** รันทุก fixture × ทุก fake measure:
  ```
  A1. join(lines) หลังถอด whitespace ที่จุด wrap = input ที่ normalize แล้ว — เทียบแบบ
      "ลำดับ grapheme ตรงกันเป๊ะ" ไม่ใช่เทียบเซต (เซตจับ 'กกข' vs 'กข' ไม่ได้)
  A2. ไม่มีบรรทัดใดจบด้วยสระหน้า [เ-ไ]
  A3. ไม่มีบรรทัดใดขึ้นต้นด้วย [ๆฯัิ-ฺ็-๎\s.]  (ยกเว้นกรณีที่ input เองขึ้นต้นด้วยอักขระนั้น)
  A4. ไม่มี grapheme cluster ใดถูกผ่ากลาง — ทุก cluster ใน output ต้องปรากฏครบใน input
  A5. wrapText('') === []   และ wrapText('   ') === []
  ```

  **ชุด B — `fitTextToBox` (ตัดได้ แต่ต้องเป็น prefix)**:
  ```
  B1. output เป็น "prefix ตามลำดับของ input" + '…' ที่เป็นทางเลือก
      (ไม่ใช่ "เท่ากับ input" เพราะการตัดคือพฤติกรรมที่ตั้งใจ)
  B2. lines.length <= MAX_LINES และ fontSizePx >= MIN_FONT_SIZE_PX เสมอ
  B3. เมื่อ didTruncate === true บรรทัดสุดท้าย (รวม '…' แล้ว) ต้องยัง <= availW
  B4. เมื่อ didTruncate === false ต้อง**ไม่มี** '…' ต่อท้าย และ join(lines) = input ครบถ้วน
      ← ข้อนี้จับบั๊ก REV 3 ที่เติม '…' ให้ป้าย 1 บรรทัดที่ครบถ้วนอยู่แล้ว
  B5. fitTextToBox('', ...) → { lines: [], didTruncate: false }
  B6. ช่องเตี้ยกว่า ascent+descent → { lines: [], didTruncate: true } ไม่ throw
  ```

  **ชุด C — การจบของลูป (ต้องมี seam ให้นับได้)**:
  ```
  C1. จำนวนรอบของ auto-shrink ต้อง <= ceil(max(0, start - MIN) / FONT_STEP_PX) + 1
      → ห่อ createMeasure ด้วย counter ใน test เพื่อสังเกตได้จริง
        ("จบใน < N รอบ" ของ REV 3 วัดไม่ได้เพราะไม่มี seam)
  C2. ทุก fixture × ทุก fake measure ต้องจบ ไม่ค้าง
  ```
- **MIRROR**: `TEST_STRUCTURE`
- **IMPORTS**: `import { describe, expect, it } from 'vitest';` + import fixtures จริงจาก `@/lib/constants/categories`
- **GOTCHA**:
  1. **ห้าม assert ผลตัดคำแบบเป๊ะ ๆ** — `Intl.Segmenter` ใช้ ICU คนละเวอร์ชันระหว่าง
     Node (ICU4C) / Safari (ICU-Apple) / Firefox 125+ (**ICU4X** ซึ่งไทยอาจใช้โมเดล LSTM)
     ตัวอย่าง: Node ซอย `'ยาเสพติด'` เป็น `"ยา"|"เสพ"|"ติด"` ทั้งที่คนไทยมองเป็นคำเดียว
  2. **ห้าม assert `measure(line) <= maxWidth` ด้วย measure ตัวเดียวกับที่ใช้ตัดบรรทัด** —
     เป็น tautology ผ่านเสมอโดยนิยาม ไม่ได้พิสูจน์อะไร ให้ assert invariant 1-7 แทน
  3. fake measure แบบ `Array.from(text).length * size * 0.6` (REV 1) **จำลองไทยผิด** —
     combining mark มี advance = 0 แต่ `Array.from` นับมันเป็นตัวเต็ม → ประเมินความกว้าง
     **เกินจริง 2-3×** สำหรับคำที่มีสระ/วรรณยุกต์เยอะ เทสต์จะไม่เคยเข้า path ที่ของจริงกว้างกว่าที่โมเดลคิด
- **VALIDATE**: `npx vitest run lib/rich-menu` เขียว

### Task 6: `frontend/lib/rich-menu/__tests__/fonts.test.ts`

- **ACTION**: เทสต์การอ่าน CSS variable
- **IMPLEMENT**:
  ```typescript
  const fakeStyle = (value: string) =>
    ({ getPropertyValue: () => value }) as unknown as CSSStyleDeclaration;

  /** ⚠️ dev กับ prod ให้ค่าไม่เหมือนกัน — ต้องเทสต์ทั้งคู่ ห้าม pin ค่าเดียว */
  const DEV_VALUE  = `'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif`;
  const PROD_VALUE = `"Noto Sans Thai",system-ui,sans-serif`;
  ```
  เคสที่ต้องมี:
  - `DEV_VALUE` และ `PROD_VALUE` ต้องถูกคืน **เหมือนเดิมทุกตัวอักษร** (ไม่มีการลอก quote)
  - มี whitespace นำหน้า/ต่อท้าย → ถูก trim แต่เนื้อในไม่เปลี่ยน
  - ค่าว่าง → คืน `FALLBACK_FONT_STACK`
  - **จำนวน quote (`'` และ `"`) ในผลลัพธ์ต้องเป็นเลขคู่ทั้งสองชนิด** ← กันคนกลับมาใส่ regex ลอก quote
  - **ห้าม assert ว่าผลลัพธ์เท่ากับสตริงคงที่ตัวใดตัวหนึ่ง** — ค่านี้เป็น build artifact ที่เปลี่ยนได้
    ให้ assert *คุณสมบัติ* (คืนค่าที่รับมาโดยไม่แก้ / quote บาลานซ์ / ว่างแล้ว fallback) เท่านั้น
- **MIRROR**: `TEST_STRUCTURE`
- **IMPORTS**: `import { resolveThaiFontFamily, FALLBACK_FONT_STACK } from '../fonts';`
- **GOTCHA**: **ห้ามเทสต์ `ensureFontsReady` / `assertCanvasFontApplied`** — `document.fonts` ไม่มีใน jsdom
  เทสต์ได้แค่ว่ามัน return เงียบ ๆ ไม่ throw เมื่อไม่มี `document.fonts`
- **VALIDATE**: `npx vitest run lib/rich-menu` เขียว

### Task 7 (**บังคับ ไม่ใช่ optional**): Playwright smoke test ในเบราว์เซอร์จริง

> **ทำไมเปลี่ยนจาก "ทำก็ได้ แล้วลบทิ้ง" เป็น "บังคับ และเก็บถาวร"**
> `render.ts` ไม่มี unit test ได้เลยตามข้อจำกัดของ jsdom — ถ้าลบ harness ทิ้ง
> จะ **ไม่เหลืออะไรตรวจสิ่งเหล่านี้อีกเลยตลอดไป**: ฟอนต์ถูก activate จริงไหม,
> `ctx.font` parse ผ่านไหม, text metrics ของเบราว์เซอร์, การ shaping ภาษาไทย,
> ตำแหน่ง baseline, การสร้าง PNG และขนาดภาพ, `clip()`, ขนาดไฟล์
> fake measure ที่ inject เข้าไปทำให้เทสต์เขียวได้ทั้งที่ฟีเจอร์พังจริง
> และ runtime guard ครอบได้แค่เรื่องฟอนต์ ไม่ครอบ layout/PNG/เบราว์เซอร์

- **ACTION**: เขียน Playwright test ถาวรที่รัน `renderRichMenuImage` ในเบราว์เซอร์จริง
- **IMPLEMENT**: `frontend/e2e/rich-menu-render.spec.ts` + หน้า harness
  `frontend/app/admin/rich-menus/dev-preview/page.tsx` (`"use client"`) ที่ expose ผลลัพธ์
  ให้ test อ่านได้ เรียก `renderRichMenuImage` ด้วย `PRESET_TEMPLATES` + ป้ายจาก `THAI_FIXTURES`
- **สิ่งที่ต้อง assert**:
  1. `ensureFontsReady` สำเร็จ — `document.fonts.check('700 96px "Noto Sans Thai"', 'กขค')` เป็น true
  2. `blob.type === 'image/png'`
  3. ขนาดภาพตรงเป๊ะ — 2500×1686 (large) และ 2500×843 (compact)
  4. `blob.size <= 1 MB`
  5. ภาพที่ได้มีพิกเซลที่ไม่ใช่สีพื้น (พิสูจน์ว่ามีตัวหนังสือถูกวาดจริง ไม่ใช่ผืนเปล่า)
  6. ป้ายยาว (`longestReal`) — พิกเซลตัวอักษรทั้งหมดอยู่ในกรอบ `bounds` ของ area ตัวเอง
     ไม่ล้นไปช่องข้าง
- **GOTCHA**:
  1. **ห้ามใช้ชื่อ `_dev-preview`** — Next.js App Router ถือว่าโฟลเดอร์ขึ้นต้น `_` เป็น
     *private folder* ที่ **ไม่ถูก route** (repo นี้ใช้ convention นี้อยู่แล้วที่
     `live-chat/_components`, `_context`, `_hooks`, `_lib`) เปิดแล้วจะได้ 404
  2. `/admin` มี `useAuth()` ครอบทุก route อยู่แล้ว (`frontend/app/admin/layout.tsx`)
     → test ต้อง login ก่อน หรือใช้ storageState ตามที่ e2e อื่นในโปรเจกต์ทำ
  3. Playwright ติดตั้งอยู่แล้ว (`@playwright/test`) ไม่ต้องลง package ใหม่
- **VALIDATE**: `npx playwright test rich-menu-render` เขียว + เปิดภาพดูด้วยตาแล้วอ่านไทยออกครบ

---

## Validation Commands

รันใน **WSL** ตามข้อกำหนดของโปรเจกต์ (`cd frontend` ก่อน)

```bash
cd frontend && npx tsc --noEmit                    # EXPECT: 0 errors
cd frontend && npx eslint lib/rich-menu            # EXPECT: 0 errors
cd frontend && npx vitest run lib/rich-menu        # EXPECT: ผ่านทั้งหมด
cd frontend && npx vitest run                      # EXPECT: ไม่มี regression
cd frontend && npx playwright test rich-menu-render # EXPECT: เขียว (ต้องมี dev server รันอยู่)
cd frontend && npm run build                       # EXPECT: build สำเร็จ
```

**Database Validation**: N/A — ไม่แตะ database

**Browser Validation**: `cd frontend && npm run dev` แล้วเปิด `/admin/rich-menus/dev-preview`

> **GOTCHA (จาก memory ของโปรเจกต์)**: Next dev server ใน WSL **มองไม่เห็น** การแก้ไฟล์จากฝั่ง
> Windows (ไม่มี inotify ข้าม 9p) → ต้อง **restart dev server** ก่อนตรวจผลทุกครั้ง

### Manual Validation

- [ ] อ่านป้ายภาษาไทยออกครบทุกช่อง **และยืนยันว่าเป็น Noto Sans Thai จริง** (ไทยมีหัว — ถ้าได้
      Leelawadee UI บน Windows หรือ Thonburi บน macOS แปลว่า fallback แปลว่า guard ไม่ทำงาน)
- [ ] คำที่มีสระบน+วรรณยุกต์ ("ผู้ใหญ่บ้าน", "เปรี๊ยะ", "ฟื้นฟู") แสดงครบ ไม่ถูกตัดบน/ล่าง
- [ ] **ไม่มีบรรทัดใดจบด้วยสระหน้า** (เ แ โ ใ ไ) และไม่มีบรรทัดใดขึ้นต้นด้วย "ๆ" หรือ "."
- [ ] ป้ายหลายบรรทัด — วรรณยุกต์บรรทัดล่างไม่ชนสระล่างบรรทัดบน
- [ ] ป้ายยาว (`longestReal`, 46 อักขระ) ถูกย่อ/ตัดอย่างสวยงาม ไม่ล้นกรอบ ไม่ทับช่องข้าง
- [ ] ป้ายสั้น ("ติดต่อ") ยังได้ฟอนต์ใหญ่ อ่านง่าย
- [ ] ครบทั้ง large (1686) และ compact (843)
- [ ] `3-buttons-left` (ช่องขนาดไม่เท่ากัน) — ช่องเล็กได้ฟอนต์เล็กลงเอง
- [ ] ขนาดไฟล์ ≤ 1 MB
- [ ] ปิด `Intl.Segmenter` ใน DevTools (`delete Intl.Segmenter`) แล้ว reload — ยังวาดได้
      **และสระ/วรรณยุกต์ยังติดกับพยัญชนะ** (ทดสอบ regex cluster fallback)
- [ ] จำลองฟอนต์ไม่โหลด (block request ฟอนต์ใน DevTools) — **ต้อง throw ไม่ใช่วาดเงียบ ๆ**

---

## Acceptance Criteria

- [ ] Task 1-7 เสร็จครบ (**Task 7 บังคับ** — ไม่ใช่ optional และไม่ลบทิ้ง)
- [ ] `npx tsc --noEmit` / `npx eslint lib/rich-menu` ไม่มี error
- [ ] `npx vitest run` ผ่านทั้งหมด ไม่มี regression
- [ ] `npx playwright test rich-menu-render` เขียว
- [ ] `npm run build` สำเร็จ
- [ ] Manual validation ผ่านครบ **โดยเฉพาะข้อยืนยันว่าเป็น Noto Sans Thai จริง**
- [ ] **`git diff` ต้องไม่มีไฟล์ใน `app/admin/rich-menus/new/` หรือ `backend/` เลย**
- [ ] ค่า `MIN_FONT_SIZE_PX = 96` และ `MAX_LINES = 2` ไม่ถูกลดลงระหว่าง implement

## Completion Checklist

- [ ] ทุก export มี explicit return type
- [ ] ข้อความ error เป็นภาษาไทย
- [ ] `ctx.save()`/`ctx.restore()` เป็นคู่กันเสมอ
- [ ] ไม่มี `console.log` / `console.error` ใน `lib/rich-menu/`
- [ ] ไม่มี magic number — `FONT_STEP_PX`, `RICH_MENU_FONT_WEIGHT`, `THAI_LINE_HEIGHT_RATIO` เป็น const
- [ ] `text-layout.ts` **ไม่มี** การอ้างถึง `document`, `canvas`, หรือ `ctx` เลย
- [ ] ไม่มีการลอก quote ออกจากค่า CSS variable ที่ไหนเลย
- [ ] ไม่ได้ลง package ใหม่ (`git diff package.json` ว่าง)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ฟอนต์ไทยไม่ถูกโหลด/ไม่ถูกใช้ แล้ววาดเงียบ ๆ ด้วยฟอนต์ระบบ | **H** | **H** | `ensureFontsReady` ส่ง Thai text แล้ว **ตรวจ `FontFace[]` ที่ `load()` คืนมา** (`length === 0` หรือ `status !== 'loaded'` = throw) + Playwright test (Task 7) assert `document.fonts.check()` ในเบราว์เซอร์จริง + manual check ว่าไทย "มีหัว" |
| `ctx.font` invalid แล้วถูกเมิน เหลือ `10px sans-serif` | M | **H** | `assertCanvasFontApplied` — round-trip ตรวจว่า `ctx.font` มี `${sizePx}px` จริงหลัง assign |
| `system-ui` ใน stack ถูก canvas parser บางตัวปฏิเสธ → ทั้งสตริง invalid | L | **H** | guard เดียวกัน + `FALLBACK_FONT_STACK` |
| ผลตัดคำต่างกันข้ามเบราว์เซอร์ → PNG จากป้ายเดียวกันขึ้นบรรทัดไม่เหมือนกัน | **H** | M | รองรับ `\n` เป็น break hint ที่ deterministic + assert invariant ไม่ใช่ผลลัพธ์เป๊ะ |
| `wrapText` วนไม่รู้จบ / ข้อความล้นกรอบ | M | **H** | แตกด้วย `splitGraphemes` จริง + invariant 5 และ 7 + `clip()` เป็นตาข่ายสุดท้าย |
| นักพัฒนาเผลอทำ Phase 3 (UI) ไปด้วย | M | M | acceptance criteria มีข้อ `git diff` |
| `render.ts` ไม่มี automated test ตลอดไป | ~~M~~ **ปิดแล้ว** | H | Task 7 เปลี่ยนเป็น **Playwright test ถาวรที่บังคับต้องมี** ครอบ font activation / PNG / ขนาด / clip / ขนาดไฟล์ |

## Notes

**ทำไมแยก `text-layout.ts` ออกจาก `render.ts`**
`frontend/vitest.config.ts` ตั้ง `environment: 'jsdom'` และโปรเจกต์ไม่ได้ลง package `canvas`
→ `canvas.getContext('2d')` คืน `null` ใน vitest (ยืนยันด้วยการรันจริงกับ jsdom 25.0.1 ของโปรเจกต์)
การรับ `createMeasure` เป็นพารามิเตอร์ทำให้ตรรกะที่ซับซ้อนที่สุดเทสต์ได้เต็มที่

**ราคาที่ต้องจ่ายของการแยกนี้ (สำคัญ)**
ความเสี่ยงทั้งหมดเรื่องฟอนต์ถูกย้ายไปอยู่ใน `render.ts` ซึ่ง **unit test เข้าไม่ถึง** ถ้าฟอนต์ไทย
ไม่โหลด เทสต์ทุกเคสยังเขียวแต่ภาพผิด — จึงต้องปิดด้วย **สองชั้นพร้อมกัน**:
1. **runtime guard** (`ensureFontsReady` ตรวจ `FontFace[]` + `assertCanvasFontApplied` ตรวจ round-trip)
   — ครอบเรื่องฟอนต์
2. **Playwright test ถาวร (Task 7, บังคับ)** — ครอบสิ่งที่ guard ครอบไม่ได้: layout, PNG,
   ขนาดภาพ, `clip()`, ขนาดไฟล์, text metrics และ shaping ของเบราว์เซอร์จริง

**"pure logic เทสต์ได้ 100%" เป็นคำที่ถูกเฉพาะกับ `text-layout.ts`** — ไม่ใช่กับตัวฟีเจอร์
อย่าใช้ประโยคนี้อธิบายทั้งเฟส

**TODO Phase 3 — ลบ type duplication**
Phase 1 คัดลอกรูปทรง `TemplateBounds`/`TemplateArea` มาไว้ใน `lib/rich-menu/types.ts`
เพราะห้ามแตะ `new/page.tsx` **นี่คือ debt** TypeScript แบบ structural typing จะไม่ error เตือน
เมื่อฝั่งหนึ่งเพิ่ม field เมื่อ Phase 3 ต้องแตะ `new/page.tsx` อยู่แล้ว ให้ย้าย type ไปไว้ที่เดียว
แล้วให้ `new/page.tsx` import กลับมา — ตรงกับ pattern ที่ `CLAUDE.md` กำหนดไว้สำหรับ
`lib/constants/` (categories/agencies นิยามครั้งเดียว ใช้ทั้ง admin และ LIFF)

**บทเรียนที่ยกมาจาก LINE MCP โดยตรง**
`src/tools/createRichMenu.ts:257-338` (repo ภายนอก) แยกการคำนวณพิกัดปุ่มออกจาก layout จริงที่อยู่ใน CSS
→ แก้ที่หนึ่งโดยไม่แก้อีกที่ = ปุ่มกดไม่ตรง และไม่มีเทสต์จับ แผนนี้จึงบังคับให้ `render.ts` รับ
`areas[].bounds` **ชุดเดียวกับที่ `new/page.tsx:314-317` ส่งให้ LINE**

**ค่าที่กำหนดไว้แล้ว แต่ปรับได้หลังเห็นภาพจริงใน Task 7**
ทั้งสองค่ามีค่าตั้งต้นที่ชัดเจนแล้ว **implement ได้ทันทีโดยไม่ต้องถามใคร** — ถ้าภาพจาก
Playwright test ดูไม่สวย ให้ปรับตัวเลขแล้วรัน test ซ้ำ ไม่ใช่ปล่อยว่างไว้ให้ตัดสินใจเอง:
- `AREA_PADDING_RATIO = 0.12`
- `INITIAL_FONT_SIZE_COEFFICIENT = 0.28` (ใช้ใน `initialFontSize`)
- ค่าชดเชย optical ถ้าข้อความดูไม่กึ่งกลางพอ — เริ่มที่ **0** และถ้าจะใส่
  ต้องเป็นค่าคงที่ตัวเดียวทั้งภาพ (เช่น `+0.03 × fontSizePx`) ห้ามคำนวณต่อสตริง

**ข้อจำกัดของการอ้างอิง repo ภายนอก**
`src/tools/createRichMenu.ts:257-338` ชี้ไปที่ `line/line-bot-mcp-server` ซึ่ง **ตรวจสอบจาก repo นี้ไม่ได้
และไม่ได้ pin commit** ถ้าจะใช้อ้างอิงในอนาคตให้เปลี่ยนเป็นลิงก์ GitHub ที่ระบุ commit hash

---

## Changelog

**REV 2 (2026-08-02)** — แก้หลังรีวิวด้วย 4 agent ขนาน (product / Thai-i18n / TypeScript / citation-check)
และผู้เขียนแผนตรวจยืนยันข้อเท็จจริงเองแล้วทุกข้อ:

| # | REV 1 เขียนว่า | ความจริง |
|---|---|---|
| 1 | `next/font` ตั้งชื่อ family แบบ hash ต้องอ่านจาก CSS var แล้วลอก quote ออก | ชื่อ family **ไม่ถูก hash** ค่าจริงเป็น font stack เต็มพร้อม quote → การลอก quote ทำให้ `ctx.font` invalid และถูกเมินเงียบ ๆ |
| 2 | `ensureFontsReady` เรียก `document.fonts.load(\`${w} 100px ${family}\`)` | default text คือ `" "` → **โหลดเฉพาะไฟล์ latin ฟอนต์ไทยไม่เคยถูกโหลด** ต้องส่ง Thai text เป็น arg ที่ 2 |
| 3 | (ไม่มี) | เพิ่ม guard เพราะทุกความล้มเหลวเรื่องฟอนต์เงียบหมด (REV 4 เปลี่ยนวิธี — ดูด้านล่าง) |
| 4 | `LINE_HEIGHT_RATIO = 1.35` | metrics ของฟอนต์เองแนะนำ **1.511 em** (ascent 1.061 + descent 0.450) → 1.35 ทำให้วรรณยุกต์ชนสระล่างบรรทัดบน |
| 5 | `textBaseline='middle'` แล้วถ้าเบี้ยวให้ใช้ `actualBoundingBox*` | `actualBoundingBox*` ผูกกับสตริง → แต่ละช่องลอยไม่เท่ากัน **แย่กว่าเดิม** ใช้ `fontBoundingBox*` แทน |
| 6 | `granularity: 'grapheme'` พอสำหรับกันตัดกลาง cluster | ไม่พอ — สระหน้า เ แ โ ใ ไ ถูกแยกออก (`'เก'` → `["เ","ก"]`) ต้องมี `toBreakableUnits()` |
| 7 | fallback ให้ใช้ `Intl.Segmenter` grapheme "ถ้ามี" | ขัดกันเอง — สาขานั้นทำงานเมื่อ `Intl.Segmenter` **ไม่มี** เปลี่ยนเป็น regex cluster |
| 8 | คำเดียวกว้างเกินกรอบ → "ใส่ไปเลยแล้วขึ้นบรรทัดใหม่" | ทำให้ loop จบแต่ **ข้อความยังล้นกรอบ** และขัดกับ test case ของแผนเองที่เขียนว่า "ต้องตัดได้" → ต้องแตกด้วย `splitGraphemes` จริง |
| 9 | ตัด `…` ท้ายบรรทัด | ไม่ได้ re-measure หลังต่อ `…` → ล้นกรอบเสมอ; `…` (U+2026) อยู่ใน subset **latin** ต้องอยู่ใน probe text ด้วย |
| 10 | `labels: string[]` index ตรงกับ `areas` | array คู่ขนานที่ type บังคับความยาวไม่ได้ → ย้าย `label` เข้า `RichMenuAreaLayout` |
| 11 | `MeasureTextFn = (text, fontSizePx) => number` | font size อยู่ 2 ที่ หลุดจากกันได้โดย type ไม่จับ → curried `(text) => number` |
| 12 | ลดฟอนต์ทีละ 2px "จนถึง MIN" | ไม่ clamp → start เลขคี่จะข้าม MIN ไป → ใช้ `Math.max(MIN, size - FONT_STEP_PX)` ทุกรอบ |
| 13 | เช็คพอดีด้วย `lines.length * fontSize * ratio` | สูตรผิด บล็อก n บรรทัดสูง `(n-1)×lineHeight + ascent + descent`; และไม่มี `clip()` → ข้อความล้นไปทับช่องข้าง |
| 14 | fake measure `Array.from(text).length * size * 0.6` | combining mark ไทยมี advance = 0 → ประเมินเกินจริง 2-3× และ assert ด้วย measure ตัวเดียวกันเป็น tautology → 3 fakes + 7 invariants + fixtures จริงจาก `categories.ts` |
| 15 | ห้าม `import type` เพราะจะลาก React เข้ามาใน lib | **ผิดทางเทคนิค** — `import type` ถูก erase ตอน compile เหตุผลจริงคือ Phase 1 ห้ามแตะ `new/page.tsx` (เป็น debt ที่ต้องลบใน Phase 3) |
| 16 | `_dev-preview/page.tsx` เปิดในเบราว์เซอร์ได้ / ต้องลบเพราะไม่มี auth guard | `_` = private folder ของ Next.js **ไม่ถูก route → 404**; และ `/admin` มี `useAuth()` ครอบอยู่แล้ว เหตุผลที่ต้องลบคือเป็น scratch code |
| 17 | citation: `new/page.tsx:11-41`, `logger.ts:1-45`, `image-utils.ts:1-31` (มี `MAX_SOURCE_BYTES`), `image-utils.test.ts:1-24` | แก้เป็น `11-36`, `1-28 + 55-73`, `1-31 + 40-42`, `1-22` ตามลำดับ |
| 18 | "ไม่ลง `canvas`" เพราะ Chromium 400MB บน Koyeb | เหตุผลนั้นใช้กับ server-side rendering `canvas` เป็น devDependency ไม่กระทบ production เหตุผลจริงคือ native build (node-gyp + Cairo) เปราะบน WSL/Windows |
| 19 | Estimated Files: 6 | 7 (6 CREATE + harness) |
| 20 | (ไม่มี) | เพิ่ม `normalizeLabel` จัดการ ZWSP/NBSP ที่แอดมินวางจาก CMS + รองรับ `\n` เป็น break hint |
| 21 | `MIN_FONT_SIZE_PX = 28` "≈12px บนมือถือ" | คำนวณผิดหน่วย — จริงคือ `28 × 390/2500 ≈ 4.4 CSS px` → ทำเครื่องหมาย `[DECISION-PENDING-1]` (ปิดแล้วใน REV 3) |

**REV 3 (2026-08-02)** — เจ้าของงานตัดสิน `[DECISION-PENDING]` ครบทั้ง 4 ข้อ **แผนนี้พร้อม implement**

| ข้อ | ตัดสินใจ | ผลต่อ Phase 1 |
|---|---|---|
| 1 | `MIN_FONT_SIZE_PX = 96`, `MAX_LINES = 2` + เพิ่มคำเตือนตอนพิมพ์ใน Phase 3 | **แก้ค่าคงที่ใน `text-layout.ts`** — ป้ายยาวถูกตัด "…" เร็วขึ้น แลกกับทุกป้ายอ่านออกจริงบนมือถือ |
| 2 | contrast guard เป็น **Must** + เตือน **และ** บล็อกปุ่มบันทึก | ไม่กระทบ Phase 1 (เป็นงาน Phase 2/3) |
| 3 | สำนักงานไม่มีระเบียบบังคับอนุมัติ → ใส่ **หน้ายืนยันก่อน publish** (frontend ล้วน) | ไม่กระทบ Phase 1 (เป็นงาน Phase 4) |
| 4 | เปลี่ยนเกณฑ์วัดผลเป็น **usability test กับแอดมินจริง 3 คน** | ไม่กระทบ Phase 1 |

**REV 4 (2026-08-02)** — แก้ตามรีวิวของ Codex (`codex exec --sandbox read-only`)
Codex ให้ verdict **NEEDS REWORK / 4/10** และยืนยันว่าการแก้ของ REV 2 **ถูกต้อง 21 ข้อ**
แต่พบบั๊กในสเปกที่ทำให้ implement ตามไม่ได้จริง ผู้เขียนแผนตรวจยืนยันเองครบทุกข้อแล้ว

| # | REV 3 เขียนว่า | ความจริง / สิ่งที่แก้ |
|---|---|---|
| 1 | `assertThaiFontActive` ชั้นที่ 3 เทียบความกว้างกับ font ปลอม เพื่อกันกรณี `check()` คืน true ทั้งที่ไม่มี face | **guard นี้ผ่านได้ทั้งที่ฟอนต์ผิด** — ถ้า Noto ล้มแล้วตกไปใช้ Leelawadee UI / Thonburi ความกว้างก็ยังต่างจาก monospace → เปลี่ยนไปตรวจ **`FontFace[]` ที่ `document.fonts.load()` คืนมา** (`length === 0` หรือ `status !== 'loaded'` = ล้มเหลว) และแยกหน้าที่เป็น `ensureFontsReady` + `assertCanvasFontApplied` |
| 2 | `truncateToWidth` ตัดทีละหน่วยจาก `segmentText()` | `segmentText()` เป็นหน่วย **ระดับคำ** — ป้ายไทยสั้นอย่าง "ประชาสัมพันธ์" เป็นคำเดียว ถ้ากว้างเกินเพราะ `…` แค่นิดเดียวจะลบทั้งคำ **เหลือแค่ `"…"`** → เปลี่ยนไปตัดด้วย `splitGraphemes()` + guard เมื่อ `…` เดี่ยว ๆ ยังกว้างเกิน |
| 3 | `fitTextToBox` ถ้าไม่พอดี → `slice(0, MAX_LINES)` + เติม `…` เสมอ | `fits()` ล้มได้ 3 สาเหตุ แต่ทางแก้นี้ **ไม่แก้กรณีสูงเกิน** (`clip()` แค่ซ่อน) และ **เติม `…` ให้ป้ายที่ครบถ้วนอยู่แล้ว** → คำนวณ `maxLinesByHeight` จาก availH จริง และเติม `…` เฉพาะเมื่อ `omittedLines \|\| lastTooWide` |
| 4 | Task 7 dev harness = optional และ **ต้องลบก่อน commit** | ลบทิ้งแล้วจะไม่เหลืออะไรตรวจ `render.ts` เลยตลอดไป (font activation, PNG, ขนาด, clip, ขนาดไฟล์, shaping) → **บังคับ + เก็บถาวรเป็น Playwright test** `frontend/e2e/rich-menu-render.spec.ts` พร้อม 6 assertion |
| 5 | ค่า `--font-noto-thai` คือ `'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif` | **นั่นคือค่าของ dev build เท่านั้น** — prod ให้ `"Noto Sans Thai",system-ui,sans-serif` (quote คนละแบบ ไม่มี Fallback family) → ถือค่านี้เป็น **opaque** ห้าม pin test กับค่าเดียว, `FALLBACK_FONT_STACK` เหลือเฉพาะส่วนที่เสถียร, เพิ่ม `THAI_FONT_CANONICAL_FAMILY` |
| 6 | "ไฟล์ไทยจะไม่ถูก request" | แม่นยำกว่าคือ **`load()` ที่ไม่ส่ง text ไม่ได้เลือกและไม่รอ face ไทย** ส่วนไฟล์เองอาจถูกดาวน์โหลดจาก `preload: true` ของ next/font ได้ — แต่ **preload ไม่ใช่การรับประกันความพร้อม** ข้อสรุปเชิงปฏิบัติไม่เปลี่ยน |
| 7 | 7 invariant รันครบทุก fixture × ทุก fake measure | ข้อ 1 ("output = input") และ 4 ("เซต grapheme เท่ากัน") **ขัดกับข้อ 6-7 โดยตรง** เพราะการตัดคือพฤติกรรมที่ตั้งใจ; และเทียบ "เซต" จับ `กกข` vs `กข` ไม่ได้ → แยกเป็นชุด A (`wrapText`, ห้ามข้อมูลหาย, เทียบลำดับ), ชุด B (`fitTextToBox`, ต้องเป็น prefix + `…`), ชุด C (ขอบเขตจำนวนรอบที่วัดได้จริงผ่าน counter seam) |
| 8 | `initialFontSize` มีแค่ signature | ไม่เคยให้สูตร ทั้งที่ Notes บอกว่า "ยังไม่ตัดสินใจ" ขณะที่ `AREA_PADDING_RATIO = 0.12` ถูก fix แล้ว — ขัดกันเองและ implement ไม่ได้ → ให้สูตรจริงพร้อม `INITIAL_FONT_SIZE_COEFFICIENT = 0.28` |
| 9 | `m.fontBoundingBoxAscent ?? size * 1.061` | `??` จับแค่ `null`/`undefined` **ไม่จับ `NaN`** → ถ้าเบราว์เซอร์คืนค่าไม่ finite จะได้ `NaN` ทั้ง blockH และพิกัด baseline → ใช้ `Number.isFinite()` |
| 10 | `toBreakableUnits` อธิบายเป็นประโยคเดียว | implement ได้หลายแบบ และไม่ครอบกรณี **หน่วยแรกเป็นอักขระต้องห้าม** (ป้ายขึ้นต้นด้วย `ๆ` / `.` / combining mark) กับ **การแตกหน่วยกว้างเกินแล้ววนกลับ** → ให้ pseudocode เต็ม + นิยามทั้งสองกรณี |
| 11 | `wrapText('')` ไม่ได้นิยาม | ถ้าคืน `[]` แล้ว `(lines.length - 1) * lineHeight` เริ่มที่ `-lineHeight` และ branch ตัดจะเขียน `lines[-1]` → นิยามชัด: `wrapText('') === []`, `fitTextToBox('')` คืน `{ lines: [], didTruncate: false }` |
| 12 | `MAX_LINES = 2` โดยนัยว่าเป็นข้อจำกัดของพื้นที่ | ที่ 96px 3 บรรทัด (~445px) และ 4 บรรทัด (~595px) **ยังพอดีใน 643px ทั้งคู่** → เป็น product constraint ไม่ใช่เรขาคณิต; และ 15 CSS px คิดบนจอ 390pt เท่านั้น จอ 320pt เหลือ 12.3 → ต้องยืนยันด้วย usability test ห้ามอ้างว่ารับประกัน "ทุกป้ายอ่านออกครบถ้วน" |
| 13 | Estimated Files: 7 (มี harness ที่ต้องลบ) | 8 และเก็บถาวรทั้งหมด |

**หมายเหตุ**: โค้ดตัวอย่างที่ Codex เสนอในข้อ 3 เขียน `lines.at(-1)! = ...` ซึ่งเป็น **SyntaxError**
(`Array.prototype.at()` คืนค่า ไม่ใช่ reference) — แผนนี้ใช้ `lines[lines.length - 1] = ...` แทน
