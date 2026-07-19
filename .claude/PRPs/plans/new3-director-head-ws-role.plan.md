# Plan: NEW-3 Director/Head Live-Chat WS Role (configurable)

## Summary

Replace the two hardcoded live-chat role allowlists
(`ws_live_chat.py:53` WS auth + `sessions.py:236` transfer target) with
a single DB-configurable permission key `access_live_chat`, wired into
the existing permissions matrix that SUPER_ADMIN already edits via
`/admin/settings/permissions`. Ships dark: `DEFAULT_POLICY` preserves
today's `{SUPER_ADMIN, ADMIN, AGENT}` set until SUPER_ADMIN opts
DIRECTOR/HEAD in.

## User Story

As a SUPER_ADMIN, I want to decide myself which roles can use the
live-chat WebSocket (including DIRECTOR and HEAD), via the same
permission matrix I already use for every other capability — so the
access policy is consistent, audited, and changeable without a redeploy.

## Problem → Solution

Two hardcoded role sets in the live-chat WS path reject DIRECTOR/HEAD
even though the HTTP-side `get_current_staff` gate already lets them
load the page — an inconsistency flagged as "pre-existing, ask team" in
the PR 2A round-2 review. The user decision (2026-07-19): SUPER_ADMIN
configures the allowlist via the existing Settings menu. Solution: add
a 17th permission key to the existing matrix infrastructure (one
backend file + two call-site edits + auto-rendered frontend row).

## Metadata

- **Complexity**: S-M (backend-only, ~3 files modified + 2 test files
  extended, 0 new tables, 0 migrations, 0 frontend code changes)
- **Source PRD**: `.claude/PRPs/prds/new3-director-head-ws-role.prd.md`
- **PRD Phase**: all 8 phases of the PRD phase map = this one PR
- **Branch**: `feat/new3-live-chat-role-config` from `main`
- **Estimated Files**: 3 backend modified + 2 backend test files
  extended + 1 docs (AGENTS.md) + 0 frontend code (matrix UI is
  registry-driven)

> **Prerequisite (binding):** none. This PR is independent of the
> P1.1a/2B/2C cookie-auth thread. It can ship before, during, or after
> the cookie rollout — the two threads touch different code paths.

## UX Design

N/A — no new UI. The existing permission matrix at
`/admin/settings/permissions` renders the new row automatically
(registry-driven). SUPER_ADMIN sees a new row "เข้าใช้ Live Chat
(WebSocket)" in the "system" group with five role checkboxes
(SUPER_ADMIN locked-on, ADMIN/AGENT/DIRECTOR/HEAD toggleable).

---

## Mandatory Reading (before writing any code)

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `.claude/PRPs/prds/new3-director-head-ws-role.prd.md` | all | Requirements; FR numbers referenced below |
| P0 | `backend/app/core/permissions.py` | 40-115, 170-200, 370-400 | `KEY_*` constants, `DEFAULT_POLICY`, `_SEED_DESCRIPTIONS`, `PERMISSION_REGISTRY`, `PermissionMeta` — the 4 places FR1 adds the new key |
| P0 | `backend/app/core/permissions.py` | 250-300 | `can()` + `_check()` helpers you are calling from the WS path (FR2, FR3) |
| P0 | `backend/app/api/v1/endpoints/ws_live_chat.py` | 40-56 | `_load_and_authorize_ws_user` — the WS auth gate you are editing (FR2) |
| P0 | `backend/app/services/live_chat_service/sessions.py` | 230-240 | `transfer_session` — the transfer-target gate you are editing (FR3) |
| P0 | `backend/app/api/deps.py` | 202-226 | `get_current_staff` — the HTTP gate you are NOT tightening (FR4) |
| P0 | `backend/app/api/v1/endpoints/settings.py` | 135-228 | `PATCH /permissions` — the existing endpoint SUPER_ADMIN uses to edit the matrix (unchanged, but you must understand its validation + cache invalidation to write FR6 test 2-3) |
| P0 | `backend/app/main.py` | lifespan startup | verify `load_policy(db)` is called at startup (FR2 GOTCHA) |
| P0 | `backend/tests/test_permissions.py` | all | the existing permissions test idiom (matrix assertions, cache invalidation, SUPER_ADMIN lockout) — FR6 tests 1-3, 6 mirror this |
| P0 | `backend/tests/test_ws_security.py` | 1-60, 250-310 | the WS auth test idiom (mock `authenticate_ws_user`, assert role rejection) — FR6 test 4 |
| P1 | `backend/app/services/live_chat_service/sessions.py` | find the existing transfer-session test | the idiom for FR6 test 5 (grep `transfer_session` in `backend/tests/`) |
| P1 | `frontend/app/admin/settings/permissions/` | grep `KEY_` or `permission-modules` | confirm the matrix UI is registry-driven (FR5 verify — no frontend code expected) |
| P2 | `AGENTS.md` | Auth/Permissions section | the one-line note FR7 adds |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| FastAPI lifespan + startup tasks | FastAPI docs (Lifespan Events) | startup runs before the app accepts connections; `load_policy(db)` called there guarantees the WS auth cache is warm before any WS handshake |
| SQLAlchemy in-process cache invalidation | (internal pattern, no external doc) | `invalidate_cache()` + `load_policy(db)` is the existing pattern in `settings.py:223-224`; the WS path reads the same cache, so an edit via `PATCH /permissions` is visible to the next WS connection without a restart |

