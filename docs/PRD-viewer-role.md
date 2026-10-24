# PRD — Read-only VIEWER role (menus 1–5)

> Task 3 of `docs/PRP-admin-ui-fixes-batch.md` (approved plan; self-review section ✅).
> Skills invoked: `testing_standards` (pytest/Vitest patterns, real-session recipe),
> `api_development_standard` + `skn-auth-security` (RBAC gating via `require_permission`),
> `frontend_architecture` (Server Components / `use client` leaves), `error_handling`.
> Branch: `feat/admin-ui-fixes-viewer-reports` (already created). No implementation on `main`.

## Problem (user's words)

Need a demo/auditor login that can **look but not touch**: see Dashboard, Chatbot
Overview, Reports, Requests/Bookings, Reply Objects/Rich Menus — and nothing else.
Today any internal login that can open those pages can also broadcast, chat,
edit users, or change settings.

## Scope — 5 allowed menus (GET only)

1. Dashboard `/admin` (requests stats; health card stays best-effort)
2. Chatbot Overview `/admin/chatbot` (reply-objects list + intent categories)
3. Reports `/admin/reports` (overview/service-requests/messages/operators/followers)
4. Manage Requests `/admin/requests` + Appointments `/admin/bookings` (list/detail/availability)
5. Reply Objects `/admin/reply-objects` (view) + Rich Menus `/admin/rich-menus` (view)

Closed (frontend hides + redirects to `/admin`; backend 403):
Broadcast, Live Chat (page + WS), Users, Access Requests, Settings, Health,
Design System, Files upload/delete, and every POST/PUT/PATCH/DELETE/send.

## Decisions

- `STAFF_ROLES` (frontend) does **NOT** include VIEWER — write-paths keyed on
  staff stay closed. Nav visibility is per-item `allowedRoles`, which lists
  VIEWER on the 7 allowed items only.
- Backend: VIEWER is in **no** existing permission key except `view_reports`.
  Read access on the other 4 menus comes from three new `*_or_viewer` gates used
  **only** on explicit GET routes. All writes keep `require_permission(MANAGE_*)`
  / admin-manager-staff gates → automatic 403 for VIEWER.
- PII: requests/bookings responses mask `line_user_id`/`phone_number`/`email`
  when the caller is VIEWER (other roles byte-identical). Reports/export already
  mask via `pii_masking.mask_line_id`; frontend `maskLineUserIdForRole` already
  masks non-SUPER_ADMIN/ADMIN (verified, no change needed).
- `GET /permissions/me` serves VIEWER (all-false capabilities) so the UI can
  hide assign/export affordances without an extra call.

## Acceptance

- `VIEWER GET` on §Scope routes → 200 (masked PII); `VIEWER` write/broadcast/
  live-chat-send → 403; `VIEWER GET` on closed routes → 403.
- Sidebar shows exactly the 5 groups; direct URL to a closed route → `/admin`;
  no add/edit/delete/send button renders for VIEWER.
- `pytest backend/tests/test_users_viewer.py -q`, `test_date_windows.py -q`,
  `npm run lint`, `npx tsc --noEmit`, `vitest nav-access` all green.
