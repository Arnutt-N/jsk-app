# Phase 3 Report: E2E + Validation — edit-request-details-permission

**Date**: 2026-06-11
**Branch**: feat/edit-request-details-permission
**PRD**: [edit-request-details-permission.prd.md](../prds/edit-request-details-permission.prd.md)
**Status**: complete (CI assertion จะถูกพิสูจน์ตอน PR — Playwright Smoke รันกับ Vercel preview)

## What Changed

ไฟล์เดียว: `frontend/e2e/permission-settings.spec.ts`

1. **Test ใหม่**: `matrix shows edit_request_details row with Thai label` — assert ว่า
   matrix render แถวที่มี description ไทย "แก้ไขข้อมูลคำร้อง (รายละเอียด/ผู้ติดต่อ)"
   (mirror pattern ของ test แถว revert_approval ที่มีอยู่เดิม)
2. **ปรับ minimum row count**: `matrix renders at least four rule rows` →
   `at least five rule rows` (`toBeGreaterThanOrEqual(4)` → `(5)`) เพราะ
   `ensure_seed_rows()` seed key ที่ 5 (`edit_request_details`) ทุก startup
3. **อัปเดต comment/docstring**: "3 default rules" → "5 default rules" (แก้ drift เดิมด้วย)

ไม่มีการ mutate policy ใน test — อ่านอย่างเดียว ตาม convention เดิมของไฟล์
(กัน dev DB ที่ใช้ร่วมกันเปื้อน)

## Validation Evidence

| Check | Result |
|---|---|
| `npx eslint e2e/permission-settings.spec.ts` (WSL) | Pass — 0 errors |
| `npx tsc --noEmit` (WSL) | Pass — 0 errors |
| Backend pytest (WSL) | Pass — 338 passed in 23.55s |
| Playwright Smoke | รอ CI (รันกับ Vercel preview ตอนเปิด PR) |

## UAT Checklist (manual — ทำหลัง deploy preview)

- [ ] Login เป็น ADMIN → เห็นปุ่ม "แก้ไข" ทั้งแท็บรายละเอียดและผู้ติดต่อ แก้แล้วบันทึกได้
- [ ] Login เป็น AGENT → ไม่เห็นปุ่ม "แก้ไข" ทั้ง 2 แท็บ แต่ยังเปลี่ยนสถานะ/มอบหมายได้ตามเดิม
- [ ] หน้า /admin/settings/permissions → เห็นแถว "แก้ไขข้อมูลคำร้อง (รายละเอียด/ผู้ติดต่อ)" และติ๊กให้ role อื่นได้
- [ ] ติ๊กให้ AGENT แล้ว refresh หน้า request detail → ปุ่มแก้ไขปรากฏ

## Local Code Review

Review uncommitted changes ทั้งหมดก่อน commit: **APPROVE** — 0 CRITICAL/HIGH,
2 LOW (ดู [edit-request-details-permission-local-review.md](../reviews/edit-request-details-permission-local-review.md))

## PRD Completion

ทั้ง 3 phases complete → พร้อม commit เป็น PR เดียวตามแผน PRD
