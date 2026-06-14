# Chatbot Management & System and Utilities — Audit & Hardening

> **Scope**: ตรวจสอบ (audit) + ยกระดับ (harden) 2 โดเมนใหญ่ของ JskApp admin dashboard ให้ถึงระดับ production / enterprise security
> **Structure**: 1 PRD → หลาย implementation phases (รันทีละ phase ตาม pipeline loop)
> **Generated**: 2026-06-14

---

## Problem Statement

Admin dashboard ของ JskApp มีฟีเจอร์ Chatbot Management และ System Management ที่ "ดูเหมือนครบ" แต่ผลการ audit โค้ดจริงพบว่าหลายส่วน **ทำงานไม่ครบ/ผิด/ไม่ปลอดภัย** (เช่น broadcast ตั้งเวลาแต่ไม่เคยส่งจริง, DIRECTOR/HEAD login เข้าระบบไม่ได้, audit log บันทึกแค่ live-chat) ทำให้เจ้าหน้าที่ใช้งานจริงไม่ได้ตามที่คาด และระบบขาด access control แบบรวมศูนย์ ต้นทุนของการไม่แก้คือ ความเสี่ยงด้านความปลอดภัย + งานที่เชื่อว่าทำได้แต่จริง ๆ ล้มเหลวเงียบ ๆ

## Evidence

หลักฐานจาก audit codebase จริง (2026-06-14, 2 agents สำรวจ Chatbot + System Management):

- **[CRITICAL] DIRECTOR/HEAD เข้า admin ไม่ได้**: `backend/app/api/deps.py:133` — `get_current_admin` อนุญาตเฉพาะ `ADMIN, SUPER_ADMIN, AGENT` ทั้งที่ enum มี `DIRECTOR, HEAD` (`models/user.py:25-26`) → 2 role นี้ถูก block ทั้งระบบ
- **[CRITICAL] Broadcast scheduler ไม่มีจริง**: `services/broadcast_service.py:229-245` เก็บ `scheduled_at` + `status=SCHEDULED` แต่ไม่มี cron/worker poll ส่ง → ข้อความตั้งเวลาไม่เคยถูกส่งอัตโนมัติ
- **[HIGH] Chat Histories CSV ไม่ได้ต่อ**: backend CSV มีที่ `admin_export.py` แต่ frontend (`chat-histories/[lineUserId]/page.tsx:171-185`) export แค่ `.txt` ผ่าน client-side Blob
- **[HIGH] Rich menu compact ขนาดผิด**: `rich_menus.py:47-73` hard-code `height:1686` ทุก template → compact (ควร 843) จะถูก LINE API reject
- **[HIGH] Audit Log ไม่ครอบคลุม**: เขียน log จริงแค่ใน `ws_live_chat.py`/`live_chat_service.py` — User CRUD, Settings, Permission changes ไม่ถูก log
- **[MEDIUM] Permission ปัจจุบันครอบแค่ request workflow**: `core/permissions.py` มี 5 keys (`assign_request`, `self_assign_request`, `revert_approval`, `edit_request_details`, `edit_permission_settings`) — ไม่มี permission สำหรับ Chatbot / File / User / Settings
- **[MEDIUM] Reply Objects ขาด message types**: `reply-objects/page.tsx:27` มีแค่ 8 types — ขาด Template (Buttons/Confirm/Carousel/Image carousel), Coupon, Text v2, Quick reply
- **[MEDIUM] File storage เป็น BLOB ใน DB** + `thumbnail_url` (`media_file.py:87`) ไม่เคย populate → Image Resize ต้องสร้าง pipeline ใหม่ทั้งหมด

## Proposed Solution

ทำเป็น **PRD เดียว แตกเป็น 6 phases** รันทีละ phase ตาม pipeline loop (branch → PRD → plan → implement → review → PR → CI → merge → phase ถัดไป) โดยยึดหลัก **"extend ไม่ replace"** — ต่อยอดของเดิมที่เสถียรแล้ว (permission engine, audit model) เพื่อลดความเสี่ยง production ให้ต่ำสุด เริ่มจาก **audit-first + ปิด CRITICAL bug** ก่อน แล้วค่อยไล่ rename → permissions v2 → chatbot hardening → system utilities → design system

## Key Hypothesis

