# Plan: Rich Menu Image Generator — Phase 1 (Render core + ฟอนต์ไทย)

## Summary

สร้างชั้น core ที่แปลง `{ areas, labels, colors }` เป็นภาพ PNG ขนาด 2500×1686 (หรือ 2500×843)
ด้วย Canvas 2D ฝั่งเบราว์เซอร์ โดยแยก **ตรรกะจัดวางข้อความ (pure, เทสต์ได้)** ออกจาก
**การวาดจริงบน canvas (ต้องใช้เบราว์เซอร์)** เพราะ jsdom ของ vitest ไม่รองรับ Canvas
เฟสนี้ไม่มี UI ยังไม่ต่อกับหน้าใด ๆ — เป็นการปิดความเสี่ยงทางเทคนิคทั้งหมดก่อน

## User Story

As a **แอดมินที่ไม่มีทักษะกราฟิก**,
I want **ให้ระบบสร้างภาพ Rich Menu จากป้ายข้อความที่ฉันพิมพ์**,
So that **ฉันเผยแพร่เมนูใหม่ได้เองโดยไม่ต้องออกไปทำภาพในโปรแกรมอื่น**.

> Phase 1 ยังไม่ส่งมอบคุณค่านี้ถึงมือผู้ใช้ — เป็นรากฐานที่ Phase 3-4 จะต่อยอด

## Problem → Solution

**Current**: ไม่มีทางสร้างภาพ Rich Menu ในระบบเลย `POST /{id}/upload` รับได้แค่ไฟล์ที่ทำมาแล้ว
**Desired**: มี pure function `renderRichMenuImage()` ที่คืน `Blob` ขนาดถูกต้อง อ่านภาษาไทยออกครบ
พร้อม unit test ครอบตรรกะเสี่ยงทั้งหมด

## Metadata

- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/rich-menu-image-generator.prd.md`
- **PRD Phase**: Phase 1 — Render core + ฟอนต์ไทย
- **Estimated Files**: 6 (5 CREATE, 0 UPDATE, 1 CREATE optional dev harness)

---

## UX Design

**N/A — internal change**

Phase 1 ไม่มีส่วนติดต่อผู้ใช้ ไม่มี route ใหม่ ไม่มีปุ่มใหม่ ผู้ใช้ยังเห็นหน้า
`/admin/rich-menus/new` เหมือนเดิมทุกประการ

UX จริงเริ่มที่ Phase 3 (`.claude/PRPs/prds/rich-menu-image-generator.prd.md` → Phase Details)

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| **P0** | `frontend/app/admin/image-resize/image-utils.ts` | 92-154 | ต้นแบบเดียวในโปรเจกต์ที่ใช้ Canvas + `toBlob` + จัดการ `imageSmoothing`/quality — pattern ที่ต้องลอกให้เหมือน |
| **P0** | `frontend/app/admin/rich-menus/new/page.tsx` | 11-41, 68-180 | นิยาม `TemplateBounds`/`TemplateArea`/`TemplateItem`/`TemplateGroup` และ `PRESET_TEMPLATES` ทั้ง 11 แบบ พร้อมพิกัดจริง — เป็น input ของ render function |
| **P0** | `frontend/app/layout.tsx` | 1-30 | การตั้งค่า `next/font/google` — `Noto_Sans_Thai` weight 400/500/700, `variable: '--font-noto-thai'` |
| **P1** | `frontend/app/globals.css` | 171-174 | `--font-sans: var(--font-noto-thai), "Inter", ...` — chain ที่ต้องอ่านค่าออกมาใช้กับ canvas |
| **P1** | `frontend/vitest.config.ts` | ทั้งไฟล์ | `environment: 'jsdom'`, `include: ['**/__tests__/**/*.test.{ts,tsx}']`, alias `@` → root |
| **P1** | `frontend/app/admin/image-resize/__tests__/image-utils.test.ts` | 1-45 | รูปแบบ test ที่ต้องเลียนแบบ: import จาก `'../image-utils'`, `describe`/`it` ตรงไปตรงมา, ไม่มี mock |
| **P2** | `frontend/lib/logger.ts` | 1-45 | `logger.error` แทน `console.error` |
| **P2** | `frontend/lib/constants/request-status.ts` | ทั้งไฟล์ | ตัวอย่าง constants module ที่ export `as const` |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| `Intl.Segmenter` | MDN — `Intl.Segmenter` | `new Intl.Segmenter('th', { granularity: 'word' })` ตัดคำไทยได้โดยไม่ต้องใช้ไลบรารี รองรับใน Chrome 87+/Safari 14.1+/Firefox 125+ — ต้องมี fallback |
| `TextMetrics` | MDN — `TextMetrics.actualBoundingBoxAscent` | ใช้ `actualBoundingBoxAscent + actualBoundingBoxDescent` เพื่อได้ความสูงจริงของข้อความ แทนการเดาจาก font-size |
| `document.fonts` (CSS Font Loading API) | MDN — `FontFaceSet.load()` | `await document.fonts.load('700 80px "family"')` ต้องเรียกก่อนวาด ไม่งั้น canvas ใช้ fallback เงียบ ๆ ไม่มี error |
| `next/font` family name | Next.js docs — Font Optimization | `next/font` สร้างชื่อ family แบบ hash (`__Noto_Sans_Thai_xxxxx`) ไม่ใช่ `"Noto Sans Thai"` — **ต้องอ่านจาก CSS variable** |

```
KEY_INSIGHT: Noto Sans Thai ถูกโหลดผ่าน next/font/google อยู่แล้วที่ layout.tsx:6-13
APPLIES_TO: Task 2 (fonts.ts)
GOTCHA: ชื่อ family ถูก hash — `ctx.font = '80px "Noto Sans Thai"'` จะ fallback เงียบ ๆ
        ต้องใช้ getComputedStyle(document.documentElement).getPropertyValue('--font-noto-thai')

