"""Endpoint test for the rich-menu LIST `user_link_count` enrichment.

`GET /admin/rich-menus` must report, per menu, how many users are currently
bound to it (rows in `user_rich_menu_links`). The count is computed with a
single grouped query (no N+1), mirroring the refollow_count enrichment in
admin_friends.list_friends.

Uses the same _SeqDB + dependency_overrides stand-in style as
test_rich_menu_peruser_endpoints.py — no real DB is touched.
"""
from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import deps
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.rich_menu import RichMenuStatus
from app.models.user import UserRole

BASE = "/api/v1/admin/rich-menus"


class _Result:
    """Mimics a SQLAlchemy Result for both .scalars().all() and .all()."""

    def __init__(self, value):
        self._value = value

    def scalars(self):
        return self

    def all(self):
        return self._value if isinstance(self._value, list) else []


class _SeqDB:
    """execute() returns preset results in order: 1st = menus, 2nd = counts."""

    def __init__(self, results):
        self._results = list(results)

    async def execute(self, stmt):
        value = self._results.pop(0) if self._results else None
        return _Result(value)


def _full_menu(id=1, name="Menu"):
    """A namespace with every field RichMenuResponse requires."""
    return SimpleNamespace(
        id=id,
        name=name,
        chat_bar_text="menu",
        line_rich_menu_id="richmenu-x",
        config={},
        image_path=None,
        status=RichMenuStatus.DRAFT,
        sync_status="PENDING",
        last_synced_at=None,
        last_sync_error=None,
        created_at=datetime(2026, 1, 1),
        updated_at=None,
    )


def _override(results):
    db = _SeqDB(results)

    async def _get_db():
        yield db

    async def _get_admin():
        return SimpleNamespace(id=1, username="admin", role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[session_get_db] = _get_db
    app.dependency_overrides[deps.get_current_admin] = _get_admin


def _clear():
    app.dependency_overrides.clear()


def test_list_rich_menus_includes_user_link_count():
    menus = [_full_menu(id=1, name="A"), _full_menu(id=2, name="B")]
    # 1st execute -> menus; 2nd execute -> grouped (rich_menu_id, count) rows.
    # Only menu 1 has links (3); menu 2 is absent -> must default to 0.
    _override(results=[menus, [(1, 3)]])
    client = TestClient(app)
    try:
        resp = client.get(BASE)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    data = resp.json()
    counts = {m["id"]: m["user_link_count"] for m in data}
    assert counts[1] == 3
    assert counts[2] == 0
