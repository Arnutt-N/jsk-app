# [Admin UI fixes batch] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 admin UI issues in one branch with viewer demo role, unified cards/dates/dropdowns, and no regressions.

**Architecture:** Shared-component-first (fix `Select`/`StatsCard`/`DateRangePicker` once), read-only `VIEWER` role enforced backend + frontend, reply-objects edit becomes a route reusing `ReplyObjectForm`, seed rename via migration.

**Tech Stack:** Next.js 16 + React 19 + Tailwind v4 (frontend), FastAPI + SQLAlchemy 2 async + Alembic (backend), pytest + Vitest.

## Global Constraints

- Async by default; never return ORM models (use `model_validate`).
- Admin date filters use Bangkok half-open UTC windows via `app/core/date_windows`.
- Comments carry why-only; no restatement banners.
- Secrets never printed; verify by counts/hashes only.
- Branch: `feat/admin-ui-fixes-viewer-reports` (already created from `main`).
- `npm run lint` + relevant pytest/Vitest suites pass per phase.

---

### Task 1: Files preview — private images show reason, 4 named files preview

**Files:**
- Modify: `frontend/app/admin/files/page.tsx:353-365, 513-570, 836-940`
- Test: manual + existing media tests `backend/tests/test_*.py` (media)

**Interfaces:**
- Consumes: `buildMediaUrl(file)`, `getPreviewUrl(file)`, `brokenIds`
- Produces: preview fallback with Thai reason + working tokenized `<Image>` for private files the admin may view

- [ ] **Step 1: Reproduce** — open `/admin/files`, search `IMG_0492.jpeg`, confirm icon fallback + console 403/404 for `/media/{id}` without token.
- [ ] **Step 2: Fix `getPreviewUrl`/`buildMediaUrl`** — for admin session, append auth (existing `apiFetch` token) or auto-create short-lived view token for `isImageMime`; on error show Thai reason ("ไฟล์ส่วนตัว — กดสร้างลิงก์สาธารณะเพื่อดู") instead of bare icon. Keep `markBroken` fallback.
- [ ] **Step 3: Verify 4 files** — `IMG_0492.jpeg`, `IMG_0495.jpeg`, `22.png`, `10-11-2.jpg` render thumbnails + modal preview.
- [ ] **Step 4: Run tests** — `python -m pytest tests/ -k media -q` + `npm run lint`.
- [ ] **Step 5: Commit** — `git add frontend/app/admin/files/page.tsx && git commit -m "fix(admin/files): preview private images with view token + Thai reason"`

### Task 2: Users table fits, username short form

**Files:**
- Modify: `frontend/app/admin/users/page.tsx:380-455`
- Test: Vitest responsive/table (new) or manual 1280px check

**Interfaces:**
- Consumes: `maskLineUserId()` from `@/lib/mask`
- Produces: `LINE:U***XXXX` cell with `title` = full id

- [ ] **Step 1: Failing check** — set viewport 1280px, confirm horizontal scrollbar exists.
- [ ] **Step 2: Implement** — username cell: `max-w-[140px] truncate font-mono` + `title={full}`; display short via `maskLineUserId`; reduce `px-6` → `px-4` on tight columns; keep `whitespace-nowrap` only on badge/date/actions.
- [ ] **Step 3: Verify** — no x-scroll at 1280px; hover shows full id.
- [ ] **Step 4: Run** — `npm run lint` + `npm run test:unit -- users`.
- [ ] **Step 5: Commit** — `git commit -m "fix(admin/users): fit table, shorten LINE username"`

### Task 3: VIEWER role — backend + nav + guards + PII mask

**Files:**
- Modify: `backend/app/models/user.py:7-27` (add `VIEWER = "VIEWER"`)
- Create: `backend/alembic/versions/xxxx_add_viewer_role.py`
- Modify: `backend/app/api/deps.py` (`get_current_admin` family), permission defaults, broadcast/live-chat write gates → 403 for VIEWER
- Modify: `frontend/lib/constants/roles.ts`, `frontend/lib/nav-access.ts`, `frontend/app/admin/layout.tsx:181-226`
- Test: `backend/tests/test_users_viewer.py` (new), `frontend/lib/__tests__/nav-access.test.ts`

