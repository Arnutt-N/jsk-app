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
    # list_friends now also calls RichMenuService — mock it explicitly so this
    # test exercises a defined path rather than relying on the shared db mock.
    original_links = admin_friends.RichMenuService.get_current_links_for_users
    admin_friends.RichMenuService.get_current_links_for_users = AsyncMock(return_value={})

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/friends")
    finally:
        client.close()
        admin_friends.friend_service.list_friends = original_list_friends
        admin_friends.friend_service.get_user_refollow_counts = original_refollow
        admin_friends.RichMenuService.get_current_links_for_users = original_links
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["friends"][0]["line_user_id"] == "U123"
    assert payload["friends"][0]["chat_mode"] == "HUMAN"


def test_list_friends_includes_current_rich_menu():
    """Each friend row reports its current per-user rich menu (id + name), or
    null when the user has no per-user binding."""
    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

    original_list = admin_friends.friend_service.list_friends
    original_refollow = admin_friends.friend_service.get_user_refollow_counts
    original_links = admin_friends.RichMenuService.get_current_links_for_users

    admin_friends.friend_service.list_friends = AsyncMock(
        return_value=[
            SimpleNamespace(
                line_user_id="U123",
                display_name="Has Menu",
                picture_url=None,
                friend_status="ACTIVE",
                friend_since=None,
                last_message_at=None,
                chat_mode=ChatMode.BOT,
            ),
            SimpleNamespace(
                line_user_id="U999",
                display_name="No Menu",
                picture_url=None,
                friend_status="ACTIVE",
                friend_since=None,
                last_message_at=None,
                chat_mode=ChatMode.BOT,
            ),
        ]
    )
    admin_friends.friend_service.get_user_refollow_counts = AsyncMock(return_value={})
    admin_friends.RichMenuService.get_current_links_for_users = AsyncMock(
        return_value={"U123": {"rich_menu_id": 5, "rich_menu_name": "Main Menu"}}
    )

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/friends")
    finally:
        client.close()
        admin_friends.friend_service.list_friends = original_list
        admin_friends.friend_service.get_user_refollow_counts = original_refollow
        admin_friends.RichMenuService.get_current_links_for_users = original_links
        app.dependency_overrides.clear()

    assert response.status_code == 200
    by_id = {f["line_user_id"]: f for f in response.json()["friends"]}
    assert by_id["U123"]["rich_menu_id"] == 5
    assert by_id["U123"]["rich_menu_name"] == "Main Menu"
    assert by_id["U999"]["rich_menu_id"] is None
    assert by_id["U999"]["rich_menu_name"] is None
