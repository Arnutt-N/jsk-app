# Verification review — Codex architecture review (2026-08-02)

**ผู้ตรวจ:** claude_code (Claude Opus 5)
**วันที่:** 2026-08-02 22:00 +0700
**HEAD ตอนตรวจ:** `248fc73` (main)

**เอกสารต้นทางที่ถูกตรวจ:**
- `project-log-md/codex/architecture-review-20260802-212946.html` (EN)
- `project-log-md/codex/architecture-review-20260802-212946-th.html` (TH)

**ลักษณะงาน:** read-only — ตรวจสอบข้อกล่าวอ้างในรายงานของ Codex เทียบกับโค้ดจริง ไม่มีการแก้ไขไฟล์โค้ดใด ๆ

---

## 1. คำตัดสินโดยรวม

**รายงานของ Codex เชื่อถือได้** — ไม่มีข้อกล่าวอ้างใดที่ตรวจแล้วพบว่าผิด ตัวเลขบรรทัดตรงเป๊ะทั้ง 10 ไฟล์
การนับ "permission 4 ตัว / audit 3 เส้นทาง" ตรง และการวินิจฉัยข้อ 05 (Reporting) แม่นมาก

**จุดอ่อนของรายงาน 2 ข้อ:**

1. เป็น *structural review* ล้วน — วิเคราะห์เรื่อง "ความซับซ้อนกระจาย" อย่างเดียว ไม่แตะ **ความถูกต้อง**
   ทั้งที่ผลพวงที่รุนแรงที่สุดของโครงสร้างที่มันชี้ คือบั๊กเชิงความถูกต้อง (ดูหัวข้อ 3)
2. **ประเมิน scope ข้อ 04 สูงเกินจริง** จนอาจทำให้ข้อที่คุ้มที่สุดต่อแรงที่ลงถูกเลื่อนออกไป (ดูหัวข้อ 4)

---

## 2. ข้อกล่าวอ้างที่ตรวจแล้ว

| ข้อกล่าวอ้างของ Codex | ผล | หลักฐาน |
|---|---|---|
| line counts ทั้ง 10 ไฟล์ | ✅ ตรงเป๊ะทุกตัว | `wc -l` |
| 01: permission 4 ตัวใน route | ✅ | `can_assign`, `can_self_assign`, `can_revert_approval`, `can_edit_request_details` — `admin_requests.py:13` |
| 01: audit 3 เส้นทางใน route | ✅ | `unassign` (:455), `revert_approval` (:512), `edit_request_details` (:536) |
| 01: transition map เป็น frontend-only | ✅ **และหนักกว่าที่เขียน** | `STATUS_TRANSITIONS` + `canTransition()` อยู่ที่ `frontend/lib/constants/request-status.ts:70,83` เท่านั้น |
| 02: LIFF ไม่มี frontend test surface | ✅ | ค้นหา test ที่แตะ `liff/` / `service-request` / `request-v2` → **ไม่พบแม้แต่ไฟล์เดียว** |
| 04: HTTP + WS ทำ claim/close/transfer ซ้ำ | ✅ | `admin_live_chat.py:185,211,235` vs `ws_session/handlers.py:218,290,362` |
| 05: CSV ยิง query แยกของตัวเอง | ✅ | `admin_reports.py:169,186,210` |
| 05: PDF เรียก route function ตรง ๆ | ✅ | `admin_reports.py:245-258` (เรียก route ทั้ง 5 ตัว) |
| 05: CSV `operators` ก็เรียก route เช่นกัน | ✅ (รายงานไม่ได้ระบุ) | `admin_reports.py:200` |

---

## 3. สิ่งที่รายงานมองข้าม

### 🔴 HIGH-1 — Backend ไม่บังคับ state machine เลย

`STATUS_TRANSITIONS` และ `canTransition(from, to)` อยู่ที่ frontend เท่านั้น ส่วน backend:

```python
# backend/app/api/v1/endpoints/admin_requests.py:440-445
if update_data.status is not None:
    request.status = update_data.status          # ← ยัดลงตรง ๆ ไม่ตรวจ transition
```

ใครยิง `PATCH /admin/requests/{id}` ตรง ๆ สามารถกระโดด `PENDING → COMPLETED` ได้ทันที
**ข้ามขั้น `AWAITING_APPROVAL` ทั้งกระบวนการ**

รายงานสังเกตเห็นข้อเท็จจริงนี้ (บอกว่า transition map เป็น frontend-only) แต่ตีความว่าเป็นปัญหา
*locality* ทั้งที่ผลลัพธ์จริงคือ **ช่องโหว่เชิง authorization/business-rule**

> นี่ทำให้เหตุผลที่ควรทำข้อ 01 ก่อน **แข็งกว่าที่รายงานให้ไว้มาก**

### 🔴 HIGH-2 — การเปลี่ยนสถานะไม่ถูกบันทึก audit

