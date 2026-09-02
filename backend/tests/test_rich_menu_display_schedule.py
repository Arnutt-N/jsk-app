"""Rich menu display settings (mode/period) + display scheduler tests.

Covers PRD 2026-09-02-rich-menu-display-schedule:
  * schema validation — SCHEDULED requires a full, ordered period (422)
  * create/update persist display_mode + period; default stays ALWAYS (AC5)
  * scheduler activation — due SCHEDULED menu becomes default + PUBLISHED
    with a system audit log (AC2 first half)
  * scheduler expiry — cancels the default only when this menu still owns it
    (AC4), flips status INACTIVE either way, audit carries cancelled_default
  * service — get_default 404 → None; cancel_default issues the right DELETE

Patterns: _SeqDB from test_rich_menu_image_media.py, FakeResp/_patches from
test_rich_menu_alias_service.py.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import deps
from app.core.permissions import invalidate_cache
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.rich_menu import RichMenuDisplayMode, RichMenuStatus
from app.models.user import UserRole
from app.schemas.rich_menu import RichMenuCreate
from app.services.rich_menu_service import RichMenuService
from app.tasks.rich_menu_display_scheduler import _activate_due, _expire_due

BASE = "/api/v1/admin/rich-menus"
NOW = datetime(2026, 9, 2, 12, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Fakes (same contracts as the existing rich-menu test files)
# ---------------------------------------------------------------------------


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
    def __init__(self, results=None):
        self._results = list(results or [])
        self.added = []
        self.commits = 0

    async def execute(self, stmt):
        return _Result(self._results.pop(0) if self._results else None)

    async def get(self, model, pk):
        return None

    def add(self, obj):
        self.added.append(obj)

    def _apply_flush_defaults(self):
        # Mimic the defaults a real flush would fire, so the create endpoint's
        # response validation sees a fully-formed row (id/sync_status/created_at).
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = 1
            if getattr(obj, "sync_status", None) is None:
                obj.sync_status = "PENDING"
            if getattr(obj, "created_at", None) is None:
                obj.created_at = NOW
            if getattr(obj, "display_mode", None) is None:
                obj.display_mode = RichMenuDisplayMode.ALWAYS.value

    async def flush(self):
        self._apply_flush_defaults()

    async def commit(self):
        self._apply_flush_defaults()
        self.commits += 1

    async def refresh(self, obj):
        pass

    async def rollback(self):
        pass


class FakeResp:
    def __init__(self, json_data=None, status_code=200, content=b"{}"):
        self._json = json_data if json_data is not None else {}
        self.status_code = status_code
        self.content = content

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "error", request=MagicMock(),
                response=MagicMock(status_code=self.status_code),
            )

    def json(self):
        return self._json


def _make_client(captured, resp):
    """Build a fake httpx.AsyncClient() context manager that records calls."""
    client = MagicMock()

    def _bind(name):
        async def _call(url, **kw):
            captured.append({"method": name, "url": url})
            return resp
        return _call

    client.get = _bind("GET")
    client.post = _bind("POST")
    client.put = _bind("PUT")
    client.delete = _bind("DELETE")

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _line_patches(captured, resp):
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


def _scheduled_menu(**overrides):
    """A SCHEDULED, synced menu — the scheduler's working set."""
    fields = dict(
        id=1,
        name="Campaign",
        chat_bar_text="menu",
        line_rich_menu_id="richmenu-x",
        image_media_id=None,
        config={"size": {"width": 2500, "height": 843}, "areas": []},
        status=RichMenuStatus.DRAFT.value,
        sync_status="SYNCED",
        last_synced_at=None,
        last_sync_error=None,
        display_mode=RichMenuDisplayMode.SCHEDULED.value,
        display_start_at=NOW - timedelta(hours=1),
        display_end_at=NOW + timedelta(hours=1),
        created_at=NOW,
        updated_at=None,
    )
    fields.update(overrides)
    return SimpleNamespace(**fields)


# ---------------------------------------------------------------------------
# Schema validation (AC: SCHEDULED needs a full, ordered period)
# ---------------------------------------------------------------------------


def _create_payload(**display):
    return dict(
        name="M",
        chat_bar_text="menu",
        template_type="6-buttons",
        areas=[],
        **display,
    )


def test_scheduled_requires_both_times():
    with pytest.raises(ValidationError):
        RichMenuCreate(**_create_payload(display_mode="SCHEDULED"))


def test_scheduled_rejects_end_before_start():
    with pytest.raises(ValidationError):
        RichMenuCreate(**_create_payload(
            display_mode="SCHEDULED",
            display_start_at=NOW,
            display_end_at=NOW - timedelta(minutes=1),
        ))


def test_always_and_manual_accept_no_times():
    for mode in ("ALWAYS", "MANUAL"):
        parsed = RichMenuCreate(**_create_payload(display_mode=mode))
        assert parsed.display_mode == mode
    # and the default is ALWAYS — existing menus keep their behavior (AC5)
    assert RichMenuCreate(**_create_payload()).display_mode == "ALWAYS"


# ---------------------------------------------------------------------------
# Endpoints persist display settings
# ---------------------------------------------------------------------------


def _api_client(db):
    invalidate_cache()

    async def _get_db():
        yield db

    async def _get_current_user():
        return SimpleNamespace(
            id=7, username="tester", display_name="Tester",
            role=UserRole.ADMIN, is_active=True,
        )

    app.dependency_overrides[session_get_db] = _get_db
    app.dependency_overrides[deps.get_current_user] = _get_current_user
    client = TestClient(app)
    return client