KEY_INSIGHT: jsdom (vitest environment) ไม่มี Canvas 2D implementation และโปรเจกต์ไม่ได้ลง package `canvas`
APPLIES_TO: Task 1, Task 5 (testing strategy ทั้งหมด)
GOTCHA: canvas.getContext('2d') คืน null ใน vitest → ตรรกะที่ต้องเทสต์ห้ามพึ่ง ctx โดยตรง
        ต้อง inject ฟังก์ชันวัดความกว้างเข้าไปเป็นพารามิเตอร์

KEY_INSIGHT: ภาษาไทยไม่มีช่องว่างระหว่างคำ
APPLIES_TO: Task 3 (text-layout.ts)
GOTCHA: `text.split(' ')` ที่เป็น idiom มาตรฐานของการ word-wrap ใช้กับไทยไม่ได้เลย
        "แจ้งเบาะแสยาเสพติด" จะถูกมองเป็นคำเดียวยาว 17 อักขระ แล้วล้นกรอบ
```

---

## Patterns to Mirror

### NAMING_CONVENTION
```typescript
// SOURCE: frontend/app/admin/image-resize/image-utils.ts:1-31
export type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ResizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  group: 'line' | 'general';
}

export const RESIZE_PRESETS: ResizePreset[] = [
  { id: 'line-rich-large', label: 'Rich Menu Large', width: 2500, height: 1686, group: 'line' },
  ...
];

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
```
→ `interface` PascalCase, ฟังก์ชัน camelCase, ค่าคงที่ `UPPER_SNAKE_CASE`, union type เป็น string literal
→ ไม่มี default export, ใช้ named export ทั้งหมด

### CANVAS_PATTERN
```typescript
// SOURCE: frontend/app/admin/image-resize/image-utils.ts:99-153
const canvas = document.createElement('canvas');
canvas.width = width;
canvas.height = height;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับ Canvas');

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
if (format === 'image/jpeg') {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
}
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
→ `toBlob` ถูกห่อด้วย `Promise` เสมอ, ตรวจ `!ctx` แล้ว throw ทันที

### ERROR_HANDLING
```typescript
// SOURCE: frontend/app/admin/image-resize/image-utils.ts:103, 123, 148
if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับ Canvas');
el.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
else reject(new Error('ไม่สามารถแปลงรูปภาพได้ — ลองเปลี่ยนรูปแบบไฟล์'));
```
→ **ข้อความ error เป็นภาษาไทย** เพราะถูกแสดงให้ผู้ใช้เห็นผ่าน toast
→ throw ทันที ไม่กลืน error ไม่ return null เงียบ ๆ

### RESOURCE_CLEANUP
```typescript
// SOURCE: frontend/app/admin/image-resize/image-utils.ts:105-140
let bitmap: ImageBitmap | null = null;
let fallbackUrl: string | null = null;
try {
  ...
} finally {
  bitmap?.close();
  if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
}
```
→ ใช้ `try/finally` ปล่อยทรัพยากรเสมอ

### TEST_STRUCTURE
```typescript
// SOURCE: frontend/app/admin/image-resize/__tests__/image-utils.test.ts:1-24
import { describe, expect, it } from 'vitest';
import {
  buildOutputFilename,
  computeLockedDimension,
} from '../image-utils';

describe('buildOutputFilename', () => {
  it('strips original extension and appends resize suffix', () => {
    expect(buildOutputFilename('my photo.png', 800, 600, 'webp')).toBe('my photo_resized_800x600.webp');
  });

  it('falls back to "image" when name has no base', () => {
    expect(buildOutputFilename('.png', 100, 100, 'jpg')).toBe('image_resized_100x100.jpg');
  });
});
```
→ `describe` ต่อ 1 ฟังก์ชัน, ชื่อ `it` เป็นประโยคอังกฤษบอกพฤติกรรม, import แบบ relative `'../xxx'`
→ ไม่มี mock ไม่มี setup — เทสต์ pure function ตรง ๆ

