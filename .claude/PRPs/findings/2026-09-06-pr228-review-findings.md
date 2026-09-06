# Findings — codebase-review-fix — PR #228 (squash `249f2c9`)

**Date:** 2026-09-06 · **Scope:** PR #228 diff (14 files: DateTimePickerTH + 4 page adoptions, created_at index migration, webhook Lua lock release, reply-objects Input swap, test updates)
**Review execution:** 4 angles (frontend / backend / security / test-coverage). Parallel subagents were unavailable in this environment (`Model request failed` for Explore and general-purpose) — **fallback: all angles reviewed in the current context, read-only**, per the workflow's fallback rule.

## Stack detected (Step 1)

| Layer | Stack | Commands |
|---|---|---|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 async, Alembic, redis-py asyncio | `backend/venv/Scripts/python.exe -m pytest tests/<file> -v` (local; CI Linux is authoritative for the full suite) |
| Frontend | Next.js 16.1, React 19.2, TS 5, Tailwind v4, Vitest + Testing Library | `npm run test:unit -- <path>`, `npx tsc --noEmit`, `npm run lint`, `npm run build` (from `frontend/`) |
| DB | PostgreSQL 16 (Supabase PROD / docker local), Redis 7 (Upstash PROD / docker local) | `scripts/db_target.py alembic --target local upgrade head` |

## Accepted findings (fix in this round)

- **F1 · Medium · tests** — `frontend/components/ui/__tests__/DateTimePickerTH.test.tsx`: two shipped behaviors have no test: (a) the `timeDisabled` prop, (b) an invalid/non-ISO `value` prop must degrade to empty fields, not crash. Category: missing-test. Evidence: the test file exercises only valid-ISO and null paths.
- **F2 · Low · frontend (consistency)** — `frontend/app/admin/reply-objects/page.tsx` (form modal select, ~L362): the PR unified the 4 text inputs to the shared `Input` (outline variant = `bg-surface`) but left the select on `bg-bg` — the one form now mixes two background tokens. Category: bad-practice/consistency. Evidence: input className via shared Input vs select's hand-written `bg-bg`.
- **F3 · Low · tests** — `backend/tests/test_webhook_deduplication.py`: the process-level path "release_lock fails/Redis hiccups at release (returns None) must not break event processing" is untested (the fixture mocks `release_lock` to return True in every test). Category: missing-test.

## Rejected / accepted-with-no-action (documented — silence is not a disposition)

- **R1 · a11y (latent, pre-existing)** — two DateTimePickerTH instances on one page duplicate CalendarPickerTH's constant `เดือน` / `ปี พ.ศ.` aria-labels. Pre-existing pattern: the old rich-menu pages had two CalendarPickerTHs with the same constants; PR #226's notes already document the `getAllByLabelText` workaround. Not introduced by PR #228; fixing means changing CalendarPickerTH's label API — out of this round's scope.
- **R2 · documented limitation (accepted)** — an external hard-reset of `value` to `null` cannot clear a pending partial selection (indistinguishable from the component's own null echo). Documented in the component docstring with the remount-key escape hatch; no consumer resets today.
- **R3 · log injection via `webhook_event_id` (pre-existing)** — event_id is logged raw at `webhook.py:65,85`. The line predates PR #228 (unchanged by it); masking user IDs uses `mask_line_id` elsewhere. Out of diff scope — flagged for a future hardening pass if the owner wants it.
- **R4 · security surface (clean)** — `_RELEASE_LOCK_LUA` is a module constant (no string interpolation); `key`/`token` reach Lua as KEYS/ARGV arguments, so a hostile `webhook_event_id` cannot inject script; token compare-and-delete means a stale holder cannot delete another worker's lock; fail-open tri-state preserved from PR #225. No XSS vectors in the frontend diff (no `dangerouslySetInnerHTML`; `required`/`disabled` preserved in the reply-objects swap).
- **R5 · no Critical/High findings** after verifying every suspicion against the code (broadcast toast merge = documented deviation; edit-page SCHEDULED load covered by existing unmodified test at `edit/__tests__/page.test.tsx:236-262`; migration matches the `r9s0t1u2v3w4` precedent including `op.f()` naming; head-guard test updated deliberately).