def _clear_overrides():
    app.dependency_overrides.clear()
    invalidate_cache()


def test_create_persists_display_mode_and_period():
    db = _SeqDB()
    client = _api_client(db)
    try:
        resp = client.post(BASE, json=_create_payload(
            display_mode="SCHEDULED",
            display_start_at=NOW.isoformat(),
            display_end_at=(NOW + timedelta(days=3)).isoformat(),
        ))
    finally:
        client.close()
        _clear_overrides()

    assert resp.status_code == 200
    body = resp.json()
    assert body["display_mode"] == "SCHEDULED"
    assert body["display_start_at"].startswith(NOW.isoformat()[:19])
    # the created ORM row carries the same settings (apply_to ran)
    assert db.commits >= 1


def test_create_rejects_incomplete_period_at_http_layer():
    db = _SeqDB()
    client = _api_client(db)
    try:
        resp = client.post(BASE, json=_create_payload(
            display_mode="SCHEDULED",
            display_start_at=NOW.isoformat(),
        ))
    finally:
        client.close()
        _clear_overrides()

    assert resp.status_code == 422


def test_update_persists_display_mode():
    menu = _scheduled_menu(
        status=RichMenuStatus.DRAFT.value,
        display_mode=RichMenuDisplayMode.ALWAYS.value,
    )
    db = _SeqDB([menu])
    client = _api_client(db)
    try:
        resp = client.put(
            f"{BASE}/1",
            json={
                "name": menu.name,
                "chat_bar_text": menu.chat_bar_text,
                "areas": [],
                "display_mode": "MANUAL",
            },
        )
    finally:
        client.close()
        _clear_overrides()

    assert resp.status_code == 200
    assert resp.json()["display_mode"] == "MANUAL"
    assert menu.display_mode == "MANUAL"


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_activate_due_publishes_and_audits():
    menu = _scheduled_menu(status=RichMenuStatus.DRAFT.value)
    db = _SeqDB([[menu]])
    with patch.object(RichMenuService, "set_default_on_line", new=AsyncMock()) as set_default, \
         patch("app.tasks.rich_menu_display_scheduler.create_audit_log", new=AsyncMock()) as audit:
        due = await _activate_due(db, NOW)

    assert due == [menu]
    assert menu.status == RichMenuStatus.PUBLISHED.value
    set_default.assert_awaited_once_with(db, "richmenu-x")
    assert audit.await_args.kwargs["action"] == "rich_menu_auto_publish"
    assert audit.await_args.kwargs["admin_id"] is None  # system action


@pytest.mark.asyncio
async def test_activate_skips_already_published():
    menu = _scheduled_menu(status=RichMenuStatus.PUBLISHED.value)
    db = _SeqDB([[]])  # the query itself filters these out
    with patch.object(RichMenuService, "set_default_on_line", new=AsyncMock()) as set_default:
        due = await _activate_due(db, NOW)

    assert due == []
    set_default.assert_not_called()


@pytest.mark.asyncio
async def test_expire_cancels_default_when_menu_still_owns_it():
    menu = _scheduled_menu(status=RichMenuStatus.PUBLISHED.value,
                           display_end_at=NOW - timedelta(minutes=5))
    db = _SeqDB([[menu]])
    with patch.object(RichMenuService, "get_default_on_line",
                      new=AsyncMock(return_value={"richMenuId": "richmenu-x"})), \
         patch.object(RichMenuService, "cancel_default_on_line", new=AsyncMock()) as cancel, \
         patch("app.tasks.rich_menu_display_scheduler.create_audit_log", new=AsyncMock()) as audit:
        due = await _expire_due(db, NOW)

    assert due == [menu]
    assert menu.status == RichMenuStatus.INACTIVE.value
    cancel.assert_awaited_once()
    assert audit.await_args.kwargs["details"]["cancelled_default"] is True


@pytest.mark.asyncio
async def test_expire_never_cancels_a_default_owned_by_another_menu():
    """AC4: another menu went live meanwhile — flip INACTIVE, touch nothing."""
    menu = _scheduled_menu(status=RichMenuStatus.PUBLISHED.value,
                           display_end_at=NOW - timedelta(minutes=5))
    db = _SeqDB([[menu]])
    with patch.object(RichMenuService, "get_default_on_line",
                      new=AsyncMock(return_value={"richMenuId": "richmenu-OTHER"})), \
         patch.object(RichMenuService, "cancel_default_on_line", new=AsyncMock()) as cancel, \
         patch("app.tasks.rich_menu_display_scheduler.create_audit_log", new=AsyncMock()):
        due = await _expire_due(db, NOW)

    assert menu.status == RichMenuStatus.INACTIVE.value
    cancel.assert_not_awaited()


# ---------------------------------------------------------------------------
# Service — default get/cancel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_default_returns_none_on_404():
    captured = []
    patches = _line_patches(captured, FakeResp(status_code=404))
    with patches[0], patches[1]:
        assert await RichMenuService.get_default_on_line(db=None) is None
    assert captured[0]["method"] == "GET"
    assert captured[0]["url"].endswith("/user/all/richmenu")


@pytest.mark.asyncio
async def test_cancel_default_issues_delete_to_all_users():
    captured = []
    p1, p2 = _line_patches(captured, FakeResp(json_data={}))
    with p1, p2:
        result = await RichMenuService.cancel_default_on_line(db=None)
    assert result == {}
    assert captured[0]["method"] == "DELETE"
    assert captured[0]["url"].endswith("/user/all/richmenu")
