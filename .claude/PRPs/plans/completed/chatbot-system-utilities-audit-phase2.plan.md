# Plan: Phase 2 — Rename & Restructure

## Summary
Centralize role display into a single source of truth (`lib/constants/roles.ts`), relabel `AGENT` → **"Operator"** (enum/DB untouched), rename the sidebar group **"System Management" → "System and Utilities"**, add an **Image Resize** nav item + placeholder route, and de-magic the `?role=AGENT` string in `AssignModal`. Also closes a Phase-1 gap: user-management role maps are missing `DIRECTOR`/`HEAD`, so those users currently render a blank badge.

## User Story
As an **admin operating the JskApp dashboard**, I want **role names and the menu structure to read correctly and consistently** (Operator instead of the ambiguous "Staff", a clearly-named "System and Utilities" group, and an Image Resize entry), so that **the UI matches the real org structure and no role displays as blank or mislabeled**.

## Problem → Solution
- **Current**: `AGENT` is labeled "Staff" in 5 places (conflating the single role with the collective "all internal staff" concept); `DIRECTOR`/`HEAD` are absent from user-page role maps → blank badges; the group is called "System Management"; there is no Image Resize entry; `AssignModal` hardcodes `?role=AGENT`.
- **Desired**: One `roles.ts` map drives every role label/badge; `AGENT` shows "Operator (เจ้าหน้าที่)"; all 6 roles render correctly; group reads "System and Utilities"; an Image Resize menu + non-404 placeholder route exists (full feature deferred to Phase 5).

## Metadata
- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/chatbot-system-utilities-audit.prd.md`
- **PRD Phase**: Phase 2 — Rename & Restructure
- **Estimated Files**: 10 (3 create, 7 update)

---

## UX Design

### Before
```
Sidebar                         User row badge
┌──────────────────────────┐    ┌───────────────────┐
│ Service Requests         │    │ name   [ Staff ]  │  ← AGENT mislabeled
│ Chatbot Management       │    │ name   [        ] │  ← DIRECTOR = blank
│ System Management        │    └───────────────────┘
│   • User Management      │    Profile dropdown
│   • File Management      │    "agent"  ← raw lowercased enum
│   • Reports              │
│   • Audit Log            │
│   • Settings             │
│   • Design System        │
└──────────────────────────┘
```

### After
```
Sidebar                         User row badge
┌──────────────────────────┐    ┌─────────────────────┐
│ Service Requests         │    │ name   [ Operator ] │  ← AGENT → Operator
│ Chatbot Management       │    │ name   [ Director ] │  ← DIRECTOR renders
│ System and Utilities     │    └─────────────────────┘
│   • User Management      │    Profile dropdown
│   • File Management      │    "Operator"  ← via getRoleLabel()
│   • Image Resize  (new)  │
│   • Reports              │
│   • Audit Log            │
│   • Settings             │
│   • Design System        │
└──────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| User list badge (`users/page.tsx`) | "Staff" / blank for DIRECTOR/HEAD | "Operator" / correct badges for all 6 | bug fix + rename |
| User detail badge (`users/[id]/page.tsx`) | "Staff" / blank | "Operator" / all 6 | bug fix + rename |
| Role filter dropdown | 4 roles, "Staff" | 6 roles, "Operator (เจ้าหน้าที่)" | display-only; create set unchanged |
| Profile dropdown role (`UserMenu`, `ProfileDropdown`) | raw `"agent"`, `"super admin"` | `getRoleLabel` → "Operator", "Super Admin" | nicer + consistent |
| Sidebar group title | "System Management" | "System and Utilities" | string at `layout.tsx:177` |
| Sidebar new item | — | "Image Resize" → `/admin/image-resize` | placeholder route, no 404 |
| Permissions matrix headers | Thai labels (already correct, incl. เจ้าหน้าที่) | same, sourced from `roles.ts` | stays Thai; no "Staff" leftover |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/lib/constants/request-status.ts` | 1-110 | **Pattern to mirror** for the new `roles.ts` (const map + `type` + `getXxx()` resolvers + normalize fallback) |
| P0 | `frontend/app/admin/layout.tsx` | 155-197 | `menuGroups` data + `isNavItemVisible` usage; group title `:177`; where to add Image Resize item |
| P0 | `frontend/app/admin/users/page.tsx` | 58-85 | `ROLE_BADGE`, `ROLE_OPTIONS`, `CREATE_ROLE_OPTIONS` to refactor |
| P0 | `frontend/app/admin/users/[id]/page.tsx` | 34-46 | `ROLE_BADGE` (with icon), `ROLE_OPTIONS` to refactor |
| P1 | `frontend/components/admin/UserMenu.tsx` | 30, 46, 105 | `StaffRole` type (already has DIRECTOR/HEAD), role render at `:105` |
| P1 | `frontend/app/admin/live-chat/_components/ProfileDropdown.tsx` | 68 | second generic role render to centralize |
| P1 | `frontend/components/admin/AssignModal.tsx` | 42 | `?role=AGENT` to replace with `ROLE.AGENT` constant |
| P1 | `frontend/app/admin/settings/permissions/page.tsx` | 31-42 | `ROLE_COLUMNS` + `ROLE_LABELS` (already 6 roles, Thai) to source from `roles.ts` |
| P2 | `frontend/lib/__tests__/nav-access.test.ts` | all | vitest style to mirror for the new `roles.test.ts` |

## External Documentation
| Topic | Source | Key Takeaway |
|---|---|---|
| — | — | No external research needed — feature uses established internal patterns (constants map + resolver helpers, identical to `request-status.ts`). |

---

## Patterns to Mirror

### NAMING_CONVENTION / CONST_MAP + RESOLVERS
```ts
// SOURCE: frontend/lib/constants/request-status.ts:16-47, 86-100
export const REQUEST_STATUS = { PENDING: 'PENDING', /* ... */ } as const
export type RequestStatus = typeof REQUEST_STATUS[keyof typeof REQUEST_STATUS]
export const STATUS_CONFIG: Record<RequestStatus, StatusConfig> = { /* ... */ }