No other external research needed — everything is established internal
patterns.

---

## Patterns to Mirror

### PERMISSION_KEY_REGISTRATION (the FR1 mechanism — 4 edits in one file)

```python
# SOURCE: backend/app/core/permissions.py
# Edit 1 — constant (around line 60, after KEY_IMAGE_RESIZE):
KEY_ACCESS_LIVE_CHAT = "access_live_chat"

# Edit 2 — DEFAULT_POLICY (around line 108, after KEY_IMAGE_RESIZE):
KEY_ACCESS_LIVE_CHAT: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT}),

# Edit 3 — _SEED_DESCRIPTIONS (around line 190):
KEY_ACCESS_LIVE_CHAT: "เข้าใช้ Live Chat (WebSocket)",

# Edit 4 — PERMISSION_REGISTRY (around line 395, in the "system" group):
PermissionMeta(KEY_ACCESS_LIVE_CHAT, "system", LEVEL_VIEW,
              _SEED_DESCRIPTIONS[KEY_ACCESS_LIVE_CHAT]),
```
**Why all four:** the constant is the stable identifier consumed by
code; `DEFAULT_POLICY` is the fallback when no DB row exists;
`_SEED_DESCRIPTIONS` is the Thai label the matrix UI shows;
`PERMISSION_REGISTRY` drives the module/level grouping the matrix UI
renders. Missing any one of the four leaves the key half-registered
(can-checkable but not editable, or editable but not grouped). The
`ALL_PERMISSION_KEYS` tuple + `get_effective_capabilities` dict are
auto-derived from the registry, so they pick up the new key with no
extra edit.

### CAN_CHECK_SYNC_CACHE (the FR2/FR3 mechanism)

```python
# SOURCE: backend/app/core/permissions.py:255-265 (the can() helper)
def can(role: UserRole, key: str) -> bool:
    """Check if role has the named permission (cache-backed, no DB call)."""
    return _check(role, key)
# _check reads _policy_cache (in-process dict), populated by load_policy.
# Safe to call from sync OR async context, with OR without a DB session,
# because the cache is module-level state.
```
**Why this matters for FR2:** the WS auth path
(`_load_and_authorize_ws_user`) opens its own `AsyncSessionLocal` and
runs outside a request dependency scope. Calling `can()` there is
safe — it reads the module-level cache, not the request's DB session.
The cache must be warm (populated by `load_policy` at startup). Task 2
verifies this; if startup doesn't load the policy, task 2 adds the
call.

### TWO_GATE_DESIGN (the FR4 decision — do NOT tighten the HTTP gate)