### LOGGING_PATTERN
```typescript
// SOURCE: frontend/app/admin/rich-menus/new/page.tsx:9
import { logger } from '@/lib/logger';
```
→ ใน `lib/` ที่เป็น pure function **ไม่ต้อง log** ให้ throw ขึ้นไปให้ชั้น component จัดการ
→ ชั้น component เท่านั้นที่เรียก `logger.error` + `toast`

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `frontend/lib/rich-menu/types.ts` | CREATE | Types ที่ใช้ร่วมกันทุกไฟล์ในโมดูล — คัดลอกรูปทรงจาก `new/page.tsx:11-28` เพื่อไม่ให้ lib ต้อง import จาก page |
| `frontend/lib/rich-menu/text-layout.ts` | CREATE | Pure: ตัดคำไทย + wrap + auto-shrink — **ที่รวมความเสี่ยงทั้งหมด และเทสต์ได้ 100%** |
| `frontend/lib/rich-menu/fonts.ts` | CREATE | อ่านชื่อ font family จริงจาก CSS variable + `await document.fonts.load()` |
| `frontend/lib/rich-menu/render.ts` | CREATE | วาด canvas จริง + `toBlob` — บางที่สุดเท่าที่ทำได้ เพราะเทสต์อัตโนมัติไม่ได้ |
| `frontend/lib/rich-menu/__tests__/text-layout.test.ts` | CREATE | Unit test ของตรรกะจัดวาง รวมเคสไทย |
| `frontend/lib/rich-menu/__tests__/fonts.test.ts` | CREATE | Unit test ของการ parse CSS variable |

## NOT Building

- **ไม่มี UI / component / route ใด ๆ** — Phase 3 เท่านั้น
- **ไม่แตะ `new/page.tsx`** — Phase 3-4 เท่านั้น (Phase 1 ต้องไม่มี diff ในไฟล์นี้เลย)
- **ไม่แตะ backend** — ทั้ง PRD ไม่มีการแก้ backend
- **ไม่ทำระบบสี/preset/contrast** — Phase 2
- **ไม่ทำไอคอน รูปพื้นหลัง เส้นคั่น** — v2
- **ไม่ลง package ใหม่** — `Intl.Segmenter` และ Canvas เป็น web API มาตรฐาน ห้ามลง `canvas`/`opentype.js`/`fabric`

---

## Step-by-Step Tasks

### Task 1: สร้าง `frontend/lib/rich-menu/types.ts`

- **ACTION**: นิยาม types ของโมดูลนี้
- **IMPLEMENT**:
  ```typescript
  export interface RichMenuBounds { x: number; y: number; width: number; height: number; }
  export interface RichMenuAreaLayout { id: number; name: string; bounds: RichMenuBounds; }
  export interface RichMenuColors { background: string; text: string; }
  export interface RenderRichMenuOptions {
    width: number;            // 2500
    height: number;           // 1686 หรือ 843
    areas: RichMenuAreaLayout[];
    labels: string[];         // index ตรงกับ areas
    colors: RichMenuColors;
    fontFamily: string;       // ชื่อ family จริง (จาก fonts.ts)
  }
  export type MeasureTextFn = (text: string, fontSizePx: number) => number;
  ```
- **MIRROR**: `NAMING_CONVENTION` — `interface` PascalCase, named export, ไม่มี default export
- **IMPORTS**: ไม่มี
- **GOTCHA**: **ห้าม `import` type จาก `app/admin/rich-menus/new/page.tsx`** — ไฟล์นั้นเป็น
  `"use client"` component การ import จะลาก React เข้ามาใน lib และทำให้ unit test ช้า/พัง
  ให้ประกาศรูปทรงเดียวกันซ้ำใน lib (โครงสร้างตรงกับ `new/page.tsx:11-22` เป๊ะ)
- **VALIDATE**: `npx tsc --noEmit` ผ่าน

### Task 2: สร้าง `frontend/lib/rich-menu/fonts.ts`

- **ACTION**: หาชื่อ font family จริงที่ `next/font` สร้าง แล้วรอให้ฟอนต์พร้อมก่อนวาด
- **IMPLEMENT**:
  ```typescript
  export const THAI_FONT_CSS_VAR = '--font-noto-thai';
  export const FALLBACK_FONT_STACK = 'system-ui, sans-serif';

  /** อ่านชื่อ family ที่ next/font สร้าง (เช่น "__Noto_Sans_Thai_a1b2c3") จาก CSS variable */
  export function resolveThaiFontFamily(rootStyle: CSSStyleDeclaration): string { ... }

  /** โหลดฟอนต์ทุก weight ที่จะใช้ ก่อนวาด canvas */
  export async function ensureFontsReady(family: string, weights: readonly number[]): Promise<void> { ... }
  ```
  - `resolveThaiFontFamily` รับ `CSSStyleDeclaration` เป็นพารามิเตอร์ (ไม่เรียก `getComputedStyle` เอง)
    → ทำให้เทสต์ได้ใน jsdom โดยส่ง object ปลอมที่มี `getPropertyValue`
  - ค่าที่ได้จาก CSS var มักมีช่องว่างนำหน้าและอาจมี quote → ต้อง `.trim()` และลอก quote ออก
  - ถ้าค่าว่าง → คืน `FALLBACK_FONT_STACK` (ไม่ throw — ฟอนต์ fallback ยังอ่านไทยออกบนเครื่องส่วนใหญ่)
  - `ensureFontsReady` วนทุก weight เรียก `document.fonts.load(\`${w} 100px ${family}\`)`
    แล้ว `await document.fonts.ready`
