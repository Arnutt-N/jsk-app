# PRD: Shared LIFF leave flow (piece 1 of 4)

## Problem
Three LIFF form pages each own a private leave flow. Debt-mediation and service-request carry byte-identical custom modal chrome (~45 lines each). Booking drives the shared ConfirmDialog with its own wording. Any wording or behavior fix ships three times or ships unevenly.

## Goal
One hook plus one dialog in `frontend/components/liff/`. All three pages use it. Wording and leave behavior identical everywhere.

## Data shape
The shared unit is a leave flow: open state, the environment flag, and three transitions (request, cancel, confirm). The hook owns the open state and the leave action. The action closes the LIFF window inside the LINE client and navigates home outside it. The dialog is a thin wrapper over the existing ConfirmDialog. No new modal chrome.

## Unified wording (intentional user-visible change)
Exact strings, copied from the two identical modals. Title in LINE: ปิดแบบฟอร์มนี้? Title outside LINE: ออกจากหน้านี้? Body: data-loss line plus unrecoverable line. Decline: ไม่ใช่. Confirm: ยืนยัน. Danger variant. Booking adopts this set and drops its own dialog title (ยกเลิกการจอง) and button labels (ยืนยันยกเลิก, กลับไปจองต่อ). Its post-cancel notice text stays unchanged.

Minor normalization accepted: the two copies used ghost decline buttons and bespoke icon chrome. The shared chrome uses outline decline plus the ConfirmDialog icon. Layout and copy stay equivalent.

## Scope
Migrate debt-mediation, service-request, booking. Delete the two copied modals. Leave request-v2 and service-request-single untouched until confirmed still used.

## Non-goals
Pieces 2 to 4 (clear button, wizard nav, step card). Visual restyle beyond the shared chrome. New strings beyond the unified set.

## Guards
Debt and service-request page tests pass unmodified. Booking dialog-wording assertions update intentionally. Full frontend suite, typecheck, and lint on touched files stay green.

## Verification
Unit tests for the three pages plus a hook-level test. Typecheck. Lint. CI green. Human phone check in LINE after merge.