```python
# SOURCE: backend/app/api/deps.py:202-226 (get_current_staff — unchanged)
# HTTP gate: permissive — lets DIRECTOR/HEAD LOAD the live-chat page
# (so they know the feature exists to ask SUPER_ADMIN for access).
#
# WS gate (FR2): strict — can(role, KEY_ACCESS_LIVE_CHAT) — only
# configured roles can USE live-chat (the real access control).
#
# This is intentional: the HTTP gate is "can you see the page?" ;
# the WS gate is "can you open a socket?". Tightening the HTTP gate
# would hide the page from supervisors, who would then not know to
# ask SUPER_ADMIN to grant access. Leave get_current_staff alone.
```
**Why this matters:** a reviewer skimming the diff might see
`get_current_staff` allows DIRECTOR/HEAD but the WS gate (under
DEFAULT_POLICY) rejects them, and "fix" the mismatch by tightening
`get_current_staff`. That would break the discoverability path. The
PR body + the optional comment in task 5 (FR4) must make the two-gate
design explicit so the "fix" doesn't happen.

### SUPER_ADMIN_LOCKOUT_AUTO_COVERS_NEW_KEY (the FR6 test 3 mechanism)

```python
# SOURCE: backend/app/api/v1/endpoints/settings.py:176-180
if "SUPER_ADMIN" not in rule.allowed_roles:
    raise HTTPException(
        status_code=400,
        detail=f"ห้ามถอด SUPER_ADMIN ออกจากสิทธิ์ '{rule.key}'",
    )
```
**Why this matters:** this guard runs for EVERY key in the batch,
including the new `access_live_chat`. FR6 test 3 asserts it fires for
the new key — proving the new key is treated identically to the
existing 16. No code change to the guard; the test is the proof.

---

## Task 1: Add `KEY_ACCESS_LIVE_CHAT` to `permissions.py` (FR1)

- **ACTION**: Edit `backend/app/core/permissions.py` — the 4 edits in
  the PERMISSION_KEY_REGISTRATION pattern above:
  1. Add `KEY_ACCESS_LIVE_CHAT = "access_live_chat"` after
     `KEY_IMAGE_RESIZE` (around line 61).
  2. Add `KEY_ACCESS_LIVE_CHAT: frozenset({UserRole.SUPER_ADMIN,
     UserRole.ADMIN, UserRole.AGENT}),` to `DEFAULT_POLICY` (around
     line 108, after the `KEY_IMAGE_RESIZE` entry).
  3. Add `KEY_ACCESS_LIVE_CHAT: "เข้าใช้ Live Chat (WebSocket)",` to
     `_SEED_DESCRIPTIONS` (around line 190).
  4. Add `PermissionMeta(KEY_ACCESS_LIVE_CHAT, "system", LEVEL_VIEW,
     _SEED_DESCRIPTIONS[KEY_ACCESS_LIVE_CHAT]),` to
     `PERMISSION_REGISTRY` in the "system" group (around line 395,
     near `KEY_VIEW_REPORTS` / `KEY_VIEW_AUDIT_LOG` which are also
     `LEVEL_VIEW` system keys).
- **VALIDATE**: `cd backend && python -c "from app.core.permissions
  import KEY_ACCESS_LIVE_CHAT, DEFAULT_POLICY, PERMISSION_REGISTRY,
  ALL_PERMISSION_KEYS; assert KEY_ACCESS_LIVE_CHAT in DEFAULT_POLICY;
  assert KEY_ACCESS_LIVE_CHAT in ALL_PERMISSION_KEYS; print('OK')"` —
  prints `OK`.
