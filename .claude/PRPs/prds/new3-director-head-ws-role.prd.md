# PRD — NEW-3 Director/Head Live-Chat WS Role (configurable)

**Status:** READY-TO-EXECUTE
**Author:** Kilo Code (planner) — 2026-07-19
**Implementer:** TBD (fresh session)
**Reviewers:** independent round-1 (ecc:fastapi-reviewer) + round-2 (security-reviewer)
**Branch:** `feat/new3-live-chat-role-config` (from `main` @ `358a4bd`)
**Parent handoff:** kilo_code 2026-07-19 08:21 (Group 2 carry-over: "NEW-3 DIRECTOR/HEAD ws role — decision + implementation")

> **Skill stack used:** superpowers `writing-plans` + ecc `prp-prd` /
> `spec-miner` per `.claude/docs/skill-collections-20260712.md`.
> User decision (2026-07-19): **SUPER_ADMIN configures the allowlist
> via the existing admin Settings menu** (not hardcoded, not a separate
> settings page — reuse the permission matrix that already exists).

## Problem (verified in current backend code)

The live-chat WebSocket auth gate at
`backend/app/api/v1/endpoints/ws_live_chat.py:53` (`_load_and_authorize_ws_user`)
hardcodes the role allowlist:

```python
if user.role not in {UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT}:
    return None
```

A second hardcoded gate exists at
`backend/app/services/live_chat_service/sessions.py:236` in
`transfer_session`, checking the *target* operator's role:

```python
if not to_operator or to_operator.role not in
   [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT]:
    raise ...
```

Meanwhile the HTTP-side role gate `get_current_staff`
(`backend/app/api/deps.py:202-226`) **already allows** DIRECTOR and
HEAD alongside ADMIN/SUPER_ADMIN/AGENT — added deliberately so the two
mid-tier supervisor roles "can reach staff-level surfaces (e.g. live
chat) alongside front-line AGENTs" (deps.py:209-211 docstring). So a
DIRECTOR/HEAD operator who is *authenticated* and reaches the live-chat
*HTTP page* is then rejected at the *WebSocket* auth gate — an
inconsistency the prior agent flagged as "pre-existing, ask team"
(checkpoint `handover-claude_code-20260716-0751.json`, round-2 review
finding NEW-3).

The handoff explicitly carried this forward as a decision + implementation
item: "NEW-3 DIRECTOR/HEAD ws role (decision + implementation)".

## User decision (binding, recorded 2026-07-19)

> SUPER_ADMIN กำหนดตั้งค่าเอง ทำเมนูไว้แล้ว

Translation: SUPER_ADMIN configures the live-chat role allowlist via the
existing admin Settings menu (the permission matrix page at
`/admin/settings/permissions`). The decision is **configurable**, not
hardcoded. The two hardcoded role sets become DB-backed + cached, with
a `DEFAULT_POLICY` fallback that preserves today's behavior
(ADMIN + SUPER_ADMIN + AGENT) until SUPER_ADMIN edits it.

## Scope decision (binding)

This PR adds a new permission key `access_live_chat` to the existing
permissions infrastructure (`app/core/permissions.py` +
`PermissionSetting` table + `PERMISSION_REGISTRY` + the
`/api/v1/settings/permissions` PATCH endpoint + the frontend matrix UI
at `/admin/settings/permissions`). The two hardcoded WS role sets are
replaced with a single `can(role, KEY_ACCESS_LIVE_CHAT)` check at both
auth + transfer sites.

**Invariant:** with no DB row for `access_live_chat`, the
`DEFAULT_POLICY` fallback returns `{SUPER_ADMIN, ADMIN, AGENT}` —
exactly today's behavior. The PR ships dark; SUPER_ADMIN flips DIRECTOR
and/or HEAD on via the existing matrix UI when ready.