audit log มี 3 เส้นทางตามที่รายงานบอก แต่ไม่มีเส้นทางไหนครอบ **status transition ปกติ**
เปลี่ยน `PENDING → COMPLETED` = ไม่มีร่องรอยว่าใครทำ (มีแค่ `completed_at` ที่บอกเวลา ไม่บอกคน)

ย้อนแย้ง: `revert_approval` (การ**ยกเลิก**อนุมัติ) มี audit แต่ตัว**การอนุมัติ**เองไม่มี

### 🔴 HIGH-3 — live-chat: commit สำเร็จแล้ว แต่ตอบ client ว่าล้มเหลว

รายงานบอกลอย ๆ ว่า *"observable outcomes can drift"* — ตรวจแล้วพบ drift จริง **2 จุด**

**(a) การจัดการ error ของ KPI broadcast ไม่ตรงกัน**

```python
# WS — ws_session/handlers.py:256-259  (ห่อไว้ ✅)
try:
    await analytics.emit_live_kpis_update(db)
except Exception as e:
    logger.warning("KPI broadcast failed (non-fatal): %s", e)

# HTTP — admin_live_chat.py:207  (ไม่ห่อ ❌)
await analytics_service.emit_live_kpis_update(db)
```

ถ้า KPI broadcast พัง → HTTP ตอบ 500 **ทั้งที่ `db.commit()` ผ่านไปแล้วที่บรรทัด :196**
session ถูก claim จริงใน DB แต่ operator เห็น error

**(b) การอ่าน `session.status` ไม่ตรงกัน**

```python
# HTTP — admin_live_chat.py:202  (ป้องกันไว้)
"status": session.status.value if hasattr(session.status, "value") else session.status

# WS — ws_session/handlers.py:251  (เรียกตรง ๆ)
"status": session.status.value
```

ถ้า `status` เป็น `str` → WS โยน `AttributeError` → ตกลง `except Exception` →
ส่ง `"Failed to claim session"` **ทั้งที่ commit ไปแล้วเช่นกัน**

> ทั้งสองเคสคืออาการเดียวกัน: **side effect สำเร็จ แต่รายงานผลว่าล้มเหลว** — อันตรายกว่า
> silent failure ธรรมดา เพราะชวนให้ผู้ใช้ *ลองใหม่* กับสิ่งที่สำเร็จไปแล้ว
>
> สาเหตุรากคือสิ่งที่รายงานชี้ถูก: `commit → broadcast → emit KPI` ถูกเขียนซ้ำสองที่
> พอเขียนซ้ำ การแก้ก็ไปแก้ทีละที่ — จุด (a) มีคนเติม try/except ที่ WS แต่ลืม HTTP;
> จุด (b) มีคนเติม `hasattr` guard ที่ HTTP แต่ลืม WS — **แก้กันคนละทิศ ที่ละครึ่ง**

### 🟡 MEDIUM

| # | ปัญหา | ตำแหน่ง |
|---|---|---|
| M1 | **CSV export ไม่มี LIMIT** — `messages` มี `.limit(10000)` แต่ `service-requests` และ `followers` ไม่มีเลย → export ช่วงกว้าง = ดึงทั้งตารางเข้า memory | `admin_reports.py:169, 210` |
| M2 | **PDF กับ CSV ใช้ช่วงเวลาคนละความหมาย** — CSV รับ `start_date`/`end_date`, PDF รับ `period` = จำนวนวันย้อนหลัง (1–90) → export "รายงานเดียวกัน" สองแบบได้ข้อมูลคนละช่วง | `admin_reports.py:157` vs `:232` |
| M3 | **permission ผิดฝา** — JSON ใช้ `KEY_VIEW_REPORTS` แต่ CSV/PDF ใช้ `KEY_EXPORT_CHAT` (สิทธิ์ "export แชท") มาคุมการ export **รายงาน** | `admin_reports.py:161, 234` |
| M4 | **`priority` ไม่ validate** — `AdminRequestCreate` ใช้ `RequestPriority` enum ถูกต้อง แต่ `RequestUpdate` ใช้ `Optional[str]` → PATCH ยัดค่าอะไรก็ได้ | `admin_requests.py:73` vs `:320` |
| M5 | **`completed_at` ค้าง** — reset แบบสมมาตรครอบแค่ `COMPLETED → AWAITING_APPROVAL/IN_PROGRESS` ถ้าไป `REJECTED`/`PENDING` ค่าค้างไว้ → CSV เขียนออกโดยไม่ดู status → คำร้องที่ปฏิเสธแล้วมีวันที่เสร็จสิ้นใน export | `admin_requests.py:401-407`, `admin_reports.py:181` |

### 🔵 LOW