export function normalizeStatus(status: string | null | undefined): RequestStatus | undefined {
  if (!status) return undefined
  const upper = status.toUpperCase().replace(/ /g, '_') as RequestStatus
  return upper in REQUEST_STATUS ? upper : undefined
}
export function getStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  return normalized ? STATUS_CONFIG[normalized].label : (status || '-')
}
```
> Mirror this exact shape: a frozen `as const` value map, a derived union `type`, a `Record<Role, Meta>` config, a private `normalizeRole`, and small `getXxx(role)` resolvers that fall back to the raw string.

### ROLE_BADGE consumer shape (must stay compatible)
```ts
// SOURCE: frontend/app/admin/users/page.tsx:60-65
const ROLE_BADGE: Record<string, { variant: 'primary'|'success'|'warning'|'danger'|'info'|'gray'; label: string }> = {
  SUPER_ADMIN: { variant: 'primary', label: 'Super Admin' },
  // consumed as ROLE_BADGE[u.role]?.variant / .label in JSX
}
```
> When refactoring, keep the `{ variant, label }` shape (and the `{ ..., icon }` shape on `users/[id]`) so the consuming JSX (`ROLE_BADGE[role]?.label`) compiles unchanged.

### EXISTING 6-ROLE THAI LABELS (reuse as labelTh source of truth)
```ts
// SOURCE: frontend/app/admin/settings/permissions/page.tsx:35-42
const ROLE_LABELS: Record<RoleValue, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin',
  DIRECTOR: 'ผู้อำนวยการ', HEAD: 'หัวหน้าฝ่าย',
  AGENT: 'เจ้าหน้าที่', USER: 'ผู้ใช้ทั่วไป',
}
```

### TEST_STRUCTURE
```ts
// SOURCE: frontend/lib/__tests__/nav-access.test.ts (vitest)
import { describe, it, expect } from 'vitest'
import { isNavItemVisible } from '../nav-access'
describe('isNavItemVisible', () => {
  it('hides items for USER role', () => {
    expect(isNavItemVisible('USER', ['ADMIN'])).toBe(false)
  })
})
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `frontend/lib/constants/roles.ts` | CREATE | Single source of truth for role identity/labels/badges |
| `frontend/lib/constants/__tests__/roles.test.ts` | CREATE | Unit tests for resolvers + regression guard (no "Staff" label) |
| `frontend/app/admin/image-resize/page.tsx` | CREATE | Placeholder route so the new nav item does not 404 |
| `frontend/app/admin/layout.tsx` | UPDATE | Rename group title; add Image Resize item + lucide icon import |
| `frontend/app/admin/users/page.tsx` | UPDATE | Source role maps from `roles.ts`; add DIRECTOR/HEAD to display + filter |
| `frontend/app/admin/users/[id]/page.tsx` | UPDATE | Same; edit-role select must include all current roles |
| `frontend/components/admin/UserMenu.tsx` | UPDATE | Render role via `getRoleLabel` (was raw lowercased enum) |
| `frontend/app/admin/live-chat/_components/ProfileDropdown.tsx` | UPDATE | Render role via `getRoleLabel` (consistency) |
| `frontend/components/admin/AssignModal.tsx` | UPDATE | Replace magic `'AGENT'` with `ROLE.AGENT` (value unchanged) |
| `frontend/app/admin/settings/permissions/page.tsx` | UPDATE | Source `ROLE_LABELS`/`ROLE_COLUMNS` from `roles.ts` (keeps Thai) |

