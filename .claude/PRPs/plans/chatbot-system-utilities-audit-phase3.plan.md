# Plan: Permissions v2 (Module-Based Access Control)

> **Source PRD**: `.claude/PRPs/prds/chatbot-system-utilities-audit.prd.md` — Phase 3
> **Branch**: `feat/chatbot-sys-audit-phase3` (off `main` @ 79fae00)
> **Depends on**: Phase 1 (DIRECTOR/HEAD access via `get_current_manager`) ✅ · Phase 2 (central `roles.ts` label map) ✅
> **Mode**: PLAN-FIRST — this document is for review **before** implementation.

## Summary

Extend the existing DB-backed permission engine (`core/permissions.py`) from 5 request-workflow keys to a full **module-based access-control matrix** spanning 3 modules (Service Requests / Chatbot Management / System & Utilities). Add 11 new permission keys, enforce them on every privileged **write** endpoint via a new `require_permission()` dependency factory, expose an effective-capability map to the frontend, and rebuild the permission settings UI as a module-grouped matrix with role presets. **Extend, never replace** — the proven `key → allowed_roles` model, cache, self-heal seed, and lockout safeguard all stay; we add rows/keys/helpers/UI, not a new engine.

## User Story

As a **SUPER_ADMIN / ADMIN** managing the JskApp admin dashboard,
I want **centralized, module-grouped control over who can do what across Chatbot Management and System & Utilities**,
So that **every privileged action is gated by a single source of truth, each role sees and does only what it's granted, and there are no silently-ungoverned endpoints.**

## Problem → Solution

**Current state**: `core/permissions.py` governs only 5 request-workflow keys. Every Chatbot/System admin endpoint is gated by a blanket `get_current_admin` (ADMIN+SUPER_ADMIN) — there is no per-capability control, DIRECTOR/HEAD can't be granted scoped access, and the settings UI is a flat 5-row checkbox table.
**Desired state**: 16 keys total (5 existing + 11 new) organized into 3 modules; backend enforces each write route against its key; the matrix UI groups keys by module with one-click role presets; SUPER_ADMIN is locked into every key (no lockout); Service Requests behavior is unchanged (regression-safe).

## Metadata
- **Complexity**: **XL** (cross-cutting authz across ~13 endpoint files + engine + migration + UI). The user has chosen **plan-first**; implementation may be split into Backend PR → Frontend PR.
- **Estimated Files**: ~18–22 (≈8 backend code, 1 migration, ~3 frontend, ~5 test, 1 PRD update, 1 report)
- **Estimated new/changed LOC**: 600–900

---

## ⚠️ Key Design Decisions — CONFIRM BEFORE IMPLEMENT

These four forks materially change the implementation. Recommended choices are made so the plan is concrete; flag any you want changed during review.

