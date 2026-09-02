"""Recreate-on-drift sync: edits to a synced rich menu must reach LINE.

LINE has no rich-menu update endpoint (size/name/chatBarText/areas immutable
per richMenuId; the image uploads exactly once), so `sync_with_idempotency`
recreates the menu on LINE when local state drifted — moving aliases, per-user
links, and the default binding to the new id before deleting the old menu.

Covers the PRD 2026-09-02 AC matrix:
  * no drift → green no-op (regression guard for AC2)
  * config drift / PENDING flag (replaced image) / FAILED retry → recreate
  * PUBLISHED menu: default moved BEFORE the old menu is deleted
  * alias re-point or set-default failure → abort, old menu intact (AC4)
  * old-menu delete failure tolerated (warning, still success)
  * users without a stored LINE id skipped + warned, never fatal
  * PUT flags PENDING only on a real config change (AC6)
  * upload already-uploaded → PENDING (new image is local-only until Sync)

Patterns mirror test_rich_menu_image_media.py (_SeqDB + patch.object mocks).
"""
import asyncio
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.rich_menu import RichMenuSyncStatus
from app.services import rich_menu_service as service_module
from app.services.rich_menu_service import RichMenuService

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

AREA_URI = {
    "bounds": {"x": 0, "y": 0, "width": 2500, "height": 843},
    "action": {
        "type": "uri", "label": None, "uri": "https://example.com",
        "text": None, "data": None, "displayText": None, "richMenuAliasId": None,
    },
}
AREA_MSG = {
    "bounds": {"x": 0, "y": 0, "width": 2500, "height": 843},
    "action": {
        "type": "message", "label": None, "uri": None,
        "text": "hello", "data": None, "displayText": None, "richMenuAliasId": None,
    },
}


def _config(areas):
    return {
        "size": {"width": 2500, "height": 843},
        "selected": False,
        "name": "Menu A",
        "chatBarText": "menu",
        "areas": areas,
    }


def _menu(id=1, line_id="richmenu-old", status="DRAFT", sync_status="SYNCED",
          config=None, image_media_id=None):
    return SimpleNamespace(
        id=id,
        name="Menu A",
        chat_bar_text="menu",
        line_rich_menu_id=line_id,
        image_media_id=image_media_id,
        config=config if config is not None else _config([AREA_URI]),
        status=status,
        sync_status=sync_status,
        last_synced_at=None,
        last_sync_error=None,
        created_at=datetime(2026, 1, 1),
        updated_at=None,
    )


class _Result:
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
    """Preset-results session stand-in (same contract as the image-media tests)."""

    def __init__(self, results=None, gets=None):
        self._results = list(results or [])
        self._gets = list(gets or [])
        self.commits = 0

    async def execute(self, stmt):
        value = self._results.pop(0) if self._results else None
        return _Result(value)

    async def get(self, model, pk):
        return self._gets.pop(0) if self._gets else None

    def add(self, obj):
        pass

    async def delete(self, obj):
        pass

    async def flush(self):
        pass

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        pass

    async def rollback(self):
        pass


def _media(size=None):
    return SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001",
        data=PNG_MAGIC,
        mime_type="image/png",
        size_bytes=size if size is not None else len(PNG_MAGIC),
    )


def _alias(alias_id="alias-a", rich_menu_id=1):
    return SimpleNamespace(alias_id=alias_id, rich_menu_id=rich_menu_id)


def _user(uid=1, token="token-1"):
    return SimpleNamespace(id=uid, line_user_id_encrypted=token)


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# No drift → green no-op (AC2 regression)
# ---------------------------------------------------------------------------


def test_sync_no_drift_is_green_noop():
    """SYNCED menu whose config matches LINE's copy must not be recreated."""
    menu = _menu(sync_status="SYNCED", config=_config([AREA_URI]))
    line_copy = _config([AREA_URI])
    db = _SeqDB([menu])
    with patch.object(RichMenuService, "get_from_line",
                      new=AsyncMock(return_value=line_copy)), \
         patch.object(RichMenuService, "create_on_line", new=AsyncMock()) as create:
        result = _run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is True
    assert result["message"] == "Already synced with LINE"
    assert menu.line_rich_menu_id == "richmenu-old"
    create.assert_not_called()


# ---------------------------------------------------------------------------
# Drift → recreate
# ---------------------------------------------------------------------------


