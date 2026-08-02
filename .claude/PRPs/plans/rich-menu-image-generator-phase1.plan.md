# Plan: Rich Menu Image Generator — Phase 1 (Render core + ฟอนต์ไทย)

> **REV 2 (2026-08-02)** — แก้หลังรีวิวด้วย 4 agent ขนาน จุดที่แก้สำคัญที่สุดคือ **สมมติฐานเรื่องชื่อฟอนต์
> ใน REV 1 ผิดข้อเท็จจริง** และ `ensureFontsReady` แบบเดิมจะไม่โหลดฟอนต์ไทยเลย ดู "Changelog" ท้ายไฟล์
>
> ⚠️ มี **4 จุดที่ยังรอการตัดสินใจ** ทำเครื่องหมาย `[DECISION-PENDING]` ห้าม implement จุดนั้นจนกว่าจะปิด

## Summary

สร้างชั้น core ที่แปลง `{ areas (พร้อม label), colors }` เป็นภาพ PNG ขนาด 2500×1686 (หรือ 2500×843)
ด้วย Canvas 2D ฝั่งเบราว์เซอร์ โดยแยก **ตรรกะจัดวางข้อความ (pure, เทสต์ได้)** ออกจาก
**การวาดจริงบน canvas (ต้องใช้เบราว์เซอร์)** เพราะ jsdom ของ vitest ไม่รองรับ Canvas
เฟสนี้ไม่มี UI ยังไม่ต่อกับหน้าใด ๆ