เราเชื่อว่าการ **audit อย่างเป็นระบบ + ปิด gap/bug ที่ซ่อนอยู่ + วาง access control แบบ module-based** จะทำให้ admin dashboard **ใช้งานได้จริงครบทุกฟีเจอร์และปลอดภัยระดับ enterprise** สำหรับเจ้าหน้าที่ทุกระดับ (SUPER_ADMIN → Operator)
เราจะรู้ว่าถูกทางเมื่อ: ทุกฟีเจอร์ที่ระบุผ่าน E2E test จริง, ทุก role login + เห็นเฉพาะสิ่งที่มีสิทธิ์, scheduled broadcast ส่งได้จริง, และทุก privileged action ถูกบันทึกใน audit log

## What We're NOT Building

- **ไม่ rename enum value `AGENT` ใน DB** — เปลี่ยนแค่ display label เป็น "Operator" (เลี่ยง migration เสี่ยง) ตามที่ตัดสินใจไว้
- **ไม่เขียน permission system ใหม่ทั้งหมด** — extend ตาราง `permission_settings` เดิม (ไม่ rebuild)
- **ไม่ย้าย file storage จาก DB BLOB ไป object storage ในรอบนี้** — บันทึกเป็น tech debt (กระทบ Image Resize แต่ไม่บล็อก)
- **ไม่เปลี่ยน role hierarchy** — DIRECTOR/HEAD/AGENT คงโครงสร้างเดิม แค่แก้ให้เข้าระบบได้ + label
- **ไม่รวม LINE LIFF mini-apps** — โฟกัสเฉพาะ admin dashboard

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| ฟีเจอร์ Chatbot ที่ทำงานครบจริง | 100% ของรายการใน PRD | E2E + manual checklist |
| Role ที่ login + เห็น nav ถูกต้อง | 6/6 roles | E2E auth test ต่อ role |
| Scheduled broadcast ส่งสำเร็จ | ส่งภายใน ±1 นาทีของเวลาตั้ง | Integration test + log |
| Privileged actions ที่ถูก audit-logged | ≥ 95% ของ write actions | Audit log coverage scan |
| CRITICAL/HIGH security issues คงค้าง | 0 | code-review + security-reviewer |
| Test coverage (โค้ดใหม่/แก้) | ≥ 80% | pytest --cov / vitest |

## Open Questions

- [ ] Image Resize: เก็บผลลัพธ์ที่ไหน (BLOB เดิม / populate `thumbnail_url` / object storage ใหม่)? — ตัดสินตอน plan Phase 5
- [ ] Permission v2: per-module override เก็บระดับ "ต่อ role" หรือ "ต่อ user" ด้วย? — เริ่มที่ต่อ role ก่อน, per-user เป็น Could
- [ ] Broadcast scheduler: ใช้ APScheduler in-process หรือ external cron/worker (Vercel cron + endpoint)? — ตัดสินตอน plan Phase 4
- [ ] Design System: ทำ tokens package แยก (`skn-design-tokens-package`) หรือคงใน tailwind config? — รอผล Design System audit

---

## Users & Context

**Primary User**
- **Who**: เจ้าหน้าที่ admin ของศูนย์ยุติธรรมชุมชน (SUPER_ADMIN / ADMIN / DIRECTOR / HEAD / Operator) ที่ดูแล LINE OA — จัดการ broadcast, ตอบแชต, ตั้งค่า auto-reply, ดูรายงาน
- **Current behavior**: ใช้ dashboard ทำงานประจำวัน แต่ชน gap (ตั้งเวลา broadcast แล้วไม่ส่ง, export ได้แค่ txt, บาง role เข้าไม่ได้)
- **Trigger**: ต้องส่งข่าวสารถึงประชาชน / ตอบเรื่องร้องเรียน / มอบหมายงานตามสิทธิ์
- **Success state**: ทำงานได้ครบจบในระบบเดียว ไม่มีฟีเจอร์หลอก, เห็นเฉพาะสิ่งที่ตนมีสิทธิ์

**Job to Be Done**
When ผู้ดูแลระบบต้องบริหารแชตบอตและจัดการระบบหลังบ้าน, I want to ใช้เครื่องมือที่ทำงานได้จริงครบถ้วนและมีการคุมสิทธิ์ชัดเจน, so I can ให้บริการประชาชนได้อย่างมั่นใจและปลอดภัย โดยไม่ต้องกังวลว่าฟีเจอร์จะล้มเหลวเงียบ ๆ