## NOT Building
- **Real Image Resize feature** (upload→resize→download / Pillow pipeline) — Phase 5. This phase ships only a gated placeholder page.
- **Adding DIRECTOR/HEAD to user _creation_ options** (`CREATE_ROLE_OPTIONS`) — that is a permission/capability change; Phase 3. Display + filter + edit selects get all 6 roles (correctness), but the "create new user" role choices stay the existing set (AGENT/ADMIN/SUPER_ADMIN).
- **Backend enum/DB rename** of `AGENT` or `assigned_agent_id` — explicitly out of scope (migration risk).
- **Permission keys / module-based gating / nav re-gating for DIRECTOR/HEAD** — Phase 3. `allowedRoles` arrays are left as-is except the new Image Resize item.
- **Changing the `?role=AGENT` query _value_** — only the magic string is centralized to `ROLE.AGENT`; the wire value stays `"AGENT"`.
- **Reordering / restyling** existing menu items beyond the group title + one inserted item.

---

## Step-by-Step Tasks

### Task 1: Create the central role map `lib/constants/roles.ts`
- **ACTION**: Create `frontend/lib/constants/roles.ts`.
- **IMPLEMENT**:
  ```ts
  /**
   * Source of truth for user-role identity across the admin UI.
   *
   * Backend enum (backend/app/models/user.py:UserRole) — DO NOT rename values:
   *   SUPER_ADMIN, ADMIN, DIRECTOR, HEAD, AGENT, USER
   *
   * Display policy (Phase 2 rename):
   *   - AGENT's English label is "Operator" (it was mislabeled "Staff").
   *   - "Staff" is a COLLECTIVE term for all internal (non-USER) roles, never
   *     the label of one role. Use STAFF_ROLES for that concept.
   *   - Thai job titles are preserved (เจ้าหน้าที่, ผู้อำนวยการ, หัวหน้าฝ่าย).
   */
  export const ROLE = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ADMIN: 'ADMIN',
    DIRECTOR: 'DIRECTOR',
    HEAD: 'HEAD',
    AGENT: 'AGENT',
    USER: 'USER',
  } as const

  export type Role = typeof ROLE[keyof typeof ROLE]
  export type RoleBadgeVariant = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'gray'

  interface RoleMeta {
    /** Canonical display name. AGENT = "Operator". */
    label: string
    /** Thai job title for Thai-context surfaces. */
    labelTh: string
    /** Badge color variant (mirrors the users-page Badge variants). */
    badge: RoleBadgeVariant
  }

  export const ROLE_META: Record<Role, RoleMeta> = {
    SUPER_ADMIN: { label: 'Super Admin', labelTh: 'ผู้ดูแลระบบสูงสุด', badge: 'primary' },
    ADMIN:       { label: 'Admin',       labelTh: 'แอดมิน',            badge: 'info'    },
    DIRECTOR:    { label: 'Director',    labelTh: 'ผู้อำนวยการ',        badge: 'danger'  },
    HEAD:        { label: 'Head',        labelTh: 'หัวหน้าฝ่าย',        badge: 'warning' },
    AGENT:       { label: 'Operator',    labelTh: 'เจ้าหน้าที่',         badge: 'success' },
    USER:        { label: 'User',        labelTh: 'ผู้ใช้ทั่วไป',        badge: 'gray'    },
  }

  /** Internal (non-public) roles — the collective "Staff". USER excluded. */
  export const STAFF_ROLES: readonly Role[] = [
    ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.DIRECTOR, ROLE.HEAD, ROLE.AGENT,
  ]

  function normalizeRole(role: string | null | undefined): Role | undefined {
    if (!role) return undefined
    const upper = role.toUpperCase()
    return upper in ROLE_META ? (upper as Role) : undefined
  }

  /** Display/English label. AGENT -> "Operator". Falls back to the raw value. */
  export function getRoleLabel(role: string | null | undefined): string {
    const r = normalizeRole(role)
    return r ? ROLE_META[r].label : (role || '-')
  }

  /** Thai job-title label for Thai-context surfaces. */
  export function getRoleLabelTh(role: string | null | undefined): string {
    const r = normalizeRole(role)
    return r ? ROLE_META[r].labelTh : (role || '-')
  }

  /** Combined "Operator (เจ้าหน้าที่)" form for option/select lists. */
  export function getRoleOptionLabel(role: string | null | undefined): string {
    const r = normalizeRole(role)
    if (!r) return role || '-'
    return `${ROLE_META[r].label} (${ROLE_META[r].labelTh})`
  }

  export function getRoleBadgeVariant(role: string | null | undefined): RoleBadgeVariant {
    const r = normalizeRole(role)
    return r ? ROLE_META[r].badge : 'gray'
  }

  export function isStaffRole(role: string | null | undefined): boolean {
    const r = normalizeRole(role)
    return r ? STAFF_ROLES.includes(r) : false
  }
  ```
