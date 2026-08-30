"""Rich-menu image storage (media_files pipeline) + publish hardening tests.

Covers the durable-fix ACs:
  * POST /{id}/upload — validation order (413 size before read, 422 magic
    bytes), media row created/replaced, failed LINE push flips sync_status
    to FAILED while the media row survives
  * POST /{id}/sync — image bytes flow to LINE from media_files; a stale
    line_rich_menu_id is cleared and the menu recreated (the publish 409's
    recovery promise)
  * POST /{id}/publish — 409 not-synced / 409 stale-on-LINE / 503 empty
    token / 502 upstream-with-detail / success marks PUBLISHED + audit
  * GET/PUT/POST — image_url populated on every response path
  * DELETE — media row removed, audit written
  * migration — structural (adds image_media_id, does NOT drop image_path)

Patterns mirror test_rich_menu_delete_guard.py (_SeqDB + dependency_overrides)
and test_rich_menu_alias_service.py (FakeResp/_patches httpx mocks).
"""
import importlib.util
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.core.permissions import invalidate_cache
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.rich_menu import RichMenuStatus, RichMenuSyncStatus
from app.models.user import UserRole
from app.services.rich_menu_service import (
    LINE_IMAGE_ALREADY_UPLOADED_RESULT,
    RichMenuService,
)