**Interfaces:**
- Consumes: `UserRole`, `isNavItemVisible`, `maskLineUserIdForRole`
- Produces: `VIEWER` sees menus 1–5 only; all mutations 403; PII masked

- [ ] **Step 1: Failing test** — `VIEWER GET /admin/requests → 200`, `POST /admin/broadcast → 403`; nav-access VIEWER sees 5 groups only.
- [ ] **Step 2: Backend** — enum + migration + 403 on write endpoints for VIEWER.
- [ ] **Step 3: Frontend** — `ROLE_META.VIEWER`, `allowedRoles` for 1–5 include VIEWER, others exclude; closed-route redirect to `/admin`; hide action buttons when `role === 'VIEWER'`.
- [ ] **Step 4: Verify** — login as VIEWER: 5 menus visible, direct URL to `/admin/users` bounces, broadcast button hidden.
- [ ] **Step 5: Run** — `python -m pytest tests/test_users_viewer.py -q` + `npm run test:unit -- nav-access`.
- [ ] **Step 6: Commit** — `git commit -m "feat(admin): add read-only VIEWER role (menus 1-5)"`

### Task 4: Unify audit + reports dates on DateRangePicker

**Files:**
- Modify: `frontend/app/admin/audit/page.tsx:64-95`, `frontend/app/admin/reports/page.tsx:246-264,313-360`
- Reuse: `frontend/components/ui/DateRangePicker.tsx`, `backend/app/core/date_windows.py`

**Interfaces:**
- Consumes: `DateRangePicker`, `standardDatePresets`
- Produces: identical preset + range UI on both pages

- [ ] **Step 1: Snapshot both UIs** — screenshots of current audit vs reports date rows.
- [ ] **Step 2: Implement** — reports adopts `DateRangePicker` (keep `period` segmented); audit keeps picker; both map to Bangkok half-open windows.
- [ ] **Step 3: Verify** — same preset labels, custom range works on both, queries return same window.
- [ ] **Step 4: Run** — `python -m pytest tests/test_date_windows.py -q` + `npm run lint`.
- [ ] **Step 5: Commit** — `git commit -m "fix(admin): unify audit+reports dates on DateRangePicker"`

### Task 5: Select wrapper fix + audit clear button in filter box

**Files:**
- Modify: `frontend/components/ui/Select.tsx:87-142` (add `wrapperClassName`)
- Modify: `frontend/app/admin/audit/page.tsx:228-260` (use wrapper width + in-box clear)

**Interfaces:**
- Consumes: `Select`, `SelectOption`
- Produces: single inside `ChevronDown`, `w-48` boxes, in-box "ล้างตัวกรอง"

- [ ] **Step 1: Reproduce** — audit filter row wraps/breaks; inspect wrapper `w-full` vs select `sm:w-48`.
- [ ] **Step 2: Implement** — `wrapperClassName` prop → `<div className={cn("w-full", wrapperClassName)}>`; pages pass width to wrapper, not select; add in-box ghost clear button (in addition to header one).
- [ ] **Step 3: Verify** — one `v` inside each box, no overflow at 360px + 1280px.
- [ ] **Step 4: Run** — `npm run test:unit -- Select` (or lint if no suite) + `npm run lint`.
- [ ] **Step 5: Commit** — `git commit -m "fix(ui): Select wrapper width + audit in-box clear"`

### Task 6: Canned switch into Status column

**Files:**
- Modify: `frontend/app/admin/canned-responses/page.tsx:380-430`
- Reference: `frontend/app/admin/auto-replies/page.tsx:340-350`

- [ ] **Step 1: Compare columns** — screenshot both status columns.
- [ ] **Step 2: Implement** — Status cell = `Badge` + `Switch` stacked (badge top, switch below); action cell keeps view/edit/delete only.
- [ ] **Step 3: Verify** — toggle round-trips `PATCH is_active`, same keyboard/ARIA as auto-replies.
- [ ] **Step 4: Run** — `npm run test:unit -- canned` + `npm run lint`.
- [ ] **Step 5: Commit** — `git commit -m "fix(admin/canned): move toggle into Status column"`

