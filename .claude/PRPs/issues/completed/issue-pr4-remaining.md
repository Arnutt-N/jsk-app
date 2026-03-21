---
issue: PR #4 Remaining Issues
title: Medium priority fixes + test coverage gaps from multi-agent review
type: ENHANCEMENT
status: READY
created: 2026-03-21
---

# Investigation: PR #4 Remaining Issues

## Summary

PR #4 multi-agent code review identified 3 medium-priority code issues and 6 test coverage gaps that were not addressed in the initial fix rounds. This artifact captures the exact problems with line numbers and provides implementation plans for each fix.

## Issues

### Medium Priority

#### M1: Mutable default in Broadcast model

- **File**: `backend/app/models/broadcast.py:36`
- **Problem**: `target_filter` column uses a mutable `dict` literal as the default value. All instances share the same dict object, leading to potential cross-row data corruption.
```python
target_filter = Column(JSONB, default={})
```
- **Fix**: Use a callable `default` instead:
```python
target_filter = Column(JSONB, default=dict)
```

#### M2: Deprecated `datetime.utcnow()`

- **File**: `backend/app/api/v1/endpoints/admin_reports.py:97`
- **Problem**: `_parse_dates()` uses `datetime.utcnow()` which is deprecated in Python 3.12+ and returns a naive datetime (no timezone info), causing inconsistent comparisons with timezone-aware DB columns.
```python
now = datetime.utcnow()
```
- **Fix**: Replace with timezone-aware call and add the import:
```python
from datetime import timezone
# ...
now = datetime.now(timezone.utc)
```

#### M3: Hardcoded colors in friends pages

- **Files**:
  - `frontend/app/admin/friends/page.tsx` (lines 80-81, 104, 107-108, 111, 115, 119, 122, 127, 134, 142, 149, 155, 160, 163, 167)
  - `frontend/app/admin/friends/history/page.tsx` (lines 181, 184, 194, 200, 206, 212, 218, 224, 230, 236, 245, 271, 273, 275, 286, 295, 304, 310, 313, 332, 344, 345, 352, 359)
- **Problem**: Both files use hardcoded Tailwind color classes (`text-slate-800`, `text-slate-400`, `text-slate-500`, `text-slate-900`, `bg-white`, `bg-slate-100`, `bg-slate-50`, `border-slate-100/60`, `divide-slate-50`, `hover:bg-slate-50/50`) instead of the project's semantic token classes. The history page partially uses dark mode variants (`dark:bg-gray-800`, `dark:text-gray-100`) but the main friends page has zero dark mode support.
- **Fix**: Replace with semantic tokens consistently:
  - `text-slate-800` / `text-slate-900` -> `text-text-primary`
  - `text-slate-400` / `text-slate-500` -> `text-text-secondary`
  - `bg-white` -> `bg-surface`
  - `bg-slate-100` -> `bg-surface-secondary`
  - `bg-slate-50/50` / `hover:bg-slate-50/50` -> `hover:bg-surface-hover`
  - `border-slate-100/60` -> `border-border`
  - `divide-slate-50` -> `divide-border`

### Test Coverage Gaps

#### T1: Fix broken test_media_endpoints.py

- **File**: `backend/tests/test_media_endpoints.py`
- **Problem**: Tests reference stale function signatures and names:
  1. Line 35: `media.upload_media(file=file, db=db)` -- actual signature is `upload_media(file, db, _admin)` (missing `_admin` param)
  2. Line 66: Calls `media.list_media_files(skip=0, limit=200, db=db, _current_admin=_admin_user())` -- function was renamed to `list_media` with different params `(category, search, page, page_size, db, _admin)`
  3. Line 70: Asserts `response.items[0].file_name` and `.content_type` and `.size` -- actual response is a plain dict with keys `filename`, `mime_type`, `size_bytes`
  4. Line 84: `media.delete_media(media_id=media_file.id, db=db, _current_admin=_admin_user())` -- actual param is `_admin`, not `_current_admin`, and return is `{"ok": True}` not a 204 Response
- **Fix**: Update all function calls to match current signatures and assert on dict keys instead of Pydantic attributes.

#### T2: Broadcast state machine tests (NEW)

