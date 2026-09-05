# Review Follow-up Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the two Medium follow-ups deferred by PR #222 — webhook lock released only by its owner, and `update_user` checking the target's current role on every PUT.

**Architecture:** Backend-only, two localized edits with failure-mode-named tests. No schema/API/policy change.

**Tech Stack:** FastAPI, pytest + pytest-asyncio, existing mock fixtures.

**PRD:** `.claude/PRPs/prds/2026-09-05-review-followup-mediums.prd.md`

## Global Constraints

- No frontend changes; no DB migration; no API contract change.
- Webhook path is LINE-message ingestion — minimal blast radius; reuse `RedisClient` semantics (tri-state `set`, error-swallowing `delete`).

## Evidence

| # | Finding | Location |
|---|---------|----------|
| E1 | `finally` deletes `lock_key` unconditionally; the `lock_acquired is False` → `continue` path still runs `finally` → loser deletes the winner's lock → third delivery re-processes the event | `backend/app/api/v1/endpoints/webhook.py:109-110` (re-verified 2026-09-05) |
| E2 | Redis-outage path (`lock_acquired is None`) also hits the delete — `RedisClient.delete` swallows errors so it is noise today, but the guard must skip it anyway | same region |
| E3 | Target-role check only inside `if body.role is not None:` — profile-only PUT on DIRECTOR/HEAD bypasses it | `backend/app/api/v1/endpoints/admin_users.py:418-422` (re-verified 2026-09-05) |
| E4 | Self-edit must stay allowed (self role-change and self-deactivation already blocked separately) | `admin_users.py` own-role/own-active guards |
| E5 | `require_permission(KEY_MANAGE_USERS)` builds a fresh closure per call — endpoint tests override `deps.get_current_user` instead (DEFAULT_POLICY grants manage_users to ADMIN and SUPER_ADMIN) | `backend/app/api/deps.py:234-258`, `backend/app/core/permissions.py` DEFAULT_POLICY |

---

### Task 1: Webhook lock — release only when acquired

**Files:**
- Modify: `backend/app/api/v1/endpoints/webhook.py:60-110`
- Test: `backend/tests/test_webhook_deduplication.py`

- [ ] **Step 1: Write failing tests** (append to `TestWebhookDeduplication`)

```python
    @pytest.mark.asyncio
    async def test_lost_lock_does_not_delete_winners_lock(self, mock_redis, mock_event_with_id):
        """Losing the NX race must not delete the winner's in-flight lock."""
        mock_redis.exists.return_value = False
        mock_redis.set.return_value = False  # another worker holds the lock

        await process_webhook_events([mock_event_with_id])

        mock_redis.delete.assert_not_awaited()
        mock_redis.setex.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_winner_releases_own_lock(self, mock_redis, mock_event_with_id):
        """The lock holder releases its own lock after processing."""
        mock_redis.exists.return_value = False
        mock_redis.set.return_value = True

        await process_webhook_events([mock_event_with_id])

        mock_redis.delete.assert_awaited_once()
        released_key = mock_redis.delete.call_args[0][0]
        assert "test-event-id-12345" in released_key

    @pytest.mark.asyncio
    async def test_redis_down_fails_open_without_lock_release(self, mock_redis, mock_event_with_id):
        """Redis outage processes without dedup and must not attempt release."""
        mock_redis.exists.return_value = False
        mock_redis.set.return_value = None  # Redis unavailable

        await process_webhook_events([mock_event_with_id])

        mock_redis.delete.assert_not_awaited()
        mock_redis.setex.assert_awaited_once()
```

Run: `cd backend && ./venv/Scripts/python.exe -m pytest tests/test_webhook_deduplication.py -q`
Expected: the lost-lock and redis-down tests FAIL (delete is awaited today).

- [ ] **Step 2: Implement** — track acquisition; guard the release

```python
        for event in events:
            cache_key = None
            lock_key = None
            lock_acquired = False
```