- **GOTCHA**: `ALL_PERMISSION_KEYS` + `get_effective_capabilities` are
  auto-derived from `PERMISSION_REGISTRY` — do NOT add the new key to
  any other list. If you find yourself adding it to a second list,
  that list is a duplicate that should be removed (file a follow-up,
  don't fix here).

## Task 2: Verify startup `load_policy` timing (FR2 GOTCHA — regression guard, NOT a code change)

- **ACTION**: Grep `load_policy` in `backend/app/main.py`. Confirm
  `_warm_permission_cache` (around line 115) still calls
  `await load_policy(db)` in the lifespan startup sequence. This is
  a VERIFICATION step — the call already exists, this task guards
  against a future PR removing it. Do NOT add a duplicate `load_policy`
  call; the existing one is the single source.
- **IF THE CALL IS MISSING** (regression): file a follow-up issue
  against whichever PR removed it. Do NOT silently re-add it in this
  PR — that would mask the regression. The follow-up restores the
  startup call; this PR's WS gate then works once the follow-up lands.
- **VALIDATE**: `cd backend && python -c "import asyncio; from
  app.main import app; from app.core.permissions import _policy_cache;
  assert _policy_cache, 'cache empty at import'; print(len(_policy_cache),
  'keys cached')"` — prints a number ≥ 17 (the 16 existing keys + the
  new one). If it prints 0 or <17, the startup load is missing or
  incomplete (the regression case above).
- **GOTCHA**: the `_policy_cache` is module-level state. Importing
  `app.main` triggers the lifespan only when the app is actually
  started (TestClient / uvicorn), not on bare import. The validation
  above checks the cache is populated *after* a startup; for a
  bare-import check, manually call `asyncio.run(load_policy(db))` in
  the test script. Record the verified `app/main.py` line number in
  the PR body.

## Task 3: Replace the WS auth gate with `can()` (FR2)

- **ACTION**: Edit `backend/app/api/v1/endpoints/ws_live_chat.py:53`:
  - Replace `if user.role not in {UserRole.ADMIN, UserRole.SUPER_ADMIN,
    UserRole.AGENT}: return None` with
    `if not can(user.role, KEY_ACCESS_LIVE_CHAT): return None`.
  - Add the import: `from app.core.permissions import can,
    KEY_ACCESS_LIVE_CHAT` at the top of the file (mirroring
    `settings.py:7-20`).
- **ACTION**: Update the `_load_and_authorize_ws_user` docstring
  (lines 41-45) — note that the role check is now configurable via
  `KEY_ACCESS_LIVE_CHAT` (DB-backed, DEFAULT_POLICY fallback =
  {SUPER_ADMIN, ADMIN, AGENT}).
- **VALIDATE**: `cd backend && python -m pytest
  tests/test_ws_security.py -x` — the existing tests mock
  `authenticate_ws_user`, so they should pass unchanged. If any test
  directly asserts the hardcoded role set (grep
  `UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT` in the test
  file), update it to use the `can()` path. Run the full file to
  confirm.
- **GOTCHA**: `can()` reads the in-process cache (no DB call). The WS
  auth path already opens its own `AsyncSessionLocal` (line 46) for
  the user load — that DB session is for the user lookup, NOT for the
  permission check. Do NOT pass the DB session to `can()`; it doesn't
  take one. The two-gate design (DB for user load, cache for role
  check) is intentional.

## Task 4: Replace the transfer-session gate with `can()` (FR3)

- **ACTION**: Edit `backend/app/services/live_chat_service/sessions.py:234-236`:
  - Replace `if not to_operator or to_operator.role not in
    [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT]: raise ...`
    with `if not to_operator or not can(to_operator.role,
    KEY_ACCESS_LIVE_CHAT): raise ...`.
  - Add the import: `from app.core.permissions import can,
    KEY_ACCESS_LIVE_CHAT` (top of the file, mirroring `settings.py:7-20`).
- **ACTION**: Update the inline comment (line 234: "Verify target
  operator exists and has appropriate role") to note the role check
  is now configurable via `KEY_ACCESS_LIVE_CHAT`.
- **VALIDATE**: `cd backend && python -m pytest tests/ -k "transfer"
  -x` — find the existing transfer-session test (grep
  `transfer_session` in `backend/tests/`) and confirm it passes. If
  it asserts the hardcoded role set, update it to use the `can()` path.
- **GOTCHA**: `transfer_session` runs inside a request-scoped DB
  session, so the cache is definitely warm by the time any HTTP
  request reaches it. No startup concern here (the FR2 GOTCHA is
  WS-only).

## Task 5: Optional — `get_current_staff` comment (FR4)

- **ACTION**: Edit `backend/app/api/deps.py:202-226` — add a one-line
  comment to the `get_current_staff` docstring pointing at
  `KEY_ACCESS_LIVE_CHAT`:
  ```
  # NOTE: this HTTP gate is permissive (lets DIRECTOR/HEAD load the
  # live-chat page). The WS gate (ws_live_chat.py:
  # _load_and_authorize_ws_user) checks `can(role, KEY_ACCESS_LIVE_CHAT)`
  # — the real access control. Do NOT tighten this gate to match the
  # WS gate; hiding the page from supervisors breaks discoverability
  # (they won't know to ask SUPER_ADMIN for access).
  ```
- **VALIDATE**: `git diff backend/app/api/deps.py` — should show only
  the added comment, no logic change. `cd backend && python -m pytest
  tests/ -k "staff or current_staff" -x` — all pass unchanged.
- **GOTCHA**: this is the single most important documentation line in
  the PR. A reviewer who skips the PRD and reads only the diff will
  see `get_current_staff` allows DIRECTOR/HEAD but the WS gate (under
  DEFAULT_POLICY) rejects them, and will be tempted to "fix" the
  mismatch. The comment is the guard. Do NOT skip this task.

## Task 6: Tests — `test_permissions.py` + `test_ws_security.py` + transfer test (FR6)

- **ACTION**: Extend `backend/tests/test_permissions.py`:
  - **Test 1 (DEFAULT_POLICY fallback)**: with NO `PermissionSetting`
    row for `access_live_chat`, assert
    `can(UserRole.DIRECTOR, KEY_ACCESS_LIVE_CHAT) is False` and
    `can(UserRole.AGENT, KEY_ACCESS_LIVE_CHAT) is True`. (Use the
    existing test idiom — probably an autouse fixture that clears the
    `permission_settings` table + invalidates the cache.)
  - **Test 2 (DB-backed grant)**: `PATCH /permissions` with
    `{updates: [{key: "access_live_chat", allowed_roles: ["SUPER_ADMIN",
    "ADMIN", "AGENT", "DIRECTOR"]}]}` → 200; assert
    `can(UserRole.DIRECTOR, KEY_ACCESS_LIVE_CHAT) is True` after the
    cache invalidation.
  - **Test 3 (SUPER_ADMIN lockout)**: `PATCH /permissions` with
    `{updates: [{key: "access_live_chat", allowed_roles: ["ADMIN",
    "AGENT"]}]}` (SUPER_ADMIN removed) → 400 with the Thai
    "ห้ามถอด SUPER_ADMIN" message.
  - **Test 6 (registry metadata)**: call `GET /permissions` (or
    `_registry_meta()` directly), assert a `PermissionKeyMeta` with
    `key="access_live_chat"`, `module="system"`, `level=1` (LEVEL_VIEW)
    is in the response.
- **ACTION**: Extend `backend/tests/test_ws_security.py`:
  - **Test 4 (WS auth respects the key)**: with DEFAULT_POLICY
    (DIRECTOR not granted), `_load_and_authorize_ws_user(director_id)`
    returns `None`. After a DB grant (insert a `PermissionSetting` row
    + `load_policy(db)` + `invalidate_cache()`), it returns the user.
    Use the existing mock pattern (`patch("...authenticate_ws_user",
    ...)`) — but for this test, do NOT mock `_load_and_authorize_ws_user`
    itself; mock only the DB session it opens, so the real `can()`
    check runs.
- **ACTION**: Find the transfer-session test (grep
  `transfer_session` in `backend/tests/`) and extend it:
  - **Test 5 (transfer respects the key)**: with DEFAULT_POLICY,
    transferring to a DIRECTOR target raises the eligibility error.
    After a DB grant, transfer succeeds. Use the same DB-grant +
    cache-invalidation idiom as test 4.
- **VALIDATE**: `cd backend && python -m pytest tests/test_permissions.py
  tests/test_ws_security.py -k "access_live_chat or transfer" -v` —
  all green. Then `cd backend && python -m pytest -x --tb=short` —
  full suite, no new failures vs main (record count).
- **GOTCHA**: the `can()` cache is module-level. Tests that flip the
  policy mid-suite MUST call `invalidate_cache()` + `load_policy(db)`
  after the DB change, or the next `can()` call reads stale cache. The
  existing `test_permissions.py` already does this (mirror its idiom).
  If a test leaks a policy mutation, later tests in the same run fail
  flakily — run the new tests in isolation first, then in the full
  suite.

## Task 7: Docs — `AGENTS.md` one-line note (FR7)

- **ACTION**: Edit `AGENTS.md` — find the Auth/Permissions section
  (grep `get_current_admin` or `get_current_staff`). Add a one-line
  note: "Live-chat WebSocket access is gated by the `access_live_chat`
  permission key (DB-configurable via `/admin/settings/permissions`,
  DEFAULT_POLICY = SUPER_ADMIN + ADMIN + AGENT)."
- **VALIDATE**: `git diff AGENTS.md` — one line added, no other change.
- **GOTCHA**: do NOT add a new section or restructure — the existing
  Auth/Permissions section is the right place; a one-line note is
  enough. If the section doesn't exist, add it under "Key Patterns"
  (the existing section that lists `get_current_admin`, `DEV_AUTH_BYPASS`,
  etc.).

## Task 8: Verify — frontend matrix row + full suite (FR5 + acceptance)

- **ACTION**: Start the backend locally (`python run.py --target
  local`) + the frontend (`npm run dev`). Log in as SUPER_ADMIN, open
  `/admin/settings/permissions`. Confirm the new row "เข้าใช้ Live
  Chat (WebSocket)" appears in the "system" group with the five role
  checkboxes (SUPER_ADMIN locked-on, ADMIN/AGENT/DIRECTOR/HEAD
  toggleable).
- **ACTION**: Toggle DIRECTOR on for `access_live_chat` via the UI.
  Save. Open a private window, log in as a DIRECTOR user, open
  `/admin/live-chat`. Confirm the WS connection succeeds (the shell
  loads conversations, no "cannot connect" error).
- **ACTION**: Toggle DIRECTOR off. Refresh the DIRECTOR user's
  live-chat page. Confirm the WS connection is rejected (shell shows
  "cannot connect" or the equivalent).
- **ACTION**: Full backend suite:
  `cd backend && python -m pytest -x --tb=short` — record the pass
  count in the PR body.
- **ACTION**: `git diff --stat main` — confirm only the expected
  files changed: `permissions.py` + `ws_live_chat.py` + `sessions.py`
  + `deps.py` (comment only) + 2 test files + `AGENTS.md` + (if task 2
  needed it) `main.py`. No drive-by edits.
- **VALIDATE**: all green; PR body has the pass count + the manual
  verification screenshots/notes.

---

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| WS auth cache cold on first connection after restart (FR2 GOTCHA) | Task 2 verifies startup `load_policy`; if missing, adds it. Record verified behavior in PR body. |
| A reviewer "fixes" the `get_current_staff` vs WS-gate mismatch by tightening the HTTP gate | Task 5 adds the two-gate comment; PR body explains the design. |
| `can()` cache leaks a test mutation to later tests (flaky) | Task 6 GOTCHA: every policy-flipping test calls `invalidate_cache()` + `load_policy(db)`; run new tests in isolation first. |
| Frontend matrix UI has a hardcoded key list (not registry-driven) so the new row doesn't appear | Task 1 GOTCHA: `ALL_PERMISSION_KEYS` is auto-derived; FR5 verifies the row appears. If it doesn't, grep `frontend/app/admin/settings/permissions/` for a hardcoded list — if found, file a follow-up (don't add the key to a second list in this PR). |
| DIRECTOR/HEAD granted live-chat access but lack other staff permissions (e.g. `manage_users`) — partial access confusion | Out of scope: the matrix is per-key; SUPER_ADMIN grants exactly the keys each role needs. The `get_current_staff` HTTP gate already lets DIRECTOR/HEAD load the page; the new key gates the WS. No partial-access bug introduced. |
| Existing WS test mocks break because `authenticate_ws_user` is unchanged but `_load_and_authorize_ws_user` now calls `can()` | Task 3 VALIDATE runs `test_ws_security.py` immediately; any breakage is fixed in task 3, not deferred. The mocks patch `authenticate_ws_user` (the outer function), not the inner `_load_and_authorize_ws_user`, so the inner `can()` call runs against the real cache — tests that pre-seed the cache (via `load_policy`) see DEFAULT_POLICY, tests that don't might see an empty cache. Mirror the existing test setup. |

---

## Out of scope (explicitly)

- Tightening `get_current_staff` (FR4 decision — HTTP gate stays
  permissive for discoverability).
- A separate `/admin/settings/live-chat` page (the matrix is the menu).
- Read-only / supervise mode for DIRECTOR/HEAD (a follow-up with a
  second key like `moderate_live_chat` if wanted later).
- Granting `access_live_chat` to DIRECTOR/HEAD by default
  (DEFAULT_POLICY preserves today's set; SUPER_ADMIN opts in).
- Removing the `authenticate_ws_user` JWT path (PR 2C, not here).
- Frontend code changes beyond verifying the auto-rendered matrix row.
- Any change to the `permission_settings` table schema (the new key is
  just another row).