**Non-Users**
- ประชาชนผู้ใช้ LIFF (USER role) — ไม่ใช่กลุ่มเป้าหมายของงานนี้
- ระบบภายนอก (Telegram/n8n) — เป็น integration ที่มีอยู่แล้ว ไม่ใช่โฟกัสหลัก

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | Audit report เป็นเอกสารอ้างอิง + ปิด CRITICAL (DIRECTOR/HEAD access, StaffRole type) | เป็นฐานตัดสินใจ scope + ของพังต้องแก้ก่อน |
| Must | Rename System Management → System and Utilities + AGENT label → Operator | ความต้องการตรงของผู้ใช้, low risk |
| Must | Permission v2 แบบ module-based (extend ของเดิม, 3 modules + presets + override) | แกนกลาง access control ที่ทุก feature ผูกอยู่ |
| Must | Broadcast scheduler ที่ส่งจริง + CSV export wiring + rich menu size fix | ปิด CRITICAL/HIGH ที่ทำให้ฟีเจอร์ใช้ไม่ได้ |
| Should | Reply Objects ครบทุก message type + Quick reply | ความครบของ LINE Messaging API |
| Should | Audit Log ครอบคลุม write actions ทั้งระบบ | enterprise compliance |
| Should | Image Resize utility (เมนูใหม่) | ความต้องการตรงของผู้ใช้ |
| Should | Design System ปรับปรุง tokens/components + เอกสาร | ฐาน UI ที่สม่ำเสมอ |
| Could | Narrowcast / multicast UI + Multi-rich-menu switching | ฟีเจอร์ขั้นสูง LINE |
| Could | Permission override ระดับราย user | ความยืดหยุ่นเพิ่ม |
| Won't | ย้าย file storage ไป object storage | นอก scope รอบนี้ (tech debt) |
| Won't | rename enum `AGENT` ใน DB | เสี่ยง migration โดยไม่จำเป็น |

### MVP Scope

**Phase 1 = Audit Report (เอกสาร) + ปิด CRITICAL bug** — validate สมมติฐานว่า "ของที่ดูครบจริง ๆ มี gap" และทำให้ทุก role เข้าระบบได้ ก่อนลงทุนสร้างของใหม่

### User Flow (critical path)

```
Operator/Admin login → (ทุก role เข้าได้) → เห็น nav ตามสิทธิ์ (module-based)
   → เข้า Chatbot > Broadcast → สร้าง+ตั้งเวลา → ระบบส่งจริงตามเวลา → ดูผลใน report
   → ทุก action ถูกบันทึกใน Audit Log
```

---

## Technical Approach

**Feasibility**: HIGH — โครงสร้างพื้นฐานดีอยู่แล้ว (permission engine DB-backed + cache, audit model, LINE SDK lazy init, async SQLAlchemy) งานส่วนใหญ่คือ "ต่อยอด + ปิด gap" ไม่ใช่สร้างใหม่จากศูนย์

**Architecture Notes**
- **Permission v2 = extend pattern เดิม**: เพิ่ม permission keys ใหม่ลงตาราง `permission_settings` + `DEFAULT_POLICY` + `ensure_seed_rows()`; UI จัดกลุ่ม key เป็น 3 module (Service Requests / Chatbot Management / System & Utilities) + role presets + per-module override; **enforce ที่ backend เป็น single source of truth** (`core/permissions.py`), frontend `lib/permissions.ts` แค่ mirror
- **AGENT rename = label layer เท่านั้น**: สร้าง role-label map กลาง (เช่น `lib/constants/roles.ts`) — `AGENT → "Operator (เจ้าหน้าที่)"`; enum/DB ไม่แตะ; "Staff" = คำรวม internal users (ไม่รวม USER) ใช้ใน Settings/permissions header
- **Broadcast scheduler**: เพิ่ม worker/cron poll `status=SCHEDULED AND scheduled_at <= now()` → เรียก `send_broadcast()` (เลือก APScheduler vs Vercel cron ตอน plan)
- **SUPER_ADMIN = Manage ทุก module ล็อกแก้ไม่ได้** — invariant ป้องกัน lockout (มี safeguard เดิมใน `settings.py:146-155` ขยายต่อ)

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Permission v2 ทำของเดิมพัง | M | Extend ไม่ replace; เก็บ 5 keys เดิมครบ; regression test Service Requests |
| Broadcast scheduler ส่งซ้ำ/ส่งพลาด | M | Idempotency (lock row / status guard); test ด้วย time mock |
| Rename label ตกหล่นบางจุด | M | ใช้ central label map + grep blast-radius (มี list แล้วใน audit) |
| DIRECTOR/HEAD เปิดสิทธิ์แล้วเห็นเกิน | M | กำหนด preset ชัดใน Phase 3; E2E ต่อ role |
| Image Resize ช้าเพราะ BLOB | L | จำกัดขนาด input; async processing; บันทึกเป็น tech debt |

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
| 1 | Audit & Critical Fixes | Audit report เอกสาร + ปิด DIRECTOR/HEAD access bug + StaffRole type + deps gate | in-progress | - | - | [phase1 plan](../plans/chatbot-system-utilities-audit-phase1.plan.md) |
| 2 | Rename & Restructure | System Management→System and Utilities + AGENT label→Operator + sidebar nav + Image Resize menu placeholder | pending | - | 1 | - |
| 3 | Permissions v2 (module-based) | Extend permission_settings: keys ใหม่ Chatbot+System + UI 3-module + role presets + per-module override | pending | - | 1, 2 | - |
| 4 | Chatbot Management Hardening | Broadcast scheduler + CSV export wiring + rich menu size fix + Reply Objects ครบ types + (Could) narrowcast/multi-menu | pending | with 5 | 3 | - |
| 5 | System & Utilities Features | Image Resize utility (เต็ม) + Audit Log coverage expansion + Reports polish | pending | with 4 | 3 | - |
| 6 | Design System | tokens/component library ปรับปรุง + เอกสาร UX/UI base (ใช้ Impeccable + karpathy skills) | pending | - | 2 | - |