def test_sync_recreates_on_config_drift_and_moves_bindings():
    """Edited areas (message vs uri) → new menu created, image uploaded to the
    NEW id, alias re-pointed, users re-linked, old deleted, id swapped."""
    menu = _menu(sync_status="SYNCED", config=_config([AREA_MSG]),
                 image_media_id="00000000-0000-0000-0000-000000000001")
    line_copy = _config([AREA_URI])  # LINE still has the old action
    db = _SeqDB(
        results=[menu, [_alias("alias-a", 1)], [_user(1, "tok-1"), _user(2, "tok-2")]],
        gets=[_media()],
    )
    order = []

    async def _create(db_, config):
        order.append("create")
        assert config == menu.config
        return "richmenu-new"

    async def _upload(db_, line_id, data, mime):
        order.append(f"upload:{line_id}")

    async def _alias_put(db_, alias_id, line_id):
        order.append(f"alias:{alias_id}->{line_id}")

    async def _bulk(db_, line_id, user_ids):
        order.append(f"bulk:{line_id}:{len(user_ids)}")

    async def _delete(db_, line_id):
        order.append(f"delete:{line_id}")

    with patch.object(RichMenuService, "get_from_line",
                      new=AsyncMock(return_value=line_copy)), \
         patch.object(RichMenuService, "create_on_line", new=_create), \
         patch.object(RichMenuService, "upload_image_to_line", new=_upload), \
         patch.object(RichMenuService, "update_alias_on_line", new=_alias_put), \
         patch.object(RichMenuService, "bulk_link", new=_bulk), \
         patch.object(RichMenuService, "delete_from_line", new=_delete), \
         patch.object(service_module, "decrypt_user_line_id",
                      side_effect=lambda u: f"U{u.id:032x}"), \
         patch.object(RichMenuService, "set_default_on_line", new=AsyncMock()) as set_default:
        result = _run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is True
    assert result["recreated"] is True
    assert result["line_rich_menu_id"] == "richmenu-new"
    assert menu.line_rich_menu_id == "richmenu-new"
    assert menu.sync_status == RichMenuSyncStatus.SYNCED.value
    # DRAFT menu: the default must NOT move
    set_default.assert_not_called()
    # Order: create → upload(new) → alias → bulk(new) → delete(old)
    assert order == [
        "create",
        "upload:richmenu-new",
        "alias:alias-a->richmenu-new",
        "bulk:richmenu-new:2",
        "delete:richmenu-old",
    ]


def test_sync_recreates_published_menu_moves_default_before_delete():
    """PUBLISHED menu: default moves to the new id BEFORE the old menu dies
    (LINE refuses deleting the current default)."""
    menu = _menu(status="PUBLISHED", sync_status="SYNCED",
                 config=_config([AREA_MSG]))
    line_copy = _config([AREA_URI])
    db = _SeqDB([menu, [], []])  # menu, aliases(none), linked users(none)
    order = []

    async def _default(db_, line_id):
        order.append(f"default:{line_id}")

    async def _delete(db_, line_id):
        order.append(f"delete:{line_id}")

    with patch.object(RichMenuService, "get_from_line",
                      new=AsyncMock(return_value=line_copy)), \
         patch.object(RichMenuService, "create_on_line",
                      new=AsyncMock(return_value="richmenu-new")), \
         patch.object(RichMenuService, "set_default_on_line", new=_default), \
         patch.object(RichMenuService, "delete_from_line", new=_delete):
        result = _run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is True
    assert order == ["default:richmenu-new", "delete:richmenu-old"]


def test_sync_recreates_on_pending_flag_covers_replaced_image():
    """sync_status PENDING (image replaced locally) recreates even when the
    config projections are equal — the config compare cannot see image drift."""
    menu = _menu(sync_status="PENDING", config=_config([AREA_URI]),
                 image_media_id="00000000-0000-0000-0000-000000000001")
    line_copy = _config([AREA_URI])  # identical config
    db = _SeqDB([menu, [], []], gets=[_media()])

    with patch.object(RichMenuService, "get_from_line",
                      new=AsyncMock(return_value=line_copy)), \
         patch.object(RichMenuService, "create_on_line",
                      new=AsyncMock(return_value="richmenu-new")), \
         patch.object(RichMenuService, "upload_image_to_line",
                      new=AsyncMock(return_value={})), \
         patch.object(RichMenuService, "delete_from_line",
                      new=AsyncMock(return_value=200)):
        result = _run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is True
    assert result["recreated"] is True


# ---------------------------------------------------------------------------
# Abort semantics — the old menu stays live (AC4)
# ---------------------------------------------------------------------------


