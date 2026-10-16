# PRD — shared service taxonomy (DB-backed, admin-editable)

## Problem
LIFF service-request and booking read categories from different places (hardcoded TOPIC_OPTIONS vs backend free-text service_types). Admins cannot edit the list; the two pages drift. Requirement: one DB-backed source, editable from DB/UI, both pages follow it.

## Decision (user override 2026-10-16)
User chose the dedicated-table design (Candidate B) over the synthesis recommendation: two tables + migration + seed, per-topic active flags, explicit ordering, admin CRUD UI.

## Locked addition (user 2026-10-16)
- Taxonomy admin is governed by the existing permission matrix, not hardcoded admin: new key `manage_taxonomy` (system module, MANAGE level, Thai label), DEFAULT_POLICY roles SUPER_ADMIN + ADMIN, other roles only via matrix grant at /admin/settings/permissions.
- Admin taxonomy endpoints use `Depends(require_permission(KEY_MANAGE_TAXONOMY))` (D7 precedent: manage_credentials/edit_business_hours). Matrix endpoints stay hardcoded (lockout prevention) — taxonomy is not one.
- Frontend mirror entry + integrity test key-count bump (22→23). Matrix UI picks it up from the live registry automatically.

## Scope (Candidate B)
1. Backend: `models/taxonomy.py` (TaxonomyCategory/TaxonomyTopic, unique per level, sort_order, is_active), Alembic migration + frozen TOPIC_OPTIONS seed, `schemas/taxonomy.py`, `services/taxonomy_service.py` (sole owner, 60s versioned cache, writers invalidate), public `GET /api/v1/taxonomy` (bare map, {} when empty), admin CRUD under `/admin/taxonomy` (401/403/404/409/422 contract).
2. Frontend admin editor `app/admin/taxonomy/page.tsx` + `TaxonomyEditor` client leaf + `useTaxonomyAdmin` hook (numeric order fields, no drag-DND v1; 409 → suggest deactivate).
3. Tests: seed-equality (authoring-time), CRUD matrix, public-map shape, never-throw client fallback (existing).
4. History policy: requests snapshot names at creation (free text unchanged); renames prospective-only; no FK.

## Non-goals
PATCH on public route, envelope wire format, FK from service_request, drag-DND ordering v1, Redis cache v1.

## Acceptance
- Migration applies cleanly on fresh + existing DB; downgrade drops both tables.
- Admin UI round-trips rename/reorder/deactivate; LIFF fallback chain intact.
