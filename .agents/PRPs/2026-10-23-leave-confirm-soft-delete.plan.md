# Leave-Confirm + Soft-Delete Implementation Plan (rev 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปุ่ม "ยกเลิก" กลางฟอร์มของ `service-request-single` ถามก่อนปิดเหมือนหน้าจอง และปุ่มลบหลังบ้านของ auto-reply / intent-category / taxonomy เป็นการซ่อนที่กู้ได้

**Architecture:** ฝั่งฟอร์มคัดลาย `useLiffLeave` + `LeaveConfirmDialog` จาก `service-request/page.tsx` (ต้นแบบที่ผู้ใช้เลือก) ไปใส่หน้าที่ขาด; ฝั่งหลังบ้านเปลี่ยน `DELETE` 3 เส้นทางจาก `db.delete` เป็น `is_active=False` ตามลาย `canned_response_service.delete` (`backend/app/services/canned_response_service.py:131-137`) ไม่แตะ schema

**Tech Stack:** Next.js 16 + React 19 (`useLiffLeave` ที่ `frontend/hooks/useLiffLeave.ts`, `LeaveConfirmDialog` ที่ `frontend/components/liff/LeaveConfirmDialog.tsx`), FastAPI + SQLAlchemy 2.0 async, pytest + Vitest

## Global Constraints

- ห้ามเปลี่ยนโครงสร้างฐานข้อมูล (no migration) — ใช้คอลัมน์ `is_active` ที่มีอยู่แล้วเท่านั้น
- ห้ามลบ decorator เส้นทาง (เช่น `@router.delete`) — ตกหล่นคือ 405 ทั้ง endpoint
- ม็อกโมดูลในเทสต์ต้อง re-export named export ทุกตัวที่โค้ด import (บทเรียน `getWindowLiff`)
- เทสต์ endpoint ที่ตรวจ response serialization ต้องใช้ session จริง สูตร NullPool + marker cleanup จาก `tests/test_taxonomy_patch_regression.py:1-60` ห้ามม็อก service
- วันที่เทียบหลังบ้านใช้ `app.core.date_windows` ห้าม naive `datetime` (งานนี้ไม่แตะวันที่)
- คอมเมนต์เฉพาะ why ที่โค้ดบอกไม่ได้ ห้าม restatement
- ทุก phase จบด้วยเทสต์เขียวก่อนไปต่อ
- คง response body ของ DELETE (`{"status":"deleted"}` / 204 ว่าง) — ไม่เปลี่ยนสัญญา API

## NOT Building

- ไม่แตะ `request-v2` — หน้านั้นไม่มีปุ่มออกกลางฟอร์มเลย (มีแค่ปุ่มปิดจอสำเร็จ) การเพิ่มปุ่มคือ UI ใหม่ ไม่ใช่งานรวมลาย บันทึกเป็น follow-up
- ไม่แตะ `close-test` — หน้าไว้ทดสอบของช่าง
- ไม่แตะจอสำเร็จ ("บันทึกสำเร็จ" + นับถอยหลังปิดเอง) — ข้อมูลบันทึกแล้ว ถามซ้ำกวนผู้ใช้
- ไม่แตะ `DELETE keywords/responses` — รายการย่อยในหมวด คีย์เวิร์ดไม่มีคอลัมน์ซ่อน ปุ่มเปิด/ปิดระดับหมวดคุมอยู่แล้ว
- ไม่แตะ `DELETE canned-responses` — ซ่อนอยู่แล้ว
- ไม่เปลี่ยนพฤติกรรมตัวกรอง/ค้นหาใด ๆ (รวม `escape_ilike` ใน auto-reply search)
- รายการหลังบ้าน (admin list) ยังแสดงแถวที่ปิดพร้อมป้าย "ปิดใช้งาน" ต่อไป — ต้องเห็นจึงจะกดเปิดกลับได้ ลายเดียวกับ `TaxonomyEditor` ที่แสดงแถว inactive แล้ว

---

### Task 1: หลังบ้าน — `DELETE auto-reply` เป็นซ่อน (รวมเปิดกลับ)

**Files:**

- Modify: `backend/app/api/v1/endpoints/admin_auto_replies.py`, ฟังก์ชัน `delete_auto_reply` (หลัง `@router.delete("/{response_id}")` ~บรรทัด 116)
- Create: `tests/test_auto_replies_delete_soft.py` (ไฟล์ใหม่ — ยืนยันแล้วว่าไม่มีชื่อซ้ำ มีแค่ `test_auto_reply_search_escape.py`)