- **MIRROR**: `ERROR_HANDLING` — ข้อความภาษาไทย; `NAMING_CONVENTION` — `UPPER_SNAKE_CASE` สำหรับค่าคงที่
- **IMPORTS**: ไม่มี (ใช้ web API ล้วน)
- **GOTCHA**:
  1. `next/font` **ไม่ได้** ตั้งชื่อ family ว่า `"Noto Sans Thai"` แต่เป็นชื่อ hash — ห้าม hardcode
  2. `document.fonts` ไม่มีใน jsdom → `ensureFontsReady` เทสต์อัตโนมัติไม่ได้ ให้เทสต์แค่
     `resolveThaiFontFamily` และป้องกันด้วย `if (typeof document === 'undefined' || !document.fonts) return;`
  3. `document.fonts.load()` **ไม่ throw** เมื่อหาฟอนต์ไม่เจอ มัน resolve เป็น array ว่าง — อย่าใช้เป็นสัญญาณความสำเร็จ
- **VALIDATE**: unit test ของ `resolveThaiFontFamily` ผ่าน (ดู Task 6)

### Task 3: สร้าง `frontend/lib/rich-menu/text-layout.ts` — **หัวใจของเฟสนี้**

- **ACTION**: เขียนตรรกะตัดคำไทย + wrap + auto-shrink แบบ pure ทั้งหมด
- **IMPLEMENT**:
  ```typescript
  export const MIN_FONT_SIZE_PX = 28;
  export const MAX_LINES = 3;
  export const LINE_HEIGHT_RATIO = 1.35;
  /** เว้นขอบในของแต่ละช่อง เป็นสัดส่วนของด้านที่สั้นกว่า */
  export const AREA_PADDING_RATIO = 0.12;

  /** ตัดข้อความเป็นหน่วยที่ขึ้นบรรทัดใหม่ได้ — ใช้ Intl.Segmenter สำหรับไทย */
  export function segmentText(text: string, locale?: string): string[] { ... }

  /** จัดข้อความลงหลายบรรทัดให้พอดีความกว้าง */
  export function wrapText(
    text: string,
    maxWidthPx: number,
    fontSizePx: number,
    measure: MeasureTextFn,
  ): string[] { ... }

  /** ลดขนาดฟอนต์จนข้อความพอดีกรอบ คืนขนาดและบรรทัดที่จัดแล้ว */
  export function fitTextToBox(
    text: string,
    box: { width: number; height: number },
    startFontSizePx: number,
    measure: MeasureTextFn,
  ): { fontSizePx: number; lines: string[]; didTruncate: boolean } { ... }

  /** ขนาดฟอนต์เริ่มต้นที่เหมาะกับขนาดช่อง */
  export function initialFontSize(box: { width: number; height: number }): number { ... }
  ```
  **อัลกอริทึม `fitTextToBox`** (ตัดสินใจไว้แล้ว — ลดฟอนต์ก่อน แล้วค่อยตัดท้าย):
  1. เริ่มที่ `startFontSizePx`
  2. `wrapText` → ได้จำนวนบรรทัด
  3. ถ้าบรรทัด ≤ `MAX_LINES` และ `lines.length * fontSize * LINE_HEIGHT_RATIO` ≤ ความสูงที่ใช้ได้ → สำเร็จ
  4. ถ้าไม่พอดี ลดฟอนต์ลงทีละ 2px แล้ววน 2 ใหม่ จนถึง `MIN_FONT_SIZE_PX`
  5. ถ้าถึงขนาดต่ำสุดแล้วยังไม่พอ → ตัดบรรทัดเกินทิ้ง เติม `…` ท้ายบรรทัดสุดท้าย, `didTruncate = true`

  **`segmentText`**:
  ```typescript
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(locale ?? 'th', { granularity: 'word' });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  // fallback: ตัดตามช่องว่าง แล้วถ้าไม่มีช่องว่างเลยให้ตัดทีละอักขระ
  ```