**Why a permission key, not a `SystemSetting`:** the repo already has a
DB-backed, cached, audited, SUPER_ADMIN-gated permission matrix
(`PermissionSetting` + `require_permission` + `can()` + the matrix UI).
Adding a 17th key to it is a ~10-line backend change + one frontend row
that the existing matrix UI renders for free. A separate
`SystemSetting` row holding a JSON role list would duplicate the cache,
the audit, the SUPER_ADMIN gate, and the UI — a second source of truth
for "which roles can do what". The whole point of the Phase 3 permissions
v2 work (PR #107 + #108) was to consolidate exactly this kind of
per-role capability into one matrix.

## Functional Requirements

### FR1 — New permission key `access_live_chat`

`backend/app/core/permissions.py`:
- Add `KEY_ACCESS_LIVE_CHAT = "access_live_chat"` next to the other
  `KEY_*` constants (around line 60, after `KEY_IMAGE_RESIZE`).
- Add it to `DEFAULT_POLICY` (around line 108):
  `KEY_ACCESS_LIVE_CHAT: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT}),`
  — this preserves today's hardcoded set as the fallback.
- Add it to `_SEED_DESCRIPTIONS` (around line 190):
  `KEY_ACCESS_LIVE_CHAT: "เข้าใช้ Live Chat (WebSocket)",`
- Add a `PermissionMeta` entry to `PERMISSION_REGISTRY` (around line
  395). Module = `"system"` (it's a system-level access gate, not a
  service-request or chatbot management capability). Level =
  `LEVEL_VIEW` (it's an access gate, not an edit/manage action —
  granting it lets a role *enter* live-chat, not change anything
  there). This places it next to `view_reports` / `view_audit_log` in
  the matrix UI's "system" group.
- Update `ALL_PERMISSION_KEYS` — it's auto-derived from
  `PERMISSION_REGISTRY` (`tuple(m.key for m in PERMISSION_REGISTRY)`),
  so it picks up the new key automatically. No separate list to touch.
- Update `get_effective_capabilities` (`can(role, m.key)` for every
  registry entry) — also auto-derived. No separate update needed.

### FR2 — Replace the WS auth gate with `can()`

`backend/app/api/v1/endpoints/ws_live_chat.py:40-56`
(`_load_and_authorize_ws_user`):
- Replace the hardcoded `if user.role not in {UserRole.ADMIN,
  UserRole.SUPER_ADMIN, UserRole.AGENT}: return None` (line 53) with a
  call to the permissions `can()` helper.
- **GOTCHA — async vs sync cache:** the WS auth path opens its own
  `AsyncSessionLocal()` (line 46) and runs *outside* a FastAPI request
  dependency scope. The `can()` helper reads the in-process
  `_policy_cache` (sync, no DB call on the hot path). The cache is
  populated by `load_policy(db)` which runs at app startup via
  `app/main.py:_warm_permission_cache` (around line 115) + is
  invalidated by `PATCH /permissions`. So `can(role,
  KEY_ACCESS_LIVE_CHAT)` is safe to call from the WS auth path WITHOUT
  a DB session — it reads the cache, and the cache is already warm
  before any WS handshake (startup loads it).
  - **Verify, do NOT add a duplicate:** Task 2 of the implementation
    plan greps `load_policy` in `app/main.py` to confirm the startup
    call is still present. If a future PR removes it, task 2's
    verification fails — but do NOT add a second `load_policy` call
    here. The existing `_warm_permission_cache` is the single source;
    a duplicate would double the startup DB load for no benefit.
- The function signature stays `async def _load_and_authorize_ws_user
  (user_id: int) -> Optional[User]` — the caller (`authenticate_ws_user`
  + `authenticate_ws_ticket`) is unchanged.

### FR3 — Replace the transfer-session role gate with `can()`

`backend/app/services/live_chat_service/sessions.py:234-236`:
- The current code: `if not to_operator or to_operator.role not in
  [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT]: raise ...`
- Replace the hardcoded role list with
  `if not to_operator or not can(to_operator.role, KEY_ACCESS_LIVE_CHAT):`
- Import `can` + `KEY_ACCESS_LIVE_CHAT` from `app.core.permissions`
  (mirroring how `settings.py:7-20` imports them).
- The error message stays the same (operator ineligible) — only the
  check changes.
- **GOTCHA — same async/sync cache concern as FR2:** `transfer_session`
  runs inside a request-scoped DB session, so the cache is definitely
  loaded by the time any HTTP request reaches it. No startup concern
  here; the concern is FR2-only.

### FR4 — `get_current_staff` alignment (cosmetic, no behavior change)

`backend/app/api/deps.py:202-226` (`get_current_staff`):
- The docstring already says DIRECTOR/HEAD are allowed "so the two
  mid-tier supervisor roles can reach staff-level surfaces (e.g. live
  chat) alongside front-line AGENTs" (lines 209-211). This was the
  *HTTP* gate that lets DIRECTOR/HEAD *load the live-chat page*.
- After FR2, the *WS* gate is `can(role, KEY_ACCESS_LIVE_CHAT)`. If
  SUPER_ADMIN has NOT granted `access_live_chat` to DIRECTOR/HEAD, a
  DIRECTOR operator can load the page (HTTP gate passes) but the WS
  connection is rejected (gate fails) — the live-chat shell loads
  empty with a "cannot connect" error.
- **Decision:** this is the intended UX. The HTTP gate is permissive
  (lets supervisors *see* the page exists); the WS gate is the real
  access control (only configured roles can *use* it). Do NOT tighten
  `get_current_staff` — leave the HTTP gate as-is. Document this in
  the PR body so reviewers don't "fix" the mismatch by tightening the
  HTTP gate (that would hide the page from supervisors, who would
  then not know the feature exists to ask SUPER_ADMIN for access).
- Optional: add a comment to `get_current_staff` pointing at
  `KEY_ACCESS_LIVE_CHAT` so the next reader understands the two-gate
  design. (Not required; reviewers ratify.)

### FR5 — Frontend matrix UI row (free, just verify)

The frontend permission matrix at `/admin/settings/permissions`
already renders every key in `PERMISSION_REGISTRY` as a row
(`frontend/app/admin/settings/permissions/`). Because FR1 adds
`KEY_ACCESS_LIVE_CHAT` to the registry, the matrix UI renders a new
row automatically — no frontend code change needed.
- **Verify:** load `/admin/settings/permissions` after the backend
  deploy, confirm a new row labeled "เข้าใช้ Live Chat (WebSocket)"
  appears in the "system" group, with checkboxes for SUPER_ADMIN
  (locked-on per the existing SUPER_ADMIN lockout safeguard),
  ADMIN, AGENT, DIRECTOR, HEAD.
- **Verify the lockout safeguard still fires:** attempting to uncheck
  SUPER_ADMIN on this row must 400 with "ห้ามถอด SUPER_ADMIN ออกจาก
  สิทธิ์ 'access_live_chat'" (the existing `update_permissions` guard
  at `settings.py:176-180` already covers every key).