**Interfaces:**

- Consumes: `AutoReply.is_active` (`backend/app/models/auto_reply.py:41`); `AutoReplyUpdate.is_active` (`backend/app/schemas/auto_reply.py`, `AutoReplyUpdate` มี `is_active: Optional[bool]`); PUT `/{reply_id}` มีอยู่แล้ว (~บรรทัด 87)
- Produces: DELETE → 204 เหมือนเดิม แถวคงอยู่ + `is_active=False`; PUT `{is_active:true}` เปิดกลับได้; ที่จับคู่ข้อความขาเข้า (`backend/app/services/message_intake/intent_matching.py:137-144`) กรอง active อยู่แล้ว ผู้ใช้จึงไม่เห็นแถวที่ปิด

**GOTCHA:** ห้ามลบ `@router.delete` เด็ดขาด (405); การจับคู่ public กรอง `is_active` อยู่แล้ว ไม่ต้องแก้ `intent_matching.py`

- [ ] **Step 1: เขียนเทสต์พังก่อน** — ไฟล์ `tests/test_auto_replies_delete_soft.py` สูตร real-session จาก `test_taxonomy_patch_regression.py:1-60` (NullPool engine + marker + TestClient override `get_db` + ลบตาม marker): สร้าง rule เปิดใช้งาน → DELETE คาดหวัง 204 → ดึงแถวตรงจาก DB คาดหวังแถวยังอยู่และ `is_active is False` → เรียก public matching (ผ่าน endpoint จับคู่หรือ query เดียวกับ `intent_matching.py:137-144`) คาดหวังไม่เจอ rule นี้ → PUT `{is_active:true}` คาดหวัง 200 → เรียก public matching คาดหวังเจออีกครั้ง

```python
@pytest.mark.asyncio
async def test_delete_auto_reply_soft_hides_and_restores():
    rule_id = await _create_active_rule(marker)
    res = client.delete(f"/api/v1/admin/auto-replies/{rule_id}")
    assert res.status_code == 204
    async with Session() as s:
        row = await s.get(AutoReply, rule_id)
        assert row is not None and row.is_active is False
    assert _public_match(keyword) is None
    res = client.put(f"/api/v1/admin/auto-replies/{rule_id}", json={"is_active": True})
    assert res.status_code == 200
    assert _public_match(keyword) is not None
```

- [ ] **Step 2: รันเทสต์ ยืนยันว่าพัง**

Run: `cd backend && python -m pytest tests/test_auto_replies_delete_soft.py -v`
Expected: FAIL ที่ `assert row is not None` (แถวหายเพราะ `db.delete`)

- [ ] **Step 3: เปลี่ยนลบจริงเป็นซ่อน**

```python
rule.is_active = False
await db.commit()
return None
```

แทน `await db.delete(rule)` (คง decorator + status 204 + response เดิม)

- [ ] **Step 4: รันเทสต์ ยืนยันว่าผ่าน**