- **MIRROR**: `request-status.ts` const-map + `normalize` + `getXxx` resolver pattern.
- **IMPORTS**: none (leaf module).
- **GOTCHA**: `normalizeRole` upper-cases so `getRoleLabel('agent')` → "Operator" (covers the raw-lowercased call sites). Do NOT add `AGENT: 'Staff'` anywhere — that string is what we are removing.
- **VALIDATE**: `npx tsc --noEmit` clean; import resolves from `@/lib/constants/roles`.

### Task 2: Unit-test the role map
- **ACTION**: Create `frontend/lib/constants/__tests__/roles.test.ts`.
- **IMPLEMENT**: cover —
  - `getRoleLabel('AGENT')` === `'Operator'`; `getRoleLabel('agent')` === `'Operator'` (case-insensitive)
  - `getRoleLabel('SUPER_ADMIN')` === `'Super Admin'`; `getRoleLabel(null)` === `'-'`; `getRoleLabel('WAT')` === `'WAT'`
  - `getRoleLabelTh('AGENT')` === `'เจ้าหน้าที่'`
  - `getRoleOptionLabel('AGENT')` === `'Operator (เจ้าหน้าที่)'`
  - `getRoleBadgeVariant('AGENT')` === `'success'`; `getRoleBadgeVariant('nope')` === `'gray'`
  - `isStaffRole('AGENT')` true; `isStaffRole('DIRECTOR')` true; `isStaffRole('USER')` false
  - **Regression guard**: `Object.values(ROLE_META).every(m => m.label !== 'Staff')` is `true`
  - `Object.keys(ROLE_META)` has all 6 roles; `STAFF_ROLES` excludes `'USER'`