### Decision 1 — Permission model: **discrete keys grouped by module** (RECOMMENDED) vs ordinal levels
- **PRD wording**: "level None/View/Edit/Manage" per (role × module).
- **Reality**: the engine is `key → frozenset[roles]` (a boolean capability per key). The 11 requested keys are themselves discrete capabilities (mostly `manage_*`), not points on one ordinal scale.
- **RECOMMENDED**: keep the discrete-key model (matches the existing 5 keys exactly, **honors PRD's own "extend not replace" mandate**, preserves granularity). Render the matrix **grouped into 3 module sections**; tag each key with an informational level (`View`/`Edit`/`Manage`) **only for visual grouping**; provide **role presets** (one click applies a recommended key-set to a role) to deliver the "level" UX without an ordinal data type.
- **Rejected — ordinal levels**: would require reworking `_check` from set-membership to ordinal comparison + a new `level` column, breaking "extend not replace" and collapsing distinct capabilities (e.g. can't separate "edit auto-replies" from "send broadcast"). Higher migration + regression risk.
- **Impact if changed**: switching to ordinal levels rewrites the engine core, the migration, and the matrix UI — roughly doubles the phase.

### Decision 2 — Enforcement style: **new `require_permission(key)` dependency factory** (RECOMMENDED) vs inline `can_*()` everywhere
- Existing module gates are blanket `Depends(get_current_admin)`; granular per-action checks in `admin_requests.py` are **inline** (because one route checks several sub-actions).
- New module keys are mostly **whole-route** gates (one key per route). A `require_permission(key)` FastAPI dependency is far cleaner and less error-prone across ~80 routes, and is purely additive (existing inline checks untouched).
- **RECOMMENDED**: add `require_permission(key)` in `deps.py`; apply it at the route signature for new module keys. Keep `admin_requests.py` inline checks as-is.

### Decision 3 — Enforcement scope: **gate WRITES + the 2 explicit view keys; leave other READS on the existing admin gate** (RECOMMENDED)
- The PRD provides only 2 view keys (`view_reports`, `view_audit_log`). Gating *every* read with a new key is out of scope and risks over-gating.
- **RECOMMENDED**: Phase 3 gates all **write** routes with `manage_*`/`edit_settings`/`export_chat`/`image_resize`; gates **reports/analytics reads → `view_reports`** and **audit reads → `view_audit_log`** (so DIRECTOR/HEAD can be granted read access); **all other read routes keep `get_current_admin`** unchanged. Documented in NOT Building.

### Decision 4 — Live Chat is OUT OF SCOPE (regression guard)
- Live-chat routes use `get_current_staff` so **AGENT (Operator) can work conversations**. AGENT is NOT in any `manage_*` key. Gating live-chat with `manage_broadcast` (as a naive endpoint map suggested) would **break Operator live chat**.
- **DECISION**: do NOT touch `admin_live_chat.py` / `ws_live_chat.py` authz in Phase 3. Operator chat keeps `get_current_staff`. (A future `manage_live_chat` key is deferred.)

### Proposed DEFAULT_POLICY for the 11 new keys (confirm role assignments)
| Key | Module | Level tag | Default roles | Notes |
|---|---|---|---|---|
| `manage_broadcast` | Chatbot | Manage | SUPER_ADMIN, ADMIN | broadcast create/edit/send/schedule/cancel |
| `manage_auto_replies` | Chatbot | Manage | SUPER_ADMIN, ADMIN | intents/keywords/responses + auto-replies write |
| `manage_rich_menus` | Chatbot | Manage | SUPER_ADMIN, ADMIN | rich-menu write/sync |
| `manage_reply_objects` | Chatbot | Manage | SUPER_ADMIN, ADMIN | reply-object write |
| `export_chat` | Chatbot | Edit | SUPER_ADMIN, ADMIN | chat-history CSV/PDF export (`admin_export.py`) |
| `manage_users` | System | Manage | SUPER_ADMIN, ADMIN | user CRUD + reset-password |
| `manage_files` | System | Manage | SUPER_ADMIN, ADMIN | media upload/delete/public links |
| `view_reports` | System | View | SUPER_ADMIN, ADMIN, DIRECTOR, HEAD | reports/analytics reads (managers may view) |
| `view_audit_log` | System | View | SUPER_ADMIN, ADMIN | audit-log reads |
| `edit_settings` | System | Edit | SUPER_ADMIN, ADMIN | system settings + LINE credentials + integrations write |
| `image_resize` | System | Manage | SUPER_ADMIN, ADMIN | image-resize utility (Phase 5 wires the real tool) |

> **Invariant**: SUPER_ADMIN is a member of every key's default and is **locked** (cannot be removed) — Decision generalizes the existing dual-key safeguard to all keys.

---

## UX Design

### Before
```
/admin/settings/permissions
┌───────────────────────────────────────────────────────────┐
│ Permission        │SUPER│ADMIN│DIR│HEAD│AGENT│USER│        │
│ ───────────────── │ ─── │ ─── │───│─── │ ─── │─── │        │
│ Assign request    │ [x] │ [x] │[x]│[x] │ [ ] │[ ] │        │
│ Self-assign       │ [x] │ [x] │[x]│[x] │ [ ] │[ ] │ flat   │
│ Edit perm settings│ 🔒x │ [x] │[ ]│[ ] │ [ ] │[ ] │ 5 rows │
│ Revert approval   │ [x] │ [x] │[ ]│[ ] │ [ ] │[ ] │        │
│ Edit req details  │ [x] │ [x] │[ ]│[ ] │ [ ] │[ ] │        │
└───────────────────────────────────────────────────────────┘
```

### After
```
/admin/settings/permissions
┌───────────────────────────────────────────────────────────┐
│ [Preset ▾] per role:  Viewer · Operator · Manager · Admin   │  ← role presets
│                                                             │
│ �se Service Requests          │SUPER│ADMIN│DIR│HEAD│AGENT│   │
│   Assign request             │ 🔒x │ [x] │[x]│[x] │ [ ] │   │
│   Self-assign · Revert · …   │  …  │  …  │ … │ …  │  …  │   │
│ ▾ Chatbot Management         │     │     │   │    │     │   │
│   Manage broadcast      [M]  │ 🔒x │ [x] │[ ]│[ ] │ [ ] │   │  grouped
│   Manage auto-replies   [M]  │ 🔒x │ [x] │[ ]│[ ] │ [ ] │   │  by 3
│   Export chat           [E]  │ 🔒x │ [x] │[ ]│[ ] │ [ ] │   │  modules
│ ▾ System & Utilities         │     │     │   │    │     │   │
│   Manage users          [M]  │ 🔒x │ [x] │[ ]│[ ] │ [ ] │   │
│   View reports          [V]  │ 🔒x │ [x] │[x]│[x] │ [ ] │   │
│   View audit log · Settings…             …                  │
└───────────────────────────────────────────────────────────┘
🔒 = SUPER_ADMIN locked on every key
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Settings → Permissions | flat 5-row table | 3 collapsible module sections, 16 rows | preserves checkbox + undo/redo |
| Role preset | none | "Apply preset" per role bulk-sets keys | delivers the "level" UX |
| Backend write endpoint | `get_current_admin` blanket | `require_permission(key)` per route | single source of truth |
| `GET /permissions/me` | 5 bools | 5 legacy bools **+** `capabilities: {key: bool}` | frontend `hasPermission(key)` |
| Nav visibility | role-based `allowedRoles` | **unchanged this phase** (see NOT Building) | role↔key defaults kept aligned |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `backend/app/core/permissions.py` | 1–263 | Engine to extend: KEY_*, DEFAULT_POLICY, `_check`, `can_*`, `load_policy`, `ensure_seed_rows`, `_SEED_DESCRIPTIONS`, `invalidate_cache`, `get_permission_summary` |
| P0 | `backend/app/api/v1/endpoints/settings.py` | 37–205 | Schemas (PermissionRule/Summary/MyPermissions/Update), `ALLOWED_PERMISSION_KEYS` (:71), PATCH safeguard (:146–155), upsert + cache refresh |
| P0 | `backend/app/api/deps.py` | 19–177 | `get_current_user`, `get_current_admin` (109–122), `get_current_manager` (125–150), `get_current_staff` (153–177) — where `require_permission` will live |
| P0 | `backend/app/models/permission_setting.py` | 28–50 | Table shape (key PK, allowed_roles JSONB, description, updated_by_id) — **no new columns needed** |
| P1 | `backend/alembic/versions/n4o5p6q7r8s9_create_permission_settings_table.py` | 28–79 | Exact seed template (`op.execute` INSERT … `ON CONFLICT (key) DO NOTHING`) |
| P1 | `backend/app/api/v1/endpoints/admin_requests.py` | 378–428 | Canonical inline `can_*()` enforcement (reference; do NOT change) |
| P1 | `frontend/app/admin/settings/permissions/page.tsx` | 1–317 | Flat matrix to rebuild as module-grouped; undo/redo + lockout lock logic |
| P1 | `frontend/lib/permissions.ts` | 1–139 | Mirror interfaces, `fetchPermissionSummary`, `updatePermissions`, `usePermissions`, cache |
| P2 | `frontend/lib/constants/roles.ts` | 1–83 | Reuse `ROLE`, `Role`, `ROLE_META`, `STAFF_ROLES`, `getRoleLabel*` |
| P2 | `backend/tests/test_permissions.py` | 1–91 | Unit-test pattern for DEFAULT_POLICY / `can_*` / summary |
| P2 | `backend/tests/test_deps_gates.py` | 1–100 | Parametrized role-gate test pattern (SimpleNamespace, 403 assert) |
| P2 | `backend/tests/test_admin_requests_endpoints.py` | 1–331 | `_FakeDB` + `dependency_overrides` endpoint-test pattern |
| P2 | `backend/alembic/versions/a1b2c3d4e5f6_add_audit_business_hours_csat_tables.py` | 74–87 | Alt seed pattern (`op.get_bind()` looped insert) if preferred |

## External Documentation
| Topic | Source | Key Takeaway |
|---|---|---|
| — | — | **No external research needed** — feature uses established internal patterns only (DB-backed RBAC, FastAPI dependencies, Alembic data seed, vitest/pytest). |

---

## Patterns to Mirror

### KEY_CONSTANT + DEFAULT_POLICY
```python
# SOURCE: backend/app/core/permissions.py:42-73
KEY_ASSIGN = "assign_request"
KEY_REVERT = "revert_approval"
DEFAULT_POLICY: dict[str, frozenset[UserRole]] = {
    KEY_ASSIGN: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTOR, UserRole.HEAD}),
    KEY_REVERT: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    # ...
}
```

### CAN_HELPER (mirror exactly for each new key)
```python
# SOURCE: backend/app/core/permissions.py:225-247
def can_revert_approval(role: UserRole | str | None) -> bool:
    """Whether `role` can revert a COMPLETED request."""
    return _check(role, KEY_REVERT)