- If the row does NOT appear (frontend bug), file a follow-up — do not
  add frontend code in this PR unless the matrix UI has a hardcoded key
  list that needs the new key added. Grep
  `frontend/app/admin/settings/permissions/` for `KEY_` or
  `permission-modules` to confirm the UI is registry-driven.

### FR6 — Tests (extend `test_permissions.py` + `test_ws_security.py`)

Backend:
1. **DEFAULT_POLICY fallback:** with NO `PermissionSetting` row for
   `access_live_chat`, `can(UserRole.DIRECTOR, KEY_ACCESS_LIVE_CHAT)`
   returns `False` (today's behavior preserved). `can(UserRole.AGENT,
   KEY_ACCESS_LIVE_CHAT)` returns `True`.
2. **DB-backed grant:** after `PATCH /permissions` adds `DIRECTOR` to
   `access_live_chat.allowed_roles`, `can(UserRole.DIRECTOR,
   KEY_ACCESS_LIVE_CHAT)` returns `True`. Cache is invalidated + reloaded.
3. **SUPER_ADMIN lockout:** attempting to remove `SUPER_ADMIN` from
   `access_live_chat` returns 400 (existing guard fires for the new
   key — proves the key is treated like every other).
4. **WS auth respects the key:** with DEFAULT_POLICY (DIRECTOR not
   granted), `_load_and_authorize_ws_user(director_user_id)` returns
   `None` (rejected, same as today). After the DB grant, it returns the
   user. Use the existing `test_ws_security.py` mock pattern
   (`patch("...authenticate_ws_user", ...)`).
5. **Transfer respects the key:** with DEFAULT_POLICY, transferring to
   a DIRECTOR target raises the eligibility error. After the DB grant,
   transfer succeeds. Add to the `live_chat_service` test file (find
   the existing transfer-session test idiom).
6. **Registry metadata:** `_registry_meta()` (the API that drives the
   frontend matrix) returns a `PermissionKeyMeta` for `access_live_chat`
   with `module="system"`, `level=1` (LEVEL_VIEW). Assert in
   `test_permissions.py`.
7. **Full suite:** no new failures vs main (record count).

### FR7 — Docs

- `AGENTS.md` — the Auth/Permissions section already describes
  `get_current_staff` as the staff gate; add a one-line note that
  live-chat WS access is gated by `access_live_chat` (DB-configurable
  via `/admin/settings/permissions`), not by a hardcoded role set.
- No `docs/remediation/` change — this PR is not part of the P0-P3
  remediation thread.

## Non-Goals

- Tightening `get_current_staff` (the HTTP gate stays permissive —
  see FR4 decision).
- A separate `/admin/settings/live-chat` page (the existing permissions
  matrix is the menu; adding a second UI duplicates the surface).
- Read-only / supervise mode for DIRECTOR/HEAD (the user decision was
  "configure via the menu", not "a second permission tier"). If
  read-only mode is wanted later, it's a follow-up PR with a second key
  (`moderate_live_chat` or similar).
- Granting `access_live_chat` to DIRECTOR/HEAD by default (the
  DEFAULT_POLICY preserves today's set; SUPER_ADMIN opts in via the
  matrix).
- Removing the `authenticate_ws_user` JWT path (that's PR 2C, not
  here — NEW-3 ships independently of the cookie-auth hardening).
- Frontend UI changes beyond verifying the auto-rendered matrix row.

## Acceptance Criteria

- [ ] `KEY_ACCESS_LIVE_CHAT` is in `PERMISSION_REGISTRY` with
      `module="system"`, `level=LEVEL_VIEW` (test 6 green).
- [ ] `DEFAULT_POLICY[KEY_ACCESS_LIVE_CHAT] == {SUPER_ADMIN, ADMIN,
      AGENT}` (today's behavior preserved) (test 1 green).
- [ ] `can(UserRole.DIRECTOR, KEY_ACCESS_LIVE_CHAT)` is `False` under
      DEFAULT_POLICY, `True` after a DB grant (tests 1-2 green).
- [ ] SUPER_ADMIN cannot be removed from the new key (test 3 green —
      existing guard fires).
- [ ] `_load_and_authorize_ws_user(director_id)` returns `None` under
      DEFAULT_POLICY, returns the user after a DB grant (test 4 green).
- [ ] `transfer_session` to a DIRECTOR target raises under
      DEFAULT_POLICY, succeeds after a DB grant (test 5 green).
- [ ] `get_current_staff` is unchanged (FR4 — HTTP gate stays
      permissive; `git diff backend/app/api/deps.py` shows zero lines
      changed, or only the optional comment from FR4).
- [ ] The frontend matrix at `/admin/settings/permissions` renders the
      new row "เข้าใช้ Live Chat (WebSocket)" in the "system" group
      with the five role checkboxes (manual verify; no frontend code
      change expected).
- [ ] Full backend suite green, no new failures vs main (record count).
- [ ] `git diff --stat` shows the expected files: `permissions.py` +
      `ws_live_chat.py` + `sessions.py` + 2 test files + (optional)
      `AGENTS.md`. No drive-by edits.

## Success Metrics (program-level, measured after rollout)

| Metric | Target | How |
|--------|--------|-----|
| Live-chat WS connects by DIRECTOR/HEAD | 0 until SUPER_ADMIN opts in | audit log: WS auth success rows by role |
| Config-driven role changes (no redeploy) | SUPER_ADMIN edits the matrix, next WS connection reflects it within cache TTL | manual: edit matrix, connect as DIRECTOR, observe success |
| Hardcoded role sets in live-chat path | 0 | grep `UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT` in `ws_live_chat.py` + `sessions.py` returns 0 hits |

## Open Questions (non-blocking; implementer proposes, reviewers ratify)

- [ ] Module grouping in `PERMISSION_REGISTRY` — proposal is
      `"system"` (alongside `view_reports`, `view_audit_log`,
      `edit_settings`). Alternative: a new `"live_chat"` module group.
      Proposal: reuse `"system"` — adding a module group for one key is
      over-engineering, and the matrix UI already groups by module so
      the new row lands in a familiar place. Reviewers ratify.
- [ ] Level tag — proposal is `LEVEL_VIEW` (access gate, not edit).
      Alternative: `LEVEL_MANAGE` (treat live-chat as a manage-level
      surface). Proposal: `LEVEL_VIEW` — the level tags drive the
      per-module "preset" buttons in the matrix UI (click "View" →
      enable all level-1 keys for the module); live-chat access is
      semantically a view-level capability. Reviewers ratify.
- [ ] Whether `get_current_staff` (HTTP gate) should gain a comment
      pointing at `KEY_ACCESS_LIVE_CHAT` so the two-gate design is
      self-documenting (FR4 optional). Proposal: add the comment —
      it's one line, prevents the next reader from "fixing" the
      mismatch. Reviewers ratify.
- [ ] Startup `load_policy` timing (FR2 GOTCHA) — `app/main.py:
      _warm_permission_cache` (around line 115) already calls
      `load_policy(db)` at startup, so the WS path's cache is warm on
      boot. Task 2 of the plan VERIFIES this is still the case
      (regression guard against a future PR removing the call); it
      does NOT add a duplicate. Record the verified line number in
      the PR body.

## Rollout note (PR body)

Ships dark: `DEFAULT_POLICY[KEY_ACCESS_LIVE_CHAT]` = today's hardcoded
set, so on deploy the WS auth gate behaves identically (DIRECTOR/HEAD
still rejected). No migration, no env var, no flag. SUPER_ADMIN opts in
DIRECTOR and/or HEAD via the existing matrix UI at
`/admin/settings/permissions` — the change takes effect on the next
WS connection (cache invalidation is immediate via the existing
`PATCH /permissions` invalidate-and-reload path).

**Rollback:** revert the PR (the `PermissionSetting` row for
`access_live_chat`, if any SUPER_ADMIN created one, is harmless —
`can()` falls back to `DEFAULT_POLICY` which the revert restores).
No data migration needed.

**Why this is low-risk:**
- The two hardcoded role sets are replaced with a single cached `can()`
  call that reads the same `DEFAULT_POLICY` the hardcoded set was
  derived from. Behavior is byte-identical until SUPER_ADMIN edits.
- The frontend matrix UI already handles the new key for free (registry-
  driven, no hardcoded key list).
- The existing SUPER_ADMIN lockout safeguard (`settings.py:176-180`)
  covers the new key automatically.
- No DB schema change (the `permission_settings` table already stores
  arbitrary keys; the new key is just another row).

## Phase map (single PR; ordering for the implementation plan)

| # | Phase | Depends |
|---|-------|---------|
| 1 | Add `KEY_ACCESS_LIVE_CHAT` to `permissions.py` (FR1) | - |
| 2 | Verify startup `load_policy` timing (FR2 GOTCHA) | 1 |
| 3 | Replace WS auth gate with `can()` (FR2) | 1,2 |
| 4 | Replace transfer-session gate with `can()` (FR3) | 1 |
| 5 | Optional: `get_current_staff` comment (FR4) | - (parallel) |
| 6 | Tests: `test_permissions.py` + `test_ws_security.py` + transfer test (FR6) | 1-4 |
| 7 | Docs: `AGENTS.md` one-line note (FR7) | 1-4 |
| 8 | Verify: frontend matrix row renders (FR5) + full suite green | 1-7 |