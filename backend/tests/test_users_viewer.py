"""VIEWER role: read-only observer (menus 1-5 GET only).

Unit tests (no DB): enum membership, permission matrix, PII masking.
Integration tests (need Postgres+Redis): VIEWER GET 200 on allow-listed
routes, 403 on writes and closed routes. Integration tests skip gracefully
when services are unreachable (local runs without docker).

Isolation recipe: same as test_taxonomy_patch_regression.py -- throwaway
NullPool engine, real HTTP via TestClient with get_db + get_current_user
overridden. No fixture rows needed: empty tables still prove the gates.
"""
import socket
from types import SimpleNamespace
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps
from app.core.config import settings
from app.core.permissions import (
    KEY_ACCESS_ADMIN_ENDPOINTS,
    KEY_ACCESS_LIVE_CHAT,
    KEY_ACCESS_MANAGER_ENDPOINTS,
    KEY_ACCESS_STAFF_ENDPOINTS,
    KEY_EDIT_SETTINGS,
    KEY_EXPORT_CHAT,
    KEY_MANAGE_BROADCAST,
    KEY_MANAGE_FILES,
    KEY_MANAGE_REPLY_OBJECTS,
    KEY_MANAGE_RICH_MENUS,
    KEY_MANAGE_USERS,
    KEY_VIEW_AUDIT_LOG,
    KEY_VIEW_REPORTS,
    can,
)
from app.core.pii_masking import (
    is_readonly_viewer,
    mask_email,
    mask_line_id,
    mask_phone,
    mask_viewer_contacts,
)
from app.main import app
from app.models.user import UserRole


def _viewer_user():
    return SimpleNamespace(id=999, username="viewer", display_name="Viewer", role=UserRole.VIEWER)


def _db_reachable() -> bool:
    parsed = urlparse(str(settings.DATABASE_URL).replace("postgresql+asyncpg://", "postgresql://", 1))
    try:
        with socket.create_connection((parsed.hostname or "127.0.0.1", parsed.port or 5432), timeout=2):
            return True
    except OSError:
        return False


needs_db = pytest.mark.skipif(not _db_reachable(), reason="Postgres unreachable (start docker services)")


def _fresh_session_factory():
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _client_with_viewer(Session):
    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_user] = _viewer_user
    return TestClient(app, raise_server_exceptions=False)


# --- Unit: enum + permission matrix (no DB) -------------------------------


def test_viewer_in_user_role_enum():
    assert UserRole.VIEWER.value == "VIEWER"


def test_viewer_can_view_reports_only():
    assert can(UserRole.VIEWER, KEY_VIEW_REPORTS) is True
    for key in (
        KEY_MANAGE_BROADCAST,
        KEY_MANAGE_REPLY_OBJECTS,
        KEY_MANAGE_RICH_MENUS,
        KEY_MANAGE_USERS,
        KEY_MANAGE_FILES,
        KEY_EXPORT_CHAT,
        KEY_VIEW_AUDIT_LOG,
        KEY_EDIT_SETTINGS,
        KEY_ACCESS_ADMIN_ENDPOINTS,
        KEY_ACCESS_MANAGER_ENDPOINTS,
        KEY_ACCESS_STAFF_ENDPOINTS,
        KEY_ACCESS_LIVE_CHAT,
    ):
        assert can(UserRole.VIEWER, key) is False, key


def test_existing_roles_unchanged_by_viewer():
    assert can(UserRole.ADMIN, KEY_MANAGE_BROADCAST) is True
    assert can(UserRole.DIRECTOR, KEY_VIEW_REPORTS) is True
    assert can(UserRole.DIRECTOR, KEY_MANAGE_BROADCAST) is False
    assert can(UserRole.AGENT, KEY_ACCESS_STAFF_ENDPOINTS) is True
    assert can(UserRole.AGENT, KEY_VIEW_REPORTS) is False


def test_is_readonly_viewer():
    assert is_readonly_viewer(UserRole.VIEWER) is True
    assert is_readonly_viewer("VIEWER") is True
    assert is_readonly_viewer(UserRole.ADMIN) is False
    assert is_readonly_viewer(None) is False


def test_viewer_pii_masked_server_side():
    line_id, phone, email = "Udeadbeef1234567890", "0812345678", "viewer@example.com"
    assert mask_line_id(line_id, UserRole.VIEWER) != line_id
    assert mask_phone(phone, UserRole.VIEWER) != phone
    masked_email = mask_email(email, UserRole.VIEWER)
    assert masked_email != email
    assert masked_email.endswith("@example.com")
    assert "viewer" not in (masked_email or "")


