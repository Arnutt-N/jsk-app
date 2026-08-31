# PRD/PRP: LIFF "ขอแก้หนี้" — Debt Mediation Registration Page

**Created:** 2026-08-31
**Branch:** `feat/liff-debt-mediation`
**Type:** Feature (new LIFF page + backend endpoint + model + migration)
**Design reference:** `/liff/service-request` wizard (stepper, glass cards, sticky header, confirm modal, success auto-close)
**Source of truth:** Google Form screenshots — "แบบลงทะเบียนแจ้งความประสงค์การไกล่เคลียหนี้ และแก้ไขปัญหาหนี้เดือดร้อน" (MoJ / Rights and Liberties Protection Department debt-mediation program)

---

## Problem

Users currently register their debt-mediation intent ("ขอแก้หนี้") through an
external Google Form (hrinno.moj@gmail.com). Data lands in Google Sheets with
no LINE identity, no spam protection, no admin pipeline, and a look-and-feel
unrelated to our platform. We replace it with a native LIFF page
(`/liff/debt-mediation`) that mirrors the service-request wizard's design and
writes straight into our database.

## Form structure (decoded from the screenshots)

Page 1 — **สถานะผู้ยื่นคำขอ** (required, single choice): ลูกหนี้ / เจ้าหนี้
Page 2 — **ข้อมูลผู้ยื่นคำขอ**: ชื่อ-สกุล*, หมายเลขโทรศัพท์*, จังหวัดที่อาศัย*
(form used an ~18-item radio list; we use the 77-province master data dropdown
instead), ตำบลที่อาศัย (optional text), ยอดหนี้สิน บาท* (number),
ประเภทหนี้* (single choice with descriptions):
- หนี้นอกระบบ — หนี้กับบุคคล/กลุ่มบุคคลที่ไม่จดทะเบียน เช่น ตลาดทอน ญาติพี่น้อง เพื่อนฝูง สินเชื่อนอกระบบ
- หนี้ในระบบ — สถาบันการเงินที่จดทะเบียน เช่น ธนาคาร บริษัทเงินทุน สหกรณ์ โรงรับจำนำ

Page 3 (ผู้ยื่น = ลูกหนี้) — **ข้อมูลเจ้าหนี้**: ชื่อเจ้าหนี้*, อัตราดอกเบี้ย*
(text, hint "เช่น ร้อยละ 5 ต่อเดือน"), ประเด็นความเดือดร้อน* (single choice
+ Other):
1. ค้างชำระหนี้ ถูกข่มขู่/กลั่นแกล้ง ไม่สามารถจ่ายได้
2. สัญญา/ข้อตกลงมีลักษณะเป็นอาชญากรรม (ถูกหลอก สัญญาไม่ชอบด้วยกฎหมาย)
3. ถูกข่มขู่/หนวกหู จากบุคคลอื่น
4. รายได้ไม่เพียงพอจะชำระหนี้
5. ผู้ไกล่เคลียติดต่อเจ้าหนี้ไม่ได้
6. อื่น ๆ (ระบุ)

Page 5 (ผู้ยื่น = เจ้าหนี้) — **ข้อมูลลูกหนี้**: ชื่อลูกหนี้*, ประเด็นความเดือดร้อน*
(single choice + Other):
1. ลูกหนี้ไม่มีเงินจ่ายหนี้
2. ลูกหนี้ปฏิเสธว่าไม่ได้เป็นหนี้
3. ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้
4. ลูกหนี้หลบหนีหนี้
5. อื่น ๆ (ระบุ)

> The screenshot text is partially garbled mock data (fictional province
> names); labels above are normalized to standard Thai. Exact wording is
> content-owner adjustable later (constants at the top of the page file).

## UI design (mirror of `/liff/service-request`)

- Sticky glass header: Scale icon + "ขอแก้หนี้", subtitle
  "แจ้งความประสงค์ไกล่เคลียหนี้ • JSK 4.0 Platform", Online badge.
- 3-step progress stepper: ผู้ยื่นคำขอ (User) → ข้อมูลหนี้ (Wallet) →
  คู่กรณี (Handshake; step title/description switches with submitter type).
- One glass Card per step with CardHeader + per-step "ล้างค่า"; red-ring
  validation per field; animate-in slide transitions.