- **MIRROR**: `nav-access.test.ts` vitest `describe/it/expect`, AAA layout.
- **IMPORTS**: `import { describe, it, expect } from 'vitest'` + named imports from `../roles`.
- **VALIDATE**: `npx vitest run lib/constants/__tests__/roles.test.ts` all green.

### Task 3: Refactor `users/page.tsx` role maps
- **ACTION**: Replace local `ROLE_BADGE` (60-65), `ROLE_OPTIONS` (67-73), `CREATE_ROLE_OPTIONS` (81-85) to source from `roles.ts`.
- **IMPLEMENT**:
  - `import { ROLE, ROLE_META, getRoleLabel, getRoleBadgeVariant, getRoleOptionLabel, type Role } from '@/lib/constants/roles'`
  - Build `ROLE_BADGE` for all 6 roles from the map (keep `{ variant, label }` shape):
    ```ts
    const ROLE_BADGE = Object.fromEntries(
      (Object.keys(ROLE_META) as Role[]).map((r) => [r, { variant: ROLE_META[r].badge, label: ROLE_META[r].label }])
    ) as Record<Role, { variant: SelectVariant; label: string }>
    ```
    (or, if simpler for the consuming JSX, replace `ROLE_BADGE[u.role]?.label` with `getRoleLabel(u.role)` and `?.variant` with `getRoleBadgeVariant(u.role)` — pick whichever keeps the diff smallest at the call sites).
  - `ROLE_OPTIONS` (filter): `{ value: '', label: 'ทุกบทบาท' }` + one entry per role using `getRoleOptionLabel` (include DIRECTOR/HEAD).
  - `CREATE_ROLE_OPTIONS`: keep the existing creatable set (`AGENT, ADMIN, SUPER_ADMIN`) but relabel AGENT via `getRoleOptionLabel(ROLE.AGENT)` → `'Operator (เจ้าหน้าที่)'`. **Do not add DIRECTOR/HEAD here** (see NOT Building).
- **MIRROR**: existing `{ variant, label }` consumer shape.
- **GOTCHA**: the badge variant union on this page is `'primary'|'success'|'warning'|'danger'|'info'|'gray'` — identical to `RoleBadgeVariant`; reuse the type. A DIRECTOR user previously hit `ROLE_BADGE[undefined]` → blank; verify it now renders.
- **VALIDATE**: render users list with a DIRECTOR + an AGENT row → badges read "Director" and "Operator"; filter dropdown lists 6 roles.

### Task 4: Refactor `users/[id]/page.tsx` role maps
- **ACTION**: Replace `ROLE_BADGE` (34-39, has `icon`) and `ROLE_OPTIONS` (41-46).
- **IMPLEMENT**:
  - Reuse the icon-bearing shape; source `variant`+`label` from `ROLE_META`, keep the existing per-role `icon` JSX (add icons for DIRECTOR/HEAD — reuse `<Shield/>` or `<UserCog/>` already imported; if an icon import is missing, use one already imported on the page).
  - `ROLE_OPTIONS` here is the **edit-role select** → include all 6 roles via `getRoleOptionLabel` so an existing DIRECTOR/HEAD user's current role is selectable/visible.