def test_sync_recreate_aborts_when_alias_repoint_fails():
    """Alias PUT+POST both failing aborts BEFORE any destructive step: the new
    menu is cleaned up, the old id is kept, sync lands FAILED."""
    menu = _menu(sync_status="SYNCED", config=_config([AREA_MSG]))
    line_copy = _config([AREA_URI])
    db = _SeqDB([menu, [_alias("alias-a", 1)], []])
    deleted = []

    async def _fail_put(db_, alias_id, line_id):
        raise RuntimeError("put exploded")

    async def _fail_post(db_, alias_id, line_id):
        raise RuntimeError("post exploded")

    async def _delete(db_, line_id):
        deleted.append(line_id)

    with patch.object(RichMenuService, "get_from_line",
                      new=AsyncMock(return_value=line_copy)), \
         patch.object(RichMenuService, "create_on_line",
                      new=AsyncMock(return_value="richmenu-new")), \
         patch.object(RichMenuService, "update_alias_on_line", new=_fail_put), \
         patch.object(RichMenuService, "create_alias_on_line", new=_fail_post), \
         patch.object(RichMenuService, "delete_from_line", new=_delete):
        result = _run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is False
    assert result["sync_status"] == RichMenuSyncStatus.FAILED.value
    assert "alias-a" in result["message"]
    assert menu.line_rich_menu_id == "richmenu-old"  # kept
    assert menu.sync_status == RichMenuSyncStatus.FAILED.value
    # only the fresh (imageless) menu is cleaned up — the old one survives
    assert deleted == ["richmenu-new"]


def test_sync_recreate_aborts_when_set_default_fails():
    menu = _menu(status="PUBLISHED", sync_status="SYNCED",
                 config=_config([AREA_MSG]))
    line_copy = _config([AREA_URI])
    db = _SeqDB([menu, [], []])
    deleted = []

    async def _delete(db_, line_id):
        deleted.append(line_id)

    with patch.object(RichMenuService, "get_from_line",
                      new=AsyncMock(return_value=line_copy)), \
         patch.object(RichMenuService, "create_on_line",
                      new=AsyncMock(return_value="richmenu-new")), \
         patch.object(RichMenuService, "set_default_on_line",
                      new=AsyncMock(side_effect=RuntimeError("LINE 400"))), \
         patch.object(RichMenuService, "delete_from_line", new=_delete):
        result = _run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is False
    assert "เมนูหลัก" in result["message"]
    assert menu.line_rich_menu_id == "richmenu-old"
    assert deleted == ["richmenu-new"]  # cleanup only; old menu untouched


def test_sync_recreate_tolerates_old_menu_delete_failure():
    """Old-menu delete failing is a warning, not an error — the local record
    already points at the new id, a leftover old copy on LINE is inert."""
    menu = _menu(sync_status="SYNCED", config=_config([AREA_MSG]))
    line_copy = _config([AREA_URI])
    db = _SeqDB([menu, [], []])

    async def _fail(db_, line_id):
        raise RuntimeError("LINE 500")

    with patch.object(RichMenuService, "get_from_line",
                      new=AsyncMock(return_value=line_copy)), \
         patch.object(RichMenuService, "create_on_line",
                      new=AsyncMock(return_value="richmenu-new")), \
         patch.object(RichMenuService, "delete_from_line", new=_fail):
        result = _run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is True
    assert any("ลบเมนูเดิม" in w for w in result.get("warnings", []))
    assert menu.line_rich_menu_id == "richmenu-new"


def test_sync_recreate_failfast_oversize_image_before_create():
    """The 1 MB cap is enforced BEFORE creating anything on LINE (no fresh
    imageless menu stranded there)."""
    menu = _menu(sync_status="PENDING", config=_config([AREA_MSG]),
                 image_media_id="00000000-0000-0000-0000-000000000001")
    line_copy = _config([AREA_URI])
    db = _SeqDB([menu, [], []], gets=[_media(size=2 * 1024 * 1024)])

    with patch.object(RichMenuService, "get_from_line",
                      new=AsyncMock(return_value=line_copy)), \
         patch.object(RichMenuService, "create_on_line", new=AsyncMock()) as create:
        result = _run(RichMenuService.sync_with_idempotency(db, 1))

    assert result["success"] is False
    assert "1 MB" in result["message"]
    create.assert_not_called()


# ---------------------------------------------------------------------------
# Per-user re-linking
# ---------------------------------------------------------------------------