- **File**: `backend/tests/test_broadcast_service.py` (CREATE)
- **Tests needed**:
  1. `test_send_broadcast_rejects_completed_status` -- Verify `send_broadcast()` raises `ValueError` when status is `COMPLETED` or `CANCELLED` (line 165-166 of broadcast_service.py)
  2. `test_send_broadcast_rejects_empty_messages` -- Verify error when `_build_messages()` returns empty list (line 170)
  3. `test_send_broadcast_transitions_to_sending_then_completed` -- Verify status goes `DRAFT -> SENDING -> COMPLETED` for `target_audience="all"` (lines 172-180)
  4. `test_send_broadcast_handles_multicast_partial_failure` -- Verify mixed success/failure sets `FAILED` status with correct counts (lines 189-206)
  5. `test_schedule_broadcast_rejects_non_draft` -- Verify only DRAFT can be scheduled (line 222)
  6. `test_schedule_broadcast_rejects_past_time` -- Verify past `scheduled_at` raises ValueError (line 229)
  7. `test_cancel_broadcast_rejects_completed` -- Verify COMPLETED/FAILED can't be cancelled (lines 238-239)
  8. `test_build_messages_text` -- Verify TEXT type builds TextMessage
  9. `test_build_messages_multi_truncates_to_5` -- Verify LINE's 5-message limit enforced (line 157)

#### T3: Role permission tests (NEW)

- **File**: `backend/tests/test_admin_users.py` (CREATE)
- **Tests needed**:
  1. `test_check_role_permission_admin_can_manage_agent` -- ADMIN user managing AGENT role should pass
  2. `test_check_role_permission_admin_cannot_manage_admin` -- ADMIN user managing ADMIN role should raise 403
  3. `test_check_role_permission_admin_cannot_manage_super_admin` -- ADMIN user managing SUPER_ADMIN role should raise 403
  4. `test_check_role_permission_super_admin_can_manage_all` -- SUPER_ADMIN should be able to manage any role
  5. `test_check_role_permission_agent_cannot_manage_agent` -- AGENT user managing AGENT role should raise 403 (only ADMIN+ allowed, lines 102-107)

#### T4: `_mask` unit tests (NEW)

- **File**: `backend/tests/test_admin_integrations.py` (CREATE)
- **Tests needed** (function at `admin_integrations.py:73-76`):
  1. `test_mask_empty_string` -- `_mask("")` should return `"****"`
  2. `test_mask_short_string` -- `_mask("abc")` (len<=6) should return `"****"`
  3. `test_mask_exactly_six` -- `_mask("abcdef")` (len==6) should return `"****"`
  4. `test_mask_seven_chars` -- `_mask("abcdefg")` should return `"abc****efg"`
  5. `test_mask_long_token` -- `_mask("123456789abcdef")` should return `"123****def"`
  6. `test_mask_none_like` -- `_mask(None)` edge case -- currently `not value` catches None but type hint says `str`, should verify behavior or add guard

#### T5: Public file endpoint tests (NEW)

- **File**: `backend/tests/test_media_endpoints.py` (UPDATE)
- **Tests needed** (for `get_public_file` at media.py:45-65):
  1. `test_get_public_file_returns_content` -- Valid public token with `is_public=True` returns file bytes with correct MIME type and Cache-Control header
  2. `test_get_public_file_404_for_invalid_token` -- Non-existent token returns 404
  3. `test_get_public_file_404_for_private_file` -- File exists but `is_public=False` returns 404
  4. `test_create_public_link_generates_token` -- `create_public_link` sets `public_token` and `is_public=True`
  5. `test_revoke_public_link_clears_token` -- `revoke_public_link` sets `is_public=False` and `public_token=None`

#### T6: Friend service `handle_follow`/`handle_unfollow` tests (NEW)