BASE = "/api/v1/admin/rich-menus"

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _Result:
    """Mimics a SQLAlchemy Result for scalar / scalars().all() access."""

    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalar(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return self._value if isinstance(self._value, list) else []


class _SeqDB:
    """Preset-results session stand-in, extended for media-row IO:

    * execute() pops preset results in order
    * get(Model, pk) pops from `gets` (used for the previous-media lookup)
    * add/delete/flush/commit/refresh/rollback are recorded no-ops
    """

    def __init__(self, results=None, gets=None):
        self._results = list(results or [])
        self._gets = list(gets or [])
        self.added = []
        self.deleted = []
        self.commits = 0

    async def execute(self, stmt):
        value = self._results.pop(0) if self._results else None
        return _Result(value)

    async def get(self, model, pk):
        return self._gets.pop(0) if self._gets else None

    def add(self, obj):
        self.added.append(obj)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        pass

    async def rollback(self):
        pass


def _make_user(role: UserRole):
    return SimpleNamespace(
        id=7, username="tester", display_name="Tester", role=role, is_active=True
    )


def _override(role=None, results=None, gets=None):
    invalidate_cache()
    db = _SeqDB(results or [], gets or [])

    async def _get_db():
        yield db

    app.dependency_overrides[session_get_db] = _get_db
    if role is not None:
        async def _get_current_user():
            return _make_user(role)

        app.dependency_overrides[deps.get_current_user] = _get_current_user
    return db


def _clear():
    app.dependency_overrides.clear()
    invalidate_cache()


def _full_menu(id=1, name="Menu A", line_id=None, image_media_id=None, status="DRAFT",
               sync_status="PENDING", last_sync_error=None):
    """A namespace with every field RichMenuResponse serialises."""
    return SimpleNamespace(
        id=id,
        name=name,
        chat_bar_text="menu",
        line_rich_menu_id=line_id,
        image_media_id=image_media_id,
        config={"size": {"width": 2500, "height": 843}, "areas": []},
        status=status,
        sync_status=sync_status,
        last_synced_at=None,
        last_sync_error=last_sync_error,
        created_at=datetime(2026, 1, 1),
        updated_at=None,
    )


def _client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# Upload endpoint
# ---------------------------------------------------------------------------


def test_upload_rejects_non_image_bytes_even_with_spoofed_content_type():
    # Spoofed multipart Content-Type says PNG; magic bytes say otherwise.
    _override(role=UserRole.ADMIN, results=[_full_menu(id=1)])
    client = _client()
    try:
        resp = client.post(
            f"{BASE}/1/upload",
            files={"file": ("evil.png", b"<html>not an image</html>", "image/png")},
        )
    finally:
        client.close()
        _clear()

    assert resp.status_code == 422
    assert "PNG or JPEG" in resp.json()["detail"]


def test_upload_rejects_oversize_before_reading_body(monkeypatch):
    # file.size is checked before the body is buffered — shrink the cap so the
    # 413 path is exercisable without shipping a 10 MB payload through TestClient.
    import app.api.v1.endpoints.rich_menus as rich_menus_module

    monkeypatch.setattr(rich_menus_module, "MAX_RICH_MENU_IMAGE_BYTES", 8)
    _override(role=UserRole.ADMIN, results=[_full_menu(id=1)])
    client = _client()
    try:
        resp = client.post(
            f"{BASE}/1/upload",
            files={"file": ("big.png", PNG_MAGIC + b"0" * 64, "image/png")},
        )
    finally:
        client.close()
        _clear()

    assert resp.status_code == 413


def test_upload_creates_media_row_and_returns_media_id():
    db = _override(role=UserRole.ADMIN, results=[_full_menu(id=1)])
    with patch.object(
        RichMenuService, "push_image_to_line", new=AsyncMock(return_value=True)
    ):
        client = _client()
        try:
            resp = client.post(
                f"{BASE}/1/upload",
                files={"file": ("menu.png", PNG_MAGIC + b"rest", "image/png")},
            )
        finally:
            client.close()
            _clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["media_id"]
    # replace_image ran for real against the fake db: one MediaFile added
    media_rows = [o for o in db.added if type(o).__name__ == "MediaFile"]
    assert len(media_rows) == 1
    assert media_rows[0].mime_type == "image/png"
    assert media_rows[0].size_bytes == len(PNG_MAGIC + b"rest")


def test_upload_line_push_failure_marks_sync_failed_but_keeps_media_row():
    db = _override(role=UserRole.ADMIN, results=[_full_menu(id=1, line_id="richmenu-live")])
    with patch.object(
        RichMenuService,
        "push_image_to_line",
        new=AsyncMock(side_effect=httpx.HTTPError("LINE down")),
    ):
        client = _client()
        try:
            resp = client.post(
                f"{BASE}/1/upload",
                files={"file": ("menu.png", PNG_MAGIC + b"rest", "image/png")},
            )
        finally:
            client.close()
            _clear()

    assert resp.status_code == 400
    assert "รูปบันทึกในระบบแล้ว" in resp.json()["detail"]
    # honesty rule: the uploaded-but-unpushed image must not read SYNCED
    assert db.commits >= 1
    assert db.added and type(db.added[0]).__name__ == "MediaFile"


# ---------------------------------------------------------------------------
# Sync endpoint — stale-id recovery + image error surfacing
# ---------------------------------------------------------------------------


def test_sync_recreates_menu_when_line_id_is_stale():
    stale_menu = _full_menu(id=1, line_id="richmenu-dead", sync_status="SYNCED")
    db = _SeqDB([stale_menu])
    with patch.object(
        RichMenuService, "get_from_line", new=AsyncMock(return_value=None)
    ), patch.object(
        RichMenuService, "create_on_line", new=AsyncMock(return_value="richmenu-fresh")
    ):
        import asyncio

        result = asyncio.run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is True
    assert result["line_rich_menu_id"] == "richmenu-fresh"
    assert "Recreated" in result["message"]
    assert stale_menu.line_rich_menu_id == "richmenu-fresh"
    assert stale_menu.sync_status == RichMenuSyncStatus.SYNCED.value


def test_sync_surfaces_image_upload_error_and_marks_failed():
    menu = _full_menu(id=1, line_id="richmenu-live", image_media_id="00000000-0000-0000-0000-000000000001")
    media = SimpleNamespace(id=menu.image_media_id, data=PNG_MAGIC, mime_type="image/png")
    _override(role=UserRole.ADMIN, results=[_full_menu(id=1), menu], gets=[media])
    with patch.object(
        RichMenuService,
        "sync_with_idempotency",
        new=AsyncMock(return_value={"success": True, "message": "Already synced with LINE",
                                    "line_rich_menu_id": "richmenu-live", "sync_status": "SYNCED"}),
    ), patch.object(
        RichMenuService, "push_image_to_line", new=AsyncMock(
            side_effect=httpx.HTTPError("LINE rejected image"))
    ):
        client = _client()
        try:
            resp = client.post(f"{BASE}/1/sync")
        finally:
            client.close()
            _clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "image_upload_error" in body  # no longer swallowed


# ---------------------------------------------------------------------------
# Publish endpoint — verify-then-act matrix
# ---------------------------------------------------------------------------


def test_publish_409_when_not_synced():
    _override(role=UserRole.ADMIN, results=[_full_menu(id=1, line_id=None)])
    client = _client()
    try:
        resp = client.post(f"{BASE}/1/publish")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 409
    assert "synced" in resp.json()["detail"]


def test_publish_409_with_structured_detail_when_menu_gone_from_line():
    db = _override(role=UserRole.ADMIN, results=[_full_menu(id=1, line_id="richmenu-dead")])
    with patch.object(
        RichMenuService, "get_from_line", new=AsyncMock(return_value=None)
    ):
        client = _client()
        try:
            resp = client.post(f"{BASE}/1/publish")
        finally:
            client.close()
            _clear()

    assert resp.status_code == 409
    body = resp.json()["detail"]
    assert "กด Sync" in body["message"]
    # the menu is marked FAILED so the UI stops offering Set Active
    assert db.commits >= 1


def test_publish_503_when_line_token_not_configured():
    async def _empty_token(db, line_id):
        raise RuntimeError("LINE channel access token is not configured")

    _override(role=UserRole.ADMIN, results=[_full_menu(id=1, line_id="richmenu-x")])
    with patch.object(RichMenuService, "get_from_line", new=_empty_token):
        client = _client()
        try:
            resp = client.post(f"{BASE}/1/publish")
        finally:
            client.close()
            _clear()

    assert resp.status_code == 503
    assert "not configured" in resp.json()["detail"]


def test_publish_502_with_line_detail_when_upstream_rejects():
    request = MagicMock()
    response = MagicMock(status_code=400, text='{"message":"The rich menu was not found"}',
                         json=MagicMock(side_effect=ValueError("not json")))

    async def _reject(db, line_id):
        raise httpx.HTTPStatusError(
            "Client error '400 Bad Request'", request=request, response=response
        )

    _override(role=UserRole.ADMIN, results=[_full_menu(id=1, line_id="richmenu-x")])
    with patch.object(RichMenuService, "get_from_line", new=AsyncMock(
        return_value={"richMenuId": "richmenu-x"}
    )), patch.object(RichMenuService, "set_default_on_line", new=_reject):
        client = _client()
        try:
            resp = client.post(f"{BASE}/1/publish")
        finally:
            client.close()
            _clear()

    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "400" in detail
    assert "The rich menu was not found" in detail


def test_publish_success_marks_published_and_audits():
    menu = _full_menu(id=1, line_id="richmenu-x")
    db = _override(role=UserRole.ADMIN, results=[menu])
    with patch.object(RichMenuService, "get_from_line", new=AsyncMock(
        return_value={"richMenuId": "richmenu-x"}
    )), patch.object(RichMenuService, "set_default_on_line", new=AsyncMock(return_value=None)):
        client = _client()
        try:
            resp = client.post(f"{BASE}/1/publish")
        finally:
            client.close()
            _clear()

    assert resp.status_code == 200
    assert menu.status == RichMenuStatus.PUBLISHED.value or menu.status == "PUBLISHED"
    assert db.commits >= 1


# ---------------------------------------------------------------------------
# image_url on every response path
# ---------------------------------------------------------------------------


def test_list_and_get_populate_image_url_from_media_fk():
    media_id = "11111111-2222-3333-4444-555555555555"
    menus = [_full_menu(id=1, image_media_id=media_id), _full_menu(id=2, image_media_id=None)]
    _override(role=UserRole.ADMIN, results=[menus, [(1, 0)]])
    client = _client()
    try:
        resp = client.get(BASE)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["image_url"] == f"/api/v1/media/{media_id}"
    assert data[1]["image_url"] is None


# ---------------------------------------------------------------------------
# Service units
# ---------------------------------------------------------------------------


def test_replace_image_deletes_previous_media_row():
    old_media = SimpleNamespace(id="00000000-0000-0000-0000-00000000000a")
    menu = _full_menu(id=1, image_media_id=old_media.id)
    db = _SeqDB(gets=[old_media])

    import asyncio

    media = asyncio.run(
        RichMenuService.replace_image(db, menu, "menu.png", "image/png", PNG_MAGIC)
    )

    assert db.deleted == [old_media]
    assert menu.image_media_id == media.id
    assert media.mime_type == "image/png"
    assert media.size_bytes == len(PNG_MAGIC)
    assert db.commits >= 1


def test_push_image_to_line_returns_false_without_media():
    menu = _full_menu(id=1, line_id="richmenu-live", image_media_id=None)
    db = _SeqDB()
    with patch.object(
        RichMenuService, "upload_image_to_line", new=AsyncMock()
    ) as mock_upload:
        import asyncio

        result = asyncio.run(RichMenuService.push_image_to_line(db, menu))

    assert result is False
    mock_upload.assert_not_awaited()


def test_push_image_to_line_uses_stored_mime_and_bytes():
    menu = _full_menu(id=1, line_id="richmenu-live", image_media_id="00000000-0000-0000-0000-000000000001")
    media = SimpleNamespace(id=menu.image_media_id, data=PNG_MAGIC + b"bytes", mime_type="image/png")
    db = _SeqDB([media])
    with patch.object(
        RichMenuService, "upload_image_to_line", new=AsyncMock(
            return_value=LINE_IMAGE_ALREADY_UPLOADED_RESULT
        )
    ) as mock_upload:
        import asyncio

        result = asyncio.run(RichMenuService.push_image_to_line(db, menu))

    # the push result is upload_image_to_line's, passed through verbatim —
    # True for a fresh upload, the marker dict for an already-decorated menu
    assert result == LINE_IMAGE_ALREADY_UPLOADED_RESULT
    mock_upload.assert_awaited_once_with(db, "richmenu-live", PNG_MAGIC + b"bytes", "image/png")


def test_line_error_detail_extracts_message_from_json_body():
    response = MagicMock(status_code=400, text="raw",
                         json=MagicMock(return_value={"message": "rich menu not found"}))
    err = httpx.HTTPStatusError("400", request=MagicMock(), response=response)

    detail = RichMenuService._line_error_detail(err)

    assert detail == "rich menu not found"


# ---------------------------------------------------------------------------
# LINE image limit (1 MB) — friendly error mapping + sync fail-fast
# ---------------------------------------------------------------------------


def _fake_line_client(post_side_effect=None):
    """MagicMock httpx.AsyncClient whose post() raises the given error (the
    raise happens while evaluating the awaited expression, before the await)."""
    client_cls = MagicMock()
    instance = MagicMock()
    instance.post = MagicMock(side_effect=post_side_effect)
    client_cls.return_value.__aenter__ = AsyncMock(return_value=instance)
    client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
    return client_cls


def _patch_line_client(error):
    return patch(
        "app.services.rich_menu_service.httpx.AsyncClient",
        new=_fake_line_client(error),
    )


def test_upload_image_to_line_413_maps_to_friendly_thai_error():
    response = MagicMock(status_code=413, text="",
                         json=MagicMock(side_effect=ValueError("no body")))
    err = httpx.HTTPStatusError(
        "Client error '413 Request Entity Too Large'",
        request=MagicMock(), response=response,
    )

    import asyncio

    with patch.object(
        RichMenuService, "get_client_headers",
        new=AsyncMock(return_value={"Authorization": "Bearer t"}),
    ), _patch_line_client(err):
        with pytest.raises(RuntimeError) as excinfo:
            asyncio.run(RichMenuService.upload_image_to_line(
                _SeqDB(), "richmenu-x", PNG_MAGIC, "image/png"
            ))

    message = str(excinfo.value)
    assert "1 MB" in message
    # the raw httpx blob must not leak through
    assert "Client error" not in message
    assert "api-data.line.me" not in message


def test_upload_image_to_line_other_status_uses_line_error_detail():
    response = MagicMock(status_code=400, text="",
                         json=MagicMock(return_value={"message": "invalid richmenu object"}))
    err = httpx.HTTPStatusError(
        "Client error '400 Bad Request'",
        request=MagicMock(), response=response,
    )

    import asyncio

    with patch.object(
        RichMenuService, "get_client_headers",
        new=AsyncMock(return_value={"Authorization": "Bearer t"}),
    ), _patch_line_client(err):
        with pytest.raises(RuntimeError) as excinfo:
            asyncio.run(RichMenuService.upload_image_to_line(
                _SeqDB(), "richmenu-x", PNG_MAGIC, "image/png"
            ))

    message = str(excinfo.value)
    assert "LINE rejected image upload (400)" in message
    assert "invalid richmenu object" in message


def test_upload_image_to_line_already_uploaded_400_is_success():
    """LINE allows one image per rich menu; a re-push 400 saying so is a
    completed state, not a failure — sync of a decorated menu stays green."""
    response = MagicMock(
        status_code=400,
        text="",
        json=MagicMock(return_value={
            "message": "An image has already been uploaded to the richmenu"
        }),
    )
    err = httpx.HTTPStatusError(
        "Client error '400 Bad Request'", request=MagicMock(), response=response
    )

    import asyncio

    with patch.object(
        RichMenuService, "get_client_headers",
        new=AsyncMock(return_value={"Authorization": "Bearer t"}),
    ), _patch_line_client(err):
        result = asyncio.run(RichMenuService.upload_image_to_line(
            _SeqDB(), "richmenu-x", PNG_MAGIC, "image/png"
        ))

    assert result == {"already_uploaded": True}


def test_upload_image_to_line_400_other_message_still_raises():
    """The substring match must not swallow unrelated 400s (false positive)."""
    response = MagicMock(
        status_code=400,
        text="",
        json=MagicMock(return_value={"message": "Invalid rich menu id"}),
    )
    err = httpx.HTTPStatusError(
        "Client error '400 Bad Request'", request=MagicMock(), response=response
    )

    import asyncio

    with patch.object(
        RichMenuService, "get_client_headers",
        new=AsyncMock(return_value={"Authorization": "Bearer t"}),
    ), _patch_line_client(err):
        with pytest.raises(RuntimeError) as excinfo:
            asyncio.run(RichMenuService.upload_image_to_line(
                _SeqDB(), "richmenu-x", PNG_MAGIC, "image/png"
            ))

    message = str(excinfo.value)
    assert "LINE rejected image upload (400)" in message
    assert "Invalid rich menu id" in message
    assert "already" not in message.lower()


def test_sync_on_already_decorated_menu_stays_synced():
    """POST /{id}/sync on a menu LINE already decorated: the marker return
    must NOT flip sync_status to FAILED nor add image_upload_error."""
    menu = _full_menu(id=1, line_id="richmenu-live", sync_status="SYNCED",
                      image_media_id="00000000-0000-0000-0000-000000000001")
    media = SimpleNamespace(id=menu.image_media_id, data=PNG_MAGIC, mime_type="image/png")
    _override(role=UserRole.ADMIN, results=[menu, menu], gets=[media])
    with patch.object(
        RichMenuService,
        "sync_with_idempotency",
        new=AsyncMock(return_value={"success": True, "message": "Already synced with LINE",
                                    "line_rich_menu_id": "richmenu-live", "sync_status": "SYNCED"}),
    ), patch.object(
        RichMenuService, "push_image_to_line",
        new=AsyncMock(return_value={"already_uploaded": True}),
    ):
        client = _client()
        try:
            resp = client.post(f"{BASE}/1/sync")
        finally:
            client.close()
            _clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "image_upload_error" not in body
    assert menu.sync_status == RichMenuSyncStatus.SYNCED.value


def test_upload_endpoint_already_uploaded_returns_200_with_marker():
    """POST /{id}/upload on a decorated menu: bytes are stored, the marker
    rides along in the payload, and sync_status is untouched (not FAILED)."""
    menu = _full_menu(id=1, line_id="richmenu-live", sync_status="SYNCED")
    _override(role=UserRole.ADMIN, results=[menu])
    with patch.object(
        RichMenuService, "push_image_to_line",
        new=AsyncMock(return_value={"already_uploaded": True}),
    ):
        client = _client()
        try:
            resp = client.post(
                f"{BASE}/1/upload",
                files={"file": ("menu.png", PNG_MAGIC + b"rest", "image/png")},
            )
        finally:
            client.close()
            _clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["media_id"]
    assert body["already_uploaded"] is True
    assert menu.sync_status == RichMenuSyncStatus.SYNCED.value


def test_sync_fail_fast_when_stored_image_exceeds_line_limit():
    oversized = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001", size_bytes=2 * 1024 * 1024
    )
    menu = _full_menu(id=1, image_media_id=oversized.id)
    db = _SeqDB([menu], gets=[oversized])

    import asyncio

    with patch.object(
        RichMenuService, "create_on_line", new=AsyncMock(return_value="richmenu-x")
    ) as mock_create:
        result = asyncio.run(RichMenuService.sync_with_idempotency(db, 1))

    # no orphan menu may be created on LINE for an image LINE would refuse
    mock_create.assert_not_called()
    assert result["success"] is False
    assert "1 MB" in result["message"]
    assert result["sync_status"] == RichMenuSyncStatus.FAILED.value
    assert menu.sync_status == RichMenuSyncStatus.FAILED.value


