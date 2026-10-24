# PRD — Admin UI fixes batch (files, users, audit, canned, reply-objects, reports + Viewer demo)

> Branch: `feat/admin-ui-fixes-viewer-reports`
> Pages: `/admin/files`, `/admin/users`, `/admin/audit`, `/admin/canned-responses`, `/admin/reply-objects`, `/admin/reports`
> Skills invoked: `writing-plans`, `to-prd` (+ project rule: AGENTS.md workflow)
> User decisions (2026-10-24): Viewer opens items 1–5 only; Reports % moves to line 3 per base `StatsCard`.

## 1. Problem (what the user sees, plain words)

1. **Files:** 4 images preview broken — `IMG_0492.jpeg`, `IMG_0495.jpeg`, `22.png`, `10-11-2.jpg`. Shows icon instead of picture.
2. **Users:** table too wide → horizontal scroll on desktop. Username column (`LINE:U...`) wastes space.
3. **Viewer demo:** need a view-only user for demo. Question was which menus to open.
4. **Audit vs Reports dates:** `/admin/audit` date filter looks/works differently from `/admin/reports`.
5. **Audit dropdowns:** dropdown + `v` button looks broken, `v` sticks outside; no clear-filter button in the filter box.
6. **Canned-responses:** on/off switch sits in the action column, while `/admin/auto-replies` puts it in the Status column.
7. **Reply-objects seed name:** card code `$$skn_menu` still shows old name "SKN 6-zone service menu", should be `jsk...`.
8. **Reply-objects edit:** edit opens a popup (`Modal`), while `+ New Template` goes to a full page (`/new`).
9. **Reply-objects status:** no on/off switch, no Status column.
10. **Reports cards:** `%` sits top-right next to icon, while base cards (`/admin/chatbot`, `/admin/users` → `StatsCard`) put `%` on line 3 under the number.

## 2. Decisions already made with user

- **Viewer scope = open items 1–5 only:**
  1. Dashboard (`/admin`)
  2. Chatbot Overview (`/admin/chatbot`)
  3. Reports (`/admin/reports`)
  4. Manage Requests (`/admin/requests`) + Appointments (`/admin/bookings`)
  5. Reply Objects (`/admin/reply-objects` view) + Rich Menus (`/admin/rich-menus` view)
  - Closed: Broadcast, Live Chat, Users, Access Requests, Settings, Health, Design System, Files upload/delete, any edit/delete/send buttons. Requests list must mask personal data for Viewer.
- **Reports card = follow base `StatsCard`:** line 1 title, line 2 big value, line 3 `%` trend (`▲/▼ x% vs last month`) or description. Remove top-right `TrendBadge`.

## 3. Root causes (technical)

| # | Cause | File:line |
|---|-------|------------|
| R1 | `getPreviewUrl()` falls back to `buildMediaUrl()` = `/media/{id}[?token]`; private files without `public_token` return 403 → `<Image onError>` marks `brokenIds` → icon fallback. The 4 named files match this path. | `frontend/app/admin/files/page.tsx:353-365, 550-570, 857-864` |
| R2 | Users table uses `whitespace-nowrap` + `px-6` on every cell, no `max-w/truncate` on username; `LINE:` + full id forces overflow. | `frontend/app/admin/users/page.tsx:380-455` |
| R3 | No `VIEWER` value in `UserRole`; sidebar `allowedRoles` only lists SUPER_ADMIN/ADMIN(/DIRECTOR/HEAD/AGENT). Backend `get_current_admin` / permission gates have no read-only path. | `backend/app/models/user.py:7-27`, `frontend/app/admin/layout.tsx:181-226`, `frontend/lib/nav-access.ts` |
| R4 | Two date mechanisms: audit uses `DateRangePicker + standardDatePresets` (`DateRangePicker.tsx`), reports uses local `datePreset 7d/30d/90d/year/custom` buttons + `period` (`reports/page.tsx:246-264,313-360`). | `frontend/app/admin/audit/page.tsx:64-95`, `frontend/app/admin/reports/page.tsx:118-142` |
| R5 | Shared `Select` wraps in `div.w-full`; page passes `className="w-full sm:w-48"` which lands on inner `<select>`, not the wrapper → wrapper stays full-width, row breaks; custom `ChevronDown` is absolute inside wrapper (correct) but duplicates native arrow if `appearance-none` fails. Clear button exists in `PageHeader` (`hasActiveFilter` → `ล้างตัวกรอง`) but not inside the filter box. | `frontend/components/ui/Select.tsx:87-142`, `frontend/app/admin/audit/page.tsx:133-155,228-260` |
| R6 | Canned puts `Switch` in action column (`canned-responses/page.tsx:423-427`) + `Badge` in status column; auto-replies puts the toggle itself in the status column (`auto-replies/page.tsx:340-350`). | as cited |
| R7 | `$$skn_menu` string not found in frontend/backend source (only `skn-admin` test strings) → it is seed/DB data (`reply_objects.object_id/name`), not code. | `grep -rni skn_menu` → no source hit |
| R8 | `openEdit()` → `Modal + ReplyObjectForm` (`reply-objects/page.tsx:60,253-269`); `+ New Template` → `<Link href="/admin/reply-objects/new">`. No `/admin/reply-objects/[id]` edit route. | `frontend/app/admin/reply-objects/page.tsx:34-70,253-269`, `frontend/app/admin/reply-objects/new/` exists, `[id]/` missing |
| R9 | `reply_object` model already has `is_active` (`backend/app/models/reply_object.py:61`) but list UI (grid + table) shows no Status column and no toggle; no PATCH wiring in page. | `frontend/app/admin/reply-objects/page.tsx:130-250`, `backend/app/models/reply_object.py:61` |
| R10 | Local `StatCard` in reports renders `TrendBadge` top-right (`reports/page.tsx:149-181`); base `StatsCard` renders `trend` on line 3 (`StatsCard.tsx:56-82`). | as cited |