- `delete_request` เป็น hard delete **ไม่มี audit log** — `admin_requests.py:546`
- `import` อยู่กลางไฟล์ (ผิด PEP 8) — `admin_requests.py:564-566`
- `update_request` ยาว **193 บรรทัด** ละเมิดกติกา `<50 บรรทัด` ของโปรเจกต์เอง

---

## 4. จุดที่ไม่เห็นด้วยกับรายงาน

**ข้อ 04 ถูกประเมิน scope สูงเกินจริง**

รายงานเสนอให้ "สร้าง Live Chat lifecycle module" พร้อมไดอะแกรมโมดูลใหม่ทั้งก้อน — แต่
`live_chat_service` **มีอยู่แล้ว** และทั้งสอง transport ก็เรียกมันอยู่แล้ว
(`claim_session` / `close_session` / `transfer_session`) → **session mutation ไม่ได้ซ้ำ**

สิ่งที่ซ้ำจริงคือ **choreography หลัง mutation**: `commit → broadcast → emit KPI` (+ การ map error)

งานจริงคือ **ย้าย 3 บรรทัดเข้าไปอยู่ใน service** ไม่ใช่สร้างโมดูลใหม่ — งานระดับครึ่งวัน
ที่แก้บั๊ก HIGH-3 ทั้งสองตัวไปในตัว รายงานทำให้มันดูเหมือนงานระดับสัปดาห์

---

## 5. ขอบเขตของการตรวจครั้งนี้ (สำคัญ — ยังไม่ครบ)

| ข้อ | ระดับที่ตรวจ |
|---|---|
| 01 Service Request | ✅ อ่านโค้ดครบทั้งไฟล์ (622 บรรทัด) |
| 02 LIFF intake | ⚠️ ตรวจแค่ line count + ยืนยันว่าไม่มี test — **ยังไม่ได้อ่านเนื้อในว่า logic ซ้ำจริงตามที่อ้าง** |
| 03 Rich Menu | ⚠️ ตรวจแค่ line count — **ยังไม่ได้อ่านเลย** |
| 04 Live Chat | ✅ เทียบ HTTP vs WS ตรง ๆ |
| 05 Reporting | ✅ อ่านโค้ดครบทั้งไฟล์ (268 บรรทัด) |

---

## 6. ลำดับที่แนะนำ (ต่างจากรายงาน)

| ลำดับ | งาน | ขนาด | เหตุผล |
|---|---|---|---|
| 1 | **01a — ปิดช่องโหว่ก่อน** | เล็ก (ไฟล์เดียว) | ย้าย `STATUS_TRANSITIONS` ลง backend + บังคับใช้ + เพิ่ม audit บนทุก transition + fix M4/M5 |
| 2 | **04 — รวม choreography** | ครึ่งวัน | ดึง commit/broadcast/KPI เข้า service → แก้ HIGH-3 ทั้งสองตัวไปในตัว |
| 3 | **05 — Reporting** | กลาง | ตามรายงาน + มี M1/M2/M3 ติดมาด้วย |
| 4 | **01b — ยุบเป็น workflow module** | ใหญ่ | ทำหลังมีตาข่ายจากขั้น 1 แล้ว |
| 5 | **02 — LIFF intake** | ใหญ่สุด | **ไม่มี test แม้แต่ไฟล์เดียว** → ต้องเขียน test ก่อน ห้าม refactor 2,427 บรรทัดโดยไม่มีตาข่าย |
| 6 | **03 — Rich Menu** | กลาง | ยังไม่ได้ตรวจเนื้อใน |

---

## 7. ถึง Codex (ผู้เขียนรายงานต้นทาง)

สามอย่างที่อยากฝากไว้สำหรับรายงานรอบหน้า:

1. **เพิ่มแกน "ความถูกต้อง" เข้าไปคู่กับแกนโครงสร้าง** — deletion test บอกได้ว่าควรมี abstraction ไหม
   แต่บอกไม่ได้ว่า *ตอนนี้พังตรงไหน* ในเคสนี้ HIGH-1/2/3 ล้วนเป็นผลโดยตรงจากโครงสร้างที่รายงานชี้ถูก
   แต่ไม่ได้ถูกหยิบมาใช้เป็นน้ำหนักของข้อเสนอ

2. **ตรวจว่ามี service layer อยู่แล้วหรือยัง ก่อนเสนอสร้างโมดูลใหม่** — ข้อ 04 เสนอสร้าง
   lifecycle module ทั้งที่ `live_chat_service` มีอยู่และถูกเรียกจากทั้งสอง transport แล้ว
   ทำให้ประเมิน scope เกินจริงหลายเท่า

3. **ข้อ 02 ที่เสนอไว้ ยังไม่มีตาข่ายรองรับ** — LIFF 2,427 บรรทัดไม่มี test เลยสักไฟล์
   ถ้าจะทำจริงต้องมี "เขียน test ก่อน" เป็น prerequisite ในข้อเสนอ ไม่ใช่ทำ refactor ทันที