**คำเตือนสำคัญเรื่องรูปทรงของเฟสนี้**: การแยก pure logic ออกมาทำให้ตรรกะเทสต์ได้จริง
แต่มัน **ย้ายความเสี่ยงเรื่องฟอนต์ทั้งหมดไปกองอยู่ใน `render.ts` ซึ่งไม่มี unit test เลย**
ถ้าฟอนต์ไทยไม่ถูกโหลด เทสต์ทุกเคสจะยังเขียว แต่ภาพที่ได้ใช้ฟอนต์ผิด — **ด้วยเหตุนี้ Task 4
จึงบังคับให้มี runtime guard (`assertThaiFontActive`) ไม่ใช่แค่ตรวจด้วยตา**

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
- **Estimated Files**: 7 (6 CREATE + 1 optional dev harness ที่ต้องลบก่อน commit)

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
| `frontend/app/admin/rich-menus/dev-preview/page.tsx` | CREATE (ชั่วคราว) | Dev harness — **ต้องลบก่อน commit** |

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

  /** ต้องตรงกับ layout.tsx — ใช้เมื่ออ่าน CSS var ไม่ได้ */
  export const FALLBACK_FONT_STACK =
    `'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif`;

  export const RICH_MENU_FONT_WEIGHT = 700;

  /** ต้องมีทั้งพยัญชนะไทย สระบน/ล่าง วรรณยุกต์ ทัณฑฆาต และ '…' (อยู่ใน subset latin) */
  export const FONT_PROBE_TEXT = 'กขคง ญ์ ปุ๊ ที่ …';

  export function resolveThaiFontFamily(rootStyle: CSSStyleDeclaration): string { ... }
  export async function ensureFontsReady(family: string, sampleText: string): Promise<void> { ... }
  export function assertThaiFontActive(ctx: CanvasRenderingContext2D, family: string, sizePx: number): void { ... }
  ```

  **`resolveThaiFontFamily`** — `.trim()` แล้วคืนเลย ถ้าว่างคืน `FALLBACK_FONT_STACK`:
  ```typescript
  const raw = rootStyle.getPropertyValue(THAI_FONT_CSS_VAR).trim();
  return raw.length > 0 ? raw : FALLBACK_FONT_STACK;
  ```

  **`ensureFontsReady`** — ต้องส่ง `sampleText` เป็นพารามิเตอร์ที่ 2 ของ `document.fonts.load()`:
  ```typescript
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = FONT_PROBE_TEXT + sampleText;   // sampleText = ป้ายจริงทุกป้ายต่อกัน
  await document.fonts.load(`${RICH_MENU_FONT_WEIGHT} 100px ${family}`, sample);
  await document.fonts.ready;
  ```

  **`assertThaiFontActive`** — guard 3 ชั้น เพราะทุกความล้มเหลวที่นี่เงียบหมด:
  ```typescript
  const wanted = `${RICH_MENU_FONT_WEIGHT} ${sizePx}px ${family}`;
  ctx.font = wanted;
  // (1) round-trip: ถ้า parse ไม่ผ่าน ค่าจะไม่เปลี่ยน (คงเป็น '10px sans-serif')
  if (!ctx.font.includes(`${sizePx}px`)) {
    throw new Error('ตั้งค่าฟอนต์บน canvas ไม่สำเร็จ — ไม่สามารถสร้างภาพได้');
  }
  // (2) ทุกอักขระใน probe ต้องมี face ที่โหลดแล้วรองรับ
  if (document.fonts && !document.fonts.check(wanted, FONT_PROBE_TEXT)) {
    throw new Error('ฟอนต์ไทยยังโหลดไม่เสร็จ — กรุณาลองใหม่อีกครั้ง');
  }
  // (3) กัน check() ที่คืน true เพราะ "ไม่มี face ไหน match เลย"
  const w1 = ctx.measureText(FONT_PROBE_TEXT).width;
  ctx.font = `${RICH_MENU_FONT_WEIGHT} ${sizePx}px "__jsk_no_such_font__", monospace`;
  const w2 = ctx.measureText(FONT_PROBE_TEXT).width;
  ctx.font = wanted;
  if (Math.abs(w1 - w2) < 0.5) {
    throw new Error('ฟอนต์ไทยไม่ถูกใช้งาน — ภาพอาจแสดงผลผิดเพี้ยน');
  }
  ```
- **MIRROR**: `ERROR_HANDLING` (ข้อความไทย), `NAMING_CONVENTION`
- **IMPORTS**: ไม่มี (web API ล้วน)
- **GOTCHA**:
  1. **ห้าม `.replace(/^['"]|['"]$/g, '')` ลอก quote** — ค่าจริงคือ font stack ที่มี quote หลายคู่
     การลอกหัวท้ายจะได้ `Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif`
     ซึ่ง quote ไม่บาลานซ์ → `ctx.font` invalid → **ถูกเมินเงียบ ๆ เหลือ `10px sans-serif`**
  2. **`document.fonts.load(font)` โดยไม่ส่ง text จะโหลดเฉพาะไฟล์ latin** เพราะ default text คือ
     `" "` (U+0020) ซึ่งอยู่ใน unicode-range ของไฟล์ latin ไฟล์ไทย (`U+0E01-0E5B`) จะไม่ถูก request
     และ `await document.fonts.ready` ก็ไม่ช่วย เพราะไฟล์ที่ไม่เคยถูกขอ ไม่นับเป็น pending
  3. `document.fonts` **ไม่มีใน jsdom** → `ensureFontsReady` และ `assertThaiFontActive`
     เทสต์อัตโนมัติไม่ได้ ให้ guard ด้วย `typeof document === 'undefined' || !document.fonts`
  4. `document.fonts.check()` คืน `true` เมื่อ **ไม่มี face ไหน match เลย** ด้วย → ห้ามใช้เดี่ยว ๆ
  5. `ctx.fillText` เป็น **synchronous** — วาดด้วยฟอนต์ที่มี ณ วินาทีนั้น ไม่รอโหลด
- **VALIDATE**: unit test ของ `resolveThaiFontFamily` ผ่าน (Task 6)

### Task 3: `frontend/lib/rich-menu/text-layout.ts` — **หัวใจของเฟสนี้**

- **ACTION**: ตรรกะจัดวางข้อความไทยแบบ pure ทั้งหมด
- **IMPLEMENT**:
  ```typescript
  export const MIN_FONT_SIZE_PX = 28;        // [DECISION-PENDING-1] ดูหมายเหตุ
  export const MAX_LINES = 3;                // [DECISION-PENDING-1]
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
  const THAI_LEAD_VOWELS = /[เ-ไ]/;   // เ แ โ ใ ไ
  const NO_BREAK_BEFORE  = /^[ๆฯ๏๚๛\s.,!?)\]}%:;…]/;  // ๆ ฯ ๏ ฯลฯ

  // ถ้าหน่วยก่อนหน้า "จบด้วยสระหน้า" หรือหน่วยนี้ "ห้ามขึ้นต้นบรรทัด" → ผนวกเข้ากับหน่วยก่อนหน้า
  ```

  **`wrapText`**:
  1. `split('\n')` ก่อน — **`\n` ที่แอดมินพิมพ์คือจุดขึ้นบรรทัดที่ authoritative** (deterministic ข้ามเบราว์เซอร์)
  2. แต่ละท่อน: `segmentText` → `toBreakableUnits` → greedy wrap
  3. **ต้องเรียก `measure(candidateLine)` กับสตริงเต็มบรรทัดที่กำลังจะได้ ทุกครั้ง**
     ห้ามบวกความกว้างของแต่ละ segment สะสม (shaping ของไทยไม่ additive)
  4. ถ้าหน่วยเดียวกว้างเกินกรอบแม้อยู่บนบรรทัดว่าง → **ต้องแตกด้วย `splitGraphemes` จริง ๆ**
     ไม่ใช่แค่ "ใส่ไปเลยแล้วขึ้นบรรทัดใหม่" (นั่นทำให้ loop จบ แต่ข้อความยังล้นกรอบ)

  **`truncateToWidth`** — ต้อง re-measure หลังต่อ `…`:
  ```typescript
  let units = toBreakableUnits(segmentText(line));
  while (units.length > 0 && measure(units.join('') + ELLIPSIS) > maxWidthPx) {
    units = units.slice(0, -1);
  }
  return units.join('').replace(/\s+$/, '') + ELLIPSIS;
  ```

  **`fitTextToBox`** — loop ที่พิสูจน์ได้ว่าจบ และไม่มีทางต่ำกว่า MIN:
  ```typescript
  const pad    = Math.round(Math.min(box.width, box.height) * AREA_PADDING_RATIO);
  const availW = box.width  - pad * 2;
  const availH = box.height - pad * 2;

  let fontSizePx = Math.max(MIN_FONT_SIZE_PX, startFontSizePx);
  let lines = wrapText(text, availW, createMeasure(fontSizePx));

  const fits = (size: number, ls: string[]): boolean => {
    const m = metricsFor(size);
    // ความสูงบล็อก = (n-1) × lineHeight + ascent + descent  ← ไม่ใช่ n × lineHeight
    const blockH = (ls.length - 1) * m.lineHeight + m.ascent + m.descent;
    const measure = createMeasure(size);
    return ls.length <= MAX_LINES && blockH <= availH && ls.every((l) => measure(l) <= availW);
  };

  while (fontSizePx > MIN_FONT_SIZE_PX && !fits(fontSizePx, lines)) {
    fontSizePx = Math.max(MIN_FONT_SIZE_PX, fontSizePx - FONT_STEP_PX);  // clamp ทุกรอบ
    lines = wrapText(text, availW, createMeasure(fontSizePx));
  }

  let didTruncate = false;
  if (!fits(fontSizePx, lines)) {
    lines = lines.slice(0, MAX_LINES);
    lines[lines.length - 1] = truncateToWidth(lines[lines.length - 1], availW, createMeasure(fontSizePx));
    didTruncate = true;
  }
  ```
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

  > **[DECISION-PENDING-1]** `MIN_FONT_SIZE_PX = 28` และ `MAX_LINES = 3` เป็นค่าจาก REV 1 ที่ตั้งบน
  > **การคำนวณหน่วยที่ผิด** — REV 1 อ้างว่า 28px บนภาพ 2500px จะเหลือ ~12px บนมือถือ ซึ่งเป็นการนับ
  > device px บนจอ 3× ขนาดที่ *ตาเห็น* จริงคือ `28 × (390/2500) ≈ 4.4 CSS px` ซึ่งอ่านไทยไม่ออกแน่นอน
  > (สิ่งที่แยก ข/ช, ด/ค, ผ/ฝ คือ "หัว" เล็ก ๆ และวรรณยุกต์ ่/้/๊/๋ ต่างกันแค่จำนวนขีด)
  > ค่าที่เสนอคือ `MIN_FONT_SIZE_PX = 96` (≈ 15 CSS px) และ `MAX_LINES = 2`
  > **แต่การเปลี่ยนนี้ทำให้ป้ายยาวถูกตัดด้วย "…" เร็วขึ้นมาก = เปลี่ยนพฤติกรรมฟีเจอร์** จึงรอการตัดสินใจ

- **VALIDATE**: unit test ทั้งหมดใน Task 5 ผ่าน

### Task 4: `frontend/lib/rich-menu/render.ts`

- **ACTION**: วาด canvas จริงและแปลงเป็น Blob พร้อม runtime guard เรื่องฟอนต์
- **IMPLEMENT**:
  ```typescript
  export const MAX_RICH_MENU_BYTES = 1024 * 1024;   // LINE จำกัด 1 MB

  export async function renderRichMenuImage(options: RenderRichMenuOptions): Promise<Blob> {
    // 1. สร้าง canvas + ctx (throw ถ้า !ctx)
    // 2. โหลดฟอนต์ให้ครบก่อน — เรียกเองภายใน ไม่ปล่อยให้ผู้เรียกจำลำดับ
    //    await ensureFontsReady(options.fontFamily, options.areas.map(a => a.label).join(''));
    // 3. assertThaiFontActive(ctx, options.fontFamily, 100)   ← throw ถ้าฟอนต์ไม่พร้อม
    // 4. fillStyle = colors.background; fillRect เต็มผืน
    // 5. วนทุก area (ดูโค้ดด้านล่าง)
    // 6. toBlob('image/png') ห่อ Promise
    // 7. ถ้า blob.size > MAX_RICH_MENU_BYTES → throw Error ภาษาไทยพร้อมขนาดจริง
  }
  ```

  **การวาดต่อ area** — ใช้ `fontBoundingBox*` (คงที่) ไม่ใช่ `actualBoundingBox*` (แปรผัน):
  ```typescript
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';        // ตั้งก่อน measure เสมอ

  const metricsFor = (size: number) => {
    ctx.font = `${RICH_MENU_FONT_WEIGHT} ${size}px ${options.fontFamily}`;
    const m = ctx.measureText('ปุ๊ญ์');
    const ascent  = m.fontBoundingBoxAscent  ?? size * 1.061;
    const descent = m.fontBoundingBoxDescent ?? size * 0.450;
    const lineHeight = Number.isFinite(ascent + descent) && ascent + descent > 0
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
  import { ensureFontsReady, assertThaiFontActive, RICH_MENU_FONT_WEIGHT } from './fonts';
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
- **VALIDATE**: `npx tsc --noEmit` ผ่าน + ตรวจด้วยตาผ่าน dev harness

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

  **7 invariant ที่ต้องรันครบทุก fixture × ทุก fake measure**:
  ```
  1. join(lines) หลังถอด whitespace ที่จุด wrap = input ที่ normalize แล้ว (ไม่มีอักขระหาย/เกิน)
  2. ไม่มีบรรทัดใดจบด้วยสระหน้า [เ-ไ]
  3. ไม่มีบรรทัดใดขึ้นต้นด้วย [ๆฯัิ-ฺ็-๎\s.]
  4. เซตของ grapheme ใน output = เซตใน input (ไม่มี cluster ถูกผ่า)
  5. terminates — ทุก input × ทุก measure จบใน < N รอบ (ไม่มี infinite loop)
  6. lines.length <= MAX_LINES และ fontSizePx >= MIN_FONT_SIZE_PX เสมอ
  7. เมื่อ didTruncate === true บรรทัดสุดท้าย (รวม '…' แล้ว) ต้องยัง <= availW
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

  const REAL_VALUE = `'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif`;
  ```
  เคสที่ต้องมี:
  - ค่าจริงทั้งสแต็กต้องถูกคืน **เหมือนเดิมทุกตัวอักษร** (ไม่มีการลอก quote)
  - มี whitespace นำหน้า/ต่อท้าย → ถูก trim แต่เนื้อในไม่เปลี่ยน
  - ค่าว่าง → คืน `FALLBACK_FONT_STACK`
  - **จำนวน `'` ในผลลัพธ์ต้องเป็นเลขคู่** ← กันคนกลับมาใส่ regex ลอก quote
- **MIRROR**: `TEST_STRUCTURE`
- **IMPORTS**: `import { resolveThaiFontFamily, FALLBACK_FONT_STACK } from '../fonts';`
- **GOTCHA**: **ห้ามเทสต์ `ensureFontsReady` / `assertThaiFontActive`** — `document.fonts` ไม่มีใน jsdom
  เทสต์ได้แค่ว่ามัน return เงียบ ๆ ไม่ throw เมื่อไม่มี `document.fonts`
- **VALIDATE**: `npx vitest run lib/rich-menu` เขียว

### Task 7 (optional): dev harness

- **ACTION**: หน้าชั่วคราวสำหรับตรวจภาพด้วยตา
- **IMPLEMENT**: `frontend/app/admin/rich-menus/dev-preview/page.tsx` — `"use client"`
  เรียก `renderRichMenuImage` ด้วย `PRESET_TEMPLATES` แบบ 6 ปุ่ม + ป้ายไทยจาก `THAI_FIXTURES`
  แล้วแสดง `<img>` จาก `URL.createObjectURL(blob)`
- **GOTCHA**:
  1. **ห้ามใช้ชื่อ `_dev-preview`** — Next.js App Router ถือว่าโฟลเดอร์ขึ้นต้น `_` เป็น
     *private folder* ที่ **ไม่ถูก route** (repo นี้ใช้ convention นี้อยู่แล้วที่
     `live-chat/_components`, `_context`, `_hooks`, `_lib`) เปิดแล้วจะได้ 404
  2. **ต้องลบทิ้งก่อน commit** เหตุผลคือ **มันคือ scratch code ที่ไม่ผ่านรีวิว** —
     ไม่ใช่เพราะไม่มี auth guard (`frontend/app/admin/layout.tsx` ครอบ `useAuth()` ทุก route
     ใต้ `/admin` อยู่แล้ว harness จะได้ guard นั้นไปด้วย)
- **VALIDATE**: เปิดดูแล้วอ่านข้อความไทยออกครบ รวมสระบน/ล่าง

---

## Validation Commands

รันใน **WSL** ตามข้อกำหนดของโปรเจกต์ (`cd frontend` ก่อน)

```bash
cd frontend && npx tsc --noEmit                    # EXPECT: 0 errors
cd frontend && npx eslint lib/rich-menu            # EXPECT: 0 errors
cd frontend && npx vitest run lib/rich-menu        # EXPECT: ผ่านทั้งหมด
cd frontend && npx vitest run                      # EXPECT: ไม่มี regression
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

- [ ] Task 1-6 เสร็จครบ (Task 7 optional และต้องลบก่อน commit)
- [ ] `npx tsc --noEmit` / `npx eslint lib/rich-menu` ไม่มี error
- [ ] `npx vitest run` ผ่านทั้งหมด ไม่มี regression
- [ ] `npm run build` สำเร็จ
- [ ] Manual validation ผ่านครบ **โดยเฉพาะข้อยืนยันว่าเป็น Noto Sans Thai จริง**
- [ ] **`git diff` ต้องไม่มีไฟล์ใน `app/admin/rich-menus/new/` หรือ `backend/` เลย**
- [ ] `[DECISION-PENDING-1]` ถูกปิดก่อน merge

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
| ฟอนต์ไทยไม่ถูกโหลด/ไม่ถูกใช้ แล้ววาดเงียบ ๆ ด้วยฟอนต์ระบบ | **H** | **H** | `ensureFontsReady` ส่ง Thai text + `assertThaiFontActive` guard 3 ชั้น + manual check ว่าไทย "มีหัว" |
| `ctx.font` invalid แล้วถูกเมิน เหลือ `10px sans-serif` | M | **H** | round-trip guard ใน `assertThaiFontActive` ข้อ (1) |
| `system-ui` ใน stack ถูก canvas parser บางตัวปฏิเสธ → ทั้งสตริง invalid | L | **H** | guard เดียวกัน + `FALLBACK_FONT_STACK` |
| ผลตัดคำต่างกันข้ามเบราว์เซอร์ → PNG จากป้ายเดียวกันขึ้นบรรทัดไม่เหมือนกัน | **H** | M | รองรับ `\n` เป็น break hint ที่ deterministic + assert invariant ไม่ใช่ผลลัพธ์เป๊ะ |
| `wrapText` วนไม่รู้จบ / ข้อความล้นกรอบ | M | **H** | แตกด้วย `splitGraphemes` จริง + invariant 5 และ 7 + `clip()` เป็นตาข่ายสุดท้าย |
| นักพัฒนาเผลอทำ Phase 3 (UI) ไปด้วย | M | M | acceptance criteria มีข้อ `git diff` |
| `render.ts` ไม่มี automated test ตลอดไป | M | M | พิจารณาแปลง Task 7 harness เป็น Playwright test ถาวรแทนการลบทิ้ง (ดู Notes) |

## Notes

**ทำไมแยก `text-layout.ts` ออกจาก `render.ts`**
`frontend/vitest.config.ts` ตั้ง `environment: 'jsdom'` และโปรเจกต์ไม่ได้ลง package `canvas`
→ `canvas.getContext('2d')` คืน `null` ใน vitest (ยืนยันด้วยการรันจริงกับ jsdom 25.0.1 ของโปรเจกต์)
การรับ `createMeasure` เป็นพารามิเตอร์ทำให้ตรรกะที่ซับซ้อนที่สุดเทสต์ได้เต็มที่

**ราคาที่ต้องจ่ายของการแยกนี้ (สำคัญ)**
ความเสี่ยงทั้งหมดเรื่องฟอนต์ถูกย้ายไปอยู่ใน `render.ts` ซึ่ง **ไม่มี unit test เลย** ถ้าฟอนต์ไทย
ไม่โหลด เทสต์ทุกเคสยังเขียวแต่ภาพผิด — นี่คือเหตุผลที่ `assertThaiFontActive` เป็น **ข้อบังคับ**
ไม่ใช่ของแถม และเป็นเหตุผลที่ควรพิจารณาเก็บ harness ไว้เป็น Playwright test แทนการลบทิ้ง

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

**ยังไม่ตัดสินใจ (ปล่อยให้ผู้ implement เลือกตอนเห็นภาพจริง)**
- ค่าที่แน่นอนของ `AREA_PADDING_RATIO` และ `initialFontSize`
- ค่าชดเชย optical ถ้าข้อความดูไม่กึ่งกลางพอ (ต้องเป็นค่าคงที่ตัวเดียวทั้งภาพ)

---

## Changelog

**REV 2 (2026-08-02)** — แก้หลังรีวิวด้วย 4 agent ขนาน (product / Thai-i18n / TypeScript / citation-check)
และผู้เขียนแผนตรวจยืนยันข้อเท็จจริงเองแล้วทุกข้อ:

| # | REV 1 เขียนว่า | ความจริง |
|---|---|---|
| 1 | `next/font` ตั้งชื่อ family แบบ hash ต้องอ่านจาก CSS var แล้วลอก quote ออก | ชื่อ family **ไม่ถูก hash** ค่าจริงเป็น font stack เต็มพร้อม quote → การลอก quote ทำให้ `ctx.font` invalid และถูกเมินเงียบ ๆ |
| 2 | `ensureFontsReady` เรียก `document.fonts.load(\`${w} 100px ${family}\`)` | default text คือ `" "` → **โหลดเฉพาะไฟล์ latin ฟอนต์ไทยไม่เคยถูกโหลด** ต้องส่ง Thai text เป็น arg ที่ 2 |
| 3 | (ไม่มี) | เพิ่ม `assertThaiFontActive` guard 3 ชั้น — ทุกความล้มเหลวเรื่องฟอนต์เงียบหมด |
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
| 21 | `MIN_FONT_SIZE_PX = 28` "≈12px บนมือถือ" | คำนวณผิดหน่วย — จริงคือ `28 × 390/2500 ≈ 4.4 CSS px` → ทำเครื่องหมาย `[DECISION-PENDING-1]` |
