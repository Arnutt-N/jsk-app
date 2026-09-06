# PRD: Backlog Batch — Shared Thai DateTime Picker, `created_at` Index, Webhook Lua Lock Release, Reply-Objects Input Height

**Date:** 2026-09-06 · **Status:** APPROVED (self-review; autonomous session) · **Branch:** `chore/backlog-batch-20260906`

Sources: backlog queued in `project-log-md/zcode/session-summary-20260905-2326.md`, `20260906-0124.md`, `20260906-1224.md` (items explicitly proposed to the user; DEFER-* items excluded — they await owner decisions).

## Problem Statement

Four small quality debts queued from recent sessions:

1. **Duplicated Thai date+time picker logic.** The broadcast scheduler and the rich-menu display-period forms (new + edit) each hand-compose `CalendarPickerTH` + a raw time input, keep date/time as separate state vars, and re-implement the combine/split logic (`isoToYMD`, `toLocalDatetimeInputValue().split('T')`, `new Date(...).setHours`). Three copies of subtle timezone code = drift risk (exactly the class of bug PR #226 fixed).
2. **No DB index on `service_requests.created_at`.** The admin requests list, the bot's "my requests" command, and admin reports all `ORDER BY created_at DESC` — sequential scans that degrade as the table grows. Every other hot column on the table is already indexed.
3. **Webhook dedup lock release is flag-based, not token-based.** After PR #225 the lock is only released by the invocation that acquired it, but the lock value is the literal `"1"`. If processing ever outlives the 5-minute lock TTL, another delivery can acquire a fresh lock and the slow first worker's `DELETE` would destroy the *second* worker's in-flight lock — reopening the duplicate-processing window PR #225 closed (narrower, but real).
4. **Reply-objects form inputs are taller than every other admin form.** The modal hand-rolls `px-4 py-3` inputs (~48px) instead of using the shared `Input` component (md = h-10 ≈ 40px), so the form visibly disagrees with the rest of the admin UI.

## Solution

1. One shared `DateTimePickerTH` component owns the "Thai (พ.ศ.) date + time" composition and emits a single timezone-correct ISO datetime (or null until both parts are chosen). The three pages reduce to a controlled `value`/`onChange` pair.
2. An additive Alembic migration adds `ix_service_requests_created_at` (same style as the `assigned_agent_id` index migration).
3. The dedup lock value becomes a per-invocation unique token; release goes through a new `RedisClient.release_lock()` that runs an atomic compare-and-delete Lua script — a stale worker can never delete a lock it no longer owns.
4. The reply-objects modal uses the shared `Input` component (md size) and matching select height.

## User Stories

1. As an admin creating a scheduled broadcast, I want one date+time control that behaves identically to the rich-menu scheduler, so that scheduling feels the same everywhere.
2. As an admin scheduling a rich-menu display period, I want the Thai (พ.ศ.) calendar and time fields to keep working exactly as after PR #226, so that my saved periods stay timezone-correct.
3. As an admin editing an existing rich menu, I want the saved period to load back into the pickers in my local wall-clock time, so that what I see matches what was saved.
4. As a maintainer, I want the compose/split datetime logic to live in exactly one file, so that a future timezone fix cannot be applied to two pages and forgotten on the third.
5. As an admin browsing the requests list, I want it to stay fast as request volume grows, so that sorting by newest does not slow down over time.
6. As a citizen messaging the OA ("ขอรายการของฉัน"), I benefit indirectly from the index because the bot command sorts my requests by creation time.
7. As an ops person, I want webhook redeliveries to stay deduplicated even if an event takes longer than the lock TTL to process, so that slow processing cannot cause a double reply to a citizen.
8. As an admin filling in the reply-objects form, I want its inputs to match the height/typography of every other admin form, so that the UI feels consistent.
9. As a developer writing the next admin form, I want a reusable date+time picker I can drop in with two props, so that I don't copy the pattern a fourth time.

## Implementation Decisions

- **Component API (`DateTimePickerTH`, controlled single-value):**
  - `value: string | null` — a full ISO datetime (with timezone); `onChange(iso: string | null)`.
  - Emits a **complete** ISO only when both date and time are chosen; emits `null` otherwise (matches every current consumer, which requires both parts before enabling saves).
  - Internal date/time parts are derived from `value` (local wall-clock parts via `Date` getters — never UTC slicing) and synced from the prop only when the incoming value differs from the last value the component itself emitted (`lastEmittedRef`), so a partial selection (date picked, time pending → emitted `null`) is not clobbered by its own echo.
  - Emit path: combine local parts into a `Date` and call `toISOString()` — same timezone semantics PR #226 locked in.
  - `dateLabel` (forwarded to `CalendarPickerTH` `ariaLabel`) and `timeLabel` (time input `aria-label`) are required — the existing page tests query `วันที่เริ่มแสดง` / `เวลาเริ่มแสดง` / `วันที่ซ่อนเมื่อถึง` / `เวลาซ่อนเมื่อถึง` and must keep passing unmodified.
  - Time input is disabled until a date is chosen (broadcast's current behavior, now intrinsic).
  - Style slots: `className` (wrapper), `dateClassName`, `timeInputClassName` merged via `cn()` (tailwind-merge resolves the display/width conflicts so the rich-menu pages keep their stacked in-label layout and the broadcast page keeps its row layout).
  - `label?: string` optional visible label above the pair (broadcast's "ตั้งเวลาส่ง (ไม่บังคับ)" stays on the page — page decides).
- **Page adoption:** broadcast/new keeps one field (submit uses the emitted ISO directly; the old date-missing/time-missing toast pair collapses into one message — "กรุณาเลือกวันและเวลาที่ต้องการส่ง" — because the component only emits complete values); rich-menu new + edit keep two fields each; edit loads `data.display_start_at` straight into `value` (the component does the ISO→local split, replacing `toLocalDatetimeInputValue().split('T')`); range validation compares the two emitted ISO strings.
- **Index:** `created_at = Column(..., index=True)` + hand-written migration `t1u2v3w4x5y6` (down: `s0t1u2v3w4x5`, verified via `alembic history` before writing) creating `ix_service_requests_created_at`; downgrade drops it. Additive; same precedent as the `assigned_agent_id` index migration.
- **Lock release:** `RedisClient.release_lock(key, token)` → Lua `if get==ARGV then del` via `eval`, tri-state (`True` released / `False` not owner anymore / `None` Redis down). Webhook generates `uuid4().hex` per event, stores it as the lock value, releases with the same token; the `lock_acquired` flag stays (cheap guard — skips the round-trip for the loser paths); failure to release stays silent-safe (TTL cleans up).
- **Reply-objects form:** the 4 text inputs become the shared `Input` (default outline, md size — `h-10 px-4 py-2.5 text-sm`), keeping ids, `required`, `disabled`, placeholders, `font-bold`, and `font-mono` on the Universal ID; the select gets `h-10 py-0 text-sm` to match. Background settles on the shared `bg-surface` (codebase default) instead of the one-off `bg-bg`.

## Testing Decisions

- **Frontend unit tests** (highest seam = rendered component behavior): new `DateTimePickerTH` test — renders both fields with given labels; emits a timezone-correct ISO only when both parts chosen (`new Date(iso)` local parts round-trip); emits `null` when cleared or partial; time disabled before date chosen; external `value` load derives local parts (edit-page scenario); own-echo does not clobber a pending partial selection. Prior art: `rich-menus/new/__tests__/page.test.tsx` (label queries) and the PR #226 timezone tests.
- **Frontend page tests:** existing rich-menu new/edit tests must pass **unmodified** (labels preserved, no `datetime-local` input). Broadcast has no page tests — covered by the component tests + tsc/build.
- **Backend tests** (`tests/test_webhook_deduplication.py`): winner releases via `release_lock` with exactly the token it stored; loser of the NX race never calls release; Redis-down path never calls release; handler failure releases without marking processed (existing tests updated to the new seam). New `RedisClient.release_lock` unit tests: eval→1 → True, eval→0 → False, disconnected → None without raising. Prior art: the existing fixture/mocking pattern in the same file.
- **Migration:** `alembic history` shows a single head with the new revision; upgrade on the local docker DB + `alembic check` reports no drift (same drill as previous index migration).

## Out of Scope

- `DEFER-M1..M3` / `DEFER-L1..L11` — each explicitly awaits an owner decision; not touchable autonomously.
- Changing the dedup lock TTL or replay-persistence policy (DEFER-L3 territory).
- Adopting `DateTimePickerTH` on pages without datetime needs (LIFF intentionally has none — design decision recorded in PR #226's PRD).
- Broadcast page redesign beyond the swap (preview text keeps its current wording, derived from the emitted ISO).
- Reply-objects JSON textarea (`rows=12` is intentional editor height).

## Further Notes

- CD scope resolver will pick up both a frontend and a backend deploy (migration runs via CD like previous additive ones).
- The 4 items are independent; they ship as separate commits on one branch so any of them can be reverted alone.