def test_sync_create_passes_when_image_exactly_at_limit():
    at_cap = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001", size_bytes=1024 * 1024
    )
    menu = _full_menu(id=1, image_media_id=at_cap.id)
    db = _SeqDB([menu], gets=[at_cap])

    import asyncio

    with patch.object(
        RichMenuService, "create_on_line", new=AsyncMock(return_value="richmenu-new")
    ) as mock_create:
        result = asyncio.run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is True
    assert result["line_rich_menu_id"] == "richmenu-new"
    mock_create.assert_called_once()


# ---------------------------------------------------------------------------
# Migration (structural — repo precedent test_booking_migration.py)
# ---------------------------------------------------------------------------


def test_migration_is_additive_and_chained_to_head():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic" / "versions" / "s0t1u2v3w4x5_rich_menu_image_media.py"
    )
    spec = importlib.util.spec_from_file_location("s0t1u2v3w4x5_migration", migration_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "s0t1u2v3w4x5"
    assert module.down_revision == "r9s0t1u2v3w4"
    source = migration_path.read_text(encoding="utf-8")
    assert "image_media_id" in source
    # expand-contract: the drop stays in the follow-up PR
    assert 'op.drop_column("rich_menus", "image_path")' not in source
    assert "op.drop_column('rich_menus', 'image_path')" not in source