- **MIRROR**: `NAMING_CONVENTION`; ทุกฟังก์ชันมี explicit return type ตาม `rules/typescript/coding-style.md`
- **IMPORTS**: `import type { MeasureTextFn } from './types';`
- **GOTCHA**:
  1. **`text.split(' ')` ใช้กับไทยไม่ได้** — ไม่มีช่องว่าง ทั้งประโยคจะเป็น token เดียว
  2. `Intl.Segmenter` คืน segment ที่ **รวมช่องว่างไว้ด้วย** (เช่น `["สวัสดี", " ", "ครับ"]`)
     ต้องจัดการตอนต่อบรรทัด ไม่งั้นได้ช่องว่างนำหน้าบรรทัด
  3. ห้ามเรียก `ctx.measureText` ในไฟล์นี้เด็ดขาด — รับ `measure` เข้ามาเท่านั้น (ไม่งั้นเทสต์ใน jsdom ไม่ได้)
  4. **ห้ามตัดตรงกลาง grapheme cluster** — "ปุ๊" คือ ป + ุ + ๊ (3 code unit, 1 อักขระที่มองเห็น)
     `Array.from(text)` ยังแยก combining mark ออกจากพยัญชนะ → ใน fallback ที่ตัดทีละอักขระ
     ต้องใช้ `new Intl.Segmenter(locale, { granularity: 'grapheme' })` ถ้ามี
  5. `MIN_FONT_SIZE_PX = 28` อ้างอิงจาก canvas 2500px กว้าง — ย่อลงบนจอมือถือจริงจะเหลือ ~12px
     อย่าตั้งต่ำกว่านี้
- **VALIDATE**: unit test ทั้งหมดใน Task 5 ผ่าน

### Task 4: สร้าง `frontend/lib/rich-menu/render.ts`

- **ACTION**: วาด canvas จริงและแปลงเป็น Blob — ให้บางที่สุด เพราะเทสต์อัตโนมัติไม่ได้
- **IMPLEMENT**:
  ```typescript
  export const MAX_RICH_MENU_BYTES = 1024 * 1024; // LINE จำกัด 1 MB

  export async function renderRichMenuImage(options: RenderRichMenuOptions): Promise<Blob> {
    // 1. สร้าง canvas ตาม width/height
    // 2. ctx.fillStyle = colors.background; fillRect เต็มผืน
    // 3. วนทุก area:
    //    - คำนวณ padding จาก AREA_PADDING_RATIO
    //    - measure = (t, size) => { ctx.font = `700 ${size}px ${fontFamily}`; return ctx.measureText(t).width; }
    //    - fitTextToBox(...) → { fontSizePx, lines }
    //    - ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    //    - วาดทีละบรรทัด จัดกึ่งกลางแนวตั้งของ area
    // 4. toBlob('image/png') ห่อด้วย Promise
    // 5. ถ้า blob.size > MAX_RICH_MENU_BYTES → throw Error ภาษาไทย
  }
  ```
- **MIRROR**: `CANVAS_PATTERN` (ตรวจ `!ctx` → throw, `toBlob` ห่อ Promise), `ERROR_HANDLING` (ข้อความไทย)
- **IMPORTS**:
  ```typescript
  import type { RenderRichMenuOptions } from './types';
  import { fitTextToBox, initialFontSize, LINE_HEIGHT_RATIO, AREA_PADDING_RATIO } from './text-layout';
  ```
- **GOTCHA**:
  1. **ต้องตั้ง `ctx.font` ใหม่ทุกครั้งก่อน `measureText`** — canvas state เป็น global การเปลี่ยนขนาดฟอนต์
     ระหว่างลูปแล้วลืมตั้งใหม่จะวัดผิดแบบเงียบ ๆ
  2. `ctx.textBaseline = 'middle'` **ไม่ได้จัดกึ่งกลางสระบน/ล่างอย่างที่คิด** สำหรับข้อความไทย —
     ถ้าเห็นว่าเบี้ยว ให้เปลี่ยนไปใช้ `'alphabetic'` แล้วคำนวณ offset จาก
     `metrics.actualBoundingBoxAscent`/`Descent` เอง
  3. ผู้เรียกต้อง `await ensureFontsReady()` **ก่อน** เรียกฟังก์ชันนี้ — เขียนไว้ใน JSDoc ให้ชัด
  4. **ห้ามใช้ `renderRichMenuImage` ใน server component** — มี `document` ต้องอยู่ใน `"use client"` เท่านั้น
  5. อย่าตั้ง `canvas.style.width` — จะไปเปลี่ยนขนาดที่ export
- **VALIDATE**: `npx tsc --noEmit` ผ่าน + ตรวจด้วยตาผ่าน dev harness (ดู Manual Validation)

### Task 5: สร้าง `frontend/lib/rich-menu/__tests__/text-layout.test.ts`

- **ACTION**: เทสต์ตรรกะจัดวางให้ครบทุกเคสเสี่ยง
- **IMPLEMENT**: ใช้ `measure` ปลอมที่คาดเดาได้:
  ```typescript
  const fakeMeasure: MeasureTextFn = (text, size) => Array.from(text).length * size * 0.6;
  ```
  เทสต์ตามตารางใน Testing Strategy ด้านล่าง