Run: `cd backend && python -m pytest tests/test_auto_replies_delete_soft.py tests/test_auto_reply_search_escape.py -v`
Expected: PASS ทั้ง 2 ไฟล์

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_auto_replies.py tests/test_auto_replies_delete_soft.py
git commit -m "fix(admin): soft-delete auto-reply rule (is_active off, restorable via PUT)"
```

### Task 2: หลังบ้าน — `DELETE intents category` เป็นซ่อน (ลูกคงอยู่ครบ)

**Files:**

- Modify: `backend/app/api/v1/endpoints/admin_intents.py`, ฟังก์ชัน `delete_category` (`@router.delete("/categories/{cat_id}")` ~บรรทัด 149)
- Create: `tests/test_intent_category_soft_delete.py` (ไฟล์ใหม่ — ห้ามต่อ `test_intent_category_readiness.py` เพราะไฟล์นั้นใช้ fake DB ขัดกฎ real-session)

**Interfaces:**

- Consumes: `IntentCategory.is_active` (`backend/app/models/intent.py`, `IntentCategory` มี `is_active` แล้ว); PUT `/categories/{id}` รับ `is_active` มีอยู่แล้ว (frontend ใช้อยู่)
- Produces: DELETE → 204 เหมือนเดิม + `is_active=False`; keywords/responses ลูกยังอยู่ครบ (flag-flip ไม่ trigger cascade `delete-orphan`); รายการแอดมินยังแสดงแถวพร้อมนับ (ต้องเห็นจึงเปิดกลับได้); public webhook กรองตามเกณฑ์ serviceable (`intent_matching.py:53,137-144,167`: `is_active` และ ≥1 active response) จึงไม่เห็นหมวดที่ปิด

**GOTCHA:** เปิดกลับ (`is_active=True`) มีกฎ 400 ถ้าหมวดไม่มี active response (`admin_intents.py` guard ~บรรทัด 128: "ห้ามเปิดใช้งานหมวดที่ยังไม่มี active response") — เทสต์เปิดกลับต้องสร้าง response ที่ active ก่อน ไม่ใช่บั๊ก

- [ ] **Step 1: เขียนเทสต์พังก่อน** — สูตร real-session เดียวกับ Task 1: สร้าง category + keyword + response(active) → DELETE คาดหวัง 204 → แถว category ยังอยู่ + `is_active False` → keyword/response ลูกยังอยู่ครบ → เรียก public matching คาดหวังหมวดนี้ไม่ถูกใช้ → PUT `{is_active:true}` คาดหวัง 200 → public matching เจออีกครั้ง; เคสขอบ: PUT เปิดหมวดที่ response ถูกปิดหมด → คาดหวัง 400 (กฎ guard เดิม)

```python
@pytest.mark.asyncio
async def test_delete_intent_category_soft_keeps_children():
    cat_id = await _create_category_with_children(marker)
    res = client.delete(f"/api/v1/admin/intents/categories/{cat_id}")
    assert res.status_code == 204
    async with Session() as s:
        cat = await s.get(IntentCategory, cat_id)
        assert cat is not None and cat.is_active is False
        kids = await s.execute(select(func.count()).where(IntentKeyword.category_id == cat_id))
        assert kids.scalar() == 1
```

- [ ] **Step 2: รันเทสต์ ยืนยันว่าพัง**

Run: `cd backend && python -m pytest tests/test_intent_category_soft_delete.py -v`
Expected: FAIL ที่ `assert cat is not None`

- [ ] **Step 3: เปลี่ยนลบจริงเป็นซ่อน**

```python
cat.is_active = False
await db.commit()
return None
```

แทน `await db.delete(cat)` (คง decorator + 204)

- [ ] **Step 4: รันเทสต์ ยืนยันว่าผ่าน**

Run: `cd backend && python -m pytest tests/test_intent_category_soft_delete.py tests/test_intent_category_readiness.py -v`
Expected: PASS ทั้ง 2 ไฟล์

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_intents.py tests/test_intent_category_soft_delete.py
git commit -m "fix(admin): soft-delete intent category (children kept, restorable via PUT)"
```

### Task 3: หลังบ้าน — `DELETE taxonomy` เป็นซ่อน + คงกฎกันหมวดมีลูก

**Files:**

- Modify: `backend/app/services/taxonomy_service.py`, `delete_category` (~บรรทัด 140) และ `delete_topic` (~บรรทัด 223)
- Modify (test): `tests/test_taxonomy_patch_regression.py` (ต่อท้าย — ไฟล์ exemplar สูตร real-session)

**Interfaces:**

- Consumes: `TaxonomyCategory.is_active` / `TaxonomyTopic.is_active` (มีอยู่แล้ว); ที่อ่านกรอง inactive แล้ว (`taxonomy_service.py:37,44`); PATCH เปิดกลับมีอยู่แล้ว (`TaxonomyEditor` ใช้ `onUpdate is_active`)
- Produces: `delete_category` หมวดที่มีหัวข้อ **active** → ยัง 409 เหมือนเดิม; หมวดว่าง → `is_active=False`; `delete_topic` → `is_active=False`; เปิดกลับด้วย PATCH ได้; `self.invalidate()` ยังเรียกเหมือนเดิมทุกทาง (ล้าง `_cached_map`)

**GOTCHA:** ห้ามลืม `self.invalidate()` (ไม่งั้น `_cached_map` เสิร์ฟของเก่า); ตัวนับ topics ใน guard ต้องนับเฉพาะหัวข้อที่ active — หัวข้อที่ถูกซ่อนแล้วไม่ขวางการซ่อนหมวด (ย้ายออกด้วย PATCH `category_id` ก่อนได้ถ้าต้องการ)

