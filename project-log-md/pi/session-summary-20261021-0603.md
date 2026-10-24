# Session Summary — pi — 2026-10-21T06:03:00+07:00

**Branch**: `main`  **HEAD**: `add13bc`
**Checkpoint**: `.agents/state/checkpoints/handover-pi-20261021-0603.json`

## Objective
Ship booking LINE notification toggle + quota readout (PR #280): operator asked for
(1) LINE push notifications manageable from the settings menu now that push quota
is sufficient, (2) an audit of the existing email toggle — does it exist and is its
config format appropriate.

## Completed
- **PRD + plan written and operator-approved** (`.claude/PRPs/prds/booking-line-notify.prd.md`,
  `.claude/PRPs/plans/booking-line-notify.plan.md`): D1 independent per-channel sends,
  D2 `line_enabled` default OFF (explicit opt-in), D3 read-only quota display.
- **Email audit verdict: toggle EXISTS and format is GOOD** (fail-closed default OFF,
  `Optional[bool]=None` keep-stored sentinel, 422 enforcement, settings UI toggle).
  Only routing changed (exclusive-or → independent). No email schema/key changes.
- **Backend** (`aab44e2`): `booking_line_enabled` key/config/schema/endpoint
  (`GET/PUT /admin/bookings/settings`, `GET /admin/bookings/line-quota` with 5-min
  cache + Thai 502), `BookingOptionsOut.line_enabled`, independent sends in
  `notify_booking_confirmed` / `send_booking_reminder`, `_push_flex` skips when OFF.
- **Frontend** (`1f0b0e2`): "แจ้งเตือนทาง LINE" toggle above the email toggle +
  quota readout (`โควต้า LINE คงเหลือ X / Y` / `ไม่จำกัด` / fail-open placeholder)
  with refresh button; `fetchLineQuota` + `describeQuota` in `lib/booking.ts`.
- **Tests**: 14 new backend (routing matrix, keep-stored, quota happy/cache/unlimited/502),
  7 new frontend (toggle on/off/persist, quota numbers/unlimited/fail-open/refresh);
  updated 2 exclusive-or tests to D1 + 4 mocks missing the new field.
- **Gates**: backend booking suite 232 passed (+3 claim on real PG after local
  `upgrade head`); frontend settings 19/19, liff/booking 55/55, walkin+calendar 17/17
  (longer timeout — 5s timeouts are environmental slowness); tsc/eslint/next build green.
- **CI journey**: first run caught a real miss (ratelimit options mock without
  `line_enabled` → 500) — fixed in `752937f`; a rerun storm self-cancelled via
  concurrency groups (retriggered cleanly); one flaky blackout-picker timing test
  passed on retry. Final: all checks green.
- **Merged**: PR #280 squash `add13bc` to main; main CI + E2E green; **CD success**.
- **Handoff**: this checkpoint (handoff-new.cjs).

## Next Steps
- Operator post-deploy step: flip **แจ้งเตือนทาง LINE → ON** in
  `/admin/settings/booking` when ready (default OFF pauses LINE booking pushes by
  decision; email channel unaffected). Verify quota readout matches LINE OA console.
- Phone-test booking flow in LINE (confirm + reminder bubbles) + hard-refresh admin.
- Consider bucket (deferred): claim no-burn shape, v2-draft resurrection, replay 201.
- pstack review pass requested on this work: no-comments, blast-radius, babysit,
  thermos, interrogate, deslop.

## Blockers
- None. SMTP sandbox still awaited from the prior session (email stays fail-closed OFF).

> Fill in detail above, then commit. TASK_LOG.md + SESSION_INDEX.md are generated.