- **MIRROR**: `TEST_STRUCTURE` — `import { describe, expect, it } from 'vitest';`,
  import จาก `'../text-layout'`, `describe` ต่อ 1 ฟังก์ชัน, ชื่อ `it` เป็นประโยคอังกฤษ
- **IMPORTS**:
  ```typescript
  import { describe, expect, it } from 'vitest';
  import { segmentText, wrapText, fitTextToBox, initialFontSize, MIN_FONT_SIZE_PX } from '../text-layout';
  import type { MeasureTextFn } from '../types';
  ```
- **GOTCHA**: `Intl.Segmenter` มีใน Node 18+ จึงใช้ได้ใน vitest — แต่ **ผลการตัดคำไทยอาจต่างกัน
  ระหว่าง Node กับเบราว์เซอร์** (ICU คนละเวอร์ชัน) → **ห้าม assert ผลตัดคำแบบเป๊ะ ๆ**
  ให้ assert คุณสมบัติแทน เช่น "ทุกบรรทัดกว้างไม่เกินกรอบ" และ "ต่อกลับได้ข้อความเดิม"
- **VALIDATE**: `npx vitest run lib/rich-menu` เขียว

### Task 6: สร้าง `frontend/lib/rich-menu/__tests__/fonts.test.ts`

- **ACTION**: เทสต์การ parse CSS variable
- **IMPLEMENT**:
  ```typescript
  const fakeStyle = (value: string) =>
    ({ getPropertyValue: () => value }) as unknown as CSSStyleDeclaration;

  // เคส: ค่าปกติ, มีช่องว่างนำหน้า, มี quote ครอบ, ค่าว่าง → fallback
  ```
- **MIRROR**: `TEST_STRUCTURE`
- **IMPORTS**: `import { resolveThaiFontFamily, FALLBACK_FONT_STACK } from '../fonts';`
- **GOTCHA**: **ห้ามเทสต์ `ensureFontsReady`** — `document.fonts` ไม่มีใน jsdom
  ถ้าอยากครอบ ให้เทสต์แค่ว่ามัน return เงียบ ๆ ไม่ throw เมื่อไม่มี `document.fonts`
- **VALIDATE**: `npx vitest run lib/rich-menu` เขียว

### Task 7 (optional): dev harness สำหรับตรวจภาพด้วยตา

- **ACTION**: สร้างหน้าชั่วคราวสำหรับดูภาพที่ render จริง
- **IMPLEMENT**: `frontend/app/admin/rich-menus/_dev-preview/page.tsx` — `"use client"`,
  เรียก `ensureFontsReady` + `renderRichMenuImage` ด้วย `PRESET_TEMPLATES` แบบ 6 ปุ่ม
  และป้ายไทยจริง แล้วแสดง `<img>` จาก `URL.createObjectURL(blob)`
- **GOTCHA**: **ต้องลบทิ้งก่อน commit ของ Phase 1** หรือทำเป็น route ที่ไม่ถูกลิงก์จาก nav
  — ห้ามหลุดขึ้น production เพราะไม่มี auth guard
- **VALIDATE**: เปิดดูแล้วอ่านข้อความไทยออกครบทุกตัว รวมสระบน/ล่าง

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `segmentText` แยกคำไทยได้ | `'แจ้งเบาะแสยาเสพติด'` | ยาว > 1 element, `join('') === input` | ✅ ไทยไม่มีช่องว่าง |
| `segmentText` รักษาข้อความครบ | ข้อความไทยผสมอังกฤษ | `join('')` เท่ากับ input เป๊ะ | ✅ |
| `segmentText` มี fallback | ลบ `Intl.Segmenter` ชั่วคราว | ไม่ throw, คืน array ที่ join กลับได้ | ✅ browser เก่า |
| `wrapText` ทุกบรรทัดไม่ล้น | ข้อความยาว, maxWidth 400 | ทุกบรรทัด `fakeMeasure(line) <= 400` | - |
| `wrapText` ข้อความสั้น 1 บรรทัด | `'ติดต่อ'`, maxWidth 1000 | `['ติดต่อ']` | - |
| `wrapText` ข้อความว่าง | `''` | `[]` หรือ `['']` (ต้องไม่ throw) | ✅ |
| `wrapText` คำเดียวยาวเกินกรอบ | คำไทยยาว 30 อักขระ, maxWidth เล็ก | ต้องตัดได้ ไม่วนไม่รู้จบ | ✅ **เคยทำ infinite loop** |
| `fitTextToBox` ลดฟอนต์เมื่อไม่พอ | ข้อความยาวในกล่องเล็ก | `fontSizePx < startFontSizePx` | - |
| `fitTextToBox` ไม่ต่ำกว่าขั้นต่ำ | ข้อความยาวมากในกล่องจิ๋ว | `fontSizePx >= MIN_FONT_SIZE_PX`, `didTruncate === true` | ✅ |
| `fitTextToBox` ไม่เกิน MAX_LINES | ข้อความยาวมาก | `lines.length <= MAX_LINES` | - |
| `fitTextToBox` ข้อความว่าง | `''` | ไม่ throw, `lines` ว่างหรือ `['']` | ✅ |
| `fitTextToBox` ตัดท้ายด้วย `…` | ข้อความยาวเกินสุด | บรรทัดสุดท้ายลงท้าย `'…'` | ✅ |
| `initialFontSize` ตามขนาดกล่อง | กล่อง compact vs large | กล่องใหญ่กว่าได้ฟอนต์ใหญ่กว่า | - |
| `resolveThaiFontFamily` ค่าปกติ | `'__Noto_Sans_Thai_a1b2c3'` | คืนค่าเดิม | - |
| `resolveThaiFontFamily` มีช่องว่าง/quote | `' "__Noto_x" '` | `'__Noto_x'` | ✅ |
| `resolveThaiFontFamily` ค่าว่าง | `''` | `FALLBACK_FONT_STACK` | ✅ |

