"""Tests for friend profile refresh behavior."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.friend_service import FriendService


@pytest.mark.asyncio
async def test_refresh_profile_skips_when_not_stale():
    service = FriendService()
    recent_user = SimpleNamespace(
        line_user_id="U123",
        display_name="Existing",
        picture_url="old.png",
        profile_updated_at=datetime.now(timezone.utc),
    )
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = recent_user
    mock_db.execute.return_value = mock_result

    user = await service.refresh_profile("U123", mock_db, force=False, stale_after_hours=24)

    assert user is recent_user
    mock_db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_refresh_profile_updates_when_stale():
    service = FriendService()
    stale_user = SimpleNamespace(
        line_user_id="U456",
        display_name="Old Name",
        picture_url="old.png",
        profile_updated_at=datetime.now(timezone.utc) - timedelta(days=2),
    )
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = stale_user
    mock_db.execute.return_value = mock_result

    profile = SimpleNamespace(display_name="Fresh Name", picture_url="fresh.png")

    with pytest.MonkeyPatch.context() as mp:
        mock_api = AsyncMock()
        mock_api.get_profile = AsyncMock(return_value=profile)
        mp.setattr("app.core.line_client.get_line_bot_api", lambda: mock_api)
        user = await service.refresh_profile("U456", mock_db, force=False, stale_after_hours=24)

    assert user.display_name == "Fresh Name"
    assert user.picture_url == "fresh.png"
    assert isinstance(user.profile_updated_at, datetime)
    mock_db.commit.assert_awaited_once()
    mock_db.refresh.assert_awaited_once_with(stale_user)


# ── T6: handle_follow / handle_unfollow tests ─────────────────────


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
        id=1,
        line_user_id="U123",
        friend_status="UNFOLLOWED",
        is_active=False,
        friend_since=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    mock_db = AsyncMock()
    # resolve_by_line_id handles the user lookup; only the refollow count hits db.execute
    refollow_result = MagicMock()
    refollow_result.scalar.return_value = 2  # already refollowed twice
    mock_db.execute.side_effect = [refollow_result]
    mock_db.add = MagicMock()

    with patch(
        "app.services.user_identity_service.resolve_by_line_id",
        new_callable=AsyncMock,
    ) as mock_resolve:
        mock_resolve.return_value = existing
        event = await service.handle_follow("U123", mock_db)

    assert event.event_type == "REFOLLOW"
    assert event.refollow_count == 3
    assert existing.friend_status == "ACTIVE"
    assert existing.is_active is True


@pytest.mark.asyncio
async def test_handle_follow_blocked_user_creates_refollow_event():
    service = FriendService()
    existing = SimpleNamespace(
        id=2,
        line_user_id="U456",
        friend_status="BLOCKED",
        is_active=False,
        friend_since=datetime(2025, 6, 1, tzinfo=timezone.utc),
    )
    mock_db = AsyncMock()
    refollow_result = MagicMock()
    refollow_result.scalar.return_value = 0
    mock_db.execute.side_effect = [refollow_result]
    mock_db.add = MagicMock()

    with patch(
        "app.services.user_identity_service.resolve_by_line_id",
        new_callable=AsyncMock,
    ) as mock_resolve:
        mock_resolve.return_value = existing
        event = await service.handle_follow("U456", mock_db)

    assert event.event_type == "REFOLLOW"
    assert event.refollow_count == 1


@pytest.mark.asyncio
async def test_handle_follow_sets_friend_since_only_if_missing():
    service = FriendService()
    existing = SimpleNamespace(
        id=3,
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
        id=4,
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