```python
            finally:
                # Release the lock ONLY when this invocation actually acquired
                # it: the `continue` paths above (lock lost to another worker,
                # Redis down) still run the finally block, and deleting then
                # would destroy the winner's in-flight lock and let a third
                # duplicate delivery process the same event again.
                if lock_key and lock_acquired:
                    await redis_client.delete(lock_key)
```

- [ ] **Step 3: Run tests** — all deduplication tests pass (incl. the pre-existing failure-path release test).
- [ ] **Step 4: Commit** — `fix(webhook): release dedup lock only when this invocation acquired it`

### Task 2: update_user — target-role check on every PUT

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_users.py:408-422`
- Test: `backend/tests/test_admin_users.py`

- [ ] **Step 1: Write failing tests** (append; follow the file's override pattern)

```python
# ── update_user target-role guard (review follow-up M2) ─────────────

class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def _target_user(role: UserRole, user_id: int = 5):
    return SimpleNamespace(
        id=user_id, username="target", email="target@example.com",
        display_name="Old Name", picture_url=None, role=role, is_active=True,
        line_user_id=None, created_at=None, updated_at=None,
    )


def _put_user(client, user_id: int = 5, **fields):
    return client.put(f"/api/v1/admin/users/{user_id}", json=fields)


def _wire_update_overrides(current_user, target):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_FakeResult(target))

    async def _override_get_db():
        yield db

    async def _override_get_current_user():
        return current_user

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_user] = _override_get_current_user
    return db


def test_admin_cannot_profile_edit_director():
    admin = SimpleNamespace(id=1, username="admin", display_name="A",
                            role=UserRole.ADMIN, is_active=True)
    target = _target_user(UserRole.DIRECTOR)
    _wire_update_overrides(admin, target)
    client = TestClient(app)
    try:
        response = _put_user(client, display_name="Renamed")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_admin_can_still_edit_own_profile():
    admin = SimpleNamespace(id=1, username="admin", display_name="A",
                            role=UserRole.ADMIN, is_active=True)
    target = _target_user(UserRole.ADMIN, user_id=1)  # self
    _wire_update_overrides(admin, target)
    client = TestClient(app)
    try:
        response = _put_user(client, user_id=1, display_name="Renamed")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200


def test_super_admin_can_profile_edit_director():
    super_admin = SimpleNamespace(id=1, username="root", display_name="Root",
                                  role=UserRole.SUPER_ADMIN, is_active=True)
    target = _target_user(UserRole.DIRECTOR)
    _wire_update_overrides(super_admin, target)
    client = TestClient(app)
    try:
        response = _put_user(client, display_name="Renamed")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
```

Run: `cd backend && ./venv/Scripts/python.exe -m pytest tests/test_admin_users.py -q`
Expected: `test_admin_cannot_profile_edit_director` FAILS (200 today — the gap).

- [ ] **Step 2: Implement** — replace the role-change-only block

```python
    # Profile-only PUTs (no `role` in the body) must still respect the
    # target's CURRENT role — otherwise an ADMIN could modify DIRECTOR/HEAD
    # accounts (display name, email, is_active) by omitting the role field.
    # Editing your own account is always allowed.
    if user.id != current_admin.id:
        _check_role_permission(current_admin, user.role)

    # Check permission for target role changes
    if body.role is not None:
        _check_role_permission(current_admin, body.role)
```

- [ ] **Step 3: Run tests** — `tests/test_admin_users.py` + `tests/test_admin_users_role_check.py` pass.
- [ ] **Step 4: Commit** — `fix(admin): check target role on every user update (profile-only PUTs included)`

### Task 3: Validation + PR

- [ ] **Step 1:** `./venv/Scripts/python.exe -m pytest tests/test_webhook_deduplication.py tests/test_admin_users.py tests/test_admin_users_role_check.py tests/test_webhook_signature.py -q` — green.
- [ ] **Step 2:** push, PR, wait CI 4/4 (CI is the backend full-suite gate — local full run hangs on Windows teardown, documented), squash-merge, CD watch.
- [ ] **Step 3:** handoff checkpoint via `handoff-new.cjs`.
