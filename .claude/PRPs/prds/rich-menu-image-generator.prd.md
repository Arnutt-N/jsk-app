# Rich Menu Image Generator

> ที่มา: ศึกษา [line/line-bot-mcp-server](https://github.com/line/line-bot-mcp-server) แล้วนำแนวคิด
> "สร้างภาพ Rich Menu อัตโนมัติจาก template + ป้ายข้อความ" มาปรับใช้กับ jsk-app
> (ไม่ได้นำโค้ดหรือ dependency ใด ๆ มาใช้ — นำเฉพาะแนวคิด)

## Problem Statement

แอดมินสร้าง Rich Menu ใน jsk-app ไม่จบในระบบเดียว เพราะ `POST /admin/rich-menus/{id}/upload`
(`backend/app/api/v1/endpoints/rich_menus.py:551`) บังคับให้ต้องมี **ไฟล์ภาพ 2500×1686 px ที่ทำมาก่อนแล้ว**
แอดมินที่ไม่ใช่ graphic designer จึงต้องออกไปทำภาพใน Canva/Photoshop แล้วกลับเข้ามาอัปโหลด
ต้นทุนของการไม่แก้: ทุกครั้งที่ต้องการเปลี่ยนป้ายเมนูแม้แค่คำเดียว ต้องวนลูปข้ามเครื่องมืออีกรอบ

## Evidence

- `POST /{id}/upload` รับ `UploadFile` เท่านั้น ไม่มี endpoint ใดสร้างภาพได้ (`rich_menus.py:551-592`)
- **มีหน้า `/admin/image-resize` ทั้งหน้า** พร้อม `RESIZE_PRESETS` ที่มี `line-rich-large` (2500×1686)
  และ `line-rich-compact` (2500×843) โดยเฉพาะ (`frontend/app/admin/image-resize/image-utils.ts:25-31`)
  — การที่ทีมลงทุนสร้างเครื่องมือย่อรูปเฉพาะทางขนาดนี้ คือหลักฐานว่า "ขั้นตอนเตรียมภาพ" เป็นจุดเจ็บจริง
- UI ปัจจุบันเตือนแอดมินเองว่า *"Ensure your image strictly matches the dimensions of the selected template"*
  (`frontend/app/admin/rich-menus/new/page.tsx:596`) — เป็นการโยนภาระความถูกต้องของขนาดไปให้ผู้ใช้
- **[สมมติฐาน — ยังไม่ได้ยืนยัน]** ยังไม่มีข้อมูลว่าแอดมินสร้าง Rich Menu บ่อยแค่ไหน หรือใช้เวลาต่อครั้งเท่าไร
  ต้องยืนยันด้วยการสัมภาษณ์แอดมิน 2-3 คน หรือดู `audit` log ของ `/rich-menus` ย้อนหลัง

## Proposed Solution

เพิ่มโหมด **"สร้างภาพให้อัตโนมัติ"** ในหน้า `/admin/rich-menus/new` โดย render ภาพด้วย **Canvas API
ฝั่งเบราว์เซอร์** จาก `PRESET_TEMPLATES` ที่มีอยู่แล้ว + ป้ายข้อความและสีที่แอดมินกรอก
ผลลัพธ์เป็น `File` object ที่ป้อนเข้า `FormData` เดิมของหน้านั้นตรง ๆ

เลือกทางนี้แทนการลอก LINE MCP (Marp + Puppeteer ฝั่ง server) ด้วย 2 เหตุผล:

1. **jsk-app มีพิกัดอยู่แล้ว** — `PRESET_TEMPLATES[].items[].areas[].bounds` (`new/page.tsx:68-180`)
   คือ layout ที่แม่นยำระดับพิกเซล ต่างจาก LINE MCP ที่ให้ CSS จัด layout แล้วค่อยคำนวณ bounds
   ตามทีหลังใน `richmenuBounds()` — ซึ่งเป็นจุดที่ภาพกับพื้นที่กดหลุดจากกันได้เงียบ ๆ
   ถ้าเรา render จาก `bounds` ชุดเดียวกับที่ส่งให้ LINE **ภาพกับพื้นที่กดจะตรงกันเสมอโดยโครงสร้าง**
2. **ไม่ต้องแตะ backend เลย** — ไม่ต้องลง Chromium ~400MB ใน Docker ของ Koyeb,
   ไม่ต้องแก้ endpoint, ไม่ต้อง migration, ไม่ต้อง deploy backend

## Key Hypothesis

เราเชื่อว่า **การสร้างภาพ Rich Menu ในหน้าเดียวกับที่ตั้งค่าเมนู** จะทำให้แอดมินที่ไม่มีทักษะกราฟิก
สร้างและแก้ Rich Menu ได้เองจนจบ โดยไม่ต้องออกไปใช้เครื่องมือภายนอก

เราจะรู้ว่าคิดถูกเมื่อ **Rich Menu ที่สร้างใหม่หลัง release ≥ 60% ใช้ภาพจาก generator (ไม่ใช่ไฟล์อัปโหลด)**

## What We're NOT Building

| ไม่ทำ | เหตุผล |
|---|---|
| MCP server ของ jsk-app | เพิ่ม attack surface ให้ระบบภาครัฐโดยยังไม่มี use case ที่ชัด — `credential.py` เป็น multi-tenant, การเปิด MCP ต้องทำ auth/audit ใหม่ทั้งชุด |
| Flex message validator แบบเข้ม | `backend/app/schemas/reply_object_validation.py` มี validator อยู่แล้ว และ **จงใจ** ปล่อย Flex เป็น free JSON ("Flex stays free JSON by design") — การรัดให้แน่นอาจทำ reply object เดิมพัง |
| Marp / Puppeteer / Playwright ฝั่ง backend | ต้นทุน image size + cold start บน Koyeb ไม่คุ้ม เมื่อ Canvas ทำงานเดียวกันได้ |
| อัปโหลดไอคอน / รูปพื้นหลัง | เลื่อนไป v2 — ต้องออกแบบ asset library และระบบ layout ที่ยืดหยุ่นก่อน |
| แก้ไข layout/ลากปรับกรอบเอง | `PRESET_TEMPLATES` 11 แบบครอบคลุมพอสำหรับ v1 |
| สร้างภาพจาก AI (text-to-image) | คาดเดาผลลัพธ์ไม่ได้ ไม่เหมาะกับงานราชการที่ต้องคุม branding |

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| **[Primary]** สัดส่วน Rich Menu ใหม่ที่ใช้ภาพจาก generator | ≥ 60% ภายใน 60 วันหลัง release | นับจาก `audit` log ของ `POST /rich-menus/{id}/upload` โดยเพิ่ม field แยกที่มาของภาพ — **ต้องออกแบบวิธีเก็บ (ดู Open Questions)** |
| เวลาจาก "สร้าง draft" ถึง "อัปโหลดภาพสำเร็จ" | ลดลง ≥ 50% เทียบ baseline | เทียบ timestamp `RichMenu.created_at` กับ audit log ของ upload |
| ภาพที่ generate ผ่านข้อจำกัด LINE | 100% (ขนาดถูก + ≤ 1 MB) | Unit test + assert ใน generator |
| Rich menu ที่ต้องแก้ภาพซ้ำภายใน 7 วัน | ไม่เพิ่มขึ้นจาก baseline | audit log |

## Open Questions

- [ ] **ยังไม่มี baseline** — ปัจจุบันแอดมินสร้าง Rich Menu กี่ครั้ง/เดือน ใช้เวลาเท่าไร? ต้องดู audit log ย้อนหลังก่อนตั้ง target จริง
- [ ] **จะแยก "ภาพจาก generator" vs "ภาพอัปโหลด" ยังไง?** `POST /{id}/upload` ปัจจุบันรับแค่ไฟล์ ไม่รู้ที่มา → ถ้าจะวัด metric หลัก อาจต้องเพิ่ม form field `source` (แต่ = แตะ backend ซึ่งขัดกับข้อดีข้อ 2) **ทางเลือก:** ใช้ชื่อไฟล์เป็นตัวบอก (`generated_*.png`) ซึ่งไม่ต้องแก้ backend แต่ก็ปลอมได้ — ยอมรับได้สำหรับ metric ภายใน
- [ ] **ฟอนต์ไทยบน Canvas** — จะ bundle ฟอนต์ (Noto Sans Thai / Sarabun) เข้า repo หรือใช้ `next/font`? ต้องยืนยันว่า `document.fonts.load()` ทำงานก่อน `ctx.fillText` ทุกครั้ง ไม่งั้นได้ฟอนต์ fallback ที่หน้าตาต่างกันในแต่ละเครื่อง
- [ ] มีคู่มือ branding ของ สธก. (สำนักงานยุติธรรมชุมชน) ที่กำหนดชุดสีบังคับหรือไม่? ถ้ามีควรทำเป็น preset
- [ ] ต้องรองรับภาษาอังกฤษ/ภาษาอื่นใน rich menu ด้วยไหม หรือไทยอย่างเดียว

---

## Users & Context

**Primary User**
- **Who**: เจ้าหน้าที่แอดมิน/ผู้ดูแลระบบของสำนักงานยุติธรรมชุมชน ที่มีสิทธิ์ `KEY_MANAGE_RICH_MENUS`
  ไม่มีพื้นฐานงานกราฟิก ไม่มี Photoshop/Illustrator
- **Current behavior**: เลือก template ในระบบ → ตั้งค่า action แต่ละปุ่ม → **ออกไปทำภาพข้างนอก** →
  กลับมาอาจแวะ `/admin/image-resize` เพื่อย่อขนาด → อัปโหลด → sync → publish
- **Trigger**: มีบริการใหม่ / เปลี่ยนชื่อเมนู / ปรับผังเมนูตามฤดูกาลหรือแคมเปญ
- **Success state**: กด "สร้างภาพ" แล้วเห็น preview ตรงกับที่จะออกจริงบน LINE แล้วกดบันทึกจบในหน้าเดียว

**Job to Be Done**
เมื่อ **ต้องเปลี่ยนเมนูใน LINE OA แต่ไม่มีคนทำกราฟิกให้**
ฉันอยาก **ได้ภาพเมนูที่ขนาดถูกต้องและอ่านง่ายทันที**
เพื่อที่ **จะเผยแพร่เมนูใหม่ได้เองภายในไม่กี่นาที โดยไม่ต้องรอใคร**

**Non-Users**
- Graphic designer ที่มีภาพสวย ๆ อยู่แล้ว → ยังใช้ทางอัปโหลดไฟล์เดิมได้ ต้องไม่ถูกบังคับให้ใช้ generator
- ผู้ใช้ปลายทางบน LINE → ไม่เห็นฟีเจอร์นี้เลย
- AI agent / ระบบภายนอก → v1 ไม่มี API สำหรับเรียกใช้

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| **Must** | Render Canvas จาก `PRESET_TEMPLATES[].areas[].bounds` ที่ขนาดจริง (2500×1686 / 2500×843) | คือแก่นของฟีเจอร์ และเป็นสิ่งที่รับประกันว่าภาพตรงกับพื้นที่กด |
| **Must** | รองรับข้อความไทยถูกต้อง (ฟอนต์ + สระ/วรรณยุกต์ + ตัดคำ) | ผู้ใช้เป็นหน่วยงานไทย ถ้าออกมาเป็น ▯▯▯ = ฟีเจอร์ใช้ไม่ได้เลย |
| **Must** | เลือกสีพื้นและสีตัวอักษรได้ | ตามที่ตัดสินใจไว้ — ทำให้เข้ากับ branding ได้โดยยังคุมความซับซ้อน |
| **Must** | Export เป็น PNG ≤ 1 MB และเสียบเข้า `FormData` เดิมของ `new/page.tsx` | LINE จำกัด 1 MB และ UI ปัจจุบันก็ประกาศไว้แล้ว |
| **Must** | Preview แบบสด เห็นก่อนบันทึก | ลดรอบแก้ และเป็นสิ่งที่แทนที่ "การเปิดดูใน Canva" |
| **Should** | ตรวจ contrast ระหว่างสีพื้นกับสีตัวอักษร แล้วเตือนถ้าอ่านยาก | สอดคล้องกับงาน a11y ที่ทำไปแล้วใน phase-2 และป้องกันเมนูที่อ่านไม่ออก |
| **Should** | ใช้ generator ได้ในหน้า `[id]/edit` ด้วย ไม่ใช่แค่ตอนสร้างใหม่ | การแก้ป้ายเมนูเกิดบ่อยกว่าการสร้างใหม่ |
| **Should** | ชุดสี preset 4-6 ชุดที่ผ่าน contrast แล้ว | แอดมินไม่ต้องเลือกสีเอง = เร็วขึ้นและปลอดภัยกว่า |
| **Could** | เส้นคั่นระหว่างช่อง (divider) ปรับความหนา/สีได้ | ช่วยให้เมนูดูเป็นปุ่มชัดขึ้น แต่ไม่ใช่ตัวขวาง |
| **Could** | ดาวน์โหลดภาพที่ generate ไว้ใช้ที่อื่น | สะดวก แต่ไม่ใช่แก่น |
| **Won't** | อัปโหลดไอคอน/รูปพื้นหลัง, ลาก-ปรับ layout, AI image | เลื่อนไป v2 ตามเหตุผลในหัวข้อ "What We're NOT Building" |

### MVP Scope

โหมด **"สร้างภาพเอง"** ในหน้า `/admin/rich-menus/new` ที่ประกอบด้วย:
1. Toggle สลับระหว่าง "อัปโหลดไฟล์" (ของเดิม) กับ "สร้างภาพเอง" (ใหม่) — **ของเดิมต้องยังทำงานได้ 100%**
2. ช่องกรอกป้ายข้อความ 1 ช่องต่อ 1 area (จำนวนช่องผูกกับ template ที่เลือก)
3. เลือกสีพื้น + สีตัวอักษร (มี preset ให้เลือก + custom)
4. Preview สด
5. ปุ่มยืนยัน → แปลงเป็น `File` → เข้า flow เดิมที่ `new/page.tsx:329`

**สิ่งที่ทำให้ MVP นี้พิสูจน์สมมติฐานได้**: แอดมินสร้าง Rich Menu ที่ใช้งานได้จริงบน LINE
โดยไม่เปิดโปรแกรมอื่นเลย

### User Flow

```
เลือก template (มีอยู่แล้ว)
        ↓
ตั้งค่า action ของแต่ละ area (มีอยู่แล้ว)
        ↓
[ใหม่] เลือกโหมด "สร้างภาพเอง"
        ↓
[ใหม่] พิมพ์ป้ายแต่ละช่อง + เลือกสี  ←──┐
        ↓                              │ แก้แล้วเห็นผลทันที
[ใหม่] Preview สด ────────────────────┘
        ↓
[ใหม่] กด "ใช้ภาพนี้" → Canvas.toBlob() → File
        ↓
POST /rich-menus (draft)  →  POST /{id}/upload  (เดิม ไม่แก้)
        ↓
sync → publish (เดิม ไม่แก้)
```

---

## Technical Approach

**Feasibility**: **HIGH**

**Architecture Notes**

- **Render ฝั่งเบราว์เซอร์ด้วย Canvas 2D** — `image-utils.ts:92-154` มีต้นแบบการใช้
  `canvas.toBlob()` + จัดการ quality/format อยู่แล้ว ใช้ pattern เดียวกันได้
- **`bounds` เป็น single source of truth** — ตัวเลขชุดเดียวกันถูกใช้ทั้งวาดภาพและส่งเป็น `areas` ให้ LINE
  จึงเป็นไปไม่ได้ที่ภาพกับพื้นที่กดจะไม่ตรงกัน (ต่างจาก LINE MCP ที่แยกกันอยู่คนละไฟล์)
- **จุดเชื่อมมีจุดเดียว**: `new/page.tsx:329-337` (`FormData.append` + POST `/upload`)
  → **ไม่มีการเปลี่ยนแปลงฝั่ง backend, ไม่มี migration, ไม่ต้อง deploy Koyeb**
- **แยก logic ออกจาก React** — วาง pure function ที่ `lib/rich-menu/render.ts` เพื่อให้ unit test
  ด้วย vitest ได้โดยไม่ต้อง mount component (ตามแนวเดียวกับ `image-utils.ts` ที่มี test แยก)

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **ฟอนต์ไทยไม่ถูกโหลดก่อนวาด** → Canvas fallback เป็นฟอนต์ระบบ ภาพต่างกันในแต่ละเครื่อง (นี่คือบั๊กเดียวกับที่ LINE MCP มี แต่ของเขาหนักกว่าเพราะ Docker ไม่มีฟอนต์ไทยเลย) | **H** | `await document.fonts.load('700 80px "Noto Sans Thai"')` ก่อนวาดทุกครั้ง + มี integration test ที่ assert ว่าฟอนต์พร้อม + bundle ฟอนต์ผ่าน `next/font` แทนพึ่งฟอนต์ระบบ |
| **ตัดคำไทยผิด** — Thai ไม่มีช่องว่าง `text.split(' ')` ใช้ไม่ได้เลย ป้ายยาวจะล้นกรอบ | **H** | ใช้ `Intl.Segmenter('th', { granularity: 'word' })` + fallback เป็นการตัดตามอักขระถ้าเบราว์เซอร์ไม่รองรับ + auto-shrink ขนาดฟอนต์เมื่อยังล้น |
| **สระบน/ล่างและวรรณยุกต์ถูกตัด** (เช่น ปุ๊, ญ์) เพราะคำนวณความสูงบรรทัดจาก font-size ตรง ๆ | **M** | ใช้ `TextMetrics.actualBoundingBoxAscent/Descent` แทนการเดาจาก font-size + snapshot test ด้วยคำที่มีสระบน-ล่างครบ |
| ภาพเกิน 1 MB (2500×1686 PNG สีทึบมักเล็ก แต่ถ้ามีสีไล่/ข้อความเยอะอาจโต) | **L** | assert ขนาดหลัง `toBlob` ถ้าเกินให้ลด quality หรือแจ้งเตือน — logic เดียวกับที่ `image-utils.ts` ทำอยู่ |
| Canvas ขนาด 2500×1686 หนักบนเครื่องสเปกต่ำ | **L** | render preview ที่ scale เล็ก (เช่น 1/4) แล้ว render ขนาดเต็มเฉพาะตอนกดยืนยัน |
| ทำ regression ให้ flow อัปโหลดเดิมพัง | **M** | toggle แยกโหมดชัดเจน + คงเส้นทางเดิมไว้ทั้งหมด + E2E test ครอบทั้ง 2 โหมด |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently
  DEPENDS: phases that must complete first
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Render core + ฟอนต์ไทย | Pure function วาด Canvas จาก bounds + จัดการฟอนต์/ตัดคำไทย พร้อม unit test | in-progress | - | - | [plan](../plans/rich-menu-image-generator-phase1.plan.md) |
| 2 | ระบบสี + contrast guard | Preset สี, color picker, ตรวจ contrast ratio | pending | with 3 | 1 | - |
| 3 | UI โหมดสร้างภาพ + preview | Toggle, ช่องกรอกป้าย, preview สด ในหน้า `new` | pending | with 2 | 1 | - |
| 4 | เชื่อมเข้า upload flow เดิม | แปลงเป็น File, ต่อเข้า FormData, จัดการ error | pending | - | 2, 3 | - |
| 5 | ขยายไปหน้า edit + E2E | ใช้ generator ในหน้า `[id]/edit` + E2E ครอบทั้ง 2 โหมด | pending | - | 4 | - |

### Phase Details

**Phase 1: Render core + ฟอนต์ไทย**
- **Goal**: ได้ pure function ที่รับ `{ areas, labels, colors }` แล้วคืน `Blob` ที่ถูกต้อง
- **Scope**: `frontend/lib/rich-menu/render.ts` + การโหลดฟอนต์ไทย + ตัดคำด้วย `Intl.Segmenter` +
  auto-shrink + unit test (รวมเคสคำไทยที่มีสระบน-ล่าง, ป้ายยาวเกิน, ป้ายว่าง)
- **Success signal**: `npx vitest run` ผ่าน และเปิดไฟล์ PNG ที่ได้แล้วอ่านข้อความไทยออกครบทุกตัว
- **หมายเหตุ**: นี่คือเฟสที่มีความเสี่ยงสูงสุดทั้งหมด ทำก่อนเพื่อให้รู้เร็วว่าติดตรงไหน

**Phase 2: ระบบสี + contrast guard**
- **Goal**: แอดมินเลือกสีได้โดยไม่สร้างเมนูที่อ่านไม่ออก
- **Scope**: preset สี 4-6 ชุด, color input, ฟังก์ชันคำนวณ contrast ratio (WCAG), คำเตือนเมื่อ < 4.5:1
- **Success signal**: เลือกสีขาวบนพื้นเหลืองแล้วมีคำเตือนขึ้น และ unit test ของ contrast ผ่าน

**Phase 3: UI โหมดสร้างภาพ + preview**
- **Goal**: แอดมินเห็นภาพก่อนบันทึก
- **Scope**: toggle 2 โหมดใน `new/page.tsx`, ช่องกรอกป้ายผูกกับจำนวน area ของ template, preview scale ย่อ
- **Success signal**: เปลี่ยน template แล้วจำนวนช่องกรอกเปลี่ยนตาม, พิมพ์แล้ว preview อัปเดต,
  โหมดอัปโหลดเดิมยังทำงานปกติ

**Phase 4: เชื่อมเข้า upload flow เดิม**
- **Goal**: กดบันทึกแล้ว rich menu ถูกสร้างจริงบน LINE
- **Scope**: `Blob → File` (ชื่อ `generated_*.png` เพื่อใช้แยกที่มาใน metric), ต่อเข้า `FormData` ที่
  `new/page.tsx:329`, จัดการ error ให้ผู้ใช้เข้าใจ (ห้ามกลืน error เงียบ ๆ)
- **Success signal**: สร้าง rich menu ด้วย generator แล้ว sync + publish ขึ้น LINE สำเร็จ และกดปุ่มบน
  LINE จริงแล้วยิง action ตรงช่อง

**Phase 5: ขยายไปหน้า edit + E2E**
- **Goal**: แก้ป้ายเมนูเดิมได้โดยไม่ต้องสร้างใหม่ และมั่นใจว่าไม่ทำของเดิมพัง
- **Scope**: นำ component จาก Phase 3 ไปใช้ที่ `[id]/edit/page.tsx` + Playwright E2E ครอบทั้ง 2 โหมด
- **Success signal**: `npx playwright test` ผ่าน และ CI เขียว

### Parallelism Notes

Phase 2 กับ 3 ทำขนานกันได้เพราะแตะไฟล์คนละชุด — Phase 2 อยู่ใน `lib/rich-menu/colors.ts`
ส่วน Phase 3 อยู่ใน component ของหน้า `new` ทั้งคู่ต้องรอ Phase 1 เพราะต้องใช้ signature
ของ render function ที่นิ่งแล้ว

Phase 1 **ต้องทำเดี่ยวและทำก่อนเสมอ** เพราะเป็นที่รวมความเสี่ยงทางเทคนิคทั้งหมด (ฟอนต์ + ตัดคำไทย)
ถ้าเฟสนี้เจอทางตัน ขอบเขตทั้ง PRD ต้องทบทวนใหม่

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| ที่ render ภาพ | Canvas ฝั่งเบราว์เซอร์ | Python+Playwright ฝั่ง backend (ตาม LINE MCP), Pillow | ไม่ต้องเพิ่ม Chromium ~400MB ใน Docker ของ Koyeb, ไม่มี cold start, ใช้ฟอนต์ไทยของเบราว์เซอร์ได้, ไม่ต้อง deploy backend |
| แหล่ง layout | `PRESET_TEMPLATES[].areas[].bounds` ที่มีอยู่ | เขียน template ใหม่แบบ Marp/HTML | พิกัดเดียวกับที่ส่งให้ LINE → ภาพกับพื้นที่กดตรงกันโดยโครงสร้าง ไม่ต้อง sync 2 ที่แบบ `richmenuBounds()` ของ LINE MCP |
| ขอบเขต v1 | ข้อความ + สีพื้น + สีตัวอักษร | แค่ข้อความ (แบบ LINE MCP), หรือเพิ่มไอคอน/รูปพื้นหลัง | แค่ข้อความอย่างเดียวจะถูกบ่นเรื่อง branding ทันที ส่วนไอคอน/รูปพื้นหลังต้องมี asset library ก่อน |
| จุดเชื่อมกับ backend | ไม่แตะ backend ใช้ `/upload` เดิม | เพิ่ม endpoint `/generate` | ลดความเสี่ยง deploy และทำให้ rollback ง่าย (แค่ซ่อน toggle) |
| ขอบเขต PRD | Rich Menu image generator เท่านั้น | รวม Flex validator และ MCP server | Flex validator แทบไม่เหลืองาน (มี `reply_object_validation.py` แล้ว) ส่วน MCP เพิ่มความเสี่ยงด้านความปลอดภัยโดยไม่มี use case |

---

## Research Summary

**Market Context**

- `line/line-bot-mcp-server` (Apache-2.0, LY Corporation, สถานะ preview) มี tool `create_rich_menu`
  ที่แปลง Markdown template → HTML ผ่าน Marp → screenshot ด้วย Puppeteer เป็น PNG 1600×910
  พร้อม template สำเร็จ 6 แบบ (1-6 ปุ่ม)
- **สิ่งที่ควรลอก**: แนวคิด "ให้ AI/ผู้ใช้ส่งมาแค่ *ข้อความ* แล้วระบบเสียบลง template ที่ออกแบบไว้แล้ว"
  ซึ่งเปลี่ยนปัญหา "สร้างภาพ" เป็นปัญหา "จัด layout" ที่คาดเดาผลลัพธ์ได้
- **สิ่งที่ไม่ควรลอก**:
  - `richmenuBounds()` (`src/tools/createRichMenu.ts:257-338`) คำนวณพิกัดปุ่มแยกจาก CSS ในไฟล์ template
    → ถ้าแก้ CSS โดยไม่แก้โค้ด ปุ่มจะกดไม่ตรงที่ และ **ไม่มี test จับ**
  - font stack เป็นภาษาญี่ปุ่นล้วน (`'Noto Sans JP', 'IPAexGothic', ...` — `createRichMenu.ts:171`)
    และ Dockerfile ลงเฉพาะฟอนต์ CJK/ญี่ปุ่น → ข้อความไทยมีความเสี่ยงสูงที่จะเป็น ▯▯▯
  - flow 5 ขั้นไม่มี rollback — ถ้าพังกลางทางจะทิ้ง rich menu ค้างบน LINE (`createRichMenu.ts:63-121`)
  - บังคับตั้งเป็น default เสมอ สร้างไว้เฉย ๆ ไม่ได้
- แนวทางที่ผลิตภัณฑ์อื่นใช้: เครื่องมือ rich menu ของ LINE OA Manager เองก็ใช้ template + ปรับข้อความ/สี
  เป็นหลัก ไม่ใช่ตัวแก้ภาพเต็มรูปแบบ — ยืนยันว่าขอบเขต v1 ที่เลือกสอดคล้องกับสิ่งที่ผู้ใช้คุ้นเคย

**Technical Context**

- `frontend/app/admin/rich-menus/new/page.tsx:68-180` — `PRESET_TEMPLATES` 11 แบบ
  (Large 2500×1686 จำนวน 7 แบบ, Compact 2500×843 จำนวน 4 แบบ) พร้อม `bounds` ครบทุก area
- `frontend/app/admin/rich-menus/new/page.tsx:329-337` — จุดเชื่อมเดียวที่ต้องแตะ (`FormData` → `/upload`)
- `frontend/app/admin/image-resize/image-utils.ts:92-154` — ต้นแบบ Canvas + `toBlob` + จัดการ quality
  ที่มี unit test แยกอยู่แล้วใน `__tests__/image-utils.test.ts` → ใช้เป็นแบบของ Phase 1
- `backend/app/api/v1/endpoints/rich_menus.py:551-592` — `/upload` รับ `UploadFile`, sanitize filename,
  อัปโหลดเข้า LINE ถ้ามี `line_rich_menu_id` แล้ว → **ไม่ต้องแก้อะไร**
- `backend/app/api/v1/endpoints/rich_menus.py:50-60` — `resolve_rich_menu_size()` map `template_type`
  → ขนาด canvas (compact 843 / large 1686) ต้องให้ generator ใช้ตรรกะเดียวกัน
- `backend/app/services/rich_menu_service.py` (454 บรรทัด) — alias, per-user link, bulk link, insights,
  sync แบบ idempotent ทั้งหมดนี้ **ไม่ถูกกระทบ**
- Playwright ติดตั้งแล้วใน `frontend/package.json` (`@playwright/test ^1.49.0`) ใช้กับ Phase 5 ได้เลย

---

*Generated: 2026-08-02*
*Status: DRAFT - needs validation (ดู Open Questions — โดยเฉพาะ baseline และวิธีวัด metric หลัก)*