- [ ] **Step 1: เขียนเทสต์พังก่อน 4 เคส** — ต่อท้าย `test_taxonomy_patch_regression.py`: (ก) DELETE topic → แถวยังอยู่ + `is_active False` + ไม่โผล่ใน `loadTaxonomy` (ข) DELETE category ว่าง → ซ่อน (ค) DELETE category ที่มี topic active → 409 เหมือนเดิม (ง) PATCH เปิด topic กลับ → โผล่คืน; เคสขอบ: หมวดที่มีแต่ topic ที่ถูกซ่อนแล้ว → ซ่อนหมวดได้ (ไม่ 409)

```python
@pytest.mark.asyncio
async def test_delete_topic_soft_hides_from_reads():
    topic_id = await _create_active_topic(marker)
    res = client.delete(f"/api/v1/admin/taxonomy/topics/{topic_id}")
    assert res.status_code == 200
    async with Session() as s:
        row = await s.get(TaxonomyTopic, topic_id)
        assert row is not None and row.is_active is False
```

- [ ] **Step 2: รันเทสต์ ยืนยันว่าพัง**

Run: `cd backend && python -m pytest tests/test_taxonomy_patch_regression.py -v -k "soft or delete"`
Expected: FAIL ข้อ (ก)(ข)

- [ ] **Step 3: เปลี่ยนลบจริงเป็นซ่อน**

```python
category.is_active = False
await db.commit()
self.invalidate()
return True
```

และแบบเดียวกันใน `delete_topic`; guard `topic_count` เติม `.where(TaxonomyTopic.is_active.is_(True))`; คง `ValueError` → 409 ไว้ที่เดิม

- [ ] **Step 4: รันเทสต์ ยืนยันว่าผ่าน**