## 4. Solution (user-visible)

1. Files: every image either previews or shows a clear Thai reason (e.g. "ไฟล์ส่วนตัว — สร้างลิงก์ก่อนดู"). The 4 named files must preview.
2. Users: no horizontal scroll on desktop 1280px; username shows short form `LINE:U***…` with full value on hover.
3. Viewer: new `VIEWER` login sees only menus 1–5; every button that changes/sends data is hidden; direct URL to closed pages bounces to Dashboard; personal data (phone/email/full LINE id) stays masked.
4. Dates: audit and reports share one look — preset buttons + Thai calendar range + one clear button. Same Bangkok half-open UTC behaviour as `date_windows`.
5. Audit filters: dropdown arrow sits inside the box (single `v`), filter box has its own "ล้างตัวกรอง".
6. Canned: switch moves into Status column (badge + switch stacked), same as auto-replies.
7. Seed: `$$skn_menu` renamed to `$$jsk_menu` / "JSK 6-zone service menu" via data migration (code + existing DB rows).
8. Edit: pencil goes to full page `/admin/reply-objects/[object_id]/edit` (same form as `/new`), modal removed.
9. Status: Status column + on/off switch on grid + table, wired to `PATCH /admin/reply-objects/{id}` (`is_active`).
10. Reports: cards rebuilt on base `StatsCard` — `%` on line 3.

## 5. User stories (abridged)

1. As an admin, I want broken images to show why, so that I know whether to create a public link.
2. As an admin, I want the users table to fit the screen, so that I don't scroll sideways.
3. As a demo host, I want a Viewer login, so that guests can look but change nothing.
4. As a Viewer, I want closed menus hidden, so that I never open a dangerous page by accident.
5. As an admin, I want audit dates to work like reports dates, so that I don't learn two systems.
6. As an admin, I want one clear-filter button in the filter box, so that I reset with one click.
7. As an admin, I want the canned switch in the Status column, so that all on/off switches sit in the same place.
8. As an admin, I want the seed card to say JSK, so that the demo shows the right brand.
9. As an admin, I want edit to open a full page, so that I have room to edit Flex JSON.
10. As an admin, I want a status switch on reply objects, so that I can disable a card without deleting it.
11. As an admin, I want reports `%` under the number, so that all summary cards read the same way.

## 6. Implementation decisions

- Viewer = new `UserRole.VIEWER` (backend enum + Alembic migration); default permission = read-only on menus 1–5; write endpoints return 403 for VIEWER; frontend `allowedRoles` updated + `PageAccessGuard`/layout redirect; mask PII via existing `maskLineUserIdForRole` / `pii_masking.py`.
- Dates: keep `DateRangePicker` as the single component; reports keeps its `period` segmented control but adopts the picker UI; Bangkok half-open windows via `app/core/date_windows`.
- Select fix: `Select` accepts `wrapperClassName` (or page wraps in fixed-width div); never pass layout width only to inner select.
- Reply-objects edit page reuses `ReplyObjectForm`; route `/admin/reply-objects/[object_id]/edit`.
- Seed rename: code default + Alembic `UPDATE reply_objects SET object_id='jsk_menu', name=... WHERE object_id='skn_menu'`.
- Reports cards: delete local `StatCard`, reuse `StatsCard` with `trend` prop.

## 7. Testing decisions

- Backend pytest: VIEWER can GET 1–5, gets 403 on POST/PATCH/DELETE + broadcast send; seed migration renames exactly one row.
- Frontend Vitest: nav-access unit (VIEWER sees 1–5 only), StatsCard trend line-3 render, audit clear-filter behaviour.
- Manual: open each of the 4 broken images; users table at 1280px no x-scroll; audit/report date parity; canned/auto toggle column match; reply edit page + status toggle round-trip.

## 8. Out of scope

- Changing date semantics (Bangkok windows stay), backend query params, validation rules.
- Rewriting `DateRangePicker` internals or `CalendarPickerTH`.
- Bottom-sheet calendar on mobile.
- Backfilling Viewer onto old audit rows.

## 9. Iron rule reminder (user-mandated 2026-10-13)

No secret/key material is printed in any handoff, summary, or log for this task. Verification by counts only.