### Task 7: Seed rename skn_menu → jsk_menu

**Files:**
- Modify: seed/defaults (wherever `skn_menu` default lives) + new migration `UPDATE reply_objects ...`
- Test: `python -m pytest tests/ -k reply_object -q`

- [ ] **Step 1: Locate rows** — `SELECT object_id,name FROM reply_objects WHERE object_id ILIKE '%skn%'`.
- [ ] **Step 2: Migrate** — code default `jsk_menu` + `UPDATE ... SET object_id='jsk_menu', name='JSK 6-zone service menu' WHERE object_id='skn_menu'`.
- [ ] **Step 3: Verify** — card shows `$$jsk_menu`; old id returns 404 or redirects.
- [ ] **Step 4: Run** — reply-object tests pass.
- [ ] **Step 5: Commit** — `git commit -m "fix(admin/reply-objects): rename skn_menu seed to jsk_menu"`

### Task 8: Reply-objects edit → full page route

**Files:**
- Create: `frontend/app/admin/reply-objects/[object_id]/edit/page.tsx` (reuse `ReplyObjectForm`)
- Modify: `frontend/app/admin/reply-objects/page.tsx:60,253-269` (pencil → `router.push(.../edit)`; delete `Modal` edit)
- Test: manual edit round-trip

- [ ] **Step 1: Scaffold route** — copy `/new` page, preload by `object_id`, same validation.
- [ ] **Step 2: Rewire** — grid + table edit buttons link to edit page; remove edit `Modal`.
- [ ] **Step 3: Verify** — edit saves, back navigates to list, VIEWER cannot open edit (redirect).
- [ ] **Step 4: Run** — `npm run lint` + `npm run test:unit -- reply`.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin/reply-objects): edit on full page, remove modal"`

### Task 9: Reply-objects Status column + toggle

**Files:**
- Modify: `frontend/app/admin/reply-objects/page.tsx:130-250` (grid + table)
- Modify: backend `PATCH /admin/reply-objects/{object_id}` already supports `is_active` — wire only
- Test: Vitest toggle + pytest PATCH

- [ ] **Step 1: Failing toggle** — no switch exists; add test expecting `PATCH {is_active:false}`.
- [ ] **Step 2: Implement** — Status column (badge + switch) in table; badge + switch row in grid card; optimistic update + rollback on 403.
- [ ] **Step 3: Verify** — toggle persists after reload; VIEWER sees badge but no switch.
- [ ] **Step 4: Run** — both suites pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin/reply-objects): status column + active toggle"`

### Task 10: Reports cards → base StatsCard, % on line 3

**Files:**
- Modify: `frontend/app/admin/reports/page.tsx:149-181,391-432,505-532` (delete local `StatCard`, use `StatsCard` + `trend`)
- Reuse: `frontend/app/admin/components/StatsCard.tsx:56-82`

- [ ] **Step 1: Screenshot before** — current top-right `%`.
- [ ] **Step 2: Implement** — replace all reports `StatCard` with shared `StatsCard` (`title/value/color/description/trend`); `%` renders line 3 as `▲ x% vs last month`.
- [ ] **Step 3: Verify** — 4 overview cards + 3 service-request cards match chatbot/users rhythm; no layout shift.
- [ ] **Step 4: Run** — `npm run test:unit -- reports StatsCard` + `npm run lint`.
- [ ] **Step 5: Commit** — `git commit -m "fix(admin/reports): cards use base StatsCard, trend on line 3"`

---

## Self-Review

- [x] Spec coverage: PRD items 1–10 each map to Tasks 1–10 above (Viewer 1–5 scope in Task 3).
- [x] Placeholder scan: no TBD/TODO; each step names exact files, commands, expected results.
- [x] Type consistency: `VIEWER` string consistent backend/frontend; `StatsCard trend` shape reused; `Select wrapperClassName` named once.

## Execution Handoff

Plan complete and saved to `docs/PRP-admin-ui-fixes-batch.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