```

### SEED DESCRIPTION
```python
# SOURCE: backend/app/core/permissions.py:138-144
_SEED_DESCRIPTIONS: dict[str, str] = {
    KEY_ASSIGN: "มอบหมายงานให้ผู้อื่น",
    KEY_REVERT: "ยกเลิกการอนุมัติ",
    # ...
}
```

### MIGRATION DATA SEED
```python
# SOURCE: backend/alembic/versions/n4o5p6q7r8s9_create_permission_settings_table.py:57-78
op.execute(
    """
    INSERT INTO permission_settings (key, allowed_roles, description)
    VALUES
        ('assign_request', '["SUPER_ADMIN","ADMIN","DIRECTOR","HEAD"]'::jsonb, 'มอบหมายงานให้ผู้อื่น')
    ON CONFLICT (key) DO NOTHING;
    """
)
```

### LOCKOUT SAFEGUARD (generalize to all keys)
```python
# SOURCE: backend/app/api/v1/endpoints/settings.py:146-155
if rule.key == KEY_EDIT_SETTINGS and "SUPER_ADMIN" not in rule.allowed_roles:
    raise HTTPException(status_code=400, detail="ห้ามถอด SUPER_ADMIN ออกจากสิทธิ์แก้ไขการตั้งค่า …")