- **File**: `backend/tests/test_friend_service.py` (UPDATE)
- **Tests needed** (for methods at friend_service.py:103-152):
  1. `test_handle_follow_new_user_creates_follow_event` -- When user doesn't exist, creates FOLLOW event (not REFOLLOW)
  2. `test_handle_follow_returning_user_creates_refollow_event` -- When user has `friend_status="UNFOLLOWED"`, creates REFOLLOW event with incremented `refollow_count`
  3. `test_handle_follow_blocked_user_creates_refollow_event` -- When user has `friend_status="BLOCKED"`, creates REFOLLOW event
  4. `test_handle_follow_sets_user_active` -- After follow, `user.friend_status == "ACTIVE"` and `user.is_active == True`
  5. `test_handle_follow_sets_friend_since_only_if_missing` -- `friend_since` set only when it was None (line 118-119)
  6. `test_handle_unfollow_sets_unfollowed_status` -- `user.friend_status` set to `"UNFOLLOWED"`
  7. `test_handle_unfollow_unknown_user_still_creates_event` -- Even if user is None, an UNFOLLOW event is still created (lines 139-151)

## Implementation Plan

### Step 1: Fix Medium issues (M1-M3)

**M1** -- In `backend/app/models/broadcast.py`, line 36, change:
```python
target_filter = Column(JSONB, default={})
```
to:
```python
target_filter = Column(JSONB, default=dict)
```

**M2** -- In `backend/app/api/v1/endpoints/admin_reports.py`, line 5, add `timezone` to import:
```python
from datetime import date, datetime, timedelta, timezone
```
Then line 97, change:
```python
now = datetime.utcnow()
```
to:
```python
now = datetime.now(timezone.utc)
```

**M3** -- In both friends pages, replace hardcoded color classes with semantic tokens. Key mappings:
- `text-slate-800` -> `text-text-primary`
- `text-slate-900` -> `text-text-primary`
- `text-slate-400` -> `text-text-secondary`
- `text-slate-500` -> `text-text-secondary`
- `text-slate-600` -> `text-text-secondary`
- `bg-white` -> `bg-surface`
- `bg-slate-100` -> `bg-surface-secondary`
- `bg-slate-50/50` -> `bg-surface-hover`
- `hover:bg-slate-50/50` -> `hover:bg-surface-hover`
- `border-slate-100/60` -> `border-border`
- `divide-slate-50` -> `divide-border`
- `hover:bg-slate-100` -> `hover:bg-surface-hover`
- Remove redundant `dark:` overrides when semantic tokens handle both modes

### Step 2: Fix broken tests (T1)

Update `backend/tests/test_media_endpoints.py`:

```python
from datetime import datetime, timezone
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

from app.api.v1.endpoints import media
from app.models.user import UserRole


def _admin_user():
    return SimpleNamespace(id=1, role=UserRole.ADMIN, username="admin")


@pytest.mark.asyncio
async def test_upload_media_returns_created_payload():
    db = AsyncMock()
    db.add = MagicMock()

    async def _refresh(obj):
        obj.id = uuid4()
        obj.is_public = False
        obj.public_token = None
        obj.category = "DOCUMENT"
        obj.created_at = datetime.now(timezone.utc)

    db.refresh.side_effect = _refresh

    file = UploadFile(
        BytesIO(b"hello world"),
        filename="manual.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )

    response = await media.upload_media(file=file, db=db, _admin=_admin_user())

    assert response["filename"] == "manual.pdf"
    assert response["id"] is not None
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_media_returns_paginated_dict():
    media_file = SimpleNamespace(
        id=uuid4(),
        filename="manual.pdf",
        mime_type="application/pdf",
        size_bytes=2048,
        category="DOCUMENT",
        is_public=False,
        public_token=None,
        created_at=datetime(2026, 3, 15, 10, 0, tzinfo=timezone.utc),
    )

    db = AsyncMock()
    # count query
    count_result = MagicMock()
    count_result.scalar.return_value = 1
    # list query
    list_result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = [media_file]
    list_result.scalars.return_value = scalars
    db.execute.side_effect = [count_result, list_result]

    response = await media.list_media(
        category=None, search=None, page=1, page_size=20,
        db=db, _admin=_admin_user(),
    )

    assert response["total"] == 1
    assert len(response["items"]) == 1
    assert response["items"][0]["filename"] == "manual.pdf"
    assert response["items"][0]["mime_type"] == "application/pdf"
    assert response["items"][0]["size_bytes"] == 2048


@pytest.mark.asyncio
async def test_delete_media_removes_existing_row():
    media_file = SimpleNamespace(id=uuid4(), filename="manual.pdf")

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = media_file
    db.execute.return_value = result

    response = await media.delete_media(
        media_id=media_file.id, db=db, _admin=_admin_user(),
    )

    assert response == {"ok": True}
    db.delete.assert_awaited_once_with(media_file)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_media_raises_404_when_missing():
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result

    with pytest.raises(HTTPException) as exc:
        await media.delete_media(
            media_id=uuid4(), db=db, _admin=_admin_user(),
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "Media not found"
```

