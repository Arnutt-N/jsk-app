# PRD: Admin UI Consistency Batch (2026-10-23)

## Problem
Admin pages grew organically: row actions, date filters, refresh buttons, and
view toggles differ per page. Users report missing buttons, inconsistent
filters, and stale reference pages.

## Scope (verified by read-only survey 2026-10-23, branch fix/admin-ui-consistency-batch)

### A. Row actions (all use shared `ActionIconButton` — no new button code)
| Page | Change |
|---|---|
| users | NO CHANGE — Edit button already exists (`page.tsx:454-456`). Detail page exists (`users/[id]`) but no row link; add view (Eye) link to it. |
| files | Add Edit (rename) action; add enable/disable toggle per file. NOTE: verify backend supports rename + active flag; if not, file-serving rename via metadata PATCH or defer toggle. |
| canned-responses | Add view-details (read-only modal) + enable/disable toggle. NOTE: verify backend `is_active` exists. |
| rich-menus | Add view-details (read-only modal with preview; edit page already exists). Insights button stays. |
| reply-objects | Add view-details (Eye) on cards; fix `$skn_menu` → `$jsk_menu` (`page.tsx:433`); add grid/list view toggle. |

### B. Filters — unify on shared `DateRangePicker` (+ this-year preset)
| Page | Change |
|---|---|
| reports | Keep presets; ADD clear-filter button. (Reports uses hand-rolled preset buttons; migrate to `DateRangePicker` only if cheap, else keep + add clear.) |
| audit | Replace number-input days with `DateRangePicker` (7/30/90/this-year/custom); keep Refresh; convert action/resource free-text Inputs to dropdowns IF backend exposes distinct values, else keep text + add clear button. |
| friends (+history) | Add `DateRangePicker` (7/30/90/this-year/custom) + clear-filter button. |
| bookings | Has `ล้างวันที่`; keep. |
| Global | Every filter bar in scope gets a clear/reset button. |

### C. Buttons / views
- chat-histories refresh → labeled style (text + spin + disabled), same as audit/analytics/health.
- reply-objects new template: DECIDED 2026-10-23 → full page like rich-menu new (user).
- bookings active tab color: DECIDED 2026-10-23 → brand color (user).
- image-resize: accept AVIF (+SVG) input; output stays PNG/JPEG/WebP. HEIC/TIFF skipped (browser canvas cannot decode reliably).

### D. Reference pages (no behavior change)
- design-system: refresh inventory counts/sections to match current `components/ui` + admin components (stale since 2026-04-08). Verify, don't rewrite.
- settings: NO CHANGE — all 7 sections covered; missing endpoints are intentional backend-only APIs.
- dashboard: DECIDED 2026-10-23 → expand now (today/overdue counts + system status card).

## Non-goals
- No backend schema changes unless toggle needs it (then separate migration PR).
- No unifying the three close/leave button policies (tracked debt from PR #288).
- No changing filter behavior, only presentation + parity.

## Acceptance
- Every page in scope: actions/filters match spec above, reuse shared components.
- `tsc --noEmit` clean; affected vitest suites green; CI green on PR.
- Manual phone/desktop check of touched pages.