### Edge Cases Checklist

- [x] Empty input — ป้ายว่าง, ข้อความว่าง
- [x] Maximum size input — ป้ายยาวเกินกรอบมาก ๆ
- [x] Invalid types — ครอบด้วย TypeScript (ไม่ต้องเทสต์ runtime)
- [ ] Concurrent access — N/A (pure function)
- [ ] Network failure — N/A (ไม่มี network ในเฟสนี้)
- [ ] Permission denied — N/A (ไม่มี API call)
- [x] **Infinite loop** — คำเดียวที่ยาวเกินกรอบต้องไม่ทำให้ `wrapText` วนไม่รู้จบ
- [x] **สระบน/ล่าง** — "ปุ๊", "ญ์", "ที่" ต้องไม่ถูกตัดกลาง grapheme
- [x] **ไม่มี `Intl.Segmenter`** — fallback path

---

## Validation Commands

รันทั้งหมดใน **WSL** ตามข้อกำหนดของโปรเจกต์ (`cd frontend` ก่อน)

### Static Analysis
```bash
cd frontend && npx tsc --noEmit
```
EXPECT: Zero type errors

```bash
cd frontend && npx eslint lib/rich-menu
```
EXPECT: Zero errors (ระวัง React-Compiler rules ที่โปรเจกต์เปิดไว้ — แต่ Phase 1 ไม่มี React)

### Unit Tests
```bash
cd frontend && npx vitest run lib/rich-menu
```
EXPECT: ทุกเทสต์ผ่าน

### Full Test Suite
```bash
cd frontend && npx vitest run
```
EXPECT: ไม่มี regression — จำนวนเทสต์เดิมต้องยังผ่านครบ

### Build
```bash
cd frontend && npm run build
```
EXPECT: build สำเร็จ

### Database Validation
N/A — Phase 1 ไม่แตะ database

### Browser Validation
```bash
cd frontend && npm run dev
```
แล้วเปิด dev harness ของ Task 7
EXPECT: ภาพแสดงข้อความไทยครบถ้วน ไม่มีกล่องสี่เหลี่ยม ▯ ไม่มีสระขาด

> **GOTCHA (จาก memory ของโปรเจกต์)**: Next dev server ใน WSL **มองไม่เห็น** การแก้ไฟล์
> จากฝั่ง Windows (ไม่มี inotify ข้าม 9p) → ต้อง **restart dev server** ก่อนตรวจผลทุกครั้ง

### Manual Validation

- [ ] เปิด dev harness แล้วอ่านป้ายภาษาไทยออกครบทุกช่อง
- [ ] คำที่มีสระบน+วรรณยุกต์ (เช่น "แจ้งเบาะแส", "ที่ปรึกษา", "ปุ๊") แสดงครบ ไม่ถูกตัดบน/ล่าง
- [ ] ป้ายยาว ("ขอคำปรึกษาด้านกฎหมายและสิทธิมนุษยชน") ถูกย่อ/ตัดอย่างสวยงาม ไม่ล้นกรอบ
- [ ] ป้ายสั้น ("ติดต่อ") ยังได้ขนาดฟอนต์ใหญ่ อ่านง่าย
- [ ] ทดสอบครบทั้ง large (1686) และ compact (843)
- [ ] ทดสอบ template ที่ช่องขนาดไม่เท่ากัน (`3-buttons-left`) — ช่องเล็กต้องได้ฟอนต์เล็กลงเอง
- [ ] ขนาดไฟล์ที่ได้ ≤ 1 MB
- [ ] ปิด `Intl.Segmenter` ใน DevTools (`delete Intl.Segmenter`) แล้ว reload — ต้องยังวาดได้

---

## Acceptance Criteria

- [ ] Task 1-6 เสร็จครบ (Task 7 เป็น optional และต้องลบก่อน commit)
- [ ] `npx tsc --noEmit` ไม่มี error
- [ ] `npx eslint lib/rich-menu` ไม่มี error
- [ ] `npx vitest run` ผ่านทั้งหมด ไม่มี regression
- [ ] `npm run build` สำเร็จ
- [ ] Manual validation ผ่านครบทุกข้อ โดยเฉพาะข้อภาษาไทย
- [ ] **`git diff` ต้องไม่มีไฟล์ใน `app/admin/rich-menus/new/` หรือ `backend/` เลย**

