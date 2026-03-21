"""Endpoint tests for admin friends APIs."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1.endpoints import admin_friends
from app.main import app
from app.models.user import ChatMode, UserRole


def _make_db_mock():
    """Create a DB mock where execute().scalar() returns a sync value."""
    db = AsyncMock()
    scalar_result = MagicMock()
    scalar_result.scalar.return_value = 1  # total count
    db.execute.return_value = scalar_result
    return db


async def _override_get_db():
    yield _make_db_mock()


async def _override_get_current_admin():
    return SimpleNamespace(id=1, role=UserRole.ADMIN, username="admin")


def test_list_friends_serializes_friend_rows():
    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

    original_list_friends = admin_friends.friend_service.list_friends
    original_refollow = admin_friends.friend_service.get_user_refollow_counts
    admin_friends.friend_service.list_friends = AsyncMock(
        return_value=[
            SimpleNamespace(
                line_user_id="U123",
                display_name="Friend One",
                picture_url="https://example.com/friend.png",
                friend_status="ACTIVE",
                friend_since=datetime(2026, 3, 10, 1, 2, tzinfo=timezone.utc),
                last_message_at=datetime(2026, 3, 11, 3, 4, tzinfo=timezone.utc),
                chat_mode=ChatMode.HUMAN,
            )
        ]
    )
    admin_friends.friend_service.get_user_refollow_counts = AsyncMock(
        return_value={"U123": 0}
    )

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/friends")
    finally:
        client.close()
        admin_friends.friend_service.list_friends = original_list_friends
        admin_friends.friend_service.get_user_refollow_counts = original_refollow
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["friends"][0]["line_user_id"] == "U123"
    assert payload["friends"][0]["chat_mode"] == "HUMAN"