def test_linked_line_user_ids_skips_users_without_stored_line_id():
    db = _SeqDB([[_user(1, "tok-1"), _user(2, None), _user(3, "tok-3")]])
    with patch.object(service_module, "decrypt_user_line_id",
                      side_effect=lambda u: f"U{u.id:032x}"):
        line_ids, skipped = _run(RichMenuService._linked_line_user_ids(db, 7))

    assert line_ids == [f"U{1:032x}", f"U{3:032x}"]
    assert skipped == [2]


# ---------------------------------------------------------------------------
# PUT flags PENDING only on a real change (AC6)
# ---------------------------------------------------------------------------


def _put_kwargs():
    return {
        "json": {
            "name": "Menu A",
            "chat_bar_text": "menu",
            "areas": [
                {
                    "bounds": {"x": 0, "y": 0, "width": 2500, "height": 843},
                    "action": {"type": "uri", "uri": "https://example.com"},
                }
            ],
        },
    }


def _put_client(menu):
    from fastapi.testclient import TestClient
    from app.api import deps
    from app.core.permissions import invalidate_cache
    from app.db.session import get_db as session_get_db
    from app.main import app
    from app.models.user import UserRole

    invalidate_cache()
    db = _SeqDB([menu])

    async def _get_db():
        yield db

    def _make_user():
        return SimpleNamespace(
            id=7, username="tester", display_name="Tester",
            role=UserRole.ADMIN, is_active=True,
        )

    async def _get_current_user():
        return _make_user()

    app.dependency_overrides[session_get_db] = _get_db
    app.dependency_overrides[deps.get_current_user] = _get_current_user
    client = TestClient(app)
    return client, db


def _clear_overrides():
    from app.api import deps  # noqa: F401
    from app.core.permissions import invalidate_cache
    from app.main import app

    app.dependency_overrides.clear()
    invalidate_cache()


def test_put_flags_pending_when_config_changes_on_synced_menu():
    from app.models.user import UserRole  # noqa: F401

    menu = _menu(sync_status="SYNCED", config=_config([AREA_MSG]))
    client, db = _put_client(menu)
    try:
        resp = client.put("/api/v1/admin/rich-menus/1", **_put_kwargs())
    finally:
        client.close()
        _clear_overrides()

    assert resp.status_code == 200
    assert resp.json()["sync_status"] == "PENDING"
    assert menu.sync_status == "PENDING"


def test_put_keeps_synced_on_noop_save():
    menu = _menu(sync_status="SYNCED", config=_config([AREA_URI]))
    client, db = _put_client(menu)
    try:
        resp = client.put("/api/v1/admin/rich-menus/1", **_put_kwargs())
    finally:
        client.close()
        _clear_overrides()

    assert resp.status_code == 200
    assert resp.json()["sync_status"] == "SYNCED"
    assert menu.sync_status == "SYNCED"


# ---------------------------------------------------------------------------
# Upload already-uploaded → PENDING (AC5/AC6 image half)
# ---------------------------------------------------------------------------


def test_upload_already_uploaded_flags_pending(monkeypatch):
    """Replacing the image of a synced menu: LINE keeps its old image (uploads
    happen once per id), so the menu must read PENDING — the new bytes go up
    with the next Sync's recreate."""
    from app.api import deps
    from app.core.permissions import invalidate_cache
    from app.db.session import get_db as session_get_db
    from app.main import app
    from app.models.user import UserRole

    invalidate_cache()
    menu = _menu(sync_status="SYNCED",
                 image_media_id="00000000-0000-0000-0000-000000000001")
    db = _SeqDB([menu], gets=[_media()])

    async def _get_db():
        yield db

    async def _get_current_user():
        return SimpleNamespace(
            id=7, username="tester", display_name="Tester",
            role=UserRole.ADMIN, is_active=True,
        )

    app.dependency_overrides[session_get_db] = _get_db
    app.dependency_overrides[deps.get_current_user] = _get_current_user
    from fastapi.testclient import TestClient

    client = TestClient(app)
    try:
        with patch.object(
            RichMenuService, "push_image_to_line",
            new=AsyncMock(return_value={"already_uploaded": True}),
        ):
            resp = client.post(
                "/api/v1/admin/rich-menus/1/upload",
                files={"file": ("new.png", PNG_MAGIC + b"rest", "image/png")},
            )
    finally:
        client.close()
        _clear_overrides()

    assert resp.status_code == 200
    assert resp.json()["already_uploaded"] is True
    assert menu.sync_status == "PENDING"
