"""Unit tests for RichMenuService alias methods (Phase 3).

These mock httpx so no real LINE call is made; they assert the HTTP method,
URL, and JSON body — the things most likely to be wrong (esp. update = PUT).
"""
import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.rich_menu_service import RichMenuService


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


@pytest.mark.asyncio
async def test_create_alias_uses_post_and_body():
    captured = []
    p1, p2 = _patches(captured, FakeResp(content=b""))
    with p1, p2:
        await RichMenuService.create_alias_on_line(None, "alias-a", "richmenu-1")
    assert captured[0]["method"] == "POST"
    assert captured[0]["url"].endswith("/richmenu/alias")
    assert captured[0]["json"] == {"richMenuAliasId": "alias-a", "richMenuId": "richmenu-1"}


@pytest.mark.asyncio
async def test_update_alias_uses_put_not_post():
    captured = []
    p1, p2 = _patches(captured, FakeResp(content=b""))
    with p1, p2:
        await RichMenuService.update_alias_on_line(None, "alias-a", "richmenu-2")
    assert captured[0]["method"] == "PUT"  # regression guard: must NOT be POST
    assert captured[0]["url"].endswith("/richmenu/alias/alias-a")
    assert captured[0]["json"] == {"richMenuId": "richmenu-2"}


@pytest.mark.asyncio
async def test_list_aliases_extracts_aliases_key():
    captured = []
    resp = FakeResp(json_data={"aliases": [{"richMenuAliasId": "a", "richMenuId": "r"}]})
    p1, p2 = _patches(captured, resp)
    with p1, p2:
        out = await RichMenuService.list_aliases_from_line(None)
    assert out == [{"richMenuAliasId": "a", "richMenuId": "r"}]
    assert captured[0]["method"] == "GET"
    assert captured[0]["url"].endswith("/richmenu/alias/list")


@pytest.mark.asyncio
async def test_list_aliases_empty_when_key_missing():
    captured = []
    p1, p2 = _patches(captured, FakeResp(json_data={}))
    with p1, p2:
        out = await RichMenuService.list_aliases_from_line(None)
    assert out == []


@pytest.mark.asyncio
async def test_delete_alias_is_404_safe():
    captured = []
    p1, p2 = _patches(captured, FakeResp(status_code=404, content=b""))
    with p1, p2:
        code = await RichMenuService.delete_alias_on_line(None, "gone")
    assert code == 404
    assert captured[0]["method"] == "DELETE"
    assert captured[0]["url"].endswith("/richmenu/alias/gone")