## Completion Checklist

- [ ] ทุก export มี explicit return type
- [ ] ข้อความ error เป็นภาษาไทย (ตาม `ERROR_HANDLING`)
- [ ] `try/finally` ปล่อยทรัพยากรที่จองไว้ (ตาม `RESOURCE_CLEANUP`)
- [ ] ไม่มี `console.log` / `console.error` ใน `lib/rich-menu/`
- [ ] ไม่มีค่า magic number — ทุกค่าอยู่ใน constant ที่ตั้งชื่อแล้ว
- [ ] `text-layout.ts` **ไม่มี** การอ้างถึง `document`, `canvas`, หรือ `ctx` เลย
- [ ] ไม่ได้ลง package ใหม่ (`git diff package.json` ต้องว่าง)
- [ ] ไม่มีการขยายขอบเขตไปทำ UI หรือระบบสี

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `resolveThaiFontFamily` อ่าน CSS var ไม่ได้ในบาง context → ได้ fallback แบบเงียบ ๆ | M | H | คืน `FALLBACK_FONT_STACK` อย่างชัดเจน + ตรวจด้วยตาใน manual validation + พิจารณาเพิ่ม warning ใน dev |
| `ctx.textBaseline = 'middle'` วางสระไทยไม่กึ่งกลางจริง | M | M | ระบุทางแก้ไว้ใน Task 4 GOTCHA #2 แล้ว (ใช้ `actualBoundingBoxAscent/Descent`) |
| ผลตัดคำ `Intl.Segmenter` ต่างกันระหว่าง Node กับ Chrome ทำให้เทสต์เขียวแต่ของจริงเพี้ยน | M | M | เทสต์ assert คุณสมบัติ ไม่ assert ผลลัพธ์เป๊ะ + manual validation บนเบราว์เซอร์จริงเป็นด่านสุดท้าย |
| `wrapText` วนไม่รู้จบเมื่อคำเดียวกว้างเกินกรอบ | M | H | มีเทสต์เฉพาะเคสนี้ + ในลูปต้องมีเงื่อนไข "ถ้าบรรทัดว่างอยู่แล้วยังใส่ไม่ได้ ให้ใส่ไปเลยแล้วขึ้นบรรทัดใหม่" |
| นักพัฒนาเผลอทำ Phase 3 (UI) ไปด้วย | M | M | Acceptance criteria มีข้อ `git diff` ต้องไม่แตะ `new/page.tsx` |

## Notes

**ทำไมแยก `text-layout.ts` ออกจาก `render.ts`**
`frontend/vitest.config.ts` ตั้ง `environment: 'jsdom'` และ **โปรเจกต์ไม่ได้ลง package `canvas`**
→ `canvas.getContext('2d')` คืน `null` ใน vitest ถ้าเขียนรวมกันเป็นก้อนเดียวจะเทสต์อัตโนมัติไม่ได้เลย
การรับ `measure: MeasureTextFn` เป็นพารามิเตอร์ทำให้ตรรกะที่ซับซ้อนที่สุด (ตัดคำไทย + auto-shrink)
เทสต์ได้เต็มที่ เหลือเฉพาะการวาดที่ต้องตรวจด้วยตา

**ทำไมไม่ใช้ Puppeteer/Playwright ฝั่ง server แบบ LINE MCP**
บันทึกไว้ใน Decisions Log ของ PRD — สรุป: ไม่ต้องลง Chromium ~400MB บน Koyeb, ไม่มี cold start,
และ `PRESET_TEMPLATES` มีพิกัดอยู่แล้วจึงไม่ต้องพึ่ง CSS จัด layout

**บทเรียนที่ยกมาจาก LINE MCP โดยตรง**
`src/tools/createRichMenu.ts:257-338` แยกการคำนวณพิกัดปุ่ม (TypeScript) ออกจาก layout จริง (CSS ในไฟล์ .md)
→ แก้ที่หนึ่งโดยไม่แก้อีกที่ = ปุ่มกดไม่ตรง และไม่มีเทสต์จับ
แผนนี้จึงบังคับให้ `render.ts` รับ `areas[].bounds` **ชุดเดียวกับที่ `new/page.tsx:314-317` ส่งให้ LINE**
เพื่อให้ความผิดพลาดแบบนั้นเกิดขึ้นไม่ได้โดยโครงสร้าง

**ยังไม่ตัดสินใจ (ปล่อยให้ผู้ implement เลือกตอนเห็นภาพจริง)**
- ค่าที่แน่นอนของ `AREA_PADDING_RATIO` และ `initialFontSize` — ต้องปรับตามที่ตาเห็น
- `ctx.textBaseline` จะใช้ `'middle'` หรือคำนวณเองจาก metrics