### Step 3: Add broadcast tests (T2)

Create `backend/tests/test_broadcast_service.py`:

```python
"""Tests for BroadcastService state machine and message building."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.broadcast import BroadcastStatus, BroadcastType
from app.services.broadcast_service import BroadcastService


def _broadcast(**overrides):
    defaults = dict(
        id=1,
        title="Test",
        message_type=BroadcastType.TEXT,
        content={"text": "Hello"},
        target_audience="all",
        target_filter={},
        status=BroadcastStatus.DRAFT,
        total_recipients=0,
        success_count=0,
        failure_count=0,
        sent_at=None,
        scheduled_at=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.mark.asyncio
async def test_send_broadcast_rejects_completed_status():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.COMPLETED)
    db = AsyncMock()
    with pytest.raises(ValueError, match="Cannot send"):
        await svc.send_broadcast(db, bc)


@pytest.mark.asyncio
async def test_send_broadcast_rejects_cancelled_status():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.CANCELLED)
    db = AsyncMock()
    with pytest.raises(ValueError, match="Cannot send"):
        await svc.send_broadcast(db, bc)


@pytest.mark.asyncio
async def test_send_broadcast_rejects_empty_messages():
    svc = BroadcastService()
    bc = _broadcast(content={"text": ""})  # empty text -> no messages
    db = AsyncMock()
    with pytest.raises(ValueError, match="no valid messages"):
        await svc.send_broadcast(db, bc)


@pytest.mark.asyncio
async def test_send_broadcast_transitions_to_completed():
    svc = BroadcastService()
    bc = _broadcast()
    db = AsyncMock()
    mock_api = AsyncMock()
    svc._api = mock_api

    result = await svc.send_broadcast(db, bc)

    assert result.status == BroadcastStatus.COMPLETED
    assert result.sent_at is not None
    mock_api.broadcast.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_broadcast_multicast_partial_failure():
    svc = BroadcastService()
    user_ids = [f"U{i}" for i in range(10)]
    bc = _broadcast(
        target_audience="specific",
        target_filter={"user_ids": user_ids},
    )
    db = AsyncMock()
    mock_api = AsyncMock()
    mock_api.multicast.side_effect = Exception("chunk fail")
    svc._api = mock_api

    result = await svc.send_broadcast(db, bc)

    assert result.status == BroadcastStatus.FAILED
    assert result.failure_count == 10


@pytest.mark.asyncio
async def test_schedule_broadcast_rejects_non_draft():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.COMPLETED)
    db = AsyncMock()
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    with pytest.raises(ValueError, match="Cannot schedule"):
        await svc.schedule_broadcast(db, bc, future)


@pytest.mark.asyncio
async def test_schedule_broadcast_rejects_past_time():
    svc = BroadcastService()
    bc = _broadcast()
    db = AsyncMock()
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    with pytest.raises(ValueError, match="must be in the future"):
        await svc.schedule_broadcast(db, bc, past)


@pytest.mark.asyncio
async def test_cancel_broadcast_rejects_completed():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.COMPLETED)
    db = AsyncMock()
    with pytest.raises(ValueError, match="Cannot cancel"):
        await svc.cancel_broadcast(db, bc)


def test_build_messages_text():
    svc = BroadcastService()
    bc = _broadcast(content={"text": "Hello world"})
    msgs = svc._build_messages(bc)
    assert len(msgs) == 1
    assert msgs[0].text == "Hello world"


def test_build_messages_multi_truncates_to_5():
    svc = BroadcastService()
    items = [{"type": "text", "text": f"msg{i}"} for i in range(10)]
    bc = _broadcast(
        message_type=BroadcastType.MULTI,
        content={"messages": items},
    )
    msgs = svc._build_messages(bc)
    assert len(msgs) == 5
```

