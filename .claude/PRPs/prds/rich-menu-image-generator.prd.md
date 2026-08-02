# Rich Menu Image Generator

> ที่มา: ศึกษา [line/line-bot-mcp-server](https://github.com/line/line-bot-mcp-server) แล้วนำแนวคิด
> "สร้างภาพ Rich Menu อัตโนมัติจาก template + ป้ายข้อความ" มาปรับใช้กับ jsk-app
> (ไม่ได้นำโค้ดหรือ dependency ใด ๆ มาใช้ — นำเฉพาะแนวคิด)

## Problem Statement

แอดมินสร้าง Rich Menu ใน jsk-app ไม่จบในระบบเดียว เพราะ `POST /admin/rich-menus/{id}/upload`
(`backend/app/api/v1/endpoints/rich_menus.py:551-592`) **รับได้เฉพาะ `UploadFile` ที่ทำมาก่อนแล้ว**
แอดมินที่ไม่ใช่ graphic designer จึงต้องออกไปทำภาพใน Canva/Photoshop แล้วกลับเข้ามาอัปโหลด
ต้นทุนของการไม่แก้: ทุกครั้งที่ต้องการเปลี่ยนป้ายเมนูแม้แค่คำเดียว ต้องวนลูปข้ามเครื่องมืออีกรอบ

> หมายเหตุความแม่นยำ: endpoint นี้ **ไม่ได้ตรวจขนาดภาพเลย** (มันแค่ sanitize ชื่อไฟล์แล้วเขียนลงดิสก์)
> ข้อจำกัด 2500×1686 มาจากฝั่ง LINE และจากคำเตือนใน UI ไม่ใช่จากการ validate ใน backend

## Evidence

### หลักฐานเชิงโครงสร้าง (ตรวจสอบได้)

- `POST /{id}/upload` รับ `UploadFile` เท่านั้น และ **ไม่มี endpoint ใดใน `rich_menus.py` สร้างภาพได้**
  (ตรวจครบทั้ง 21 `@router.*` decorator)
- UI ปัจจุบันเตือนแอดมินเองว่า *"Ensure your image strictly matches the dimensions of the selected
  template. Max size 1MB."* (`frontend/app/admin/rich-menus/new/page.tsx:596`)
  — เป็นการโยนภาระความถูกต้องของขนาดไปให้ผู้ใช้

### สัญญาณแวดล้อม (ไม่ใช่หลักฐานความเจ็บปวดของผู้ใช้)

- มีหน้า `/admin/image-resize` พร้อม `RESIZE_PRESETS` ที่มี `line-rich-large` (2500×1686) และ
  `line-rich-compact` (2500×843) (`frontend/app/admin/image-resize/image-utils.ts:25-31`)
  **แต่ต้องระวังการตีความ**: หน้านี้เกิดจาก commit `79fae00` / PR #106 *"Phase 2 — Rename & Restructure"*
  ซึ่งเป็นงานจัดระเบียบ sidebar — ไม่ได้เกิดจากคำร้องขอเรื่อง rich menu และ `RESIZE_PRESETS` มี **5 preset**
  (รวม `line-flex-hero`, `og-image`, `square-1080`) คือเป็นเครื่องมือย่อรูปอเนกประสงค์
  ที่บังเอิญมี rich menu อยู่ในลิสต์ ไม่ใช่เครื่องมือเฉพาะทาง

### ⚠️ ช่องว่างของหลักฐาน (ต้องปิดก่อน Phase 2)

**ยังไม่มีหลักฐานตรงว่ามีผู้ใช้เจ็บปวดจริง** — เมื่อถอดสัญญาณแวดล้อมข้างบนออก เอกสารนี้เหลือแค่
การอ่านโค้ดว่าระบบ *ทำงานอย่างไร* ซึ่งไม่ได้บอกว่า *มีใครเดือดร้อน* ต้องปิดด้วย:
1. สัมภาษณ์แอดมิน 2-3 คนที่ถือ `KEY_MANAGE_RICH_MENUS`
2. `SELECT count(*), min(created_at), max(created_at) FROM rich_menus;` เพื่อได้อัตราการสร้างจริง

Phase 1 (pure function) เดินต่อได้ระหว่างรอ เพราะไม่ขึ้นกับคำตอบเหล่านี้

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

เราจะรู้ว่าคิดถูกเมื่อ **แอดมินที่ไม่มีทักษะกราฟิก 3 ใน 3 คน สร้างเมนูที่ publish ได้จริง
ภายใน 10 นาที ในการทดสอบแบบมีผู้สังเกตการณ์ โดยไม่เปิดโปรแกรมอื่นและไม่ต้องถามใคร**

> เกณฑ์ "≥ 60% ภายใน 60 วัน" ของ REV 1 ถูกยกเลิก — พิสูจน์ว่าผิดไม่ได้ (ผลต่ำอธิบายได้เสมอว่า
> "ยังไม่มีใครสร้างเมนูใหม่") และตัวหารน่าจะเป็นเลขหลักเดียวเพราะ LINE ตั้งเมนูหลักได้ทีละอัน

## What We're NOT Building

| ไม่ทำ | เหตุผล |
|---|---|
| MCP server ของ jsk-app | เพิ่ม attack surface ให้ระบบภาครัฐโดยยังไม่มี use case ที่ชัด — `credential.py` เป็น multi-provider (LINE/TELEGRAM/n8n) ไม่ใช่ multi-tenant, การเปิด MCP ต้องทำ auth/audit ใหม่ทั้งชุด |
| Flex message validator แบบเข้ม | `backend/app/schemas/reply_object_validation.py` มี validator อยู่แล้ว และ **จงใจ** ปล่อย Flex เป็น free JSON ("Flex stays free JSON by design") — การรัดให้แน่นอาจทำ reply object เดิมพัง |
| Marp / Puppeteer / Playwright ฝั่ง backend | ต้นทุน image size + cold start บน Koyeb ไม่คุ้ม เมื่อ Canvas ทำงานเดียวกันได้ |
| อัปโหลดไอคอน / รูปพื้นหลัง | เลื่อนไป v2 — ต้องออกแบบ asset library และระบบ layout ที่ยืดหยุ่นก่อน |
| แก้ไข layout/ลากปรับกรอบเอง | `PRESET_TEMPLATES` 11 แบบครอบคลุมพอสำหรับ v1 |
| สร้างภาพจาก AI (text-to-image) | คาดเดาผลลัพธ์ไม่ได้ ไม่เหมาะกับงานราชการที่ต้องคุม branding |

## Success Metrics

> ⚠️ **แก้ REV 2**: metric ชุดเดิมวัดจาก "audit log ของ `/rich-menus`" ซึ่ง **ไม่มีอยู่จริง** —
> `grep -i audit backend/app/api/v1/endpoints/rich_menus.py` ได้ 0 ครั้ง (แม้ `core/audit.py` และ
> `models/audit_log.py` จะมีอยู่ก็ตาม) และการไปเพิ่ม audit ให้ endpoint นี้จะ **ขัดกับเสาหลัก
> "ไม่แตะ backend" ของ PRD ฉบับนี้เอง** จึงเปลี่ยนมาวัดจากสิ่งที่มีอยู่แล้ว

| Metric | Target | How Measured |
|--------|--------|--------------|
| **[Primary]** ✅ **Usability test กับแอดมินจริง 3 คน** | **ชนะ** = ทั้ง 3 คนทำครบทั้ง *สร้างใหม่* และ *แก้ป้ายของเมนูเดิม* ได้จริง ภายใน 10 นาทีต่อคน โดยไม่เปิดโปรแกรมอื่นและไม่ต้องถามใคร<br>**แพ้** = มีอย่างน้อย 1 คนทำไม่จบ หรือผลลัพธ์ไม่ผ่าน rubric ด้านล่าง | นั่งสังเกตการณ์ จับเวลา บันทึกจุดที่ติด — **รู้ผลใน 1 วัน** มีทั้งขาชนะและขาแพ้ชัดเจน (**ดูนิยามปฏิบัติการด้านล่าง — ต้อง preregister ก่อนทดสอบ**) |
| **[Secondary]** สัดส่วน Rich Menu ใหม่ที่ใช้ภาพจาก generator | ไม่ตั้งเป้าตัวเลข — ใช้ดูแนวโน้มอย่างเดียว เพราะตัวหารน่าจะ 1-5 เมนู | `RichMenu.image_path` ถูก persist อยู่แล้ว และ endpoint เขียนเป็น `{id}_{safe_name}` โดย sanitize แค่ `os.path.basename()` + `.replace("..","")` → prefix `generated_` รอดผ่าน จึงวัดได้ด้วย SQL ตรง ๆ **โดยไม่แตะ backend**:<br>`SELECT count(*) FILTER (WHERE image_path LIKE '%\_generated\_%') * 100.0 / count(*) FROM rich_menus WHERE created_at > '<release_date>';` |
| **[Guardrail]** tap rate ของเมนูที่สร้างด้วย generator | ไม่ต่ำกว่าเมนูก่อนหน้าเกิน 20% ที่ 14 วันหลัง publish | `GET /admin/rich-menus/{id}/insights/daily` (`rich_menus.py:459`) ซึ่ง **มีอยู่แล้ว** — นี่คือตัวเดียวที่จับได้ว่า "แอดมินทำเมนูเองได้เร็วขึ้น แต่ได้เมนูที่คนกดน้อยลง" |
| ภาพที่ generate ผ่านข้อจำกัด LINE | 100% (ขนาดถูก + ≤ 1 MB) | ~~metric~~ → **ย้ายเป็น acceptance criterion ของ Phase 1** เพราะเป็น 100% เสมอโดยนิยาม (เรา assert เอง) |

### ❌ metric ที่ถอดออกเพราะวัดไม่ได้ด้วยข้อมูลที่มี

- ~~เวลาจาก "สร้าง draft" ถึง "อัปโหลดภาพสำเร็จ"~~ — `RichMenu` มีแค่ `created_at` และ `updated_at`
  (`onupdate=func.now()`) **ไม่มี `image_uploaded_at`** และ `updated_at` ถูกทับทุกครั้งที่แก้ชื่อ/config
- ~~Rich menu ที่ต้องแก้ภาพซ้ำภายใน 7 วัน~~ — ต้องใช้ event history แต่ `image_path` เป็น current state
  ที่ถูกเขียนทับ นับ "แก้ซ้ำ" ไม่ได้

> ✅ **ปิดแล้ว (REV 3)** — target "≥ 60% ภายใน 60 วัน" ของ REV 1 ถูกยกเลิก เพราะตั้งขึ้นทั้งที่
> เอกสารยอมรับเองว่าไม่มี baseline และเนื่องจาก LINE OA มี default rich menu ได้ทีละหนึ่งอัน
> อัตราการสร้างจริงของหน่วยงานเดียวใน 60 วันน่าจะอยู่ที่ 1-5 อัน → "60%" = "2 ใน 3 อัน"
> ซึ่งเป็น anecdote ไม่ใช่ metric แทนที่ด้วย usability test 3 คน ตามตารางด้านบน

### นิยามปฏิบัติการของ metric (REV 4 — ต้อง preregister ก่อนทดสอบ ห้ามตัดสินหลังเห็นผล)

**Usability test**
- **ผู้เข้าร่วม**: ถือสิทธิ์ `KEY_MANAGE_RICH_MENUS` และ **ไม่เคยใช้ Photoshop/Illustrator/Figma
  ในงานประจำ** (ถามก่อนคัดเลือก ไม่ประเมินเอง)
- **โจทย์คงที่ 2 ข้อ เหมือนกันทุกคน** เพื่อให้เทียบกันได้:
  1. สร้างเมนู 6 ปุ่มด้วยป้ายที่กำหนดให้ (ใช้ป้ายจริงจาก `lib/constants/categories.ts`)
  2. แก้ป้ายช่องที่ 3 ของเมนูที่มีอยู่แล้ว ให้เป็นข้อความใหม่ที่กำหนด
- **rubric "ผลลัพธ์ผ่าน"** — ทั้ง 4 ข้อต้องเป็นจริง:
  1. ป้ายทุกช่องอ่านออกครบ ไม่มีตัวอักษรถูกตัดบน/ล่าง
  2. ไม่มีข้อความล้นออกนอกกรอบปุ่ม
  3. contrast ผ่าน 4.5:1
  4. กดปุ่มบน LINE จริงแล้ว action ตรงช่อง
- **จับเวลาแยกต่อโจทย์** นับตั้งแต่เปิดหน้าจนกด publish สำเร็จ

**Guardrail tap rate**
- **ตัวเศษ** = จำนวนการกดของ area ทั้งหมดในเมนูนั้น / **ตัวส่วน** = จำนวนผู้เห็นเมนู
  (ทั้งคู่จาก `GET /{id}/insights/daily`)
- **เมนูที่ใช้เทียบ** = เมนูที่เป็น default ตัวก่อนหน้าโดยตรง
- **จุดเริ่ม 14 วัน**: `RichMenu` **ไม่มี `published_at`** → ใช้วันแรกที่ insights มีข้อมูล > 0
  เป็นวันเริ่มนับ (บันทึกวันนั้นไว้ด้วยมือใน PRP report)
- **ถ้า LINE ปิดข้อมูลเพราะจำนวนผู้ใช้น้อยเกินเกณฑ์ → ผลเป็น "สรุปไม่ได้" ไม่ใช่ "ผ่าน"**

> ❌ **Gate เดิม "ถ้าสร้าง < 1 เมนู/เดือน ให้หยุดโครงการ" ถูกยกเลิกใน REV 5 — มันวัดผิดแกน**
> Rich menu เป็น **โครงสร้างพื้นฐานที่อยู่ถาวร ไม่ใช่งานที่ทำซ้ำ** สร้างครั้งเดียวแล้วผู้ติดตาม OA
> ทุกคนเห็นทุกวันไปอีกเป็นปี ความถี่ของ *งานแอดมิน* จึงไม่ได้สะท้อนคุณค่าของ *ผลลัพธ์*
> (ตรรกะเดียวกันจะสรุปว่าเครื่องมือ deploy ไม่ควรมีเพราะ deploy ไม่บ่อย)
>
> ที่สำคัญกว่า: **ตัวเลขต่ำอาจเป็นหลักฐานสนับสนุนฟีเจอร์นี้** ถ้าแอดมินไม่ค่อยแก้เมนูเพราะแก้ทีต้อง
> ไปตามหาคนทำกราฟิก ตัวเลขต่ำคือ *อาการ* ไม่ใช่ *ข้อสรุปว่าไม่มีความต้องการ* — การนับอย่างเดียว
> แยกสองอย่างนี้ไม่ออก ดู gate ที่ใช้แทนใน Open Questions

## Open Questions

- [ ] **ยังไม่มีหลักฐานตรงว่าสถานะปัจจุบันเป็นปัญหา** — ต้องถามแอดมิน 2-3 คนที่ถือ `KEY_MANAGE_RICH_MENUS` 3 คำถาม:
  1. **เมนูที่ live อยู่ตอนนี้ ตรงกับบริการที่หน่วยงานให้จริงหรือเปล่า?** (เมนูตั้งไว้นานแล้วบริการเปลี่ยนไป = หลักฐานของ friction ไม่ใช่ของความพอใจ)
  2. **มีอะไรที่อยากแก้ในเมนูแต่ยังไม่ได้แก้ไหม เพราะอะไร?** (ความตั้งใจที่ถูกบล็อก = หลักฐานตรงที่สุด)
  3. **ครั้งล่าสุดที่แก้ ใช้เวลาเท่าไร ต้องรอใครไหม?**
  **เกณฑ์เดินต่อ**: ถ้ามีอย่างน้อย 1 คนตอบข้อ 2 ว่า "มี" → ปัญหามีจริง เดินต่อได้
  ถ้าทุกคนบอกว่าเมนูปัจจุบันดีอยู่แล้วและไม่มีอะไรค้างอยากแก้ → ทบทวนว่าควรทำต่อไหม
- [ ] *(ข้อมูลประกอบ ไม่ใช่ตัวตัดสิน)* `SELECT count(*), min(created_at), max(created_at) FROM rich_menus;` — ช่วยให้เห็นว่าเมนูถูกแตะครั้งสุดท้ายเมื่อไร ซึ่งใช้ประกอบคำถามข้อ 1 ได้ **ดู audit log ไม่ได้** เพราะ `rich_menus.py` ไม่เขียน audit เลย
- [x] ~~จะแยก "ภาพจาก generator" vs "ภาพอัปโหลด" ยังไง?~~ **ปิดแล้ว** — `RichMenu.image_path` ถูก persist อยู่แล้วและ sanitizer ปล่อย prefix `generated_` ผ่าน → query ด้วย SQL ได้เลย ไม่ต้องแตะ backend (ดู Success Metrics)
- [x] ~~ฟอนต์ไทยบน Canvas — จะ bundle เองหรือใช้ next/font?~~ **ปิดแล้ว** — `app/layout.tsx:6-13` โหลด `Noto_Sans_Thai` (`subsets:['thai','latin']`, weight 400/500/700) ผ่าน `next/font/google` อยู่แล้ว **แต่พบความเสี่ยงใหม่ที่หนักกว่า**: ฟอนต์ไทยเป็น `@font-face` คนละไฟล์กับ latin และ `document.fonts.load()` โดยไม่ส่ง text จะโหลดเฉพาะ latin → ดู Technical Risks และ plan Task 2
- [ ] **มีข้อกำหนดเรื่องสีที่ต้องใช้หรือไม่?** — ยังไม่มีข้อมูลเลยว่าหน่วยงานมีคู่มือ branding หรือชุดสีบังคับหรือเปล่า (ค้นทั้ง repo ไม่พบไฟล์ใดกล่าวถึง) **ต้องถามผู้ใช้ ห้ามสมมติ**
  - ถ้า**มี** → Phase 2 ควรทำเป็น preset ล็อก ไม่ควรมี custom color picker
  - ถ้า**ไม่มี** → preset 4-6 ชุด + custom ที่ผ่าน contrast gate ตามที่วางไว้
- [ ] ต้องรองรับภาษาอังกฤษ/ภาษาอื่นใน rich menu ด้วยไหม หรือไทยอย่างเดียว

---

## Users & Context

**Primary User**
- **Who**: เจ้าหน้าที่แอดมิน/ผู้ดูแลระบบของศูนย์ยุติธรรมชุมชน (Community Justice Services) ที่มีสิทธิ์ `KEY_MANAGE_RICH_MENUS`
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
| **Must** | Render Canvas จาก `PRESET_TEMPLATES[].items[].areas[].bounds` ที่ขนาดจริง (2500×1686 / 2500×843) | คือแก่นของฟีเจอร์ และเป็นสิ่งที่รับประกันว่าภาพตรงกับพื้นที่กด |
| **Must** | รองรับข้อความไทยถูกต้อง (ฟอนต์ + สระ/วรรณยุกต์ + ตัดคำ) | ผู้ใช้เป็นหน่วยงานไทย ถ้าออกมาเป็น ▯▯▯ = ฟีเจอร์ใช้ไม่ได้เลย |
| **Must** | เลือกสีพื้นและสีตัวอักษรได้ | ตามที่ตัดสินใจไว้ — ทำให้เข้ากับ branding ได้โดยยังคุมความซับซ้อน |
| **Must** | Export เป็น PNG ≤ 1 MB และเสียบเข้า `FormData` เดิมของ `new/page.tsx` | LINE จำกัด 1 MB และ UI ปัจจุบันก็ประกาศไว้แล้ว |
| **Must** | Preview แบบสด เห็นก่อนบันทึก | ลดรอบแก้ และเป็นสิ่งที่แทนที่ "การเปิดดูใน Canva" |
| **Must** | **contrast guard: เตือน *และ* บล็อกปุ่มบันทึกเมื่อ < 4.5:1** | ✅ ตัดสินใจแล้ว — ความสามารถที่*สร้าง*ความเสี่ยง (เลือกสีเสรี) กับความสามารถที่*คุม*ความเสี่ยง ต้องอยู่ชั้นเดียวกัน ไม่งั้น = เครื่องมือที่ผลิตเมนูอ่านไม่ออกได้เร็วกว่าเดิม **ทางออกฉุกเฉินยังมี**: โหมดอัปโหลดไฟล์เดิมไม่ถูกบล็อก |
| **Must** | **หน้ายืนยันก่อน publish** — แสดงภาพขนาดจริงเต็มจอ + ให้พิมพ์ชื่อเมนูซ้ำเพื่อยืนยัน | ✅ ตัดสินใจแล้ว — ปัจจุบัน `KEY_MANAGE_RICH_MENUS` ตัวเดียวครอบตั้งแต่ create ถึง publish และ friction ธรรมชาติ (ต้องรอคนทำกราฟิก = ตาคู่ที่สอง) กำลังถูกฟีเจอร์นี้ลบทิ้ง **frontend ล้วน ไม่แตะ backend** |
| **Must** | **เตือนตอนพิมพ์เมื่อป้ายยาวเกินจนจะถูกตัด** | ✅ ตัดสินใจแล้ว — แก้ที่ต้นเหตุ แทนที่จะย่อฟอนต์เงียบ ๆ แล้วไปเห็นตอนขึ้น LINE ป้ายเมนู LINE ควรสั้นโดยธรรมชาติ ("แจ้งเบาะแส") ถ้าแอดมินพิมพ์ 46 ตัวอักษร แปลว่าใช้ป้ายผิดวิธี |
| **Should** | ใช้ generator ได้ในหน้า `[id]/edit` ด้วย ไม่ใช่แค่ตอนสร้างใหม่ | การแก้ป้ายเมนูเกิดบ่อยกว่าการสร้างใหม่ |
| **Should** | ชุดสี preset 4-6 ชุดที่ผ่าน contrast แล้ว | แอดมินไม่ต้องเลือกสีเอง = เร็วขึ้นและปลอดภัยกว่า |
| **Could** | เส้นคั่นระหว่างช่อง (divider) ปรับความหนา/สีได้ | ช่วยให้เมนูดูเป็นปุ่มชัดขึ้น แต่ไม่ใช่ตัวขวาง |
| **Could** | ดาวน์โหลดภาพที่ generate ไว้ใช้ที่อื่น | สะดวก แต่ไม่ใช่แก่น |
| **Won't** | อัปโหลดไอคอน/รูปพื้นหลัง, ลาก-ปรับ layout, AI image | เลื่อนไป v2 ตามเหตุผลในหัวข้อ "What We're NOT Building" |

### MVP Scope

โหมด **"สร้างภาพเอง"** ในหน้า `/admin/rich-menus/new` ที่ประกอบด้วย:
1. Toggle สลับระหว่าง "อัปโหลดไฟล์" (ของเดิม) กับ "สร้างภาพเอง" (ใหม่) — **ของเดิมต้องยังทำงานได้ 100%**
2. ช่องกรอกป้ายข้อความ 1 ช่องต่อ 1 area (จำนวนช่องผูกกับ template ที่เลือก)
   พร้อม **คำเตือนตอนพิมพ์เมื่อป้ายยาวจนจะถูกตัด**
3. เลือกสีพื้น + สีตัวอักษร (preset + custom) พร้อม **contrast guard ที่บล็อกปุ่มบันทึกเมื่อ < 4.5:1**
4. Preview สด
5. ปุ่มยืนยัน → แปลงเป็น `File` (ชื่อ `generated_*.png`) → เข้า flow เดิมที่ `new/page.tsx:330-331`

และที่หน้ารายการเมนู (`/admin/rich-menus`):

6. **หน้ายืนยันก่อน publish** — แสดงภาพขนาดจริงเต็มจอ + ให้พิมพ์ชื่อเมนูซ้ำ ก่อนเรียก
   `POST /{id}/publish` ที่ `rich-menus/page.tsx:99`

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
- **แยก logic ออกจาก React** — วาง pure function ที่ `lib/rich-menu/text-layout.ts` เพื่อให้ unit test
  ด้วย vitest ได้โดยไม่ต้อง mount component **ราคาที่ต้องจ่าย**: ความเสี่ยงเรื่องฟอนต์ทั้งหมดถูกย้ายไป
  กองใน `render.ts` ซึ่งไม่มี unit test เลย → ต้องมี runtime guard ไม่ใช่แค่เทสต์เพิ่ม (ดู plan Task 4)

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **ฟอนต์ไทยไม่ถูกโหลดก่อนวาด** → Canvas fallback เป็นฟอนต์ระบบ ภาพต่างกันในแต่ละเครื่อง (บั๊กเดียวกับที่ LINE MCP มี แต่ของเขาหนักกว่าเพราะ Docker ไม่มีฟอนต์ไทยเลย) | **H** | ฟอนต์ไทยเป็น `@font-face` **คนละไฟล์กับ latin** (`unicode-range: U+0E01-0E5B`) และ `document.fonts.load(font)` มี default text = `" "` → โหลดเฉพาะ latin **ต้องส่งข้อความไทยเป็น arg ที่ 2 เสมอ** + `assertThaiFontActive()` guard 3 ชั้นก่อนวาด (round-trip `ctx.font` + `fonts.check` + width probe) |
| **`ctx.font` invalid แล้วถูกเมินเงียบ ๆ** — spec บอกว่า "must be ignored" → คงค่า default `10px sans-serif` ทั้งที่ layout คำนวณบน 96px | **M** | ค่า `--font-noto-thai` เป็น font stack ที่มี quote (`'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif`) — **ห้ามลอก quote** assign ตรง ๆ ได้ + round-trip guard |
| **ตัดคำไทยผิด** — Thai ไม่มีช่องว่าง `text.split(' ')` ใช้ไม่ได้เลย ป้ายยาวจะล้นกรอบ | **H** | `Intl.Segmenter('th', {granularity:'word'})` + **`toBreakableUnits()`** กันสระหน้า (เ แ โ ใ ไ) ค้างท้ายบรรทัด และกัน "ๆ"/"." ขึ้นต้นบรรทัด (Segmenter ให้ UAX#29 ไม่ใช่ UAX#14) + fallback เป็น regex cluster (ไม่ใช่ตัดทีละ code point) + auto-shrink |
| **ผลตัดคำต่างกันข้ามเบราว์เซอร์** — ICU4C (Chrome) / ICU-Apple (Safari) / ICU4X (Firefox 125+) → PNG จากป้ายเดียวกันขึ้นบรรทัดไม่เหมือนกัน | **H** | รองรับ `\n` ที่แอดมินพิมพ์เองเป็น break hint ที่ deterministic + เทสต์ assert invariant ไม่ใช่ผลลัพธ์เป๊ะ |
| **สระบน/ล่างและวรรณยุกต์ถูกตัดหรือชนกัน** (เช่น ปุ๊, ญ์, ฟื้น) | **M** | ใช้ **`fontBoundingBoxAscent/Descent`** (ค่าคงที่ระดับฟอนต์) — **ห้ามใช้ `actualBoundingBox*`** ซึ่งผูกกับสตริง จะทำให้แต่ละช่องลอยไม่เท่ากันตามว่าคำนั้นมีวรรณยุกต์หรือไม่ ซึ่งดูพังกว่าเอียงเท่ากันทั้งกริด + line height ต้อง ≥ 1.51 em ตาม metrics ของฟอนต์เอง (ไม่ใช่ 1.35) + `ctx.clip()` ต่อช่อง |
| **ฟอนต์ย่อจนอ่านไม่ออก** — auto-shrink ไม่มีพื้นล่างที่สมเหตุผล | **M** | ตั้ง `MIN_FONT_SIZE_PX = 96` (≈ 15 CSS px บนจอ 390pt) และ `MAX_LINES = 2` ค่าเดิม 28px = **4.4 CSS px** ซึ่งไทยแยก ข/ช, ผ/ฝ และวรรณยุกต์ ่/้/๊/๋ ไม่ออก + เตือนความยาวป้ายตอนพิมพ์ใน Phase 3 **⚠️ ยังไม่ผ่านการทดสอบกับผู้ใช้จริง**: บนจอเล็กสุด 320pt เหลือ 12.3 CSS px และ `MAX_LINES = 2` เป็น product constraint ไม่ใช่ข้อจำกัดพื้นที่ (3-4 บรรทัดยังพอดี) ต้องยืนยันใน usability test |
| ภาพเกิน 1 MB (2500×1686 PNG สีทึบมักเล็ก แต่ถ้ามีสีไล่/ข้อความเยอะอาจโต) | **L** | assert ขนาดหลัง `toBlob` แล้ว throw พร้อมขนาดจริง — **ไม่มี precedent ให้ลอก**: `image-utils.ts` ไม่มีการเช็คขนาดหลัง toBlob เลย ตัวที่ใกล้ที่สุดคือ `use-image-resize.ts:196-199` ซึ่งเทียบกับ 10 MB แล้ว toast + หยุด ไม่ลด quality |
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
| 2 | ระบบสี + contrast (logic) | `colors.ts`: preset สี + `getContrastRatio()` + unit test — **ไม่มี UI** | pending | with 3 | 1 | - |
| 3 | UI โหมดสร้างภาพ + preview | Toggle, ช่องกรอกป้าย, preview สด, **color input + บล็อกปุ่มเมื่อ contrast ไม่ผ่าน**, **เตือนความยาวป้าย** | pending | with 2 | 1 | - |
| 4 | เชื่อม upload + ยืนยันก่อน publish | แปลงเป็น File, ต่อเข้า FormData, **หน้ายืนยันก่อน publish ที่ `rich-menus/page.tsx`** | pending | - | 2, 3 | - |
| 5 | ขยายไปหน้า edit + E2E | ใช้ generator ในหน้า `[id]/edit` + E2E ครอบทั้ง 2 โหมด | pending | - | 4 | - |

### Phase Details

**Phase 1: Render core + ฟอนต์ไทย**
- **Goal**: ได้ `renderRichMenuImage(options: { width, height, areas: { bounds, label }[], colors, fontFamily }): Promise<Blob>`
  โดย **เฉพาะ helper ใน `text-layout.ts` เท่านั้นที่เป็น pure** ส่วน `render.ts` ผูกกับ browser state
- **Scope**: `frontend/lib/rich-menu/{types,text-layout,fonts,render}.ts` + การโหลดฟอนต์ไทย + ตัดคำด้วย `Intl.Segmenter` +
  auto-shrink + unit test (รวมเคสคำไทยที่มีสระบน-ล่าง, ป้ายยาวเกิน, ป้ายว่าง)
- **Success signal**: `npx vitest run` ผ่าน และเปิดไฟล์ PNG ที่ได้แล้วอ่านข้อความไทยออกครบทุกตัว
- **หมายเหตุ**: นี่คือเฟสที่มีความเสี่ยงสูงสุดทั้งหมด ทำก่อนเพื่อให้รู้เร็วว่าติดตรงไหน

**Phase 2: ระบบสี + contrast guard** — *ปรับขอบเขตเป็น logic ล้วน*
- **Goal**: มีฟังก์ชันคำนวณ contrast ที่เชื่อถือได้ และชุดสี preset ที่ผ่านเกณฑ์ทุกคู่
- **Scope**: `lib/rich-menu/colors.ts` — preset สี 4-6 ชุด + `getContrastRatio()` (WCAG) + unit test
  **ไม่รวม UI** (color input และคำเตือนย้ายไป Phase 3 เพราะต้องมีหน้าจอก่อนถึงจะทดสอบได้จริง)
- **Success signal**: unit test ผ่าน และ **ทุกคู่สีใน preset ได้ contrast ≥ 4.5:1** — ทดสอบได้เองโดยไม่ต้องรอเฟสอื่น

**Phase 3: UI โหมดสร้างภาพ + preview**
- **Goal**: แอดมินเห็นภาพก่อนบันทึก และถูกกันไม่ให้สร้างเมนูที่อ่านไม่ออก
- **Scope**: toggle 2 โหมดใน `new/page.tsx`, ช่องกรอกป้ายผูกกับจำนวน area, preview scale ย่อ,
  **color input + คำเตือน contrast ที่บล็อกปุ่มบันทึก**, **คำเตือนความยาวป้ายตอนพิมพ์**
- **Success signal**: เปลี่ยน template แล้วจำนวนช่องกรอกเปลี่ยนตาม / พิมพ์แล้ว preview อัปเดต /
  เลือกสีขาวบนพื้นเหลืองแล้ว**ปุ่มบันทึกกดไม่ได้** / พิมพ์ป้ายยาวเกินแล้วมีคำเตือนขึ้นทันที /
  โหมดอัปโหลดเดิมยังทำงานปกติ

**Phase 4: เชื่อมเข้า upload flow เดิม + หน้ายืนยันก่อน publish**
- **Goal**: กดบันทึกแล้ว rich menu ถูกสร้างจริงบน LINE โดยผ่านด่านยืนยันก่อนถึงประชาชน
- **Scope**:
  - `Blob → File` (ชื่อ `generated_*.png` เพื่อใช้แยกที่มาใน metric) ต่อเข้า `FormData` ที่
    `frontend/app/admin/rich-menus/new/page.tsx:330-331`, จัดการ error ให้ผู้ใช้เข้าใจ (ห้ามกลืน error เงียบ ๆ)
  - **หน้ายืนยันก่อน publish** — ⚠️ **ต้องทำที่ `frontend/app/admin/rich-menus/page.tsx:99`**
    ซึ่งเป็นที่เดียวที่เรียก `POST /{id}/publish` **ไม่ใช่ที่ `new/page.tsx`** ซึ่งเรียกแค่
    `/upload` และ `/sync` (บรรทัด 341) เท่านั้น
  - ต้องระบุด้วยว่า confirmation ใช้กับ **ทุกเมนู** หรือเฉพาะเมนูที่ภาพมาจาก generator
    (ข้อเสนอ: ทุกเมนู — เพราะความเสี่ยงคือ "เผยแพร่ผิด" ไม่ใช่ "ภาพมาจากไหน")

> ⚠️ **ข้อจำกัดที่ต้องบันทึกไว้**: confirmation ที่ทำฝั่ง frontend อย่างเดียว **ข้ามได้ด้วยการ
> เรียก API ตรง** มันเป็นการกันพลาดมือ (UX friction) **ไม่ใช่ security control**
> ถ้าภายหลังสำนักงานออกระเบียบบังคับอนุมัติจริง จะต้องบังคับที่ backend และบันทึกว่าใคร
> publish เมื่อไร ซึ่ง `rich_menus.py` ยังไม่เขียน audit log เลยในปัจจุบัน
- **Success signal**: สร้าง rich menu ด้วย generator แล้ว sync + publish ขึ้น LINE สำเร็จ และกดปุ่มบน
  LINE จริงแล้วยิง action ตรงช่อง / กด publish โดยไม่พิมพ์ชื่อยืนยันแล้วไปต่อไม่ได้

### Rollout & Rollback

- **Rollout**: เปิด toggle "สร้างภาพเอง" ให้ role ที่กำหนดก่อน แล้วค่อยเปิดทั่วไป
- **Rollback ฟีเจอร์**: ซ่อน toggle → กลับไปโหมดอัปโหลดไฟล์เดิม 100%
- **Rollback ผลลัพธ์ (เมนูผิดที่ publish ไปแล้ว)** — *runbook ที่ REV 1 ขาดไป*:
  1. เปิดเมนูตัวก่อนหน้าที่สถานะยัง `SYNCED`
  2. `POST /admin/rich-menus/{id}/publish` เพื่อ `set_default_on_line` ทับตัวที่ผิด
  3. เป้าหมาย < 5 นาที
- **ห้ามลบเมนูตัวเดิมทิ้ง** จนกว่าตัวใหม่จะอยู่ได้ 24 ชม.

**Phase 5: ขยายไปหน้า edit + E2E**
- **Goal**: แก้ป้ายเมนูเดิมได้โดยไม่ต้องสร้างใหม่ และมั่นใจว่าไม่ทำของเดิมพัง
- **Scope**: นำ component จาก Phase 3 ไปใช้ที่ `[id]/edit/page.tsx` + Playwright E2E ครอบทั้ง 2 โหมด
- **Success signal**: `npx playwright test` ผ่าน และ CI เขียว

### Parallelism Notes

Phase 2 กับ 3 ทำขนานกันได้ **หลังปรับขอบเขต Phase 2 ให้เป็น logic ล้วน** — Phase 2 อยู่ใน
`lib/rich-menu/colors.ts` ส่วน Phase 3 อยู่ใน component ของหน้า `new` ทั้งคู่ต้องรอ Phase 1
เพราะต้องใช้ signature ของ render function ที่นิ่งแล้ว

> REV 1 เขียนว่าขนานกันได้เพราะ "แตะไฟล์คนละชุด" ซึ่งเป็นเงื่อนไข *จำเป็นแต่ไม่เพียงพอ* —
> Phase 2 เดิมมี color input และคำเตือนซึ่งต้องไปแสดงบนหน้าจอที่ Phase 3 เป็นคนสร้าง
> success signal เดิม ("เลือกสีขาวบนพื้นเหลืองแล้วมีคำเตือนขึ้น") จึงทดสอบไม่ได้จนกว่า Phase 3 จะเสร็จ
> REV 3 ย้าย UI ทั้งหมดไป Phase 3 ทำให้ทั้งสองเฟสตรวจผลของตัวเองได้จริง

Phase 1 **ต้องทำเดี่ยวและทำก่อนเสมอ** เพราะเป็นที่รวมความเสี่ยงทางเทคนิคทั้งหมด (ฟอนต์ + ตัดคำไทย)
ถ้าเฟสนี้เจอทางตัน ขอบเขตทั้ง PRD ต้องทบทวนใหม่

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| ที่ render ภาพ | Canvas ฝั่งเบราว์เซอร์ | Python+Playwright ฝั่ง backend (ตาม LINE MCP), Pillow | ไม่ต้องเพิ่ม Chromium ~400MB ใน Docker ของ Koyeb, ไม่มี cold start, ใช้ฟอนต์ไทยของเบราว์เซอร์ได้, ไม่ต้อง deploy backend |
| แหล่ง layout | `PRESET_TEMPLATES[].items[].areas[].bounds` ที่มีอยู่ | เขียน template ใหม่แบบ Marp/HTML | พิกัดเดียวกับที่ส่งให้ LINE → ภาพกับพื้นที่กดตรงกันโดยโครงสร้าง ไม่ต้อง sync 2 ที่แบบ `richmenuBounds()` ของ LINE MCP |
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
  ใช้เป็นแบบของ Phase 1 — **หมายเหตุ**: `resizeImage` เองไม่มี unit test ชุดเทสต์ครอบเฉพาะ helper บริสุทธิ์ ซึ่งยิ่งยืนยันว่าต้องแยก pure logic ออกมา
- `backend/app/api/v1/endpoints/rich_menus.py:551-592` — `/upload` รับ `UploadFile`, sanitize filename,
  อัปโหลดเข้า LINE ถ้ามี `line_rich_menu_id` แล้ว → **ไม่ต้องแก้อะไร**
- `backend/app/api/v1/endpoints/rich_menus.py:50-60` — `resolve_rich_menu_size()` map `template_type`
  → ขนาด canvas (compact 843 / large 1686) ต้องให้ generator ใช้ตรรกะเดียวกัน
- `backend/app/services/rich_menu_service.py` (454 บรรทัด) — alias, per-user link, bulk link, insights,
  sync แบบ idempotent ทั้งหมดนี้ **ไม่ถูกกระทบ**
- Playwright ติดตั้งแล้วใน `frontend/package.json` (`@playwright/test ^1.49.0`) ใช้กับ Phase 5 ได้เลย

---

## Changelog

**REV 2 (2026-08-02)** — แก้หลังรีวิวด้วย 4 agent ขนาน โดยผู้เขียนตรวจยืนยันข้อเท็จจริงเองทุกข้อแล้ว

| # | REV 1 เขียนว่า | ความจริงที่ตรวจแล้ว |
|---|---|---|
| 1 | Metric วัดจาก "audit log ของ `/rich-menus`" (3 ใน 4 ตัว) | **`rich_menus.py` ไม่เขียน audit เลย** (grep = 0) และการเพิ่มจะขัดกับเสาหลัก "ไม่แตะ backend" ของ PRD เอง → เปลี่ยนไปวัดจาก `image_path LIKE '%\_generated\_%'` ด้วย SQL |
| 2 | metric "เวลา draft→upload" และ "แก้ภาพซ้ำใน 7 วัน" | วัดไม่ได้ — ไม่มี `image_uploaded_at`, `updated_at` ถูกทับ, `image_path` เป็น current state ไม่ใช่ event history → **ถอดออก** |
| 3 | (ไม่มี guardrail metric) | เพิ่ม tap rate จาก `GET /{id}/insights/daily` ซึ่งมีอยู่แล้ว — ตัวเดียวที่จับได้ว่า "เร็วขึ้นแต่เมนูแย่ลง" |
| 4 | หน้า `/admin/image-resize` = **หลักฐาน** ว่าขั้นเตรียมภาพเจ็บจริง | มาจาก PR #106 *"Phase 2 — Rename & Restructure"* (งานจัดระเบียบ sidebar) และมี 5 preset ไม่ใช่เครื่องมือเฉพาะทาง → ลดชั้นเป็น "สัญญาณแวดล้อม" และยอมรับว่า **ยังไม่มีหลักฐานตรง** |
| 5 | `rich_menus.py:551` "บังคับให้ต้องมีไฟล์ 2500×1686" | endpoint **ไม่ validate ขนาดเลย** ข้อจำกัดมาจาก LINE และคำเตือนใน UI |
| 6 | `PRESET_TEMPLATES[].areas[].bounds` | path ไม่มีจริง — ต้องเป็น `PRESET_TEMPLATES[].items[].areas[].bounds` |
| 7 | pure function อยู่ที่ `lib/rich-menu/render.ts` | ขัดกับ plan — ชั้น pure คือ `text-layout.ts` ส่วน `render.ts` เป็นชั้นที่เทสต์ไม่ได้ |
| 8 | "assert ขนาดหลัง toBlob — logic เดียวกับที่ `image-utils.ts` ทำอยู่" | `image-utils.ts` ไม่มี logic นั้น; ตัวใกล้เคียงคือ `use-image-resize.ts:196-199` ที่เทียบกับ 10 MB แล้ว toast + หยุด |
| 9 | `credential.py` เป็น multi-tenant | เป็น multi-**provider** (LINE/TELEGRAM/n8n) ไม่มี tenant column |
| 10 | ความเสี่ยงฟอนต์ = "โหลดก่อนวาดก็พอ" | ฟอนต์ไทยเป็น `@font-face` **คนละไฟล์กับ latin** และ `document.fonts.load()` มี default text `" "` → โหลดไม่ถูกไฟล์; ต้องมี `assertThaiFontActive()` guard |
| 11 | แก้สระเบี้ยวด้วย `actualBoundingBox*` | ผูกกับสตริง → แต่ละช่องลอยไม่เท่ากัน **แย่กว่าเดิม** ต้องใช้ `fontBoundingBox*` |
| 12 | `MIN_FONT_SIZE_PX=28` "≈12px บนมือถือ" | คำนวณผิดหน่วย จริงคือ **4.4 CSS px** → `[DECISION-PENDING-1]` |

**REV 3 (2026-08-02)** — เจ้าของงานตัดสิน `[DECISION-PENDING]` ครบทั้ง 4 ข้อ

| ข้อ | ตัดสินใจ | ผลต่อขอบเขต |
|---|---|---|
| 1 | **`MIN_FONT_SIZE_PX = 96`, `MAX_LINES = 2`** + เพิ่มคำเตือนความยาวป้ายตอนพิมพ์ | ป้ายยาวถูกตัด "…" เร็วขึ้น แลกกับทุกป้ายอ่านออกจริงบนมือถือ (96px บนภาพ 2500px ≈ 15 CSS px) และแก้ที่ต้นเหตุด้วยการเตือนใน Phase 3 → เพิ่ม **Must** ใหม่ |
| 2 | **contrast guard เป็น Must + เตือนและบล็อกปุ่มบันทึก** | ย้ายจาก Should → Must; **ปรับขอบเขต Phase 2 เป็น logic ล้วน** และย้าย UI ไป Phase 3 เพื่อให้แต่ละเฟสตรวจผลตัวเองได้ |
| 3 | **หน่วยงานไม่มีระเบียบบังคับอนุมัติ** → ใส่หน้ายืนยันก่อน publish (ไม่ทำ approval workflow) | เพิ่ม **Must** ใหม่ใน Phase 4 — frontend ล้วน ไม่แตะ backend ไม่ขยายจำนวนเฟส |
| 4 | **usability test กับแอดมินจริง 3 คน** แทน "≥60% ใน 60 วัน" | เปลี่ยน primary metric + hypothesis; รู้ผลใน 1 วันแทน 60 วัน |

**เพิ่มเติมจากรีวิวที่ทำไปพร้อมกัน**: เพิ่มหัวข้อ Rollout & Rollback พร้อม runbook กู้เมนูที่ publish ผิด
ซึ่ง REV 1-2 ขาดไป (REV 1 จับประเด็นนี้กับ LINE MCP ได้ถูกต้อง แต่ไม่ได้ย้อนมาตรวจระบบตัวเอง)

**REV 4 (2026-08-02)** — แก้ตามรีวิวของ Codex (`codex exec --sandbox read-only`)
Codex ยืนยันว่าการแก้ของ REV 2 **ถูกต้อง 21 ข้อ** แต่พบว่า PRD ยังมีข้อความค้างจากก่อน REV 3
และ metric ยังนิยามไม่พอจะวัดจริง ผู้เขียนตรวจยืนยันเองครบทุกข้อแล้ว

| # | REV 3 เขียนว่า | ความจริง / สิ่งที่แก้ |
|---|---|---|
| 1 | หน้ายืนยันก่อน publish ทำที่ `new/page.tsx:330-331` | **ผิดที่** — `new/page.tsx` เรียกแค่ `/upload` และ `/sync` (บรรทัด 341) ส่วน `POST /{id}/publish` อยู่ที่ **`frontend/app/admin/rich-menus/page.tsx:99`** → ย้ายไปที่ถูก + ระบุว่าใช้กับทุกเมนู + **บันทึกไว้ว่า frontend-only ข้ามได้ด้วยการเรียก API ตรง เป็น UX friction ไม่ใช่ security control** |
| 2 | Phase 1 Goal: "pure function ที่รับ `{ areas, labels, colors }`" | ค้างจากก่อน REV 2 — `label` ย้ายเข้า area แล้ว และมีแค่ `text-layout.ts` ที่ pure ส่วน `render.ts` ผูกกับ browser state |
| 3 | ตาราง phase: Phase 2 มี "color picker", Phase 4 ไม่มี confirmation | ขัดกับ Phase Details ที่ REV 3 แก้ไปแล้ว → sync ตารางให้ตรง |
| 4 | MVP Scope 5 ข้อ | ขาด Must ใหม่ทั้ง 3 ตัว (contrast บล็อก / เตือนความยาวป้าย / หน้ายืนยัน) → เพิ่มครบ |
| 5 | Usability test + tap rate ระบุเป็นประโยคเดียว | วัดจริงไม่ได้ — ไม่มีนิยาม "ไม่มีทักษะกราฟิก", ไม่มี rubric, ไม่มีโจทย์คงที่; tap rate ไม่มีตัวเศษ/ตัวส่วน/เมนูเทียบ และ `RichMenu` **ไม่มี `published_at`** ให้เริ่มนับ 14 วัน → เพิ่มหัวข้อ "นิยามปฏิบัติการ" ครบทุกจุด + ระบุว่าข้อมูลไม่พอ = "สรุปไม่ได้" ไม่ใช่ "ผ่าน" |
| 6 | hypothesis พูดถึง "สร้างและแก้" แต่ test ครอบแค่การสร้าง | เพิ่มโจทย์ที่ 2 (แก้ป้ายของเมนูเดิม) เข้า test |
| 7 | 96px "รับประกันว่าทุกป้ายอ่านออก" | **อ้างเกินจริง** — 15 CSS px คิดบนจอ 390pt เท่านั้น จอ 320pt เหลือ 12.3 และการตัดด้วย `…` แปลว่าเนื้อหาบางส่วนหายไปจริง; `MAX_LINES = 2` ก็เป็น product constraint ไม่ใช่ข้อจำกัดพื้นที่ (3-4 บรรทัดยังพอดีใน 643px) → ปรับถ้อยคำเป็น "ต้องยืนยันด้วย usability test" |
| 8 | Phase 1 = "APPROVED for implementation" | REV 4 ลดเป็น **technical spike** เพราะ gate เรื่องความถี่ — **แต่ REV 5 ยกเลิก gate นั้นและคืนสถานะ APPROVED** (ดูด้านล่าง) |

---

**REV 5 (2026-08-02)** — เจ้าของงานคัดค้าน gate เรื่องความถี่ และคัดค้านถูก

| REV 4 เขียนว่า | ความจริง |
|---|---|
| ถ้าสร้าง < 1 เมนู/เดือน ให้หยุดโครงการ → Phase 1 เป็น spike ที่ยังไม่ merge | **วัดผิดแกน** — rich menu เป็นโครงสร้างพื้นฐานถาวร ไม่ใช่งานที่ทำซ้ำ สร้างครั้งเดียวแล้วผู้ติดตามเห็นทุกวันไปอีกเป็นปี ความถี่ของงานแอดมินไม่สะท้อนคุณค่าของผลลัพธ์ และ **ตัวเลขต่ำอาจเป็นหลักฐานสนับสนุนฟีเจอร์** (ไม่ค่อยแก้เพราะแก้ยาก) การนับแยกสองกรณีนี้ไม่ออก → **ยกเลิก gate, คืนสถานะ Phase 1 เป็น APPROVED** |
| baseline = นับจำนวนเมนูด้วย SQL | เปลี่ยนเป็น **ถามแอดมิน 3 คำถามเรื่องสถานะปัจจุบัน** (เมนูตรงกับบริการไหม / มีอะไรอยากแก้แต่ยังไม่ได้แก้ไหม / ครั้งล่าสุดใช้เวลาเท่าไร) ส่วน SQL ลดชั้นเป็นข้อมูลประกอบ |

> ที่มาของความผิดพลาด: gate นี้มาจาก agent ที่รีวิว PRD และผมรับมาโดยไม่ได้ตรวจสมมติฐานของมัน
> ว่า "ความถี่ของงาน" กับ "คุณค่าของฟีเจอร์" เป็นคนละแกนกัน

---

*Generated: 2026-08-02 (REV 5)*
*Status: **APPROVED for implementation** — Phase 1 เริ่มและ merge ได้ ไม่มี gate ขวางแล้ว*
*⚠️ ยังควรปิดก่อน Phase 2: หลักฐานตรงจากแอดมิน 3 คำถาม + มีข้อกำหนดเรื่องสีบังคับหรือไม่ + ภาษาที่ต้องรองรับ*