```

### ENDPOINT GATE (current blanket — to be replaced per Decision 2)
```python
# SOURCE: e.g. backend/app/api/v1/endpoints/admin_broadcast.py (every write route)
async def create_broadcast(..., current_admin: User = Depends(get_current_admin)):
```

### BACKEND TEST — role gate
```python
# SOURCE: backend/tests/test_deps_gates.py:23-46
def _user(role: UserRole): return SimpleNamespace(role=role)

@pytest.mark.asyncio
@pytest.mark.parametrize("role,allowed", [(UserRole.SUPER_ADMIN, True), (UserRole.AGENT, False), ...])
async def test_gate(role, allowed):
    if allowed:
        assert (await get_current_manager(current_user=_user(role))).role is role
    else:
        with pytest.raises(HTTPException) as e:
            await get_current_manager(current_user=_user(role))
        assert e.value.status_code == 403
```

### BACKEND TEST — endpoint with FakeDB + overrides
```python
# SOURCE: backend/tests/test_admin_requests_endpoints.py:66-92
app.dependency_overrides[session_get_db] = _override_get_db
app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin
client = TestClient(app)
resp = client.post("/api/v1/admin/...", json={...})
app.dependency_overrides.clear()
assert resp.status_code in (200, 403)
```

### FRONTEND mirror + matrix
```typescript
// SOURCE: frontend/lib/permissions.ts — fetch/update/hook
export async function fetchPermissionSummary(): Promise<PermissionSummary | null>
export async function updatePermissions(rules: PermissionRule[]): Promise<UpdatePermissionsResult>
export function usePermissions(): MyPermissions | null
// SOURCE: frontend/app/admin/settings/permissions/page.tsx — checkbox + undo/redo + SUPER_ADMIN lock
```

### FRONTEND test
```typescript
// SOURCE: frontend/lib/__tests__/nav-access.test.ts
import { describe, it, expect } from 'vitest'
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/app/core/permissions.py` | UPDATE | +11 KEY_* consts, +DEFAULT_POLICY entries, +`_SEED_DESCRIPTIONS`, +`can_*` helpers, +`PERMISSION_REGISTRY` (key→module/level/label), +`get_effective_capabilities(role)` |
| `backend/app/api/deps.py` | UPDATE | +`require_permission(key)` dependency factory |
| `backend/app/api/v1/endpoints/settings.py` | UPDATE | extend `ALLOWED_PERMISSION_KEYS`; generalize lockout to all keys (SUPER_ADMIN); add `modules`/`capabilities` to summary + `/permissions/me`; expose registry for UI grouping |
| `backend/app/api/v1/endpoints/admin_broadcast.py` | UPDATE | writes → `require_permission(KEY_MANAGE_BROADCAST)` |
| `backend/app/api/v1/endpoints/admin_intents.py` | UPDATE | writes → `manage_auto_replies` |
| `backend/app/api/v1/endpoints/admin_auto_replies.py` | UPDATE | writes → `manage_auto_replies` |
| `backend/app/api/v1/endpoints/admin_reply_objects.py` | UPDATE | writes → `manage_reply_objects` |
| `backend/app/api/v1/endpoints/rich_menus.py` (or admin_rich_menus) | UPDATE | writes → `manage_rich_menus` |
| `backend/app/api/v1/endpoints/admin_users.py` | UPDATE | writes → `manage_users` |
| `backend/app/api/v1/endpoints/media.py` | UPDATE | `/admin/media` writes → `manage_files` (public/token routes untouched) |
| `backend/app/api/v1/endpoints/admin_credentials.py` | UPDATE | writes → `edit_settings` |
| `backend/app/api/v1/endpoints/admin_integrations.py` | UPDATE | writes → `edit_settings` |
| `backend/app/api/v1/endpoints/admin_reports.py` | UPDATE | reads → `view_reports`; export → `export_chat` |
| `backend/app/api/v1/endpoints/admin_export.py` | UPDATE | export → `export_chat` |
| `backend/app/api/v1/endpoints/admin_audit.py` | UPDATE | reads → `view_audit_log` |
| `backend/app/api/v1/endpoints/admin_analytics.py` | UPDATE | reads → `view_reports` |
| `backend/alembic/versions/<new>_seed_module_permission_keys.py` | CREATE | seed 11 new keys (`ON CONFLICT DO NOTHING`) |
| `frontend/lib/permissions.ts` | UPDATE | extend interfaces (`capabilities`, `modules`), `hasPermission(key)` helper |
| `frontend/app/admin/settings/permissions/page.tsx` | UPDATE | module-grouped matrix + role presets; lock SUPER_ADMIN on all keys |
| `frontend/lib/constants/permission-modules.ts` | CREATE | frontend mirror of registry (module → keys, labels, level tags) |
| `backend/tests/test_permissions.py` | UPDATE | unit tests for new keys/helpers/registry/`get_effective_capabilities` |
| `backend/tests/test_deps_gates.py` | UPDATE | `require_permission` factory gate tests |
| `backend/tests/test_module_permission_endpoints.py` | CREATE | endpoint 200/403 tests for representative routes per module |
| `frontend/lib/__tests__/permission-modules.test.ts` | CREATE | registry integrity + `hasPermission` tests |
| `.claude/PRPs/prds/chatbot-system-utilities-audit.prd.md` | UPDATE | Phase 3 → in-progress, link plan |
| `.claude/PRPs/reports/chatbot-system-utilities-audit-phase3-report.md` | CREATE | completion report (at implement time) |

## NOT Building
- **No ordinal level data type** — levels are presentation tags only (Decision 1).
- **No new DB columns** on `permission_settings` — only new rows (Decision 1).
- **No live-chat authz change** — `admin_live_chat.py`/`ws_live_chat.py` keep `get_current_staff` so Operators keep working (Decision 4).
- **No gating of non-report read routes** — they keep `get_current_admin` (Decision 3).
- **No per-user overrides** — per-role only this phase (PRD "Could"; deferred).
- **No nav permission-binding** — sidebar stays role-based `allowedRoles`; defaults kept aligned with new policy (deferred to avoid regressions).
- **No enum/DB rename of `AGENT`** — unchanged (PRD-wide constraint).
- **No Image Resize tool implementation** — only the `image_resize` permission key (the tool is Phase 5).

---

## Step-by-Step Tasks

### Task 1: Extend the permission engine — keys, policy, descriptions, helpers
- **ACTION**: In `backend/app/core/permissions.py`, add 11 `KEY_*` constants, their `DEFAULT_POLICY` entries (per the table above), and `_SEED_DESCRIPTIONS` Thai text.
- **IMPLEMENT**: e.g. `KEY_MANAGE_BROADCAST = "manage_broadcast"` … `KEY_IMAGE_RESIZE = "image_resize"`; add to `DEFAULT_POLICY` with the proposed role frozensets; add a `can_*` helper per key mirroring `can_revert_approval` (`return _check(role, KEY_*)`).
- **MIRROR**: KEY_CONSTANT + DEFAULT_POLICY, CAN_HELPER, SEED DESCRIPTION patterns.
- **IMPORTS**: none new (uses existing `UserRole`, `_check`).
- **GOTCHA**: keep the 5 existing keys/aliases byte-for-byte; do not reorder. `view_reports` default includes DIRECTOR+HEAD.
- **VALIDATE**: `cd backend && python -c "from app.core.permissions import DEFAULT_POLICY; print(len(DEFAULT_POLICY))"` → expect 16.

### Task 2: Add a `PERMISSION_REGISTRY` + `get_effective_capabilities()`
- **ACTION**: In `permissions.py`, add an ordered registry mapping each key → `{module, level, label_th}`; add `get_effective_capabilities(role) -> dict[str, bool]` returning `{key: _check(role, key)}` for all keys.
- **IMPLEMENT**: `Module = Literal["service_requests","chatbot","system"]`; `PERMISSION_REGISTRY: list[PermissionMeta]`; helper that iterates registry.
- **MIRROR**: existing module-docstring table (:1–27) for label text.
- **GOTCHA**: registry is the single source the UI groups by; keep key order stable (Service Requests first, then Chatbot, then System) so UI rows are deterministic.
- **VALIDATE**: unit test asserts every `DEFAULT_POLICY` key appears exactly once in the registry and vice-versa.

### Task 3: `require_permission(key)` dependency factory
- **ACTION**: In `backend/app/api/deps.py`, add a factory returning an async dependency that resolves `get_current_user`, checks `_check(user.role, key)`, raises 403 otherwise.
- **IMPLEMENT**:
  ```python
  def require_permission(key: str):
      async def _dep(current_user = Depends(get_current_user)):
          from app.core.permissions import _check  # or a public can_for(key, role)
          if not _check(current_user.role, key):
              raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์ดำเนินการนี้")
          return current_user
      return _dep
  ```
- **MIRROR**: `get_current_manager` structure (raise 403 pattern).
- **GOTCHA**: prefer adding a **public** `can(key, role)` to `permissions.py` rather than importing the private `_check`. The factory must NOT bypass `get_current_user` (auth still required).
- **VALIDATE**: `test_deps_gates.py` parametrized test per representative key.

### Task 4: Generalize the lockout safeguard + extend allowed keys (settings.py)
- **ACTION**: Update `ALLOWED_PERMISSION_KEYS` to include all 16; change the PATCH safeguard to reject removing SUPER_ADMIN from **any** key.
- **IMPLEMENT**: replace the two `if rule.key == … and "SUPER_ADMIN" not in …` blocks with a loop: `if "SUPER_ADMIN" not in rule.allowed_roles: raise HTTPException(400, f"ห้ามถอด SUPER_ADMIN ออกจากสิทธิ์ '{rule.key}'")`.
- **MIRROR**: LOCKOUT SAFEGUARD pattern (:146–155).
- **GOTCHA**: keep validation order (validate all rules before any write); keep `invalidate_cache()` + `load_policy()` after commit.
- **VALIDATE**: endpoint test — PATCH removing SUPER_ADMIN from `manage_users` → 400.

### Task 5: Expose capabilities + module registry to the API
- **ACTION**: Extend `MyPermissions` with `capabilities: dict[str,bool]` (keep 5 legacy bools); extend `GET /permissions/me` to populate via `get_effective_capabilities`. Add module/level metadata to `GET /permissions` response (e.g. `modules: [{module, keys:[{key,label,level}]}]`) so the UI groups without hardcoding.
- **IMPLEMENT**: new Pydantic fields with safe defaults (backward compatible); reuse `get_permission_summary` for legacy fields.
- **GOTCHA**: additive only — existing request pages read the 5 bools; don't rename them.
- **VALIDATE**: `GET /permissions/me` returns `capabilities` with 16 keys for an ADMIN.

### Task 6: Enforce module keys on write endpoints (per Files to Change)
- **ACTION**: For each endpoint file, change write-route signatures from `Depends(get_current_admin)` → `Depends(require_permission(KEY_…))`; reports/audit reads → view keys per Decision 3.
- **IMPLEMENT**: import the relevant `KEY_*`; swap the dependency. One file at a time; diff each route.
- **MIRROR**: ENDPOINT GATE pattern.
- **GOTCHA**: **DO NOT touch** `admin_live_chat.py`, `ws_live_chat.py`, public/token `media.py` routes, or `admin_requests.py` inline checks. Confirm each route's method (GET=read) before swapping.
- **VALIDATE**: `test_module_permission_endpoints.py` — for one route per key: ADMIN→200, AGENT→403 (where AGENT lacks the key).

### Task 7: Alembic migration — seed 11 new keys
- **ACTION**: Create a migration that `INSERT … ON CONFLICT (key) DO NOTHING` the 11 keys with default roles + Thai descriptions.
- **IMPLEMENT**: mirror `n4o5p6q7r8s9` seed; `downgrade()` deletes exactly those 11 keys (`DELETE FROM permission_settings WHERE key IN (...)`).
- **MIRROR**: MIGRATION DATA SEED pattern.
- **GOTCHA**: must match `DEFAULT_POLICY` exactly; `down_revision` = current head (`python scripts/db_target.py alembic --target local current`). Idempotent with `ensure_seed_rows()` (both safe).
- **VALIDATE**: `python scripts/db_target.py alembic --target local upgrade head` then `downgrade -1` then `upgrade head` cleanly.

### Task 8: Frontend mirror — interfaces + `hasPermission`
- **ACTION**: In `frontend/lib/permissions.ts`, extend `MyPermissions` with `capabilities?: Record<string,boolean>`; add `hasPermission(key: string): boolean` reading the cached capabilities; extend `PermissionSummary` for module metadata.
- **MIRROR**: existing fetch/cache/hook structure.
- **GOTCHA**: keep legacy bool fields; `hasPermission` falls back to `false` when capability missing.
- **VALIDATE**: vitest unit test for `hasPermission`.

### Task 9: Frontend permission-modules registry
- **ACTION**: Create `frontend/lib/constants/permission-modules.ts` mirroring the backend registry (module → ordered keys, Thai labels, level tags), reusing `ROLE`/`Role`/`ROLE_META` from `roles.ts`.
- **MIRROR**: `roles.ts` `as const` + derived types pattern (Phase 2).
- **GOTCHA**: this must stay in sync with backend registry — add a test asserting the key set equals the backend-provided keys (or a hardcoded expected set) to catch drift.
- **VALIDATE**: `permission-modules.test.ts` — all 16 keys present, grouped into 3 modules, no duplicates.

### Task 10: Rebuild the matrix UI (module-grouped + presets)
- **ACTION**: Refactor `frontend/app/admin/settings/permissions/page.tsx` to render 3 collapsible module sections driven by the registry; add per-role "Apply preset" actions; lock SUPER_ADMIN checkbox on every key.
- **IMPLEMENT**: keep checkbox cells, `useUndoableState`, keyboard undo/redo, `canEdit` gate, save via `updatePermissions`. Presets = predefined key-sets (Viewer/Operator/Manager) applied to a role column.
- **MIRROR**: existing page structure (:1–317).
- **GOTCHA**: SUPER_ADMIN cells disabled+checked for ALL keys (mirror backend lock); preserve the existing read-only mode when `!canEdit`.
- **VALIDATE**: manual (dev server, WSL) — toggling + preset + save round-trips; SUPER_ADMIN uncheck blocked; visual check at 768/1440.

### Task 11: Tests — backend + frontend
- **ACTION**: Write/extend the 4 test files (Files to Change). Cover: registry integrity, `get_effective_capabilities`, `require_permission` 403/200, generalized lockout 400, representative endpoint gating, frontend `hasPermission` + registry integrity.
- **MIRROR**: test patterns above.
- **GOTCHA**: backend endpoint tests use `dependency_overrides` + `_FakeDB`; **frontend vitest is NOT in CI — run locally in WSL**.
- **VALIDATE**: see Validation Commands.

---

## Testing Strategy

### Unit Tests (backend — `test_permissions.py`)
| Test | Input | Expected | Edge? |
|---|---|---|---|
| new key in DEFAULT_POLICY | `KEY_MANAGE_BROADCAST` | present, roles == {SUPER_ADMIN,ADMIN} | — |
| `can_manage_users` | ADMIN / AGENT | True / False | — |
| registry ↔ policy parity | all keys | every key in both, no extras | structural |
| `get_effective_capabilities(ADMIN)` | ADMIN | 16-key map, manage_* True | — |
| `get_effective_capabilities(USER)` | USER | all False | edge |

### Unit/Gate Tests (`test_deps_gates.py`)
| Test | Input | Expected |
|---|---|---|
| `require_permission(KEY_MANAGE_USERS)` | ADMIN | returns user |
| same | AGENT | HTTPException 403 |
| same | unauthenticated | 401 (via `get_current_user`) |

### Endpoint Tests (`test_module_permission_endpoints.py`)
| Route | Role | Expected |
|---|---|---|
| `POST /admin/broadcasts` | ADMIN / AGENT | 200(ish) / 403 |
| `POST /admin/users` | ADMIN / AGENT | 200 / 403 |
| `GET /admin/reports/overview` | HEAD | 200 (view_reports incl. HEAD) |
| `PATCH /admin/settings/permissions` removing SUPER_ADMIN | ADMIN | 400 |

### Frontend Tests (vitest — run in WSL)
| Test | Expected |
|---|---|
| registry has 16 keys / 3 modules / no dupes | pass |
| `hasPermission('manage_users')` from capabilities map | true/false per fixture |

### Edge Cases Checklist
- [ ] Empty/missing capabilities map → `hasPermission` false
- [ ] Unknown key in PATCH → 400 (ALLOWED_PERMISSION_KEYS)
- [ ] Unknown role string in allowed_roles → 400
- [ ] Remove SUPER_ADMIN from any key → 400
- [ ] AGENT on live-chat send → still 200 (NOT regressed)
- [ ] Cache stale after PATCH → invalidated + reloaded
- [ ] migration downgrade then upgrade → clean

---

## Validation Commands

> **Environment**: ALL frontend commands run in **WSL** at `/mnt/d/genAI/jsk-app/frontend`. Backend pytest in `backend` venv. **CI does NOT run vitest** — run it locally.

### Backend static + tests
```bash
cd backend
python -m pytest -q                      # EXPECT: all pass (incl. new permission tests)
python -m pytest tests/test_permissions.py tests/test_deps_gates.py tests/test_module_permission_endpoints.py -v
python -c "from app.core.permissions import DEFAULT_POLICY, PERMISSION_REGISTRY; assert len(DEFAULT_POLICY)==16"
```

### Database / migration
```bash
cd backend
python scripts/db_target.py alembic --target local current
python scripts/db_target.py alembic --target local upgrade head     # EXPECT: 11 new rows
python scripts/db_target.py alembic --target local downgrade -1      # EXPECT: clean drop of 11
python scripts/db_target.py alembic --target local upgrade head
```

### Frontend (WSL)
```bash
cd /mnt/d/genAI/jsk-app/frontend
./node_modules/.bin/tsc --noEmit          # EXPECT: 0 type errors
npx eslint app/admin/settings/permissions/page.tsx lib/permissions.ts lib/constants/permission-modules.ts
npx vitest run                            # EXPECT: all pass (incl. new tests) — NOT in CI
npm run build                             # EXPECT: production build clean
```

### Manual (dev server, WSL)
- [ ] Login as ADMIN → Settings → Permissions shows 3 module sections, 16 rows
- [ ] Toggle a Chatbot key for DIRECTOR, save, reload → persists
- [ ] Try unchecking SUPER_ADMIN on any key → blocked (400 + UI lock)
- [ ] As a role lacking `manage_broadcast`, broadcast write → 403; live-chat send still works
- [ ] "Apply preset" on a role column sets expected keys

---

## Acceptance Criteria
- [ ] All 11 keys defined in engine + registry + migration + seed; `DEFAULT_POLICY` len == 16
- [ ] `require_permission` enforces all write routes per the Files table
- [ ] Generalized SUPER_ADMIN lockout (any key) — 400 on removal
- [ ] `/permissions/me` returns capabilities map; frontend `hasPermission` works
- [ ] Matrix UI module-grouped + presets; SUPER_ADMIN locked everywhere
- [ ] Service Requests + Live Chat behavior unchanged (regression-safe)
- [ ] Backend pytest + frontend tsc/vitest/eslint/build all green (vitest verified locally)
- [ ] Migration up/down/up clean

## Completion Checklist
- [ ] Code follows discovered patterns (KEY_*, can_*, seed, factory, matrix)
- [ ] Errors handled (403 on denial, 400 on bad PATCH) matching codebase style
- [ ] No hardcoded role lists in endpoints (all via keys)
- [ ] Tests follow pytest/vitest patterns; ≥80% on new/changed code
- [ ] No console.log/debug; immutable UI state (undo/redo intact)
- [ ] PRD Phase 3 row updated; report written
- [ ] Self-contained — no further codebase search needed during implement

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Over-gating a read route breaks a page | M | H | Decision 3 limits scope to writes + 2 view keys; diff each route's method before swap |
| Operator (AGENT) loses live chat | L | H | Decision 4: live-chat explicitly out of scope; regression test asserts AGENT send 200 |
| Registry ↔ DEFAULT_POLICY drift | M | M | parity unit test (Task 2) fails build on mismatch |
| Frontend/backend key drift | M | M | registry mirror + integrity test (Task 9); backend serves module metadata |
| Migration vs `ensure_seed_rows` double-insert | L | L | both use `ON CONFLICT DO NOTHING` / idempotent |
| Default role assignment wrong (too open/closed) | M | M | Decision table flagged for review; presets make correction one click |
| XL scope in one PR | M | M | tasks ordered so a Backend PR (Tasks 1–7,11-backend) can ship before Frontend PR (Tasks 8–10,11-frontend) |

## Notes
- **Confidence (single-pass implementation): 8/10.** High because it's a faithful extension of a well-understood engine with strong test scaffolding already present. The −2 is the breadth of endpoint edits (~13 files) and the default-policy/role assignments needing human confirmation.
- **Plan-first**: do not run `/prp-implement` until the 4 Key Design Decisions (esp. #1 model + the DEFAULT_POLICY role table) are confirmed.
- If the user later wants the 2-PR split: PR1 = Tasks 1–7 + backend tests (ships enforcement); PR2 = Tasks 8–10 + frontend tests (ships the UI). The capability API (Task 5) is the contract between them.