def test_staff_pii_unchanged():
    line_id, phone, email = "Udeadbeef1234567890", "0812345678", "op@example.com"
    assert mask_line_id(line_id, UserRole.ADMIN) == line_id
    assert mask_phone(phone, UserRole.SUPER_ADMIN) == phone
    assert mask_email(email, UserRole.ADMIN) == email


def test_mask_viewer_contacts_only_for_viewer():
    payload = {"line_user_id": "Udeadbeef1234", "phone_number": "0812345678", "email": "a@b.co", "status": "PENDING"}
    masked = mask_viewer_contacts(dict(payload), UserRole.VIEWER)
    assert masked["line_user_id"] != payload["line_user_id"]
    assert masked["phone_number"] != payload["phone_number"]
    assert masked["email"] != payload["email"]
    assert masked["status"] == "PENDING"
    untouched = mask_viewer_contacts(dict(payload), UserRole.ADMIN)
    assert untouched == payload


# --- Integration: gates (needs DB) ---------------------------------------


@needs_db
def test_viewer_get_allowed_routes_200():
    Session = _fresh_session_factory()
    client = _client_with_viewer(Session)
    try:
        for path in (
            "/api/v1/admin/requests/stats",
            "/api/v1/admin/requests/stats/monthly",
            "/api/v1/admin/requests?limit=1",
            "/api/v1/admin/bookings?limit=1",
            "/api/v1/admin/bookings/availability?service_type=x&date=2026-01-01",
            "/api/v1/admin/reports/overview?start_date=2026-01-01&end_date=2026-01-02",
            "/api/v1/admin/reply-objects?limit=1",
            "/api/v1/admin/rich-menus?limit=1",
            "/api/v1/admin/intents/categories?limit=1",
        ):
            response = client.get(path)
            assert response.status_code == 200, (path, response.status_code, response.text[:200])
    finally:
        app.dependency_overrides.pop(deps.get_db, None)
        app.dependency_overrides.pop(deps.get_current_user, None)


@needs_db
def test_viewer_write_endpoints_403():
    Session = _fresh_session_factory()
    client = _client_with_viewer(Session)
    try:
        cases = (
            ("post", "/api/v1/admin/broadcasts", {"title": "x", "message_type": "text", "content": {"text": "x"}}),
            ("post", "/api/v1/admin/users", {"username": "viewer", "password": "password123", "display_name": "V", "role": "VIEWER"}),
            ("post", "/api/v1/admin/requests", {"description": "x"}),
            ("post", "/api/v1/admin/reply-objects", {"object_id": "$viewer_probe", "name": "x", "object_type": "text", "payload": {"text": "x"}}),
            ("post", "/api/v1/admin/live-chat/conversations/U123/messages", {"text": "x"}),
        )
        for method, path, body in cases:
            response = getattr(client, method)(path, json=body)
            assert response.status_code == 403, (method, path, response.status_code, response.text[:200])
    finally:
        app.dependency_overrides.pop(deps.get_db, None)
        app.dependency_overrides.pop(deps.get_current_user, None)


@needs_db
def test_viewer_closed_read_routes_403():
    Session = _fresh_session_factory()
    client = _client_with_viewer(Session)
    try:
        for path in (
            "/api/v1/admin/users?limit=1",
            "/api/v1/admin/broadcasts",
            "/api/v1/admin/live-chat/conversations",
            "/api/v1/admin/access-requests",
            "/api/v1/admin/settings",
            "/api/v1/admin/audit/logs",
        ):
            response = client.get(path)
            assert response.status_code == 403, (path, response.status_code, response.text[:200])
    finally:
        app.dependency_overrides.pop(deps.get_db, None)
        app.dependency_overrides.pop(deps.get_current_user, None)


@needs_db
def test_viewer_requests_list_pii_masked():
    Session = _fresh_session_factory()
    client = _client_with_viewer(Session)
    try:
        response = client.get("/api/v1/admin/requests?limit=1")
        assert response.status_code == 200
        for row in response.json():
            phone = row.get("phone_number")
            if phone:
                assert phone == "***" or "****" in phone, phone
            email = row.get("email")
            if email:
                local = email.split("@")[0]
                assert local == "***" or local.endswith("***"), email
            line_id = row.get("line_user_id")
            if line_id:
                assert line_id == "***" or "***" in line_id, line_id
    finally:
        app.dependency_overrides.pop(deps.get_db, None)
        app.dependency_overrides.pop(deps.get_current_user, None)