- สถานะผู้ยื่น & ประเภทหนี้ & ประเด็นความเดือดร้อน = selectable radio cards
  (border highlight), matching the form's radio semantics but touch-friendly.
- Bottom nav: กลับ / ถัดไป / ยื่นคำขอ + "ยกเลิกรายการ" (confirm modal, LIFF
  close vs navigate `/`), PDPA footer note.
- Confirm modal before submit; success screen with CheckCircle + auto-close
  countdown inside LINE (`useAutoCloseCountdown`), reset option in external
  browser — all identical to service-request behavior.
- Province dropdown loads from `/api/v1/locations/provinces` (relative path
  through the Next rewrite proxy, same as service-request).

## Backend design

- New model `DebtMediationRequest` (`debt_mediation_requests`),
  `backend/app/models/debt_mediation.py`:
  - `submitter_type` Enum(`DEBTOR`/`CREDITOR`, pg type `debtparty`)
  - `full_name`, `phone_number`, `province`, `sub_district` (nullable)
  - `debt_amount` Numeric(14,2)
  - `debt_type` Enum(`INFORMAL`/`FORMAL`, pg type `debttype`)
  - `counterparty_name` (เจ้าหนี้ เมื่อผู้ยื่นเป็นลูกหนี้ / ลูกหนี้ เมื่อผู้ยื่นเป็นเจ้าหนี้)
  - `interest_rate` (nullable — required server-side only when DEBTOR)
  - `issue_category` (Thai label as selected; "อื่น ๆ" when Other)
  - `issue_other` (nullable — required when issue_category = อื่น ๆ)
  - `user_id` FK users.id (nullable), `details` JSONB (`{"source": "LIFF"}`),
    `status` reuses `RequestStatus` (PENDING default, existing pg type).
- New schema `backend/app/schemas/debt_mediation_liff.py`:
  `DebtMediationCreate` (model_validator: debtor requires `interest_rate`;
  "อื่น ๆ" requires `issue_other`; phone length 9–15; amount > 0) +
  `DebtMediationResponse`.
- New endpoint `POST /api/v1/liff/debt-mediation` in `liff.py`: same LIFF
  token-verify + `http_rate_limit("liff-submit")` pattern as
  `create_service_request`; resolves LINE identity via
  `resolve_by_line_id` → `friend_service.get_or_create_user` (create on miss).
- Migration `b8c9d0e1f2a3_add_debt_mediation_requests.py`, chained on the
  current head `s0t1u2v3w4x5`; creates pg enum types `debtparty`, `debttype`
  (reuses existing `requeststatus`), table + indexes (user_id,
  submitter_type, status). Downgrade drops table + its two new types.
- Model registered in `backend/app/models/__init__.py`.

## Acceptance criteria

- AC-1: `/liff/debt-mediation` renders the 3-step wizard visually consistent
  with `/liff/service-request` (header, stepper, cards, modals, success).
- AC-2: Step validation enforces required fields client-side (red ring +
  alert) and server-side via `DebtMediationCreate` (422 on junk payloads).
- AC-3: Debtor path requires interest_rate; creditor path does not;
  "อื่น ๆ" requires the extra detail text — both client and server.
- AC-4: Successful POST `/api/v1/liff/debt-mediation` → 201, row persisted,
  LIFF identity attached; unverified requests rejected when
  `LIFF_STRICT_MODE` (same as service-requests).
- AC-5: `python -m pytest tests/test_liff_debt_mediation.py` green;
  frontend `vitest` for the new page green; `npm run lint` and
  `npm run build` green.

## Validation plan

1. Backend: `cd backend && python -m pytest tests/test_liff_debt_mediation.py -v`
   (schema validation + direct handler-call identity tests, no live DB needed).
2. Migration syntax: `python scripts/db_target.py alembic --target local upgrade head`
   (requires local Docker db; skipped in CI-safe runs — SQL reviewed by hand).
3. Frontend: `cd frontend && npx vitest run app/liff/debt-mediation`,
   `npm run lint`, `npm run build`.
4. Visual: run dev server, walk all 3 steps × both paths, submit, verify
   success screen; confirm row in `debt_mediation_requests`.

## Ship

Single commit per phase (backend, frontend), PR, merge per `git_workflow`.