Run: `cd backend && python -m pytest tests/test_taxonomy_patch_regression.py tests/test_taxonomy.py -v`
Expected: PASS ทั้ง 2 ไฟล์

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/taxonomy_service.py tests/test_taxonomy_patch_regression.py
git commit -m "fix(admin): soft-delete taxonomy category/topic (reads already filter inactive)"
```

### Task 4: หน้าจอ — คำพูด taxonomy ให้ตรงความจริง

**Files:**

- Modify: `frontend/components/admin/TaxonomyEditor.tsx` — modal ยืนยัน (~บรรทัด 342-356), toast (~บรรทัด 290-298)
- Modify (test): `frontend/components/admin/__tests__/TaxonomyEditor.test.tsx` (ต่อท้าย — ไฟล์มีอยู่แล้ว)

**Interfaces:**

- Consumes: `pendingDelete`, `deleteCategory`/`deleteTopic`, `confirmText` เดิม (ไม่เปลี่ยนชื่อฟังก์ชัน ไม่เปลี่ยน flow)
- Produces: modal "หมวด/หัวข้อจะถูกซ่อนไว้ กู้คืนได้ด้วยการเปิดสวิตช์แสดงใน LIFF" + ปุ่ม `confirmText="ปิดใช้งาน"` + toast "ปิดใช้งานแล้ว (เปิดสวิตช์เพื่อกู้คืน)"

- [ ] **Step 1: เขียนเทสต์พังก่อน**

```tsx
it('delete modal says hide-restorable, not permanent', () => {
  render(<TaxonomyEditor ... />);
  // เปิด modal ลบหมวด
  expect(screen.getByText(/ซ่อนไว้/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ปิดใช้งาน' })).toBeInTheDocument();
});
```

- [ ] **Step 2: รันเทสต์ ยืนยันว่าพัง**

Run: `cd frontend && npx vitest run components/admin/__tests__/TaxonomyEditor.test.tsx -t "hide-restorable"`
Expected: FAIL (ของเดิมเขียน "ลบถาวร")

- [ ] **Step 3: เปลี่ยนคำ** — แก้เฉพาะข้อความ modal/toast/ปุ่ม ไม่แตะ logic (คงกฎ "หมวดที่มีหัวข้อย่อยห้ามลบ" ไว้)

- [ ] **Step 4: รันเทสต์ ยืนยันว่าผ่าน**

Run: `cd frontend && npx vitest run components/admin/__tests__/TaxonomyEditor.test.tsx`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add frontend/components/admin/TaxonomyEditor.tsx frontend/components/admin/__tests__/TaxonomyEditor.test.tsx
git commit -m "fix(admin): taxonomy delete dialog says hide-restorable, not permanent"
```

### Task 5: ฟอร์ม LIFF — `service-request-single` ถามก่อนปิด

**Files:**

- Modify: `frontend/app/liff/service-request-single/page.tsx` — ปุ่ม "ยกเลิก" (~บรรทัด 616-623), ไม่แตะ `handleClose` ของจอสำเร็จ (~บรรทัด 267) และปุ่มปิดจอสำเร็จ (~บรรทัด 309)
- Modify (test): `frontend/app/liff/service-request-single/__tests__/validation.test.tsx` (ต่อท้าย — ไฟล์มีอยู่แล้ว; ม็อก `@/hooks/useLiffInit` ต้อง re-export `getWindowLiff` ด้วย)

**Interfaces:**

- Consumes: `import { useLiffLeave } from '@/hooks/useLiffLeave'` + `import { LeaveConfirmDialog } from '@/components/liff/LeaveConfirmDialog'` — ลายเดียวกับ `service-request/page.tsx:30-31,58,753,802-806`
- Produces: กด "ยกเลิก" → `requestLeave()` → dialog ถามก่อน → ยืนยันค่อย `confirmLeave()`; จอสำเร็จปิดตรงเหมือนเดิม

**GOTCHA:** ม็อก `useLiffInit` ต้อง re-export named export ทุกตัว (`useLiffInit`, `getWindowLiff`) ไม่งั้นพังยกแผง

- [ ] **Step 1: เขียนเทสต์พังก่อน**

```tsx
it('cancel asks before leaving', async () => {
  render(<LiffServiceRequestSingle />);
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
  expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
});
```

- [ ] **Step 2: รันเทสต์ ยืนยันว่าพัง**

Run: `cd frontend && npx vitest run app/liff/service-request-single/__tests__/validation.test.tsx -t "asks before leaving"`
Expected: FAIL (ของเดิมปิดเลย ไม่มี dialog)

- [ ] **Step 3: ต่อ `useLiffLeave` ลายเดียวกับต้นฉบับ** — เพิ่ม 2 import; ในคอมโพเนนต์เพิ่ม `const { leaveOpen, requestLeave, cancelLeave, confirmLeave } = useLiffLeave()`; ปุ่มยกเลิก `onClick={handleClose}` → `onClick={requestLeave}`; วาง `<LeaveConfirmDialog isOpen={leaveOpen} isInLineApp={isInLineApp} onClose={cancelLeave} onConfirm={confirmLeave} />` ท้าย `<main>` ลายเดียวกับ `service-request/page.tsx:802-806`

- [ ] **Step 4: รันเทสต์ + `tsc` ยืนยันว่าผ่าน**

Run: `cd frontend && npx vitest run app/liff/service-request-single && npx tsc --noEmit`
Expected: PASS + tsc clean

- [ ] **Step 5: Commit**

```bash
git add frontend/app/liff/service-request-single/
git commit -m "feat(liff): confirm-before-leave on service-request-single cancel"
```

### Task 6: ฟอร์ม LIFF — `booking` จอสำเร็จเติมแผนสำรองนอก LINE

**Files:**

- Modify: `frontend/app/liff/booking/page.tsx` — ปุ่ม "ปิดหน้าต่าง" จอสำเร็จ (~บรรทัด 648-654) เท่านั้น ไม่แตะ wizard (`requestLeave` ใช้อยู่แล้ว ~บรรทัด 707-920)
- Modify (test): `frontend/app/liff/booking/__tests__/page.test.tsx` (ต่อท้าย — ไฟล์มีอยู่แล้ว)

**Interfaces:**

- Consumes: ลาย fallback จาก `service-request-single/page.tsx:267-283`: `liff.closeWindow()` → `window.close()` → `location.href = line.me/R/app/{liffId}`
- Produces: ใน LINE พฤติกรรมเดิม (`closeWindow`); นอก LINE ไม่ค้าง — ปิดหน้าต่างไม่ได้ให้ไปหน้า LINE แอป

- [ ] **Step 1: เขียนเทสต์พังก่อน** — mock ไม่มี `window.liff` → กด "ปิดหน้าต่าง" จอสำเร็จ → คาดหวัง `window.close` ถูกเรียก (ของเดิมเรียกแค่ `closeWindow?.()` ซึ่งไม่มี จึงค้าง)

```tsx
it('success close falls back outside LINE', async () => {
  const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
  // render หน้าจอสำเร็จโดยไม่มี window.liff
  fireEvent.click(screen.getByRole('button', { name: 'ปิดหน้าต่าง' }));
  expect(closeSpy).toHaveBeenCalled();
  closeSpy.mockRestore();
});
```

- [ ] **Step 2: รันเทสต์ ยืนยันว่าพัง**

Run: `cd frontend && npx vitest run app/liff/booking/__tests__/page.test.tsx -t "falls back outside LINE"`
Expected: FAIL (`close` ไม่ถูกเรียก)

- [ ] **Step 3: เติม fallback ลายเดียวกับต้นฉบับ** — แทน `onClick={() => window.liff?.closeWindow?.()}` ด้วยฟังก์ชัน `handleSuccessClose` ลาย `service-request-single/page.tsx:267-283` (ใน LINE: `closeWindow`; นอก LINE: `window.close()`; ยังไม่ได้: `location.href = https://line.me/R/app/${liffId}`)

- [ ] **Step 4: รันเทสต์ + `tsc` ยืนยันว่าผ่าน**

Run: `cd frontend && npx vitest run app/liff/booking/__tests__/page.test.tsx && npx tsc --noEmit`
Expected: PASS + tsc clean

- [ ] **Step 5: Commit**

```bash
git add frontend/app/liff/booking/
git commit -m "fix(liff): booking success close falls back outside LINE"
```

### Task 7: ตรวจรอบสุดท้าย + เปิด PR

**Files:** ไม่แตะโค้ด (รันคำสั่งอย่างเดียว)

- [ ] **Step 1: รันชุดตรวจทั้งหมด**

```bash
cd backend && python -m pytest tests/test_auto_replies_delete_soft.py tests/test_auto_reply_search_escape.py tests/test_intent_category_soft_delete.py tests/test_intent_category_readiness.py tests/test_taxonomy.py tests/test_taxonomy_patch_regression.py -v
cd frontend && npx vitest run components/admin/__tests__/TaxonomyEditor.test.tsx app/liff/service-request-single app/liff/booking/__tests__/page.test.tsx
cd frontend && npx tsc --noEmit
cd frontend && npx eslint components/admin/TaxonomyEditor.tsx app/liff/service-request-single/page.tsx app/liff/booking/page.tsx
```

(ทุกบรรทัดรันอิสระจากรากรีโปได้ — `cd` ต่อบรรทัด ไม่พึ่ง cwd ต่อเนื่อง)

Expected: เขียวทั้งหมด

- [ ] **Step 2: เปิด PR + babysit CI** — push สาขา `feat/liff-leave-unify-soft-delete-policy`, เปิด PR พร้อมสรุปภาษาไทย, `gh pr checks --watch` จนเขียวค่อยรวม
- [ ] **Step 3: เช็กลิสต์ลองกดบนมือถือ** — เขียนใน PR: ยกเลิกกลางฟอร์ม `service-request-single` → ถามก่อน; หลังบ้านปิดหมวด/หัวข้อ/auto-reply → ซ่อน + เปิดกลับได้

## Self-Review

- **Spec coverage:** PRD ข้อ A ครบด้วย Task 5 (ปุ่มยกเลิกที่ขาด) + Task 6 (fallback จอสำเร็จ booking); 3 หน้าที่ถามก่อนอยู่แล้ว (`service-request`, `debt-mediation`, wizard ของ `booking`) ไม่ต้องแตะ; ข้อ B ครบด้วย Task 1-3 (auto-replies/intents/taxonomy) + canned/keywords verify-only ใน NOT Building; ข้อ C ครบด้วย Task 4; เกณฑ์ผ่านทุกข้อมีเทสต์รองรับ; request-v2 ออกจากขอบเขตพร้อมเหตุผลใน NOT Building (ไม่มีปุ่มออกกลางฟอร์ม — เพิ่มคือ UI ใหม่)
- **Placeholder scan:** ไม่มี TBD/TODO/`<>`/`ค้น */ถ้ามี` — ทุก Task มีไฟล์ ชื่อฟังก์ชัน บรรทัด import ข้อความ commit และคำสั่งรันจริง
- **Type consistency:** `leaveOpen/requestLeave/cancelLeave/confirmLeave` + `LeaveConfirmDialog(isOpen/isInLineApp/onClose/onConfirm)` ตรงต้นฉบับทุก Task; `is_active` ตรงชื่อคอลัมน์ทั้ง 3 ตาราง; response code คงเดิม (204/204/200+409); `invalidate()` คงอยู่; guard 409/intent-400 คงพฤติกรรมเดิม