### Step 4: Add role permission tests (T3)

Create `backend/tests/test_admin_users.py`:

```python
"""Tests for _check_role_permission helper in admin_users."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.admin_users import _check_role_permission
from app.models.user import UserRole


def _user(role: UserRole):
    return SimpleNamespace(id=1, role=role)


def test_super_admin_can_manage_super_admin():
    _check_role_permission(_user(UserRole.SUPER_ADMIN), UserRole.SUPER_ADMIN)


def test_super_admin_can_manage_admin():
    _check_role_permission(_user(UserRole.SUPER_ADMIN), UserRole.ADMIN)


def test_super_admin_can_manage_agent():
    _check_role_permission(_user(UserRole.SUPER_ADMIN), UserRole.AGENT)


def test_admin_can_manage_agent():
    _check_role_permission(_user(UserRole.ADMIN), UserRole.AGENT)


def test_admin_cannot_manage_admin():
    with pytest.raises(HTTPException) as exc:
        _check_role_permission(_user(UserRole.ADMIN), UserRole.ADMIN)
    assert exc.value.status_code == 403


def test_admin_cannot_manage_super_admin():
    with pytest.raises(HTTPException) as exc:
        _check_role_permission(_user(UserRole.ADMIN), UserRole.SUPER_ADMIN)
    assert exc.value.status_code == 403


def test_agent_cannot_manage_agent():
    with pytest.raises(HTTPException) as exc:
        _check_role_permission(_user(UserRole.AGENT), UserRole.AGENT)
    assert exc.value.status_code == 403


def test_user_role_managing_user_role_is_allowed():
    # UserRole.USER is not checked by _check_role_permission (no branch),
    # so it should pass without error
    _check_role_permission(_user(UserRole.AGENT), UserRole.USER)
```

### Step 5: Add mask/integration tests (T4)

Create `backend/tests/test_admin_integrations.py`:

```python
"""Tests for _mask helper in admin_integrations."""
from app.api.v1.endpoints.admin_integrations import _mask


def test_mask_empty_string():
    assert _mask("") == "****"


def test_mask_short_string():
    assert _mask("abc") == "****"


def test_mask_exactly_six():
    assert _mask("abcdef") == "****"


def test_mask_seven_chars():
    result = _mask("abcdefg")
    assert result == "abc****efg"


def test_mask_long_token():
    result = _mask("123456789abcdef")
    assert result == "123****def"


def test_mask_boundary_at_seven():
    # len=7 -> show first 3 + **** + last 3
    result = _mask("1234567")
    assert result == "123****567"
```

### Step 6: Add media public file tests (T5)

Append to `backend/tests/test_media_endpoints.py` (in updated file from Step 2):

```python
@pytest.mark.asyncio
async def test_create_public_link_generates_token():
    media_file = SimpleNamespace(
        id=uuid4(), filename="doc.pdf", mime_type="application/pdf",
        size_bytes=100, category="DOCUMENT",
        is_public=False, public_token=None,
        created_at=datetime.now(timezone.utc),
    )
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = media_file
    db.execute.return_value = result

    response = await media.create_public_link(
        media_id=media_file.id, db=db, _admin=_admin_user(),
    )

    assert media_file.is_public is True
    assert media_file.public_token is not None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_revoke_public_link_clears_token():
    media_file = SimpleNamespace(
        id=uuid4(), filename="doc.pdf", mime_type="application/pdf",
        size_bytes=100, category="DOCUMENT",
        is_public=True, public_token="some-token",
        created_at=datetime.now(timezone.utc),
    )
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = media_file
    db.execute.return_value = result

    response = await media.revoke_public_link(
        media_id=media_file.id, db=db, _admin=_admin_user(),
    )

    assert media_file.is_public is False
    assert media_file.public_token is None
    db.commit.assert_awaited_once()
```

### Step 7: Add friend service tests (T6)

Append to `backend/tests/test_friend_service.py`:

