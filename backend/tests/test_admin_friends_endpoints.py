"""Endpoint tests for admin friends APIs."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1.endpoints import admin_friends
from app.main import app
from app.models.user import ChatMode, UserRole
from app.services.credential_service import credential_service

from tests.identity_helpers import make_line_user_fields


def _make_db_mock(user_rows: list[tuple[int, str]], total: int = 1):
    """DB mock wired for list_friends' two real db.execute calls:
    1) count query → .scalar() → total
    2) decrypt_line_ids_for_users select(User.id, User.line_user_id_encrypted)
       → .all() → [(user_id, encrypted_token), ...]
    """
    db = AsyncMock()
    count_result = MagicMock()
    count_result.scalar.return_value = total
    decrypt_result = MagicMock()
    decrypt_result.all.return_value = user_rows
    db.execute = AsyncMock(side_effect=[count_result, decrypt_result])
    return db


def _make_db_override(user_rows: list[tuple[int, str]], total: int = 1):
    async def _override_get_db():
        yield _make_db_mock(user_rows, total=total)

    return _override_get_db


async def _override_get_current_admin():
    return SimpleNamespace(id=1, role=UserRole.ADMIN, username="admin")


def test_list_friends_serializes_friend_rows():
    app.dependency_overrides[deps.get_db] = _make_db_override(
        [(1, credential_service.encrypt_line_id("U123"))]
    )
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

    original_list_friends = admin_friends.friend_service.list_friends
    original_refollow = admin_friends.friend_service.get_user_refollow_counts
    admin_friends.friend_service.list_friends = AsyncMock(
        return_value=[
            SimpleNamespace(
                id=1,
                display_name="Friend One",
                picture_url="https://example.com/friend.png",
                friend_status="ACTIVE",
                friend_since=datetime(2026, 3, 10, 1, 2, tzinfo=timezone.utc),
                last_message_at=datetime(2026, 3, 11, 3, 4, tzinfo=timezone.utc),
                chat_mode=ChatMode.HUMAN,
                **make_line_user_fields("U123"),
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
    null when the user has no per-user binding. Rich menu links are keyed by
    user.id (PR C: user_id FK)."""
    app.dependency_overrides[deps.get_db] = _make_db_override(
        [
            (1, credential_service.encrypt_line_id("U123")),
            (2, credential_service.encrypt_line_id("U999")),
        ],
        total=2,
    )
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

    original_list = admin_friends.friend_service.list_friends
    original_refollow = admin_friends.friend_service.get_user_refollow_counts
    original_links = admin_friends.RichMenuService.get_current_links_for_users

    admin_friends.friend_service.list_friends = AsyncMock(
        return_value=[
            SimpleNamespace(
                id=1,
                display_name="Has Menu",
                picture_url=None,
                friend_status="ACTIVE",
                friend_since=None,
                last_message_at=None,
                chat_mode=ChatMode.BOT,
                **make_line_user_fields("U123"),
            ),
            SimpleNamespace(
                id=2,
                display_name="No Menu",
                picture_url=None,
                friend_status="ACTIVE",
                friend_since=None,
                last_message_at=None,
                chat_mode=ChatMode.BOT,
                **make_line_user_fields("U999"),
            ),
        ]
    )
    admin_friends.friend_service.get_user_refollow_counts = AsyncMock(return_value={})
    admin_friends.RichMenuService.get_current_links_for_users = AsyncMock(
        return_value={1: {"rich_menu_id": 5, "rich_menu_name": "Main Menu"}}
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