### Phase Details

**Phase 1: Audit & Critical Fixes** _(MVP)_
- **Goal**: มีเอกสาร audit เป็น single source of truth + ทุก role เข้าระบบได้
- **Scope**: เขียน audit report (รวมผลจาก 3 agents), แก้ `deps.py:133` ให้รวม DIRECTOR/HEAD, แก้ `StaffRole` type (frontend) ให้ครบ 6 role, regression test auth ต่อ role
- **Success signal**: ทั้ง 6 role login ได้; audit report ผ่าน review; auth E2E เขียว

**Phase 2: Rename & Restructure**
- **Goal**: ป้ายและโครงสร้างเมนูตรงตามที่ต้องการ โดยไม่กระทบ DB
- **Scope**: rename group "System Management"→"System and Utilities" (`layout.tsx:179`); central role-label map; เปลี่ยน AGENT label→"Operator" ทุก UI; เพิ่มเมนู "Image Resize" (placeholder/route); จัดกลุ่ม nav ให้สอดคล้อง
- **Success signal**: ไม่มี "System Management"/"Staff (เจ้าหน้าที่)" ตกค้างผิดที่; nav แสดงถูกต้องทุก role; visual regression ผ่าน

**Phase 3: Permissions v2 (module-based)**
- **Goal**: access control รวมศูนย์ 3 module + presets + override
- **Scope**: เพิ่ม keys ใหม่ (`manage_broadcast`, `manage_auto_replies`, `manage_rich_menus`, `manage_reply_objects`, `export_chat`, `manage_users`, `manage_files`, `view_reports`, `view_audit_log`, `edit_settings`, `image_resize`) + DEFAULT_POLICY + seed; helper `can_*` + module grouping; UI matrix (role × module, level None/View/Edit/Manage) + per-module override; backend enforce ทุก endpoint ที่เกี่ยว; SUPER_ADMIN lock
- **Success signal**: ทุก privileged endpoint gated; Service Requests เดิมไม่ regress; E2E permission ต่อ role/module เขียว

**Phase 4: Chatbot Management Hardening** _(parallel with 5)_
- **Goal**: ฟีเจอร์ chatbot ทำงานจริงครบ
- **Scope**: broadcast scheduler (ส่งตามเวลา + idempotent); wire CSV export ที่ chat-histories; fix rich menu compact size (843); เติม Reply Objects types (Template/Coupon/Text v2/Quick reply) + preview; (Could) narrowcast/multicast UI, multi-rich-menu switching (`richmenuswitch`), response ordering UI; แก้ label bug หน้า broadcast detail
- **Success signal**: scheduled broadcast ส่งจริง; CSV ดาวน์โหลดได้; rich menu sync สำเร็จทุก template; E2E + unit เขียว