- **GOTCHA**: This select binds the user's current role; omitting DIRECTOR/HEAD would blank the field for those users. Including them here is correctness, not the "create" capability change excluded above.
- **VALIDATE**: open a DIRECTOR user detail → badge "Director", select shows the correct current option.

### Task 5: Centralize role render in `UserMenu.tsx` + `ProfileDropdown.tsx`
- **ACTION**: Replace `role.replace('_', ' ').toLowerCase()` (UserMenu `:105`) and `user?.role?.toLowerCase().replace('_', ' ')` (ProfileDropdown `:68`) with `getRoleLabel(...)`.
- **IMPLEMENT**:
  - UserMenu: `<p ...>{getRoleLabel(role) }</p>` (drop the trailing `|| 'admin'`; `getRoleLabel` already falls back to `'-'`, but to preserve "admin" default-for-empty, use `{getRoleLabel(role) || 'Administrator'}` only if `role` empty — keep behavior: if `role===''`, show "Administrator"). Simplest: `{role ? getRoleLabel(role) : 'Administrator'}`. Remove the now-unneeded `capitalize` class if it would double-transform (it won't harm; leave styling alone).
  - ProfileDropdown: `{user?.role ? getRoleLabel(user.role) : 'Admin'}`.
  - `import { getRoleLabel } from '@/lib/constants/roles'` in both.
- **GOTCHA**: `capitalize` CSS on an already-cased "Super Admin" is harmless; do not fight it. Keep `StaffRole` type in UserMenu as-is (already includes DIRECTOR/HEAD from Phase 1).
- **VALIDATE**: login as AGENT → dropdown shows "Operator"; as SUPER_ADMIN → "Super Admin".

### Task 6: De-magic `AssignModal.tsx` role query
- **ACTION**: Replace the literal `'AGENT'` in the fetch URL (`:42`) with `ROLE.AGENT`.
- **IMPLEMENT**: `import { ROLE } from '@/lib/constants/roles'` then `` `${API_BASE}/admin/users/workload?role=${ROLE.AGENT}` ``.
- **GOTCHA**: The wire value MUST remain `"AGENT"` (backend enum). This is a readability/DRY change only — assert the resulting URL is byte-identical.
- **VALIDATE**: network call still hits `...workload?role=AGENT`.

### Task 7: Source the permissions matrix labels from `roles.ts`
- **ACTION**: In `settings/permissions/page.tsx`, replace the local `ROLE_LABELS` (35-42) with the map; keep Thai register for the matrix.
- **IMPLEMENT**:
  - Keep `ROLE_COLUMNS` order (`SUPER_ADMIN, ADMIN, DIRECTOR, HEAD, AGENT, USER`) — optionally re-export from `roles.ts` later, but for Phase 2 just import labels.
  - `import { getRoleLabelTh } from '@/lib/constants/roles'` and render headers via `getRoleLabelTh(role)` (DIRECTOR→ผู้อำนวยการ, AGENT→เจ้าหน้าที่). This keeps the page Thai and removes the duplicated literal map.
- **GOTCHA**: This page is intentionally Thai — do NOT switch AGENT here to "Operator"; "เจ้าหน้าที่" is the legitimate Thai title and is **not** the "Staff" mislabel being removed.
- **VALIDATE**: matrix headers unchanged visually; no local `ROLE_LABELS` literal remains.

### Task 8: Rename sidebar group + add Image Resize item
- **ACTION**: In `layout.tsx`, change group title `'System Management'` → `'System and Utilities'` (`:177`); insert an Image Resize `MenuItem` after File Management (`:180`).
- **IMPLEMENT**:
  - Add icon import (lucide-react): `Scaling` (resize semantics). Place alongside the existing lucide imports.
  - New item: `{ name: 'Image Resize', href: '/admin/image-resize', icon: Scaling, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] }` (mirror siblings' `allowedRoles`).
- **MIRROR**: existing `MenuItem` literals at `:179-184`.
- **GOTCHA**: `Scaling` exists in current lucide-react; if a build error claims otherwise, fall back to `Crop` or `ImageUp`. Leave all other items' order and `allowedRoles` untouched (Phase 3 re-gates).
- **VALIDATE**: sidebar shows "System and Utilities" with the new "Image Resize" entry; `npx tsc --noEmit` clean.

### Task 9: Image Resize placeholder route
- **ACTION**: Create `frontend/app/admin/image-resize/page.tsx` so the nav target does not 404.
- **IMPLEMENT**: minimal server component using existing design tokens (no data fetch):
  ```tsx
  export const metadata = { title: 'Image Resize' }

  export default function ImageResizePage() {
    return (
      <div className="p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-text-primary">Image Resize</h1>
          <p className="text-text-secondary">ปรับขนาด/บีบอัดรูปภาพสำหรับใช้งานในระบบ</p>
        </header>
        <div className="rounded-2xl border border-dashed border-border-default bg-surface p-12 text-center">
          <p className="text-text-secondary">ฟีเจอร์นี้กำลังพัฒนา — จะเปิดใช้งานใน Phase 5</p>
        </div>
      </div>
    )
  }
  ```
- **MIRROR**: design tokens (`text-text-primary`, `bg-surface`, `border-border-default`) used across admin pages; if `PageHeader` (`@/app/admin/components/PageHeader`) is preferred, mirror its usage from `permissions/page.tsx` — plain markup is acceptable to keep this self-contained.
- **GOTCHA**: It sits under the `/admin` layout so the sidebar/auth wrapper applies. Real role-gating + the actual tool come in Phase 5; the placeholder intentionally fetches nothing.
- **VALIDATE**: navigate to `/admin/image-resize` → renders the placeholder, no 404, no console error.

---

## Testing Strategy

### Unit Tests
| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `getRoleLabel` rename | `'AGENT'` | `'Operator'` | — |
| `getRoleLabel` case-insensitive | `'agent'` | `'Operator'` | yes |
| `getRoleLabel` unknown | `'WAT'` | `'WAT'` | yes |
| `getRoleLabel` nullish | `null` | `'-'` | yes |
| `getRoleOptionLabel` | `'AGENT'` | `'Operator (เจ้าหน้าที่)'` | — |
| `getRoleLabelTh` | `'AGENT'` | `'เจ้าหน้าที่'` | — |
| `getRoleBadgeVariant` unknown | `'nope'` | `'gray'` | yes |
| `isStaffRole` | `'USER'` / `'AGENT'` | `false` / `true` | — |
| Regression: no "Staff" label | `ROLE_META` values | none equals `'Staff'` | guard |

### Edge Cases Checklist
- [x] Empty / null role → `'-'` (or component default)
- [x] Lowercased raw enum (`'agent'`) from auth context → normalized
- [x] Unknown/legacy role string → falls back to raw value, badge `gray`
- [ ] Concurrent access — N/A (pure functions)
- [ ] Network failure — N/A (no fetch in changed code; AssignModal fetch unchanged)
- [x] Permission denied — N/A this phase (placeholder ungated by design)

---

## Validation Commands

> Per project memory, frontend tooling runs in **WSL** (`npm ci` already healthy there).

### Static Analysis
```bash
cd frontend && npx tsc --noEmit
```
EXPECT: Zero type errors.

### Lint (changed files)
```bash
cd frontend && npx eslint app/admin/layout.tsx app/admin/users/page.tsx "app/admin/users/[id]/page.tsx" \
  components/admin/UserMenu.tsx app/admin/live-chat/_components/ProfileDropdown.tsx \
  components/admin/AssignModal.tsx app/admin/settings/permissions/page.tsx \
  app/admin/image-resize/page.tsx lib/constants/roles.ts lib/constants/__tests__/roles.test.ts
```
EXPECT: No errors.

### Unit Tests
```bash
cd frontend && npx vitest run
```
EXPECT: All pass (existing suite + new `roles.test.ts`).

### Rename Guards (must return nothing)
```bash
# No stale group title or "Staff" role mislabel left in source:
cd frontend && rg -n "System Management" app/ components/ ; \
  rg -n "label: 'Staff'|value: 'AGENT', label: 'Staff" app/ components/
```
EXPECT: No matches (group renamed; no AGENT-labeled-"Staff" remains). The collective word "Staff" may legitimately remain only where it means *all internal users*.

### Build (optional; CI covers)
```bash
cd frontend && npm run build
```
EXPECT: Build succeeds.

### Manual Validation
- [ ] Sidebar group reads "System and Utilities"; "Image Resize" entry present and routes without 404.
- [ ] User list: an AGENT row badge = "Operator"; a DIRECTOR row badge renders (not blank).
- [ ] Role filter dropdown lists all 6 roles; AGENT option = "Operator (เจ้าหน้าที่)".
- [ ] Profile dropdown (UserMenu + live-chat ProfileDropdown) shows "Operator" for an AGENT login.
- [ ] Permissions matrix headers unchanged (Thai), no regressions.
- [ ] AssignModal still lists assignable operators (network call `?role=AGENT`).

---

## Acceptance Criteria
- [ ] All 9 tasks completed.
- [ ] `tsc --noEmit`, eslint, vitest all green.
- [ ] No "System Management" string and no AGENT-as-"Staff" label remain in `app/`/`components/`.
- [ ] All 6 roles render a correct badge in user management.
- [ ] Image Resize route renders a placeholder (no 404), full feature deferred.
- [ ] Matches the After UX.

## Completion Checklist
- [ ] Code follows the `request-status.ts` constants pattern.
- [ ] Error handling / fallbacks match codebase style (raw-value fallback).
- [ ] Tests follow the vitest `nav-access.test.ts` pattern; coverage for new helpers ≥ 80%.
- [ ] No hardcoded role strings reintroduced (use `ROLE.*` / resolvers).
- [ ] Backend enum/DB untouched; `?role=AGENT` wire value preserved.
- [ ] No unnecessary scope additions (no Phase 3/5 work).
- [ ] Self-contained — no further codebase searching needed.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Refactor changes a consumer's expected `ROLE_BADGE` shape → type error | M | L | Keep `{ variant, label }` (+`icon`) shapes identical; `tsc` catches |
| `getRoleLabel` changes other role renders (e.g. "super admin"→"Super Admin") unexpectedly | L | L | Documented as intended UX improvement; verify in manual check |
| DIRECTOR/HEAD badge colors clash (danger/warning) visually | L | L | Cosmetic; Phase 6 Design System can assign dedicated role colors |
| `Scaling` icon name not in installed lucide version | L | L | Fallback `Crop`/`ImageUp`; build/tsc verifies |
| Placeholder route reachable by low-priv users via direct URL | L | L | Harmless (no data); real gating in Phase 3/5 — noted |

## Notes
- **"Staff" disambiguation is the core of this phase**: the bug is the English label "Staff" on the single `AGENT` role. The fix introduces `getRoleLabel(AGENT)='Operator'` for the role, and `STAFF_ROLES`/`isStaffRole` for the *collective* internal-users concept (used later in Phase 3 Settings/permissions headers). Thai "เจ้าหน้าที่" is a legitimate title and is preserved.
- **Phase-1 carryover fixed here**: `users/page.tsx` and `users/[id]/page.tsx` role maps lacked DIRECTOR/HEAD (blank badges). Centralizing closes that gap.
- **Design System (Phase 6)** may later own role badge colors / a `<RoleBadge>` component; this phase keeps badges inline but single-sourced.
- After implement: run `/prp-implement`, then code-review → commit → push → PR → CI/E2E → merge, then proceed to **Phase 3 (Permissions v2)** per the PRD pipeline.
