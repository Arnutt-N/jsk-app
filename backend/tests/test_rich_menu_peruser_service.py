"""Unit tests for RichMenuService per-user methods (Phase 4).

These mock httpx so no real LINE call is made; they assert the HTTP method,
URL, and JSON body. The most error-prone things are guarded explicitly:
  * link uses the **line_rich_menu_id** (string) in the URL, not the local id
  * bulk_unlink body must be a **dict** ({"userIds": [...]}), never a set
  * get_user_rich_menu returns None on 404 (user has no assigned menu)

Mirrors the FakeResp / _make_client / _patches style of
test_rich_menu_alias_service.py.
"""
import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.rich_menu_service import RichMenuService

# Valid LINE userId: "U" + 32 lowercase hex chars (33 total).
USER_A = "U" + "0" * 32
USER_B = "U" + "a" * 32


class FakeResp:
    def __init__(self, json_data=None, status_code=200, content=b"{}"):
        self._json = json_data if json_data is not None else {}
        self.status_code = status_code
        self.content = content

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "error", request=MagicMock(), response=MagicMock(status_code=self.status_code)
            )

    def json(self):
        return self._json


def _make_client(captured, resp):
    """Build a fake httpx.AsyncClient() context manager that records calls."""
    client = MagicMock()

    async def _post(url, **kw):
        captured.append({"method": "POST", "url": url, "json": kw.get("json")})
        return resp

    async def _put(url, **kw):
        captured.append({"method": "PUT", "url": url, "json": kw.get("json")})
        return resp

    async def _delete(url, **kw):
        captured.append({"method": "DELETE", "url": url, "json": kw.get("json")})
        return resp

    async def _get(url, **kw):
        captured.append({"method": "GET", "url": url, "json": kw.get("json")})
        return resp

    client.post, client.put, client.delete, client.get = _post, _put, _delete, _get

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _patches(captured, resp):
    return (
        patch(
            "app.services.rich_menu_service.SettingsService.get_setting",
            new=AsyncMock(return_value="tok"),
        ),
        patch(
            "app.services.rich_menu_service.httpx.AsyncClient",
            return_value=_make_client(captured, resp),
        ),
    )


# ---------------------------------------------------------------------------
# link_to_user — POST /user/{userId}/richmenu/{lineRichMenuId}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_link_to_user_uses_post_with_line_menu_id_in_url():
    captured = []
    p1, p2 = _patches(captured, FakeResp(content=b""))
    with p1, p2:
        await RichMenuService.link_to_user(None, USER_A, "richmenu-xyz")
    assert captured[0]["method"] == "POST"
    # URL must contain the LINE rich menu id (string), not a local int id
    assert captured[0]["url"].endswith(f"/user/{USER_A}/richmenu/richmenu-xyz")


# ---------------------------------------------------------------------------
# unlink_from_user — DELETE /user/{userId}/richmenu
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unlink_from_user_uses_delete():
    captured = []
    p1, p2 = _patches(captured, FakeResp(content=b""))
    with p1, p2:
        await RichMenuService.unlink_from_user(None, USER_A)
    assert captured[0]["method"] == "DELETE"
    assert captured[0]["url"].endswith(f"/user/{USER_A}/richmenu")


@pytest.mark.asyncio
async def test_unlink_from_user_is_404_safe():
    # LINE returns 404 when the user has no per-user menu — a normal case
    # (e.g. unlinking a user already on the default menu). Must not raise.
    captured = []
    p1, p2 = _patches(captured, FakeResp(status_code=404, content=b""))
    with p1, p2:
        code = await RichMenuService.unlink_from_user(None, USER_A)
    assert code == 404


# ---------------------------------------------------------------------------
# get_user_rich_menu — GET /user/{userId}/richmenu (None on 404)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_user_rich_menu_returns_dict():
    captured = []
    resp = FakeResp(json_data={"richMenuId": "richmenu-xyz"})
    p1, p2 = _patches(captured, resp)
    with p1, p2:
        out = await RichMenuService.get_user_rich_menu(None, USER_A)
    assert out == {"richMenuId": "richmenu-xyz"}
    assert captured[0]["method"] == "GET"
    assert captured[0]["url"].endswith(f"/user/{USER_A}/richmenu")


@pytest.mark.asyncio
async def test_get_user_rich_menu_404_returns_none():
    captured = []
    p1, p2 = _patches(captured, FakeResp(status_code=404, content=b""))
    with p1, p2:
        out = await RichMenuService.get_user_rich_menu(None, USER_A)
    assert out is None


# ---------------------------------------------------------------------------
# bulk_link — POST /richmenu/bulk/link  body {"richMenuId", "userIds"}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bulk_link_body_is_dict_with_menu_and_users():
    captured = []
    p1, p2 = _patches(captured, FakeResp(content=b""))
    with p1, p2:
        await RichMenuService.bulk_link(None, "richmenu-xyz", [USER_A, USER_B])
    assert captured[0]["method"] == "POST"
    assert captured[0]["url"].endswith("/richmenu/bulk/link")
    body = captured[0]["json"]
    assert isinstance(body, dict)
    assert body == {"richMenuId": "richmenu-xyz", "userIds": [USER_A, USER_B]}


# ---------------------------------------------------------------------------
# bulk_unlink — POST /richmenu/bulk/unlink  body {"userIds"} (NO richMenuId)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bulk_unlink_body_is_dict_with_users_only():
    captured = []
    p1, p2 = _patches(captured, FakeResp(content=b""))
    with p1, p2:
        await RichMenuService.bulk_unlink(None, [USER_A, USER_B])
    assert captured[0]["method"] == "POST"
    assert captured[0]["url"].endswith("/richmenu/bulk/unlink")
    body = captured[0]["json"]
    # regression guard: must be a dict, never a set like {"userIds"}
    assert isinstance(body, dict)
    assert body == {"userIds": [USER_A, USER_B]}
    assert "richMenuId" not in body
