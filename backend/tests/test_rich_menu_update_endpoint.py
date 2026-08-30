"""Endpoint tests for PUT /admin/rich-menus/{id} (the edit-save path).

Locks in the Phase 5.2 fix: the edit page sends {name, chat_bar_text, areas}
(no template_type, since the layout is fixed after creation). The endpoint must
accept RichMenuUpdate — NOT RichMenuCreate — so that payload no longer 422s, and
it must preserve the canvas size already stored in config instead of re-deriving
it from a template_type it no longer receives.

Mirrors the _SeqDB + dependency_overrides style of test_rich_menu_delete_guard.py.
The menu carries full RichMenuResponse fields so the 200 response serialises.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import deps
from app.core.permissions import invalidate_cache
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.rich_menu import RichMenuStatus
from app.models.user import UserRole

BASE = "/api/v1/admin/rich-menus"


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _SeqDB:
    def __init__(self, results):
        self._results = list(results)

    async def execute(self, stmt):
        value = self._results.pop(0) if self._results else None
        return _Result(value)

    def add(self, obj):
        pass

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass


def _make_user(role: UserRole):
    return SimpleNamespace(
        id=7, username="tester", display_name="Tester", role=role, is_active=True
    )


def _override(role=None, results=None):
    invalidate_cache()
    db = _SeqDB(results or [])

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


def _menu_full(size=None):
    """A RichMenu row with every field RichMenuResponse serialises.

    `size` seeds the stored config.size so a test can prove the endpoint
    preserves it rather than re-deriving from a (now absent) template_type.
    """
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=1,
        name="Original",
        chat_bar_text="Original Bar",
        line_rich_menu_id=None,
        config={"size": size or {"width": 2500, "height": 843}, "areas": []},
        image_media_id=None,
        status=RichMenuStatus.DRAFT,
        sync_status="PENDING",
        last_synced_at=None,
        last_sync_error=None,
        created_at=now,
        updated_at=None,
    )


def _uri_area():
    return {
        "bounds": {"x": 0, "y": 0, "width": 2500, "height": 843},
        "action": {"type": "uri", "uri": "https://example.com", "label": "Open"},
    }


def _switch_area(alias_id="menu-b"):
    action = {"type": "richmenuswitch", "label": "Switch"}
    if alias_id is not None:
        action["richMenuAliasId"] = alias_id
    return {"bounds": {"x": 0, "y": 0, "width": 2500, "height": 843}, "action": action}


# ---------------------------------------------------------------------------
# Payload shape — RichMenuUpdate (no template_type)
# ---------------------------------------------------------------------------


def test_update_accepts_payload_without_template_type():
    # The edit page sends no template_type; this must NOT 422 anymore.
    _override(role=UserRole.ADMIN, results=[_menu_full()])
    payload = {"name": "Updated", "chat_bar_text": "New Bar", "areas": [_uri_area()]}
    client = TestClient(app)
    try:
        resp = client.put(f"{BASE}/1", json=payload)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Updated"
    assert body["chat_bar_text"] == "New Bar"


def test_update_preserves_existing_canvas_size():
    # Stored size is compact (843). The endpoint must keep it, not re-derive a
    # default large (1686) from a missing template_type.
    _override(role=UserRole.ADMIN, results=[_menu_full(size={"width": 2500, "height": 843})])
    payload = {"name": "Updated", "chat_bar_text": "Bar", "areas": [_uri_area()]}
    client = TestClient(app)
    try:
        resp = client.put(f"{BASE}/1", json=payload)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    assert resp.json()["config"]["size"] == {"width": 2500, "height": 843}


# ---------------------------------------------------------------------------
# richmenuswitch validator still applies on the edit path
# ---------------------------------------------------------------------------


def test_update_accepts_richmenuswitch_with_alias():
    _override(role=UserRole.ADMIN, results=[_menu_full()])
    payload = {"name": "Switcher", "chat_bar_text": "Bar", "areas": [_switch_area("menu-b")]}
    client = TestClient(app)
    try:
        resp = client.put(f"{BASE}/1", json=payload)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200


def test_update_rejects_richmenuswitch_without_alias():
    # Validator (model_validator return self) rejects before the endpoint runs.
    _override(role=UserRole.ADMIN, results=[_menu_full()])
    payload = {"name": "Bad", "chat_bar_text": "Bar", "areas": [_switch_area(alias_id=None)]}
    client = TestClient(app)
    try:
        resp = client.put(f"{BASE}/1", json=payload)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 422


def test_update_404_when_menu_missing():
    _override(role=UserRole.ADMIN, results=[None])
    payload = {"name": "X", "chat_bar_text": "Y", "areas": [_uri_area()]}
    client = TestClient(app)
    try:
        resp = client.put(f"{BASE}/999", json=payload)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404


def test_update_forbidden_for_agent():
    _override(role=UserRole.AGENT)
    payload = {"name": "X", "chat_bar_text": "Y", "areas": [_uri_area()]}
    client = TestClient(app)
    try:
        resp = client.put(f"{BASE}/1", json=payload)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 403