```python
@pytest.mark.asyncio
async def test_handle_follow_new_user_creates_follow_event():
    service = FriendService()
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # user not found
    mock_db.execute.return_value = mock_result
    mock_db.add = MagicMock()

    event = await service.handle_follow("Unew", mock_db)

    mock_db.add.assert_called_once()
    assert event.event_type == "FOLLOW"
    assert event.refollow_count == 0


@pytest.mark.asyncio
async def test_handle_follow_returning_user_creates_refollow_event():
    service = FriendService()
    existing = SimpleNamespace(
        line_user_id="U123",
        friend_status="UNFOLLOWED",
        is_active=False,
        friend_since=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    mock_db = AsyncMock()
    # First call: find user; Second call: count refollows
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = existing
    refollow_result = MagicMock()
    refollow_result.scalar.return_value = 2  # already refollowed twice
    mock_db.execute.side_effect = [user_result, refollow_result]
    mock_db.add = MagicMock()

    event = await service.handle_follow("U123", mock_db)

    assert event.event_type == "REFOLLOW"
    assert event.refollow_count == 3
    assert existing.friend_status == "ACTIVE"
    assert existing.is_active is True


@pytest.mark.asyncio
async def test_handle_follow_blocked_user_creates_refollow_event():
    service = FriendService()
    existing = SimpleNamespace(
        line_user_id="U456",
        friend_status="BLOCKED",
        is_active=False,
        friend_since=datetime(2025, 6, 1, tzinfo=timezone.utc),
    )
    mock_db = AsyncMock()
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = existing
    refollow_result = MagicMock()
    refollow_result.scalar.return_value = 0
    mock_db.execute.side_effect = [user_result, refollow_result]
    mock_db.add = MagicMock()

    event = await service.handle_follow("U456", mock_db)

    assert event.event_type == "REFOLLOW"
    assert event.refollow_count == 1


@pytest.mark.asyncio
async def test_handle_follow_sets_friend_since_only_if_missing():
    service = FriendService()
    existing = SimpleNamespace(
        line_user_id="U789",
        friend_status="ACTIVE",
        is_active=True,
        friend_since=None,
    )
    mock_db = AsyncMock()
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = existing
    mock_db.execute.return_value = user_result
    mock_db.add = MagicMock()

    await service.handle_follow("U789", mock_db)

    assert existing.friend_since is not None


@pytest.mark.asyncio
async def test_handle_unfollow_sets_unfollowed_status():
    service = FriendService()
    existing = SimpleNamespace(
        line_user_id="U123",
        friend_status="ACTIVE",
    )
    mock_db = AsyncMock()
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = existing
    mock_db.execute.return_value = user_result
    mock_db.add = MagicMock()

    event = await service.handle_unfollow("U123", mock_db)

    assert existing.friend_status == "UNFOLLOWED"
    assert event.event_type == "UNFOLLOW"


@pytest.mark.asyncio
async def test_handle_unfollow_unknown_user_still_creates_event():
    service = FriendService()
    mock_db = AsyncMock()
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = user_result
    mock_db.add = MagicMock()

    event = await service.handle_unfollow("Uunknown", mock_db)

    assert event.event_type == "UNFOLLOW"
    mock_db.add.assert_called_once()
```

## Validation

```bash
cd backend && python -m pytest tests/test_broadcast_service.py tests/test_admin_users.py tests/test_admin_integrations.py tests/test_media_endpoints.py tests/test_friend_service.py -v
cd frontend && npx tsc --noEmit
```

## Files to Modify/Create

| Action | File | Purpose |
|--------|------|---------|
| MODIFY | `backend/app/models/broadcast.py` | Fix mutable default on line 36 |
| MODIFY | `backend/app/api/v1/endpoints/admin_reports.py` | Fix `utcnow()` on line 97 |
| MODIFY | `frontend/app/admin/friends/page.tsx` | Replace hardcoded colors with semantic tokens |
| MODIFY | `frontend/app/admin/friends/history/page.tsx` | Replace hardcoded colors with semantic tokens |
| MODIFY | `backend/tests/test_media_endpoints.py` | Fix broken tests + add public file tests |
| CREATE | `backend/tests/test_broadcast_service.py` | State machine tests |
| CREATE | `backend/tests/test_admin_users.py` | Role permission tests |
| CREATE | `backend/tests/test_admin_integrations.py` | `_mask` helper tests |
| MODIFY | `backend/tests/test_friend_service.py` | Add follow/unfollow tests |