**Phase 5: System & Utilities Features** _(parallel with 4)_
- **Goal**: เมนู utilities ครบ + audit log มีคุณค่า
- **Scope**: Image Resize utility เต็ม (upload→resize→download / populate thumbnail); ขยาย audit logging ครอบ User/Settings/Permission CRUD (decorator/helper กลาง); Reports polish (enum แทน string literal, period consistency, org filter)
- **Success signal**: Image Resize ใช้งานได้; ≥95% write actions ถูก log; reports ถูกต้อง; tests เขียว

**Phase 6: Design System**
- **Goal**: ฐาน UI สม่ำเสมอ + เอกสาร
- **Scope**: รวม design tokens เป็น single source; ทบทวน component library (`components/ui`, `components/admin`); แก้ hardcoded values; เอกสาร UX/UI base; ใช้ skill `impeccable` + `andrej-karpathy-skills` สำหรับคุณภาพ frontend (อ้างผล Design System audit ตัวที่ 3)
- **Success signal**: tokens single-source; component consistency ผ่าน checklist; เอกสารพร้อมใช้; a11y/visual regression เขียว

### Parallelism Notes

- **Phase 1 → 2 → 3 เป็นแกน sequential** (ต้องมี role ครบ + โครงสร้างก่อนวาง permission)
- **Phase 4 และ 5 รันขนานกันได้** หลัง Phase 3 — คนละโดเมน (Chatbot vs System) ไม่ชนไฟล์หลัก
- **Phase 6 (Design System)** เริ่มได้หลัง Phase 2 (rename เสร็จเพื่อเลี่ยง conflict) และทำคู่ขนานกับ 4/5 ได้ในทางทฤษฎี แต่แนะนำทำท้ายเพื่อให้ UI ของ feature ใหม่ทุกตัวมาใช้ token เดียวกัน

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| โครงสร้าง PRD | 1 PRD + 6 phases | แยก PRD ต่อโดเมน/feature | permissions+design เป็นแกนร่วม, เข้ากับ pipeline loop |
| Role naming | Operator=AGENT(แค่ label), Staff=คำรวม internal | rename จริงใน DB / คงคำว่า agent | เลี่ยง migration, ลดความเสี่ยง, blast radius ต่ำ |
| Operators scope | แค่ AGENT | รวม DIRECTOR/HEAD | ตรงโครงสร้างองค์กรจริง (ผอ./หัวหน้าแยก) |
| Permission strategy | Extend ตารางเดิม (module-based view) | เขียนใหม่ทั้งระบบ | audit ยืนยันของเดิมดี+เสถียร, production-safe |
| MVP phase | Audit report ก่อน | rename/permission/design ก่อน | ตรงเจตนา "investigate & audit", เป็นฐาน scope |
| File storage | คง BLOB ใน DB รอบนี้ | ย้าย object storage | นอก scope, เป็น tech debt บันทึกไว้ |

---

## Research Summary

**Market Context**
- เทียบ pattern กับ enterprise admin (Google Workspace / Microsoft 365 admin roles): RBAC + scoped override เป็นมาตรฐาน — โมเดล "role presets + per-module override" ที่เลือกสอดคล้อง
- LINE Messaging API: message types, rich menu (`richmenuswitch` สำหรับ multi-menu), narrowcast/multicast/broadcast — ต้องอ้าง official docs + context7 ตอน implement แต่ละ feature (ตาม remark ผู้ใช้)

**Technical Context** (จาก codebase audit จริง)
- Role hierarchy จริง 6 ระดับ (CLAUDE.md ระบุผิดว่า 4) — `models/user.py:7-28`
- Permission engine: DB-backed + in-process cache + DEFAULT_POLICY fallback + `ensure_seed_rows` self-heal — `core/permissions.py`
- Sidebar nav hardcoded ใน `layout.tsx:156-188`; "System Management" = string เดียวที่ `:179`
- AGENT blast radius: backend enum + ~19 จุด, frontend ~22 จุด (UI labels ส่วนใหญ่หน้า users แสดง "Staff" อยู่แล้ว) — list เต็มใน audit report
- Audit log model พร้อม (`models/audit_log.py`) แต่ instrument แค่ live-chat
- File = BLOB ใน Postgres, `thumbnail_url` ไม่เคย populate, ไม่มี Pillow/PIL ใน requirements

---

*Generated: 2026-06-14*
*Status: DRAFT - needs validation*
*Note: Design System audit (agent 3) กำลังรัน — ผลจะนำมาเสริม Phase 6 ตอน /prp-plan*
